import { withSupabase } from 'npm:@supabase/server@1';

import { callTool } from '../_shared/anthropic.ts';
import { addGapEvents, upsertGap } from '../_shared/gaps.ts';
import { segmentJyutping } from '../_shared/jyutping.ts';
import type { ScenarioSpec } from '../_shared/reply.ts';
import { limitResponse, refundUsage, takeUsage } from '../_shared/usage.ts';

const MAX_QUESTION_LENGTH = 500;
const CONTEXT_MESSAGES = 6;

type AskInput = {
  answer: string;
  examples?: { hanzi: string; english: string }[];
  say_it?: { english: string; hanzi: string } | null;
};

const ASK_TOOL = {
  name: 'answer',
  description: "Answer the learner's side question.",
  input_schema: {
    type: 'object',
    properties: {
      answer: { type: 'string', description: 'Short English explanation, 2 to 4 sentences.' },
      examples: {
        type: 'array',
        description: 'At most 3 examples in colloquial Hong Kong Cantonese, Traditional characters.',
        items: {
          type: 'object',
          properties: { hanzi: { type: 'string' }, english: { type: 'string' } },
          required: ['hanzi', 'english'],
        },
      },
      say_it: {
        type: 'object',
        description: 'Only if the question is "how do I say X": the English X and its Cantonese.',
        properties: {
          english: { type: 'string', description: 'lowercase' },
          hanzi: { type: 'string', description: 'As short as possible' },
        },
        required: ['english', 'hanzi'],
      },
    },
    required: ['answer', 'examples'],
  },
};

// F16 Ask panel: a tutor outside the roleplay. Never added to the chat history.
export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const userId = ctx.userClaims?.id;
    if (!userId) return Response.json({ error: 'Not signed in' }, { status: 401 });

    const { session_id, question } = await req.json().catch(() => ({}));
    const q = typeof question === 'string' ? question.trim() : '';
    if (typeof session_id !== 'string' || !q) {
      return Response.json({ error: 'session_id and question are required' }, { status: 400 });
    }
    if (q.length > MAX_QUESTION_LENGTH) {
      return Response.json({ error: 'That question is too long' }, { status: 400 });
    }

    const { data: session } = await ctx.supabase
      .from('sessions')
      .select('id, scenarios(spec)')
      .eq('id', session_id)
      .maybeSingle();
    if (!session) return Response.json({ error: 'Chat not found' }, { status: 404 });

    const { data: recentDesc } = await ctx.supabase
      .from('messages')
      .select('role, text_raw, payload')
      .eq('session_id', session_id)
      .order('created_at', { ascending: false })
      .limit(CONTEXT_MESSAGES);
    const spec = (session.scenarios as unknown as { spec: ScenarioSpec }).spec;
    const transcript = (recentDesc ?? [])
      .reverse()
      .map((m) =>
        m.role === 'user'
          ? `Learner: ${m.text_raw}`
          : `${spec.character.name}: ${m.text_raw} (${m.payload?.english ?? ''})`,
      )
      .join('\n');

    const system = `You are a friendly Cantonese tutor helping a learner who is in the middle of a
roleplay ("${spec.title}"). Answer their side question briefly in English (2 to 4 sentences).
Give at most 3 Cantonese examples in colloquial Hong Kong Cantonese, Traditional
characters (係, 唔, 嘅, 咗, 冇, 佢, 喺, never Mandarin forms like 是, 不, 的, 了, 他, 在).
If the question is "how do I say X", set say_it with the phrase.
Recent roleplay for context:
${transcript || '(nothing yet)'}`;

    if (!(await takeUsage(ctx.supabaseAdmin, userId, 'side_questions'))) return limitResponse();

    let input: AskInput;
    try {
      input = await callTool<AskInput>({
        system: [{ type: 'text', text: system }],
        messages: [{ role: 'user', content: q }],
        tool: ASK_TOOL,
        maxTokens: 500,
        temperature: 0.3,
      });
    } catch (e) {
      await refundUsage(ctx.supabaseAdmin, userId, 'side_questions');
      return Response.json({ error: (e as Error).message }, { status: 502 });
    }

    const examples = (input.examples ?? []).slice(0, 3).map((ex) => ({
      hanzi: ex.hanzi,
      english: ex.english,
      jyutping: segmentJyutping(ex.hanzi),
    }));

    let sayIt = null;
    let gapId: string | null = null;
    if (input.say_it?.hanzi && input.say_it.english) {
      const gap = await upsertGap(
        ctx.supabaseAdmin,
        userId,
        { english: input.say_it.english, hanzi: input.say_it.hanzi, kind: 'production' },
        new Date(),
      );
      if (gap) {
        gapId = gap.id;
        sayIt = gap;
        await addGapEvents(ctx.supabaseAdmin, [
          { gap_id: gap.id, session_id, message_id: null, kind: 'asked' },
        ]);
      }
    }

    const { data: saved, error } = await ctx.supabaseAdmin
      .from('side_questions')
      .insert({
        session_id,
        question: q,
        answer: { text: input.answer ?? '', examples, say_it: sayIt },
        created_gap_id: gapId,
      })
      .select('id, question, answer, created_at')
      .single();
    if (error) {
      console.error('side_questions insert failed', error);
      return Response.json({ error: 'Could not save the answer' }, { status: 500 });
    }

    return Response.json({ side_question: saved });
  }),
};
