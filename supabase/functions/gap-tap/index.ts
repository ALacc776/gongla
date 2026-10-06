import { withSupabase } from 'npm:@supabase/server@1';

import { addGapEvents, upsertGap } from '../_shared/gaps.ts';
import type { ReplyPayload } from '../_shared/reply.ts';
import { normalizeHanzi } from '../_shared/text.ts';

// F2 tap-to-gloss: the learner tapped a word in an AI message they didn't
// understand, so it becomes a recognition gap.
export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const userId = ctx.userClaims?.id;
    if (!userId) return Response.json({ error: 'Not signed in' }, { status: 401 });

    const { message_id, segment_index } = await req.json().catch(() => ({}));
    if (typeof message_id !== 'string' || typeof segment_index !== 'number') {
      return Response.json({ error: 'message_id and segment_index are required' }, { status: 400 });
    }

    // RLS: only messages in the caller's own sessions come back.
    const { data: message } = await ctx.supabase
      .from('messages')
      .select('id, session_id, role, payload')
      .eq('id', message_id)
      .maybeSingle();
    if (!message || message.role !== 'assistant') {
      return Response.json({ error: 'Message not found' }, { status: 404 });
    }

    const segment = (message.payload as ReplyPayload | null)?.segments?.[segment_index];
    if (!segment || !segment.gloss) return Response.json({ gap: null });

    // Tapping the same word in the same message again counts only once.
    const { data: existing } = await ctx.supabase
      .from('gaps')
      .select('id, gap_events!inner(id)')
      .eq('kind', 'recognition')
      .eq('hanzi', normalizeHanzi(segment.hanzi))
      .eq('gap_events.message_id', message.id)
      .eq('gap_events.kind', 'tapped')
      .limit(1);
    if (existing?.length) return Response.json({ gap: { id: existing[0].id } });

    const gap = await upsertGap(
      ctx.supabaseAdmin,
      userId,
      { english: segment.gloss, hanzi: segment.hanzi, kind: 'recognition' },
      new Date(),
    );
    if (!gap) return Response.json({ gap: null });

    await addGapEvents(ctx.supabaseAdmin, [
      { gap_id: gap.id, session_id: message.session_id, message_id: message.id, kind: 'tapped' },
    ]);
    return Response.json({ gap });
  }),
};
