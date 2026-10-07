import { withSupabase } from 'npm:@supabase/server@1';

import { recognize } from '../_shared/azure.ts';
import { startTimer } from '../_shared/timing.ts';

const MAX_BYTES = 2_000_000; // about 60 s of 16 kHz mono 16-bit audio

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
      const text = await recognize(audio);
      timer.mark('azure');
      return Response.json({ text, timings: { ...timer.done(), audio_bytes: audio.length } });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 502 });
    }
  }),
};
