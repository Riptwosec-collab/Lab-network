import { create } from "zustand";

import type { TopologySnapshot } from "@/types/network";

const HISTORY_LIMIT = 50;

interface HistoryState {
  readonly past: TopologySnapshot[];
  readonly future: TopologySnapshot[];
  record(snapshot: TopologySnapshot): void;
  undo(current: TopologySnapshot): TopologySnapshot | undefined;
  redo(current: TopologySnapshot): TopologySnapshot | undefined;
  clear(): void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  record: (snapshot) =>
    set((state) => ({ past: [...state.past, structuredClone(snapshot)].slice(-HISTORY_LIMIT), future: [] })),
  undo: (current) => {
    const { past, future } = get();
    const previous = past.at(-1);
    if (!previous) return undefined;
    set({ past: past.slice(0, -1), future: [structuredClone(current), ...future] });
    return structuredClone(previous);
  },
  redo: (current) => {
    const { past, future } = get();
    const next = future[0];
    if (!next) return undefined;
    set({ past: [...past, structuredClone(current)].slice(-HISTORY_LIMIT), future: future.slice(1) });
    return structuredClone(next);
  },
  clear: () => set({ past: [], future: [] }),
}));
