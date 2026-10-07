import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractClosedString } from '../supabase/functions/_shared/stream-json.ts';

test('returns null until the string has closed', () => {
  assert.equal(extractClosedString('{"say": "幾位', 'say'), null);
  assert.equal(extractClosedString('{"sa', 'say'), null);
  assert.equal(extractClosedString('', 'say'), null);
});

test('returns the string as soon as it closes', () => {
  assert.equal(extractClosedString('{"say": "幾位啦？"', 'say'), '幾位啦？');
  assert.equal(extractClosedString('{"say":"得","segments":[{"hanzi":"得"', 'say'), '得');
});

test('handles escapes and spaces', () => {
  assert.equal(extractClosedString('{ "say" : "他說\\"好\\"\\n" }', 'say'), '他說"好"\n');
  assert.equal(extractClosedString('{"say": "a\\\\', 'say'), null);
  assert.equal(extractClosedString('{"say": "a\\\\"', 'say'), 'a\\');
});
