import { withSupabase } from 'npm:@supabase/server@1';

import { callTool } from '../_shared/anthropic.ts';
import type { ScenarioSpec } from '../_shared/reply.ts';
import { cantoneseRatio } from '../_shared/text.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const MEMORY_MIN_USER_MESSAGES = 4;
const MEMORY_MAX_FACTS = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

type GapInfo = { id: string; english: string; hanzi: string; jyutping: string };

const MEMORY_TOOL = {
  name: 'save_memory',
  description: 'Save the updated list of facts about the learner.',
  input_schema: {
    type: 'object',
    properties: {
      facts: {
        type: 'array',
        items: { type: 'string' },
        description: `At most ${MEMORY_MAX_FACTS} facts, each under 15 words, in English.`,
      },
    },
    required: ['facts'],
  },
};

// F17: refresh the short note about the learner from what they said this chat.
async function updateMemory(current: string[], userMessages: string[]): Promise<string[] | null> {
  try {
    const { facts } = await callTool<{ facts: string[] }>({
      system: [
        {
          type: 'text',
          text: `Update this list of facts about a Cantonese learner. Add new durable personal facts
(name, job, people in their life, hobbies, where they live at city level, what they find hard),
update changed ones, drop trivial ones. Max ${MEMORY_MAX_FACTS} facts, each under 15 words.
Never store sensitive details like health, finances, or addresses beyond city level.
Things the learner says while roleplaying a scene may be invented: only keep facts
they clearly state about their real life. If nothing changes, return the current list.`,
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Current facts:\n${current.map((f) => `- ${f}`).join('\n') || '(none)'}\n\nWhat the learner said this chat:\n${userMessages.map((m) => `- ${m}`).join('\n')}`,
        },
      ],
      tool: MEMORY_TOOL,
      maxTokens: 400,
      temperature: 0,
    });
    return (facts ?? [])
      .map((f) => String(f).trim())
      .filter(Boolean)
      .slice(0, MEMORY_MAX_FACTS);
  } catch (e) {
    console.error('memory update failed', e);
    return null;
  }
}

// F9: end a chat and compute its summary. No model call except the memory update.
export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const userId = ctx.userClaims?.id;
    if (!userId) return Response.json({ error: 'Not signed in' }, { status: 401 });

    const { session_id } = await req.json().catch(() => ({}));
    if (typeof session_id !== 'string') {
      return Response.json({ error: 'session_id is required' }, { status: 400 });
    }

    const { data: session } = await ctx.supabase
      .from('sessions')
      .select('id, scenario_id, ended_at, summary, scenarios(spec)')
      .eq('id', session_id)
      .maybeSingle();
    if (!session) return Response.json({ error: 'Chat not found' }, { status: 404 });
    if (session.ended_at) return Response.json({ summary: session.summary });

    const now = new Date();
    const [{ data: messages }, { data: events }, { data: profile }, { data: recentSessions }] =
      await Promise.all([
        ctx.supabase
          .from('messages')
          .select('role, text_raw, payload')
          .eq('session_id', session_id)
          .order('created_at'),
        ctx.supabase
          .from('gap_events')
          .select('kind, gaps(id, english, hanzi, jyutping, kind)')
          .eq('session_id', session_id),
        ctx.supabase.from('profiles').select('level, memory').eq('id', userId).maybeSingle(),
        ctx.supabase
          .from('sessions')
          .select('cantonese_ratio, ended_at')
          .not('ended_at', 'is', null)
          .not('cantonese_ratio', 'is', null)
          .order('ended_at', { ascending: false })
          .limit(20),
      ]);

    const userTexts = (messages ?? []).filter((m) => m.role === 'user').map((m) => m.text_raw);
    const ratio = cantoneseRatio(userTexts);
    const goalMet = (messages ?? []).some((m) => m.role === 'assistant' && m.payload?.goal_met);

    const newGaps = new Map<string, GapInfo>();
    const usedGaps = new Map<string, GapInfo>();
    for (const e of (events ?? []) as unknown as { kind: string; gaps: GapInfo & { kind: string } | null }[]) {
      if (!e.gaps) continue;
      const info = { id: e.gaps.id, english: e.gaps.english, hanzi: e.gaps.hanzi, jyutping: e.gaps.jyutping };
      if (e.kind === 'used') usedGaps.set(info.id, info);
      else if (e.gaps.kind === 'production') newGaps.set(info.id, info);
    }

    // Trend: this chat vs. the average of chats ended in the last 7 days.
    const past = (recentSessions ?? []) as { cantonese_ratio: number; ended_at: string }[];
    const week = past.filter((s) => now.getTime() - new Date(s.ended_at).getTime() < 7 * DAY_MS);
    const avg7d = week.length ? week.reduce((sum, s) => sum + s.cantonese_ratio, 0) / week.length : null;

    // F13 (simple): suggest a level change after 3 chats in a row above 80% or below 30%.
    const level = profile?.level ?? 1;
    const lastThree = ratio === null ? [] : [ratio, ...past.slice(0, 2).map((s) => s.cantonese_ratio)];
    let levelSuggestion: 'up' | 'down' | null = null;
    if (lastThree.length === 3) {
      if (level < 5 && lastThree.every((r) => r > 0.8)) levelSuggestion = 'up';
      else if (level > 1 && lastThree.every((r) => r < 0.3)) levelSuggestion = 'down';
    }

    const spec = (session.scenarios as unknown as { spec: ScenarioSpec }).spec;
    const summary = {
      title: spec.title,
      scenario_id: session.scenario_id,
      ratio,
      avg_7d: avg7d,
      goal_met: goalMet,
      user_turns: userTexts.length,
      new_gaps: [...newGaps.values()],
      used_gaps: [...usedGaps.values()],
      level,
      level_suggestion: levelSuggestion,
    };

    const { error } = await ctx.supabaseAdmin
      .from('sessions')
      .update({ ended_at: now.toISOString(), cantonese_ratio: ratio, summary })
      .eq('id', session_id)
      .is('ended_at', null);
    if (error) {
      console.error('session end failed', error);
      return Response.json({ error: 'Could not end the chat' }, { status: 500 });
    }

    // The memory update runs after the response so the summary shows right away.
    if (userTexts.length >= MEMORY_MIN_USER_MESSAGES) {
      const work = updateMemory(profile?.memory?.facts ?? [], userTexts).then(async (facts) => {
        if (!facts) return;
        await ctx.supabaseAdmin
          .from('profiles')
          .update({ memory: { facts }, memory_updated_at: now.toISOString() })
          .eq('id', userId);
      });
      EdgeRuntime.waitUntil(work);
    }

    return Response.json({ summary });
  }),
};
