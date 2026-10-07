import { withSupabase } from 'npm:@supabase/server@1';

import { recognize } from '../_shared/azure.ts';
import { startTimer } from '../_shared/timing.ts';

const MAX_BYTES = 2_000_000; // about 60 s of 16 kHz mono 16-bit audio

// Length and loudness of a 16-bit PCM WAV, so an empty result can say why
// (silence vs. speech that couldn't be understood). Peak is 0 to 1.
function measure(wav: Uint8Array): { seconds: number; peak: number } {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let i = 12;
  while (i + 8 <= wav.length) {
    const id = String.fromCharCode(wav[i], wav[i + 1], wav[i + 2], wav[i + 3]);
    const size = view.getUint32(i + 4, true);
    if (id === 'data') {
      let peak = 0;
      const end = Math.min(i + 8 + size, wav.length - 1);
      for (let j = i + 8; j < end; j += 2) peak = Math.max(peak, Math.abs(view.getInt16(j, true)));
      return { seconds: Math.round((size / 32000) * 10) / 10, peak: Math.round((peak / 32768) * 1000) / 1000 };
    }
    i += 8 + size + (size % 2);
  }
  return { seconds: 0, peak: 0 };
}

// F14: the app posts a WAV recording; the transcript goes back into the text box
// for the learner to check before sending.
export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const timer = startTimer();
    if (!ctx.userClaims?.id) return Response.json({ error: 'Not signed in' }, { status: 401 });

    const audio = new Uint8Array(await req.arrayBuffer());
    timer.mark('upload');
    if (audio.length < 1000) return Response.json({ error: 'That recording was too short' }, { status: 400 });
    if (audio.length > MAX_BYTES) return Response.json({ error: 'Keep recordings under a minute' }, { status: 400 });

    try {
      const { text, status } = await recognize(audio);
      timer.mark('azure');
      const { seconds, peak } = measure(audio);
      if (!text) console.warn('nothing recognised', { status, seconds, peak });
      return Response.json({ text, status, seconds, peak, timings: { ...timer.done(), audio_bytes: audio.length } });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 502 });
    }
  }),
};
