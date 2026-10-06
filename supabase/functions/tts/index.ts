import { withSupabase } from 'npm:@supabase/server@1';

import { DEFAULT_VOICE, synthesize, VOICES, type AudioFormat } from '../_shared/azure.ts';
import { countUsage } from '../_shared/usage.ts';

const BUCKET = 'tts';
const MAX_TEXT_LENGTH = 300;
const URL_TTL_SECONDS = 24 * 60 * 60;

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// F10: Cantonese speech, cached in Storage so each phrase is synthesized once for everyone.
export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const userId = ctx.userClaims?.id;
    if (!userId) return Response.json({ error: 'Not signed in' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > MAX_TEXT_LENGTH) {
      return Response.json({ error: 'text is required (max 300 characters)' }, { status: 400 });
    }
    const voice = (VOICES as readonly string[]).includes(body.voice) ? body.voice : DEFAULT_VOICE;
    const rate = typeof body.rate === 'number' ? Math.min(Math.max(Math.round(body.rate * 100) / 100, 0.5), 1.5) : 0.85;
    const format: AudioFormat = body.format === 'wav' ? 'wav' : 'mp3';

    const hash = await sha256(`${voice}|${rate}|${format}|${text}`);
    const path = `${hash.slice(0, 2)}/${hash}.${format}`;

    const { data: cached } = await ctx.supabaseAdmin.from('tts_cache').select('storage_path').eq('hash', hash).maybeSingle();
    if (!cached) {
      let audio;
      try {
        audio = await synthesize(text, voice, rate, format);
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 502 });
      }
      const { error: uploadError } = await ctx.supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, audio, { contentType: format === 'wav' ? 'audio/wav' : 'audio/mpeg', upsert: true });
      if (uploadError) {
        console.error('tts upload failed', uploadError);
        return Response.json({ error: 'Could not save the audio' }, { status: 500 });
      }
      await ctx.supabaseAdmin.from('tts_cache').upsert({ hash, storage_path: path });
      await countUsage(ctx.supabaseAdmin, userId, 'tts_chars', text.length);
    }

    const { data: signed, error } = await ctx.supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(cached?.storage_path ?? path, URL_TTL_SECONDS);
    if (error || !signed) return Response.json({ error: 'Could not load the audio' }, { status: 500 });

    return Response.json({ url: signed.signedUrl, cached: !!cached });
  }),
};
