// Mandarin leak detector (design doc F4). Pure, no imports.

// Weighted Mandarin markers. Longer forms first so they match before their parts.
const MANDARIN_MARKERS: [string, number][] = [
  ['沒有', 2],
  ['没有', 2],
  ['什麼', 2],
  ['什么', 2],
  ['怎麼', 2],
  ['怎么', 2],
  ['這', 2],
  ['这', 2],
  ['們', 2],
  ['们', 2],
  ['是', 2],
  ['他', 2],
  ['她', 2],
  ['看', 2],
  ['說', 2],
  ['说', 2],
  ['不', 1],
  ['的', 1],
  ['了', 1],
  ['在', 1],
  ['那', 1],
  ['嗎', 1],
  ['吗', 1],
];

// Cantonese words that contain marker characters. Removed before scanning.
const ALLOWLIST = [
  '的士', '的確', '目的', '的而且確',
  '但係', '是但', '於是', '凡是',
  '不過', '不如', '不得了', '不停', '不錯', '不同', '不好意思', '不斷', '不知不覺', '不少', '不論',
  '睇下', '看護',
  '實在', '現在', '存在', '自在', '好在', '在於', '在場', '所在',
  '了解', '為了', '受不了', '大不了', '了不起', '未了',
  '小說', '傳說', '說明', '說話',
  '那麼',
];

const CANTONESE_MARKERS = [
  '係', '唔', '嘅', '咗', '冇', '佢', '喺', '啲', '嘢', '嚟', '乜', '咩', '嗰', '呢', '哋',
  '㗎', '喇', '嘞', '囉', '喎', '啦', '吖', '噉', '咁', '緊', '畀', '俾', '睇', '講', '嘥', '咪',
  '揾', '搵', '攞', '仲', '晒', '先', '啱', '靚', '食', '飲', '嚿', '嗮', '呀', '喂', '哦', '咋',
];

export type MandarinCheck = { score: number; hits: string[] };

function maskAllowlisted(text: string): string {
  let scan = text;
  for (const word of ALLOWLIST) scan = scan.split(word).join('　'.repeat(word.length));
  return scan;
}

export function checkMandarin(text: string): MandarinCheck {
  let scan = maskAllowlisted(text);

  let score = 0;
  const hits: string[] = [];
  for (const [marker, weight] of MANDARIN_MARKERS) {
    const count = scan.split(marker).length - 1;
    if (count > 0) {
      score += weight * count;
      hits.push(marker);
      scan = scan.split(marker).join('　');
    }
  }

  const hanCount = (text.match(/\p{Script=Han}/gu) ?? []).length;
  const hasCantoneseMarker = CANTONESE_MARKERS.some((m) => text.includes(m));
  if (!hasCantoneseMarker && hanCount > 6) score += 2;

  return { score, hits };
}

export const MANDARIN_THRESHOLD = 2;

// Unambiguous Mandarin -> Cantonese swaps, longest first. Used to build a
// correction when the model misses one in the learner's message.
const SWAPS: [string, string][] = [
  ['他們', '佢哋'],
  ['她們', '佢哋'],
  ['我們', '我哋'],
  ['你們', '你哋'],
  ['沒有', '冇'],
  ['没有', '冇'],
  ['什麼', '乜嘢'],
  ['什么', '乜嘢'],
  ['是', '係'],
  ['不', '唔'],
  ['他', '佢'],
  ['她', '佢'],
  ['在', '喺'],
  ['看', '睇'],
  ['說', '講'],
  ['这', '呢'],
  ['這', '呢'],
  ['那', '嗰'],
];

export type Cantonized = { better: string; swaps: [string, string][] };

// Rewrites the clear Mandarin words in a sentence, leaving allowlisted words alone.
export function cantonize(text: string): Cantonized {
  const masked = maskAllowlisted(text);
  const chars = [...text];
  const maskedChars = [...masked];
  const swaps: [string, string][] = [];
  let out = '';
  for (let i = 0; i < chars.length; ) {
    const swap = SWAPS.find(([from]) => maskedChars.slice(i, i + [...from].length).join('') === from);
    if (swap) {
      out += swap[1];
      if (!swaps.some(([f]) => f === swap[0])) swaps.push(swap);
      i += [...swap[0]].length;
    } else {
      out += chars[i];
      i++;
    }
  }
  return { better: out, swaps };
}
