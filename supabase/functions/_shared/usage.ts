import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type UsageField = 'messages' | 'side_questions' | 'tts_chars';

// Counts one use against today's limit for the user's plan (F12; the limits live
// in the take_usage SQL function). Returns false if the user is over it.
export async function takeUsage(
  admin: SupabaseClient,
  userId: string,
  field: 'messages' | 'side_questions',
): Promise<boolean> {
  const { data, error } = await admin.rpc('take_usage', { p_user: userId, p_field: field });
  if (error) {
    // Don't block learners if the counter itself fails.
    console.error('take_usage failed', error);
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
