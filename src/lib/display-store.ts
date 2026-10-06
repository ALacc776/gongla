import { create } from 'zustand';

export type Layer = 'hanzi' | 'jyutping' | 'english';

type DisplayState = Record<Layer, boolean> & {
  slow: boolean;
  autoplay: boolean;
  toggle: (layer: Layer) => void;
  set: (values: Partial<Record<Layer | 'slow' | 'autoplay', boolean>>) => void;
};

export const useDisplayStore = create<DisplayState>((set) => ({
  hanzi: true,
  jyutping: true,
  english: true,
  slow: false,
  autoplay: false,
  toggle: (layer) => set((state) => ({ [layer]: !state[layer] })),
  set: (values) => set(values),
}));
