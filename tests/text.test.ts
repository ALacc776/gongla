import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  analyzeInput,
  cantoneseRatio,
  normalizeEnglish,
  normalizeHanzi,
} from '../supabase/functions/_shared/text.ts';

test('Jyutping counts as Cantonese, not English', () => {
  assert.deepEqual(analyzeInput('nei5 hou2'), { hanChars: 0, jyutpingSyllables: 2, englishWords: 0 });
});

test('mixed input is split into Han, Jyutping and English', () => {
  assert.deepEqual(analyzeInput('我想要 receipt, m4 goi1'), {
    hanChars: 3,
    jyutpingSyllables: 2,
    englishWords: 1,
  });
});

test('English words without tone numbers are English', () => {
  assert.equal(analyzeInput('two people please').englishWords, 3);
});

test('normalizeEnglish strips articles and punctuation', () => {
  assert.equal(normalizeEnglish('  A Receipt. '), 'receipt');
  assert.equal(normalizeEnglish('the bill'), 'bill');
  assert.equal(normalizeEnglish('To Order'), 'order');
  assert.equal(normalizeEnglish('iced lemon tea'), 'iced lemon tea');
});

test('normalizeHanzi drops punctuation and spaces', () => {
  assert.equal(normalizeHanzi(' 埋單！'), '埋單');
});

test('cantoneseRatio', () => {
  assert.equal(cantoneseRatio(['我要凍檸茶', 'no ice']), 5 / 7);
  assert.equal(cantoneseRatio(['nei5 hou2']), 1);
  assert.equal(cantoneseRatio(['hello there']), 0);
  assert.equal(cantoneseRatio(['', '!!!']), null);
});
