// Reads a string property out of a JSON object that is still being streamed in,
// so the reply can be spoken before the rest of the tool input arrives. Pure.

// Returns the decoded value of `key` once its closing quote has arrived, else null.
// Only top-level keys are expected to be used (the reply tool puts `say` first).
export function extractClosedString(buffer: string, key: string): string | null {
  const opener = new RegExp(`"${key}"\\s*:\\s*"`).exec(buffer);
  if (!opener) return null;
  const start = opener.index + opener[0].length;
  for (let i = start; i < buffer.length; i++) {
    const ch = buffer[i];
    if (ch === '\\') {
      i++; // skip the escaped character
      continue;
    }
    if (ch === '"') {
      try {
        return JSON.parse(buffer.slice(start - 1, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}
