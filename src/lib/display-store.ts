import { create } from 'zustand';

export type Layer = 'hanzi' | 'jyutping' | 'english';

type DisplayState = Record<Layer, boolean> & {
  slow: boolean;
  autoplay: boolean;
  // F14: send what the mic heard straight away instead of filling the text box.
  autoSend: boolean;
  toggle: (layer: Layer) => void;
  set: (values: Partial<Record<Layer | 'slow' | 'autoplay' | 'autoSend', boolean>>) => void;
};

export const useDisplayStore = create<DisplayState>((set) => ({
  hanzi: true,
  jyutping: true,
  english: true,
  slow: false,
  autoplay: false,
  autoSend: true,
  toggle: (layer) => set((state) => ({ [layer]: !state[layer] })),
  set: (values) => set(values),
}));
