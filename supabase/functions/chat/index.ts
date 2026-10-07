import { withSupabase } from 'npm:@supabase/server@1';

import { addGapEvents, markGapUsed, upsertGap, type GapEventKind } from '../_shared/gaps.ts';
import { segmentJyutping } from '../_shared/jyutping.ts';
import { cantonize, checkMandarin } from '../_shared/mandarin.ts';
import { generateReply, replyText, type ChatTurn, type ScenarioSpec, type TargetGap } from '../_shared/reply.ts';
import { analyzeInput, hasHan, normalizeEnglish, normalizeHanzi } from '../_shared/text.ts';
import { startTimer } from '../_shared/timing.ts';
import { concatBytes, saveTts, toBase64, ttsHash, ttsParams, TTS_BUCKET } from '../_shared/tts-cache.ts';
import { synthesizeStream } from '../_shared/azure.ts';
import { limitResponse, refundUsage, takeUsage } from '../_shared/usage.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const HISTORY_LIMIT = 16;
const TURN_CAP = 40;
const MAX_TEXT_LENGTH = 500;

const SWAP_MEANINGS: Record<string, string> = {
  是: 'to be (is, am, are)', 不: 'not', 他: 'he, she', 她: 'he, she', 他們: 'they', 她們: 'they',
  我們: 'we', 你們: 'you (plural)', 在: 'at, in (a place)', 看: 'to look, to watch', 說: 'to say, to speak',
  沒有: "don't have, there isn't", 没有: "don't have, there isn't", 什麼: 'what', 什么: 'what',
  這: 'this', 这: 'this', 那: 'that',
};

type RecentMessage = { id: string; role: 'user' | 'assistant'; text_raw: string };
type StuckWord = { english: string; hanzi: string; kind: GapEventKind };

// One roleplay turn, streamed as newline-delimited JSON so the app can speak the
// reply as soon as it exists:
//   {"type":"say","message_id","hanzi"}             the reply text, before glosses and gaps
//   {"type":"audio","b64"} ... {"type":"audio_end"} the reply's voice (MP3), if `speak` was set
//   {"type":"done","user_message","message",...}    everything, saved
//   {"type":"error","error"}
// Gap bookkeeping (F2, F5) is written after the response, off the critical path.
export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const timer = startTimer();
    const userId = ctx.userClaims?.id;
    if (!userId) return Response.json({ error: 'Not signed in' }, { status: 401 });

    // voice/rate/speak: when set, the reply's voice streams back inline (F10, F14).
    const { session_id, text, voice, rate, speak } = await req.json().catch(() => ({}));
    const userText = typeof text === 'string' ? text.trim() : '';
    if (typeof session_id !== 'string' || !userText) {
      return Response.json({ error: 'session_id and text are required' }, { status: 400 });
    }
    if (userText.length > MAX_TEXT_LENGTH) {
      return Response.json({ error: 'That message is too long' }, { status: 400 });
    }

    // Everything needed before the model call, in one parallel batch. RLS limits
    // the reads to the caller's own rows.
    const [{ data: session }, { data: profile }, { data: recentDesc }, { data: usedEvents }, allowed] =
      await Promise.all([
        ctx.supabase
          .from('sessions')
          .select('id, turn_count, ended_at, target_gap_ids, scenarios(spec)')
          .eq('id', session_id)
          .maybeSingle(),
        ctx.supabase.from('profiles').select('level, memory, english_ok').eq('id', userId).maybeSingle(),
        ctx.supabase
          .from('messages')
          .select('id, role, text_raw')
          .eq('session_id', session_id)
          .order('created_at', { ascending: false })
          .limit(HISTORY_LIMIT),
        ctx.supabase.from('gap_events').select('gap_id').eq('session_id', session_id).eq('kind', 'used'),
        takeUsage(ctx.supabaseAdmin, userId, 'messages'),
      ]);
    const refund = () => (allowed ? refundUsage(ctx.supabaseAdmin, userId, 'messages') : Promise.resolve());
    if (!session) {
      await refund();
      return Response.json({ error: 'Chat not found' }, { status: 404 });
    }
    if (session.ended_at || session.turn_count >= TURN_CAP) {
      await refund();
      const error = session.ended_at ? 'This chat has ended' : 'This chat has reached its length limit';
      return Response.json({ error }, { status: 409 });
    }
    if (!allowed) return limitResponse();

    const targetIds: string[] = session.target_gap_ids ?? [];
    const { data: targetRows } = targetIds.length
      ? await ctx.supabase.from('gaps').select('id, english, hanzi').in('id', targetIds)
      : { data: [] as TargetGap[] };
    timer.mark('db_load');

    const recent = ((recentDesc ?? []) as RecentMessage[]).reverse();
    const usedThisSession = new Set((usedEvents ?? []).map((e: { gap_id: string }) => e.gap_id));
    // Targets already used this session drop out of the prompt so the scene moves on.
    const targets = ((targetRows ?? []) as TargetGap[]).filter((t) => !usedThisSession.has(t.id));
    const englishOk: string[] = (profile?.english_ok ?? []).map(normalizeEnglish);

    // User turns as typed, assistant turns as hanzi only (saves tokens).
    const history: ChatTurn[] = recent.map((m) => ({ role: m.role, content: m.text_raw }));
    history.push({ role: 'user', content: userText });
    const spec = (session.scenarios as unknown as { spec: ScenarioSpec }).spec;

    const userMessageId = crypto.randomUUID();
    const assistantMessageId = crypto.randomUUID();
    const encoder = new TextEncoder();

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: Record<string, unknown>) =>
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        let sayAt: number | null = null;

        // The reply's voice, started the moment its text exists. Cached phrases come
        // from Storage; new ones stream from Azure and are cached afterwards.
        let audioTask: Promise<void> | null = null;
        const startAudio = (say: string) => {
          const params = speak === true ? ttsParams({ text: say, voice: voice ?? spec.character.voice, rate }) : null;
          if (!params || audioTask) return;
          audioTask = (async () => {
            const { data: cached } = await ctx.supabaseAdmin
              .from('tts_cache')
              .select('storage_path')
              .eq('hash', await ttsHash(params))
              .maybeSingle();
            if (cached) {
              const { data } = await ctx.supabaseAdmin.storage.from(TTS_BUCKET).download(cached.storage_path);
              if (data) {
                send({ type: 'audio', b64: toBase64(new Uint8Array(await data.arrayBuffer())) });
                send({ type: 'audio_end' });
                return;
              }
            }
            const chunks: Uint8Array[] = [];
            for await (const chunk of await synthesizeStream(params.text, params.voice, params.rate, 'mp3')) {
              chunks.push(chunk);
              send({ type: 'audio', b64: toBase64(chunk) });
            }
            send({ type: 'audio_end' });
            EdgeRuntime.waitUntil(saveTts(ctx.supabaseAdmin, userId, params, concatBytes(chunks)).catch((e) => console.error(e)));
          })().catch((e) => {
            console.error('inline audio failed', e);
            send({ type: 'audio_error' });
          });
        };

        let result;
        try {
          result = await generateReply(
            {
              spec,
              level: profile?.level ?? 1,
              memory: profile?.memory?.facts ?? [],
              englishOk,
              targets,
              wrapUp: session.turn_count + 1 >= TURN_CAP,
              learnerMandarin: checkMandarin(userText).hits,
            },
            history,
            (say) => {
              sayAt = timer.elapsed();
              send({ type: 'say', message_id: assistantMessageId, hanzi: say });
              startAudio(say);
            },
          );
        } catch (e) {
          await refund();
          await audioTask;
          send({ type: 'error', error: (e as Error).message });
          controller.close();
          return;
        }
        timer.mark('model');
        if (!result.sayEmitted) {
          sayAt = timer.elapsed();
          send({ type: 'say', message_id: assistantMessageId, hanzi: result.say });
          startAudio(result.say);
        }

        // What the learner sees under their message, worked out without the database.
        const now = new Date();
        const input = analyzeInput(userText);
        const stuck: StuckWord[] = [];
        const gapChips: { id: string; english: string; hanzi: string; jyutping: string; source: string }[] = [];
        for (const g of result.gaps) {
          // A fallback only counts if the learner actually typed English (Jyutping is Cantonese).
          if (g.source === 'fallback' && input.englishWords === 0) continue;
          const hanzi = normalizeHanzi(g.hanzi);
          const english = normalizeEnglish(g.english);
          if (!hanzi || !english || gapChips.some((c) => c.hanzi === hanzi)) continue;
          // Skip "translations" with no Chinese in them, and English the learner is fine using
          // (unless they asked how to say it).
          if (!hasHan(hanzi) || (g.source === 'fallback' && englishOk.includes(english))) continue;
          gapChips.push({ id: hanzi, english, hanzi, jyutping: segmentJyutping(hanzi), source: g.source });
          stuck.push({ english, hanzi, kind: g.source === 'asked' ? 'asked' : 'fallback' });
        }

        // F4 for the learner: if they used clear Mandarin forms and the model didn't
        // correct them, add the correction ourselves.
        const modelCorrections = [...result.corrections];
        const cantonized = cantonize(userText);
        if (
          cantonized.swaps.length &&
          !modelCorrections.some((c) => cantonized.swaps.some(([from]) => c.user_said.includes(from)))
        ) {
          const [from, to] = cantonized.swaps[0];
          modelCorrections.push({
            user_said: userText,
            better: cantonized.better,
            note: `Spoken Cantonese uses ${cantonized.swaps.map(([f, t]) => `${t}, not ${f}`).join('; ')} (that's Mandarin).`,
            hanzi: to,
            english: SWAP_MEANINGS[from] ?? to,
          });
        }
        const corrections = modelCorrections.slice(0, 2).map((c) => {
          if (c.hanzi && c.english) stuck.push({ english: c.english, hanzi: c.hanzi, kind: 'corrected' });
          return { user_said: c.user_said, better: c.better, better_jyutping: segmentJyutping(c.better), note: c.note };
        });

        // F5: target words used without help. Model report or string match, but not
        // if the character said the word in its last 2 messages (that's parroting).
        const stuckHanzi = new Set(stuck.map((s) => normalizeHanzi(s.hanzi)));
        const lastAssistantTexts = recent.filter((m) => m.role === 'assistant').slice(-2).map((m) => m.text_raw);
        const used = targets.filter((t) => {
          if (stuckHanzi.has(t.hanzi)) return false;
          const said = result.targetsUsed.includes(t.id) || userText.includes(t.hanzi);
          return said && !lastAssistantTexts.some((text) => text.includes(t.hanzi));
        });

        // Save the two messages (and the turn count, which the next turn checks), then finish.
        // Explicit timestamps keep the order stable: one insert shares a single now().
        const [{ data: saved, error: saveError }] = await Promise.all([
          ctx.supabaseAdmin
            .from('messages')
            .insert([
              {
                id: userMessageId,
                session_id,
                role: 'user',
                text_raw: userText,
                payload: { gaps: gapChips, corrections, used },
                created_at: now.toISOString(),
              },
              {
                id: assistantMessageId,
                session_id,
                role: 'assistant',
                text_raw: replyText(result.payload),
                payload: result.payload,
                created_at: new Date(now.getTime() + 1).toISOString(),
              },
            ])
            .select('id, role, text_raw, payload, created_at')
            .order('created_at'),
          ctx.supabaseAdmin
            .from('sessions')
            .update({ turn_count: session.turn_count + 1, last_message_preview: replyText(result.payload) })
            .eq('id', session_id),
        ]);
        timer.mark('save');
        if (saveError || !saved) {
          console.error('message save failed', saveError);
          await audioTask;
          send({ type: 'error', error: 'Could not save the message' });
          controller.close();
          return;
        }

        send({
          type: 'done',
          user_message: saved[0],
          message: saved[1],
          turn_count: session.turn_count + 1,
          turn_cap: TURN_CAP,
          timings: {
            ...timer.done(),
            say: sayAt,
            model_calls: result.calls.length,
            output_tokens: result.calls.reduce((n, c) => n + c.output_tokens, 0),
          },
        });
        await audioTask;
        controller.close();

        // After the response: gaps, events and schedules (F2, F5).
        EdgeRuntime.waitUntil(
          recordGaps({
            admin: ctx.supabaseAdmin,
            reader: ctx.supabase,
            userId,
            sessionId: session_id,
            messageId: userMessageId,
            now,
            stuck,
            used,
            previous: recent.filter((m) => m.role === 'assistant').at(-1),
            repliedInCantonese: input.hanChars + input.jyutpingSyllables > 0,
            usedThisSession,
          }).catch((e) => console.error('recording gaps failed', e)),
        );
      },
    });

    return new Response(body, {
      headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-cache' },
    });
  }),
};

type Db = Parameters<typeof upsertGap>[0];

async function recordGaps(opts: {
  admin: Db;
  reader: Db;
  userId: string;
  sessionId: string;
  messageId: string;
  now: Date;
  stuck: StuckWord[];
  used: TargetGap[];
  previous: RecentMessage | undefined;
  repliedInCantonese: boolean;
  usedThisSession: Set<string>;
}) {
  const { admin, reader, userId, now, messageId } = opts;
  const events: { gap_id: string; kind: GapEventKind; message_id: string }[] = [];

  for (const s of opts.stuck) {
    const gap = await upsertGap(admin, userId, { english: s.english, hanzi: s.hanzi, kind: 'production' }, now);
    if (gap) events.push({ gap_id: gap.id, kind: s.kind, message_id: messageId });
  }
  for (const t of opts.used) {
    await markGapUsed(admin, t.id, now);
    events.push({ gap_id: t.id, kind: 'used', message_id: messageId });
  }

  // Recognition gaps: the learner replied in Cantonese to a message containing
  // a word they once tapped, without tapping it this time.
  if (opts.previous && opts.repliedInCantonese) {
    const [{ data: recognition }, { data: taps }] = await Promise.all([
      reader.from('gaps').select('id, hanzi').eq('kind', 'recognition').neq('status', 'closed').limit(300),
      reader.from('gap_events').select('gap_id').eq('message_id', opts.previous.id).eq('kind', 'tapped'),
    ]);
    const tapped = new Set((taps ?? []).map((t: { gap_id: string }) => t.gap_id));
    for (const r of (recognition ?? []) as { id: string; hanzi: string }[]) {
      if (tapped.has(r.id) || opts.usedThisSession.has(r.id) || !opts.previous.text_raw.includes(r.hanzi)) continue;
      await markGapUsed(admin, r.id, now);
      events.push({ gap_id: r.id, kind: 'used', message_id: messageId });
    }
  }

  await addGapEvents(admin, events.map((e) => ({ ...e, session_id: opts.sessionId })));
}
