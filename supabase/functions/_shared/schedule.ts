// Gap scheduling, a simplified SM-2 (design doc F5). Pure, no imports.

export type GapStatus = 'new' | 'practicing' | 'closed';

export type GapSchedule = {
  status: GapStatus;
  times_stuck: number;
  times_used: number;
  interval_days: number;
  next_due_at: string;
  first_used_at: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_INTERVAL_DAYS = 60;
const CLOSE_AFTER_USES = 3;
const CLOSE_AFTER_DAYS = 7;

// The learner got stuck on this word again (fallback, asked or corrected).
export function onStuck(gap: GapSchedule, now: Date): GapSchedule {
  return {
    ...gap,
    times_stuck: gap.times_stuck + 1,
    interval_days: 0,
    next_due_at: now.toISOString(),
    status: gap.status === 'closed' ? 'practicing' : gap.status,
  };
}

// The learner produced (or understood) the word without help.
export function onUsed(gap: GapSchedule, now: Date): GapSchedule {
  const firstUse = gap.first_used_at === null;
  const interval = firstUse
    ? 1
    : Math.min(Math.max(gap.interval_days, 1) * 2.5, MAX_INTERVAL_DAYS);
  const firstUsedAt = gap.first_used_at ?? now.toISOString();
  const timesUsed = gap.times_used + 1;
  const spanDays = (now.getTime() - new Date(firstUsedAt).getTime()) / DAY_MS;
  const closed = timesUsed >= CLOSE_AFTER_USES && spanDays >= CLOSE_AFTER_DAYS;

  return {
    ...gap,
    times_used: timesUsed,
    interval_days: interval,
    first_used_at: firstUsedAt,
    next_due_at: new Date(now.getTime() + interval * DAY_MS).toISOString(),
    status: closed ? 'closed' : 'practicing',
  };
}
