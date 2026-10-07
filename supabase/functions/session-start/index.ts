import { withSupabase } from 'npm:@supabase/server@1';

import { generateReply, replyText, type ScenarioSpec, type TargetGap } from '../_shared/reply.ts';
import { validSpec } from '../_shared/spec.ts';
import { startTimer } from '../_shared/timing.ts';

const CANDIDATE_LIMIT = 15;
const TARGET_LIMIT = 5;

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const timer = startTimer();
    const userId = ctx.userClaims?.id;
    if (!userId) return Response.json({ error: 'Not signed in' }, { status: 401 });

    const { scenario_id, custom_spec } = await req.json().catch(() => ({}));

    let scenario: { id: string; spec: unknown } | null = null;
    if (custom_spec !== undefined) {
      // F8: a Rehearse preview the learner accepted becomes their own scenario.
      if (!validSpec(custom_spec)) return Response.json({ error: 'That scenario is incomplete' }, { status: 400 });
      const { preview: _preview, ...spec } = custom_spec;
      const { data, error } = await ctx.supabaseAdmin
        .from('scenarios')
        .insert({ owner_id: userId, pack: 'rehearsal', spec, is_custom: true })
        .select('id, spec')
        .single();
      if (error) {
        console.error('custom scenario insert failed', error);
        return Response.json({ error: 'Could not save the scenario' }, { status: 500 });
      }
      scenario = data;
    } else if (typeof scenario_id === 'string') {
      // Read through the caller's RLS: only built-in or their own scenarios come back.
      const { data } = await ctx.supabase.from('scenarios').select('id, spec').eq('id', scenario_id).maybeSingle();
      scenario = data;
    } else {
      return Response.json({ error: 'scenario_id is required' }, { status: 400 });
    }
    if (!scenario) return Response.json({ error: 'Scenario not found' }, { status: 404 });

    // F5: due production gaps are candidates; the opener call picks the ones that fit.
    const [{ data: profile }, { data: due }] = await Promise.all([
      ctx.supabase.from('profiles').select('level, memory').eq('id', userId).maybeSingle(),
      ctx.supabase
        .from('gaps')
        .select('id, english, hanzi')
        .eq('kind', 'production')
        .neq('status', 'closed')
        .lte('next_due_at', new Date().toISOString())
        .order('next_due_at')
        .order('times_stuck', { ascending: false })
        .limit(CANDIDATE_LIMIT),
    ]);
    const candidates = (due ?? []) as TargetGap[];
    timer.mark('db_load');

    let result;
    try {
      result = await generateReply(
        {
          spec: scenario.spec as ScenarioSpec,
          level: profile?.level ?? 1,
          memory: profile?.memory?.facts ?? [],
          targets: [],
          candidates,
        },
        [],
      );
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 502 });
    }

    timer.mark('model');
    const candidateIds = new Set(candidates.map((c) => c.id));
    const targetIds = [...new Set(result.chosenTargetIds)]
      .filter((id) => candidateIds.has(id))
      .slice(0, TARGET_LIMIT);

    const { data: session, error: sessionError } = await ctx.supabaseAdmin
      .from('sessions')
      .insert({
        user_id: userId,
        scenario_id: scenario.id,
        target_gap_ids: targetIds,
        last_message_preview: replyText(result.payload),
      })
      .select('id')
      .single();
    if (sessionError) {
      console.error('session insert failed', sessionError);
      return Response.json({ error: 'Could not start the chat' }, { status: 500 });
    }

    const { data: message, error: messageError } = await ctx.supabaseAdmin
      .from('messages')
      .insert({
        session_id: session.id,
        role: 'assistant',
        text_raw: replyText(result.payload),
        payload: result.payload,
      })
      .select('id, role, text_raw, payload, created_at')
      .single();
    if (messageError) return Response.json({ error: 'Could not save the message' }, { status: 500 });

    timer.mark('save');
    return Response.json({
      session_id: session.id,
      scenario_id: scenario.id,
      message,
      target_count: targetIds.length,
      timings: { ...timer.done(), model_calls: result.calls.length, output_tokens: result.calls.reduce((n, c) => n + c.output_tokens, 0) },
    });
  }),
};
