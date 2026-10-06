import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkMandarin, MANDARIN_THRESHOLD } from '../supabase/functions/_shared/mandarin.ts';

test('natural Cantonese passes', () => {
  for (const text of ['你好，想食啲咩呀？', '幾多位呀？', '我哋去搭的士啦', '唔該，埋單！', '不過佢唔喺度喎']) {
    const r = checkMandarin(text);
    assert.ok(r.score < MANDARIN_THRESHOLD, `${text}: ${JSON.stringify(r)}`);
  }
});

test('Mandarin is flagged', () => {
  for (const text of ['你要吃什麼？', '他是我的朋友', '我們沒有這個', '你在看什麼']) {
    const r = checkMandarin(text);
    assert.ok(r.score >= MANDARIN_THRESHOLD, `${text}: ${JSON.stringify(r)}`);
  }
});

test('allowlisted words do not trigger', () => {
  assert.equal(checkMandarin('現在搭的士').score, 0);
  assert.equal(checkMandarin('是但啦').score, 0);
});

test('long reply with no Cantonese markers is suspicious', () => {
  const r = checkMandarin('今天天氣很好我們去公園');
  assert.ok(r.score >= MANDARIN_THRESHOLD);
});

test('reports which markers were hit', () => {
  assert.deepEqual(checkMandarin('他是').hits.sort(), ['他', '是'].sort());
});

import { cantonize } from '../supabase/functions/_shared/mandarin.ts';

test('cantonize swaps clear Mandarin words', () => {
  assert.deepEqual(cantonize('我是學生'), { better: '我係學生', swaps: [['是', '係']] });
  assert.equal(cantonize('他們不在家').better, '佢哋唔喺家');
});

test('cantonize leaves allowlisted words alone', () => {
  assert.deepEqual(cantonize('現在搭的士'), { better: '現在搭的士', swaps: [] });
  assert.equal(cantonize('不過他是但').better, '不過佢是但');
});
