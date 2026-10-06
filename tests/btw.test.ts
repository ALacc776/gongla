import assert from 'node:assert/strict';
import { test } from 'node:test';

import { routeInput } from '../src/lib/btw.ts';

test('/btw goes to the Ask panel', () => {
  assert.deepEqual(routeInput('/btw how do I say receipt?'), { kind: 'ask', question: 'how do I say receipt?' });
  assert.deepEqual(routeInput('  /BTW   why 喎?'), { kind: 'ask', question: 'why 喎?' });
  assert.deepEqual(routeInput('/btw'), { kind: 'ask', question: '' });
});

test('everything else goes to the roleplay', () => {
  assert.deepEqual(routeInput('唔該'), { kind: 'chat', text: '唔該' });
  assert.deepEqual(routeInput('/btwx hi'), { kind: 'chat', text: '/btwx hi' });
  assert.deepEqual(routeInput('by the way /btw'), { kind: 'chat', text: 'by the way /btw' });
});
