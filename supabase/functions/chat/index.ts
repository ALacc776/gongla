import { withSupabase } from 'npm:@supabase/server@1';

import { addGapEvents, markGapUsed, upsertGap, type GapChip, type GapEventKind } from '../_shared/gaps.ts';
import { segmentJyutping } from '../_shared/jyutping.ts';
import { generateReply, replyText, type ChatTurn, type ScenarioSpec, type TargetGap } from '../_shared/reply.ts';
import { cantonize, checkMandarin } from '../_shared/mandarin.ts';
import { analyzeInput } from '../_shared/text.ts';
import { limitResponse, refundUsage, takeUsage } from '../_shared/usage.ts';

const HISTORY_LIMIT = 16;

const SWAP_MEANINGS: Record<string, string> = {
  是: 'to be (is, am, are)', 不: 'not', 他: 'he, she', 她: 'he, she', 他們: 'they', 她們: 'they',
  我們: 'we', 你們: 'you (plural)', 在: 'at, in (a place)', 看: 'to look, to watch', 說: 'to say, to speak',
  沒有: "don't have, there isn't", 没有: "don't have, there isn't", 什麼: 'what', 什么: 'what',
  這: 'this', 这: 'this', 那: 'that',
};
const TURN_CAP = 40;
const MAX_TEXT_LENGTH = 500;

type RecentMessage = { id: string; role: 'user' | 'assistant'; text_raw: string };

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const userId = ctx.userClaims?.id;
    if (!userId) return Response.json({ error: 'Not signed in' }, { status: 401 });

    const { session_id, text } = await req.json().catch(() => ({}));
    const userText = typeof text === 'string' ? text.trim() : '';
    if (typeof session_id !== 'string' || !userText) {
      return Response.json({ error: 'session_id and text are required' }, { status: 400 });
    }
    if (userText.length > MAX_TEXT_LENGTH) {
      return Response.json({ error: 'That message is too long' }, { status: 400 });
    }

    // Read through the caller's RLS: only their own session comes back.
    const { data: session } = await ctx.supabase
      .from('sessions')
      .select('id, turn_count, ended_at, target_gap_ids, scenarios(spec)')
      .eq('id', session_id)
      .maybeSingle();
    if (!session) return Response.json({ error: 'Chat not found' }, { status: 404 });
    if (session.ended_at) return Response.json({ error: 'This chat has ended' }, { status: 409 });
    if (session.turn_count >= TURN_CAP) {
      return Response.json({ error: 'This chat has reached its length limit' }, { status: 409 });
    }

    const targetIds: string[] = session.target_gap_ids ?? [];
    const [{ data: profile }, { data: recentDesc }, { data: targetRows }, { data: usedEvents }] =
      await Promise.all([
        ctx.supabase.from('profiles').select('level, memory').eq('id', userId).maybeSingle(),
        ctx.supabase
          .from('messages')
          .select('id, role, text_raw')
          .eq('session_id', session_id)
          .order('created_at', { ascending: false })
          .limit(HISTORY_LIMIT),
        targetIds.length
          ? ctx.supabase.from('gaps').select('id, english, hanzi').in('id', targetIds)
          : Promise.resolve({ data: [] as TargetGap[] }),
        ctx.supabase.from('gap_events').select('gap_id').eq('session_id', session_id).eq('kind', 'used'),
      ]);

    const recent = ((recentDesc ?? []) as RecentMessage[]).reverse();
    const usedThisSession = new Set((usedEvents ?? []).map((e: { gap_id: string }) => e.gap_id));
    // Targets already used this session drop out of the prompt so the scene moves on.
    const targets = ((targetRows ?? []) as TargetGap[]).filter((t) => !usedThisSession.has(t.id));

    // User turns as typed, assistant turns as hanzi only (saves tokens).
    const history: ChatTurn[] = recent.map((m) => ({ role: m.role, content: m.text_raw }));
    history.push({ role: 'user', content: userText });

    // F12: count the message against today's limit before paying for the model call.
    if (!(await takeUsage(ctx.supabaseAdmin, userId, 'messages'))) return limitResponse();

    const spec = (session.scenarios as unknown as { spec: ScenarioSpec }).spec;
    let result;
    try {
      result = await generateReply(
        {
          spec,
          level: profile?.level ?? 1,
          memory: profile?.memory?.facts ?? [],
          targets,
          wrapUp: session.turn_count + 1 >= TURN_CAP,
          learnerMandarin: checkMandarin(userText).hits,
        },
        history,
      );
    } catch (e) {
      await refundUsage(ctx.supabaseAdmin, userId, 'messages');
      return Response.json({ error: (e as Error).message }, { status: 502 });
    }

    const now = new Date();
    const userMessageId = crypto.randomUUID();
    const assistantMessageId = crypto.randomUUID();
    const input = analyzeInput(userText);
    const events: { gap_id: string; kind: GapEventKind; message_id: string }[] = [];

    // F2: gaps from English fallback and "how do I say". A fallback only counts
    // if the learner actually typed English (Jyutping is Cantonese).
    const gapChips: (GapChip & { source: string })[] = [];
    for (const g of result.gaps) {
      if (g.source === 'fallback' && input.englishWords === 0) continue;
      if (gapChips.some((c) => c.hanzi === g.hanzi)) continue;
      const chip = await upsertGap(ctx.supabaseAdmin, userId, { ...g, kind: 'production' }, now);
      if (!chip) continue;
      gapChips.push({ ...chip, source: g.source });
      events.push({ gap_id: chip.id, kind: g.source === 'asked' ? 'asked' : 'fallback', message_id: userMessageId });
    }

    // F4 for the learner: if they used clear Mandarin forms and the model didn't
    // correct them, add the correction ourselves.
    const modelCorrections = [...result.corrections];
    const cantonized = cantonize(userText);
    if (cantonized.swaps.length && !modelCorrections.some((c) => cantonized.swaps.some(([from]) => c.user_said.includes(from)))) {
      const [from, to] = cantonized.swaps[0];
      modelCorrections.push({
        user_said: userText,
        better: cantonized.better,
        note: `Spoken Cantonese uses ${cantonized.swaps.map(([f, t]) => `${t}, not ${f}`).join('; ')} (that's Mandarin).`,
        hanzi: to,
        english: SWAP_MEANINGS[from] ?? to,
      });
    }

    const corrections = [];
    for (const c of modelCorrections.slice(0, 2)) {
      let gapId: string | null = null;
      if (c.hanzi && c.english) {
        const chip = await upsertGap(ctx.supabaseAdmin, userId, { english: c.english, hanzi: c.hanzi, kind: 'production' }, now);
        if (chip) {
          gapId = chip.id;
          events.push({ gap_id: chip.id, kind: 'corrected', message_id: userMessageId });
        }
      }
      corrections.push({
        user_said: c.user_said,
        better: c.better,
        better_jyutping: segmentJyutping(c.better),
        note: c.note,
        gap_id: gapId,
      });
    }

    // F5: target words used without help. Model report or string match, but not
    // if the character said the word in its last 2 messages (that's parroting).
    const stuckIds = new Set(events.map((e) => e.gap_id));
    const lastAssistantTexts = recent.filter((m) => m.role === 'assistant').slice(-2).map((m) => m.text_raw);
    const used: { id: string; english: string; hanzi: string }[] = [];
    for (const t of targets) {
      if (stuckIds.has(t.id)) continue;
      const modelSays = result.targetsUsed.includes(t.id);
      const stringMatch = userText.includes(t.hanzi);
      const parroted = lastAssistantTexts.some((text) => text.includes(t.hanzi));
      if ((modelSays || stringMatch) && !parroted) {
        await markGapUsed(ctx.supabaseAdmin, t.id, now);
        used.push(t);
        events.push({ gap_id: t.id, kind: 'used', message_id: userMessageId });
      }
    }

    // Recognition gaps: the learner replied in Cantonese to a message containing
    // a word they once tapped, without tapping it this time.
    const previous = recent.filter((m) => m.role === 'assistant').at(-1);
    if (previous && input.hanChars + input.jyutpingSyllables > 0) {
      const [{ data: recognition }, { data: taps }] = await Promise.all([
        ctx.supabase.from('gaps').select('id, hanzi').eq('kind', 'recognition').neq('status', 'closed').limit(300),
        ctx.supabase.from('gap_events').select('gap_id').eq('message_id', previous.id).eq('kind', 'tapped'),
      ]);
      const tapped = new Set((taps ?? []).map((t: { gap_id: string }) => t.gap_id));
      for (const r of (recognition ?? []) as { id: string; hanzi: string }[]) {
        if (tapped.has(r.id) || usedThisSession.has(r.id) || !previous.text_raw.includes(r.hanzi)) continue;
        await markGapUsed(ctx.supabaseAdmin, r.id, now);
        events.push({ gap_id: r.id, kind: 'used', message_id: userMessageId });
      }
    }

    // Explicit timestamps keep the order stable: one insert shares a single now().
    const { data: saved, error: saveError } = await ctx.supabaseAdmin
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
      .order('created_at');
    if (saveError || !saved) {
      console.error('message save failed', saveError);
      return Response.json({ error: 'Could not save the message' }, { status: 500 });
    }

    await Promise.all([
      addGapEvents(ctx.supabaseAdmin, events.map((e) => ({ ...e, session_id }))),
      ctx.supabaseAdmin
        .from('sessions')
        .update({ turn_count: session.turn_count + 1, last_message_preview: replyText(result.payload) })
        .eq('id', session_id),
    ]);

    return Response.json({
      user_message: saved[0],
      message: saved[1],
      turn_count: session.turn_count + 1,
      turn_cap: TURN_CAP,
    });
  }),
};
