import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// F12 daily limits per plan.
const LIMITS = {
  free: { messages: 25, side_questions: 10 },
  pro: { messages: 300, side_questions: 100 },
} as const;

export type UsageField = 'messages' | 'side_questions' | 'tts_chars';

export async function planFor(admin: SupabaseClient, userId: string): Promise<'free' | 'pro'> {
  const { data } = await admin.from('profiles').select('plan').eq('id', userId).maybeSingle();
  return data?.plan === 'pro' ? 'pro' : 'free';
}

// Counts one use against today's limit. Returns false if the user is over it.
export async function takeUsage(
  admin: SupabaseClient,
  userId: string,
  field: 'messages' | 'side_questions',
): Promise<boolean> {
  const plan = await planFor(admin, userId);
  const { data, error } = await admin.rpc('bump_usage', {
    p_user: userId,
    p_field: field,
    p_amount: 1,
    p_limit: LIMITS[plan][field],
  });
  if (error) {
    // Don't block learners if the counter itself fails.
    console.error('bump_usage failed', error);
    return true;
  }
  return data === true;
}

// Gives a use back, e.g. when the model call failed.
export async function refundUsage(admin: SupabaseClient, userId: string, field: UsageField, amount = 1) {
  await admin.rpc('bump_usage', { p_user: userId, p_field: field, p_amount: -amount, p_limit: null });
}

export async function countUsage(admin: SupabaseClient, userId: string, field: UsageField, amount: number) {
  await admin.rpc('bump_usage', { p_user: userId, p_field: field, p_amount: amount, p_limit: null });
}

export function limitResponse() {
  return Response.json({ error: 'Daily limit reached', reason: 'daily_limit' }, { status: 429 });
}
