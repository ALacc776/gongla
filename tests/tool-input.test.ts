import assert from 'node:assert/strict';
import { test } from 'node:test';

import { asArray } from '../supabase/functions/_shared/tool-input.ts';

test('asArray keeps real arrays', () => {
  assert.deepEqual(asArray([{ hanzi: '你好', gloss: 'hello' }]), [{ hanzi: '你好', gloss: 'hello' }]);
  assert.deepEqual(asArray([]), []);
});

test('asArray parses an array sent as a JSON string', () => {
  assert.deepEqual(asArray('[{"hanzi":"你好","gloss":"hello"}]'), [{ hanzi: '你好', gloss: 'hello' }]);
});

test('asArray rejects anything that is not an array', () => {
  assert.equal(asArray('{"hanzi":"你好"}'), null);
  assert.equal(asArray('你好'), null);
  assert.equal(asArray(undefined), null);
  assert.equal(asArray({ length: 1 }), null);
});
