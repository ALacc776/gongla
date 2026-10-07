import { create } from 'zustand';

// On-device timings, shown under messages in development builds (Expo Go) only,
// so slow steps can be seen on a real phone. scripts/bench.mjs measures the backend.
export const SHOW_TIMINGS = __DEV__;

type PerfState = {
  // Keyed by message id: how long the reply took, and how long the voice took to hear.
  reply: Record<string, number>;
  heard: Record<string, number>;
  // Keyed by spoken text: tap (or auto-play) until the audio actually starts.
  voice: Record<string, number>;
  record: (kind: 'reply' | 'heard' | 'voice', key: string, ms: number) => void;
};

export const usePerfStore = create<PerfState>((set) => ({
  reply: {},
  heard: {},
  voice: {},
  record: (kind, key, ms) => set((s) => ({ [kind]: { ...s[kind], [key]: Math.round(ms) } })),
}));

export function formatSeconds(ms: number | undefined) {
  return ms === undefined ? undefined : `${(ms / 1000).toFixed(1)}s`;
}
