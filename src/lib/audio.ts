import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { fetch as streamingFetch } from 'expo/fetch';
import type { File } from 'expo-file-system';
import { useCallback } from 'react';

import { ttsSource } from '@/lib/api';
import { clipFile } from '@/lib/clip-cache';
import { useDisplayStore } from '@/lib/display-store';
import { usePerfStore } from '@/lib/perf-store';
import { useProfile } from '@/lib/profile';

const SLOW_RATE = 0.7;

let player: AudioPlayer | null = null;

export async function setPlaybackMode() {
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
}

// Starting the audio system takes a couple of seconds the first time, so the chat
// screen calls this when it opens rather than on the first reply.
export async function warmUpAudio() {
  if (player) return;
  await setPlaybackMode();
  player = createAudioPlayer(null);
}

// Plays a file on the phone and resolves once audio is actually playing (or after 10 s).
// Local files start almost instantly; the phone's player is slow to start remote streams.
async function playFile(file: File) {
  await warmUpAudio();
  const current = player!;
  await new Promise<void>((resolve) => {
    let done = false;
    const timeout = setTimeout(finish, 10_000);
    const sub = current.addListener('playbackStatusUpdate', (status) => {
      if (status.playing) finish();
    });
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      sub.remove();
      resolve();
    }
    current.replace({ uri: file.uri });
    current.play();
  });
}

export function stopPlayback() {
  player?.pause();
}

export type VoiceSettings = { voice: string; rate: number };

// The voice and speed to use: the character's voice if given, else the learner's
// choice, slowed down when the 🐢 toggle is on.
export function useVoiceSettings(voiceOverride?: string): VoiceSettings {
  const { data: profile } = useProfile();
  const slow = useDisplayStore((s) => s.slow);
  return {
    voice: voiceOverride ?? profile?.voice ?? 'zh-HK-HiuMaanNeural',
    rate: slow ? SLOW_RATE : (profile?.speech_rate ?? 1),
  };
}

// A reply's voice arriving inline with the chat stream (base64 MP3 chunks). It is
// written to the phone as it arrives and played once complete.
export function receiveClip(text: string, { voice, rate }: VoiceSettings) {
  const file = clipFile(text, voice, rate);
  const started = Date.now();
  let failed = false;
  try {
    file.create({ overwrite: true });
  } catch {
    failed = true;
  }
  return {
    append(b64: string) {
      if (failed) return;
      try {
        file.write(b64, { encoding: 'base64', append: true });
      } catch (e) {
        failed = true;
        console.warn('saving voice failed', e);
      }
    },
    // Resolves false if the clip couldn't be saved, so the caller can fall back.
    async play() {
      if (failed) return false;
      await playFile(file);
      usePerfStore.getState().record('voice', text, Date.now() - started);
      return true;
    },
  };
}

// F10: returns speak(text). Plays from the phone's cache if heard before, otherwise
// fetches the clip from the tts function (cached on the server for everyone).
export function useSpeaker(voiceOverride?: string) {
  const { voice, rate } = useVoiceSettings(voiceOverride);

  return useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      const started = Date.now();
      try {
        const file = clipFile(clean, voice, rate);
        if (!file.exists) {
          const source = await ttsSource(clean, voice, rate);
          const res = await streamingFetch(source.uri, { headers: source.headers });
          if (!res.ok) throw new Error(`tts ${res.status}`);
          const bytes = new Uint8Array(await res.arrayBuffer());
          file.create({ overwrite: true });
          file.write(bytes);
        }
        await playFile(file);
        usePerfStore.getState().record('voice', clean, Date.now() - started);
      } catch (e) {
        console.warn('tts failed', e);
      }
    },
    [voice, rate],
  );
}
