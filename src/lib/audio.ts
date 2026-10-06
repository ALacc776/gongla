import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useCallback } from 'react';

import { invokeTts } from '@/lib/api';
import { useDisplayStore } from '@/lib/display-store';
import { useProfile } from '@/lib/profile';

const SLOW_RATE = 0.7;

let player: AudioPlayer | null = null;
// Signed URLs from the tts function, keyed by voice + rate + text. Valid for a day.
const urlCache = new Map<string, string>();

export async function setPlaybackMode() {
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
}

export async function playUrl(url: string) {
  if (!player) {
    await setPlaybackMode();
    player = createAudioPlayer(null);
  }
  player.replace({ uri: url });
  player.play();
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
      try {
        let url = urlCache.get(key);
        if (!url) {
          url = (await invokeTts(clean, voice, rate)).url;
          urlCache.set(key, url);
        }
        await playUrl(url);
      } catch (e) {
        console.warn('tts failed', e);
      }
    },
    [voice, rate],
  );
}
