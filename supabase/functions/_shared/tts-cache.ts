import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { DEFAULT_VOICE, synthesize, VOICES, type AudioFormat } from './azure.ts';
import { countUsage } from './usage.ts';

// The shared TTS cache (F10): one file per voice + rate + format + text in the
// private `tts` bucket, indexed by `tts_cache`. Used by `tts` and by `chat`, which
// streams the reply's voice inline.
export const TTS_BUCKET = 'tts';
export const MAX_TTS_LENGTH = 300;

export type TtsParams = { text: string; voice: string; rate: number; format: AudioFormat };

export function ttsParams(raw: { text?: unknown; voice?: unknown; rate?: unknown; format?: unknown }): TtsParams | null {
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  if (!text || text.length > MAX_TTS_LENGTH) return null;
  const voice = typeof raw.voice === 'string' && (VOICES as readonly string[]).includes(raw.voice) ? raw.voice : DEFAULT_VOICE;
  const rateNumber = Number(raw.rate);
  const rate = Number.isFinite(rateNumber) ? Math.min(Math.max(Math.round(rateNumber * 100) / 100, 0.5), 1.5) : 1;
  return { text, voice, rate, format: raw.format === 'wav' ? 'wav' : 'mp3' };
}

export async function ttsHash({ text, voice, rate, format }: TtsParams) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${voice}|${rate}|${format}|${text}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function ttsPath(hash: string, format: AudioFormat) {
  return `${hash.slice(0, 2)}/${hash}.${format}`;
}

export async function saveTts(admin: SupabaseClient, userId: string, params: TtsParams, audio: Uint8Array) {
  const hash = await ttsHash(params);
  const path = ttsPath(hash, params.format);
  const contentType = params.format === 'wav' ? 'audio/wav' : 'audio/mpeg';
  const { error } = await admin.storage.from(TTS_BUCKET).upload(path, audio, { contentType, upsert: true });
  if (error) {
    console.error('tts upload failed', error);
    return;
  }
  await admin.from('tts_cache').upsert({ hash, storage_path: path });
  await countUsage(admin, userId, 'tts_chars', params.text.length);
}

export function concatBytes(chunks: Uint8Array[]) {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// The whole clip for a phrase: from the cache if it's there, else from Azure
// (saved to the cache by `background`, so the caller doesn't wait for the upload).
export async function ttsBytes(
  admin: SupabaseClient,
  userId: string,
  params: TtsParams,
  background: (work: Promise<unknown>) => void,
): Promise<Uint8Array> {
  const { data: cached } = await admin.from('tts_cache').select('storage_path').eq('hash', await ttsHash(params)).maybeSingle();
  if (cached) {
    const { data } = await admin.storage.from(TTS_BUCKET).download(cached.storage_path);
    if (data) return new Uint8Array(await data.arrayBuffer());
  }
  const audio = await synthesize(params.text, params.voice, params.rate, params.format);
  background(saveTts(admin, userId, params, audio).catch((e) => console.error('tts cache save failed', e)));
  return audio;
}
