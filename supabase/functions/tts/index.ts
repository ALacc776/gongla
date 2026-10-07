import { withSupabase } from 'npm:@supabase/server@1';

import { synthesize } from '../_shared/azure.ts';
import { saveTts, ttsHash, ttsParams, ttsPath, TTS_BUCKET } from '../_shared/tts-cache.ts';
import { startTimer } from '../_shared/timing.ts';

const URL_TTL_SECONDS = 24 * 60 * 60;

// F10: Cantonese speech for a phrase, cached in Storage so it is synthesized once
// for everyone. (A reply's voice usually arrives inline with the chat stream; this
// is for replays, single words, the Word Bank and the tutor.)
//
// GET  /tts?text=&voice=&rate=   the MP3 itself. Cached phrases redirect to Storage.
// POST /tts {text, voice, rate, format}   a signed URL (scripts/bench.mjs uses WAV).
export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const timer = startTimer();
    const userId = ctx.userClaims?.id;
    if (!userId) return Response.json({ error: 'Not signed in' }, { status: 401 });

    const isGet = req.method === 'GET';
    const params = ttsParams(isGet ? Object.fromEntries(new URL(req.url).searchParams) : await req.json().catch(() => ({})));
    if (!params) return Response.json({ error: 'text is required (max 300 characters)' }, { status: 400 });

    const hash = await ttsHash(params);
    const { data: cached } = await ctx.supabaseAdmin.from('tts_cache').select('storage_path').eq('hash', hash).maybeSingle();
    timer.mark('cache_lookup');
    const signedUrl = async (path: string) =>
      (await ctx.supabaseAdmin.storage.from(TTS_BUCKET).createSignedUrl(path, URL_TTL_SECONDS)).data?.signedUrl ?? null;

    if (isGet && cached) {
      const url = await signedUrl(cached.storage_path);
      if (url) return Response.redirect(url, 302);
    }

    let audio: Uint8Array | null = null;
    if (!cached) {
      try {
        audio = await synthesize(params.text, params.voice, params.rate, params.format);
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 502 });
      }
      timer.mark('azure');
    }

    if (isGet) {
      // The whole clip with a length, which the phone's player handles far better than a stream.
      EdgeRuntime.waitUntil(saveTts(ctx.supabaseAdmin, userId, params, audio!).catch((e) => console.error(e)));
      return new Response(audio, {
        headers: { 'content-type': 'audio/mpeg', 'content-length': String(audio!.length), 'cache-control': 'no-store' },
      });
    }

    if (audio) {
      await saveTts(ctx.supabaseAdmin, userId, params, audio);
      timer.mark('upload');
    }
    const url = await signedUrl(cached?.storage_path ?? ttsPath(hash, params.format));
    if (!url) return Response.json({ error: 'Could not load the audio' }, { status: 500 });
    timer.mark('sign');
    return Response.json({ url, cached: !!cached, timings: timer.done() });
  }),
};

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
