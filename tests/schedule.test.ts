import assert from 'node:assert/strict';
import { test } from 'node:test';

import { onStuck, onUsed, type GapSchedule } from '../supabase/functions/_shared/schedule.ts';

const DAY = 24 * 60 * 60 * 1000;
const t0 = new Date('2026-10-01T00:00:00Z');
const fresh: GapSchedule = {
  status: 'new',
  times_stuck: 1,
  times_used: 0,
  interval_days: 0,
  next_due_at: t0.toISOString(),
  first_used_at: null,
};

test('first use: interval 1 day, practicing', () => {
  const g = onUsed(fresh, t0);
  assert.equal(g.interval_days, 1);
  assert.equal(g.status, 'practicing');
  assert.equal(g.first_used_at, t0.toISOString());
  assert.equal(g.next_due_at, new Date(t0.getTime() + DAY).toISOString());
});

test('later uses multiply by 2.5, capped at 60', () => {
  let g = onUsed(fresh, t0);
  g = onUsed(g, new Date(t0.getTime() + DAY));
  assert.equal(g.interval_days, 2.5);
  g = { ...g, interval_days: 40 };
  g = onUsed(g, new Date(t0.getTime() + 2 * DAY));
  assert.equal(g.interval_days, 60);
});

test('closes after 3 uses spanning 7 days', () => {
  let g = onUsed(fresh, t0);
  g = onUsed(g, new Date(t0.getTime() + 2 * DAY));
  g = onUsed(g, new Date(t0.getTime() + 5 * DAY));
  assert.equal(g.status, 'practicing'); // 3 uses but only 5 days
  g = onUsed(g, new Date(t0.getTime() + 8 * DAY));
  assert.equal(g.status, 'closed');
});

test('getting stuck resets the interval and reopens closed gaps', () => {
  const closed: GapSchedule = { ...fresh, status: 'closed', interval_days: 20, times_used: 4 };
  const g = onStuck(closed, t0);
  assert.equal(g.status, 'practicing');
  assert.equal(g.interval_days, 0);
  assert.equal(g.times_stuck, 2);
  assert.equal(g.next_due_at, t0.toISOString());
  assert.equal(onStuck(fresh, t0).status, 'new');
});

test('use after a stuck reset still grows the interval', () => {
  const reset: GapSchedule = { ...fresh, status: 'practicing', first_used_at: t0.toISOString(), interval_days: 0 };
  assert.equal(onUsed(reset, t0).interval_days, 2.5);
});
