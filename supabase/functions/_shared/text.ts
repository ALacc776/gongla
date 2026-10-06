// Pure text helpers shared by the Edge Functions. No imports, so they can be
// unit-tested with plain Node (see tests/).

const HAN = /\p{Script=Han}/gu;
const LATIN_RUN = /[A-Za-z]+[1-6]?/g;
// A Jyutping syllable: letters followed by a tone number, e.g. "nei5", "hou2".
const JYUTPING_SYLLABLE = /^[a-z]{1,6}[1-6]$/i;

export type InputAnalysis = {
  hanChars: number;
  jyutpingSyllables: number;
  englishWords: number;
};

// Counts what the learner typed: Chinese characters, Jyutping syllables and
// English words. Jyutping counts as Cantonese, not English.
export function analyzeInput(text: string): InputAnalysis {
  const hanChars = (text.match(HAN) ?? []).length;
  let jyutpingSyllables = 0;
  let englishWords = 0;
  for (const run of text.match(LATIN_RUN) ?? []) {
    if (JYUTPING_SYLLABLE.test(run)) jyutpingSyllables++;
    else englishWords++;
  }
  return { hanChars, jyutpingSyllables, englishWords };
}

export function hasHan(text: string): boolean {
  return /\p{Script=Han}/u.test(text);
}

// "A Receipt." -> "receipt"
export function normalizeEnglish(english: string): string {
  return english
    .toLowerCase()
    .trim()
    .replace(/^(a|an|the|to)\s+/, '')
    .replace(/[.!?,;:"'“”‘’]+$/g, '')
    .replace(/^["'“”‘’]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Keeps only Han characters and inner spaces trimmed: "單。" -> "單"
export function normalizeHanzi(hanzi: string): string {
  return hanzi.replace(/[\s\p{P}]/gu, '').trim();
}

// Share of the learner's messages that was Cantonese (F9):
// (Han chars + Jyutping syllables) / (that + English words). Null if nothing countable.
export function cantoneseRatio(messages: string[]): number | null {
  let cantonese = 0;
  let english = 0;
  for (const m of messages) {
    const a = analyzeInput(m);
    cantonese += a.hanChars + a.jyutpingSyllables;
    english += a.englishWords;
  }
  const total = cantonese + english;
  return total === 0 ? null : cantonese / total;
}
