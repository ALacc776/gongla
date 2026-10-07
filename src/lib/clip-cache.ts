import { File, Paths } from 'expo-file-system';

// Voice clips kept in the phone's cache folder, one per voice + rate + text, so a
// phrase heard (or prefetched) once plays instantly afterwards.
export function clipFile(text: string, voice: string, rate: number) {
  const key = `${voice}|${rate}|${text.trim()}`;
  let hash = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return new File(Paths.cache, `tts-${hash.toString(16)}-${key.length}.mp3`);
}

// Saves a whole clip that arrived as base64 (e.g. the opener's voice).
export function saveClip(texts: string[], voice: string, rate: number, b64: string) {
  for (const text of new Set(texts.map((t) => t.trim()).filter(Boolean))) {
    try {
      const file = clipFile(text, voice, rate);
      file.create({ overwrite: true });
      file.write(b64, { encoding: 'base64' });
    } catch (e) {
      console.warn('saving voice failed', e);
    }
  }
}
