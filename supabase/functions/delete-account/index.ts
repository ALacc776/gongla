import { withSupabase } from 'npm:@supabase/server@1';

// F11: deletes the caller's auth user. Foreign keys cascade to all their rows.
export default {
  fetch: withSupabase({ auth: 'user' }, async (_req, ctx) => {
    const userId = ctx.userClaims?.id;
    if (!userId) return Response.json({ error: 'Not signed in' }, { status: 401 });

    // Custom scenarios are referenced by sessions without a cascade, so remove sessions first.
    await ctx.supabaseAdmin.from('sessions').delete().eq('user_id', userId);
    const { error } = await ctx.supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      console.error('delete user failed', error);
      return Response.json({ error: 'Could not delete the account' }, { status: 500 });
    }
    return Response.json({ ok: true });
  }),
};
