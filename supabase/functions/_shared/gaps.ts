import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { segmentJyutping } from './jyutping.ts';
import { onStuck, onUsed, type GapSchedule } from './schedule.ts';
import { normalizeEnglish, normalizeHanzi } from './text.ts';

export type GapKind = 'production' | 'recognition';
export type GapEventKind = 'fallback' | 'asked' | 'corrected' | 'tapped' | 'used';

// What the app shows in a "Say it like this" chip.
export type GapChip = { id: string; english: string; hanzi: string; jyutping: string };

const GAP_COLUMNS =
  'id, english, hanzi, jyutping, status, times_stuck, times_used, interval_days, next_due_at, first_used_at';

type GapRow = GapSchedule & { id: string; english: string; hanzi: string; jyutping: string };

function schedule(row: GapRow): GapSchedule {
  return {
    status: row.status,
    times_stuck: row.times_stuck,
    times_used: row.times_used,
    interval_days: row.interval_days,
    next_due_at: row.next_due_at,
    first_used_at: row.first_used_at,
  };
}

// F2 step 3: insert a new gap, or mark an existing one as stuck again.
// Returns null if the hanzi has no Chinese characters in it.
export async function upsertGap(
  admin: SupabaseClient,
  userId: string,
  gap: { english: string; hanzi: string; kind: GapKind },
  now: Date,
): Promise<GapChip | null> {
  const hanzi = normalizeHanzi(gap.hanzi);
  const english = normalizeEnglish(gap.english);
  if (!hanzi || !/\p{Script=Han}/u.test(hanzi) || !english) return null;

  const { data: existing } = await admin
    .from('gaps')
    .select(GAP_COLUMNS)
    .eq('user_id', userId)
    .eq('hanzi', hanzi)
    .eq('kind', gap.kind)
    .maybeSingle();

  if (existing) {
    const row = existing as GapRow;
    const { error } = await admin
      .from('gaps')
      .update({ ...onStuck(schedule(row), now), last_seen_at: now.toISOString() })
      .eq('id', row.id);
    if (error) console.error('gap update failed', error);
    return { id: row.id, english: row.english, hanzi: row.hanzi, jyutping: row.jyutping };
  }

  const jyutping = segmentJyutping(hanzi);
  const { data: inserted, error } = await admin
    .from('gaps')
    .insert({
      user_id: userId,
      english,
      hanzi,
      jyutping,
      kind: gap.kind,
      next_due_at: now.toISOString(),
      last_seen_at: now.toISOString(),
    })
    .select('id')
    .single();
  if (error || !inserted) {
    console.error('gap insert failed', error);
    return null;
  }
  return { id: inserted.id, english, hanzi, jyutping };
}

// The learner used a gap without help: move it along the schedule.
export async function markGapUsed(admin: SupabaseClient, gapId: string, now: Date) {
  const { data } = await admin.from('gaps').select(GAP_COLUMNS).eq('id', gapId).maybeSingle();
  if (!data) return;
  const { error } = await admin
    .from('gaps')
    .update({ ...onUsed(schedule(data as GapRow), now), last_seen_at: now.toISOString() })
    .eq('id', gapId);
  if (error) console.error('gap used update failed', error);
}

export async function addGapEvents(
  admin: SupabaseClient,
  events: { gap_id: string; session_id: string; message_id: string | null; kind: GapEventKind }[],
) {
  if (!events.length) return;
  const { error } = await admin.from('gap_events').insert(events);
  if (error) console.error('gap_events insert failed', error);
}
