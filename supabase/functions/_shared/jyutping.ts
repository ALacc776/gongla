import ToJyutping from 'npm:to-jyutping@3.1.1';

// Jyutping for one segment, e.g. "你好" -> "nei5 hou2". Punctuation and Latin
// letters return nothing. Done here, not by the model: models guess tones badly.
export function segmentJyutping(hanzi: string): string {
  return ToJyutping.getJyutpingList(hanzi)
    .map(([, jyutping]) => jyutping)
    .filter((j): j is string => j !== null)
    .join(' ');
}
