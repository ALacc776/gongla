import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useCallback } from 'react';

import { invokeTts } from '@/lib/api';
import { useDisplayStore } from '@/lib/display-store';
import { usePerfStore } from '@/lib/perf-store';
import { useProfile } from '@/lib/profile';

const SLOW_RATE = 0.7;

let player: AudioPlayer | null = null;
// Signed URLs from the tts function, keyed by voice + rate + text. Valid for a day.
const urlCache = new Map<string, string>();

export async function setPlaybackMode() {
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
}

// Starts playback and resolves once audio is actually playing (or after 10 s).
export async function playUrl(url: string) {
  if (!player) {
    await setPlaybackMode();
    player = createAudioPlayer(null);
  }
  const current = player;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(finish, 10_000);
    const sub = current.addListener('playbackStatusUpdate', (status) => {
      if (status.playing) finish();
    });
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      sub.remove();
      resolve();
    }
    current.replace({ uri: url });
    current.play();
  });
}

export function stopPlayback() {
  player?.pause();
}

// F10: returns speak(text), which plays Cantonese through the cached tts function.
export function useSpeaker(voiceOverride?: string) {
  const { data: profile } = useProfile();
  const slow = useDisplayStore((s) => s.slow);
  const voice = voiceOverride ?? profile?.voice ?? 'zh-HK-HiuMaanNeural';
  const rate = slow ? SLOW_RATE : (profile?.speech_rate ?? 0.85);

  return useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      const key = `${voice}|${rate}|${clean}`;
      const started = Date.now();
      try {
        let url = urlCache.get(key);
        if (!url) {
          url = (await invokeTts(clean, voice, rate)).url;
          urlCache.set(key, url);
        }
        await playUrl(url);
        usePerfStore.getState().record('voice', clean, Date.now() - started);
      } catch (e) {
        console.warn('tts failed', e);
      }
    },
    [voice, rate],
  );
}
