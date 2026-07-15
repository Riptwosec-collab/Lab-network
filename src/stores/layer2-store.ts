import { create } from "zustand";

import type {
  EtherChannelState,
  Layer2TraceResult,
  MacAddressEntry,
  SpanningTreeState,
} from "@/engine/protocols/layer2-engine";

interface Layer2StoreState {
  readonly macTable: readonly MacAddressEntry[];
  readonly spanningTreeByVlan: Readonly<Record<string, SpanningTreeState>>;
  readonly etherChannels: readonly EtherChannelState[];
  readonly lastTrace?: Layer2TraceResult;
  recordTrace(trace: Layer2TraceResult): void;
  reset(): void;
}

const initialState = () => ({
  macTable: [] as readonly MacAddressEntry[],
  spanningTreeByVlan: {} as Readonly<Record<string, SpanningTreeState>>,
  etherChannels: [] as readonly EtherChannelState[],
  lastTrace: undefined,
});

export const useLayer2Store = create<Layer2StoreState>((set) => ({
  ...initialState(),
  recordTrace: (trace) =>
    set((state) => ({
      macTable: mergeMacEntries(state.macTable, trace.macTable),
      spanningTreeByVlan: { ...state.spanningTreeByVlan, [String(trace.vlanId)]: trace.spanningTree },
      etherChannels: trace.etherChannels,
      lastTrace: trace,
    })),
  reset: () => set(initialState()),
}));

function mergeMacEntries(
  current: readonly MacAddressEntry[],
  learned: readonly MacAddressEntry[],
): readonly MacAddressEntry[] {
  const entries = new Map(
    current.map((entry) => [`${entry.switchDeviceId}:${entry.vlanId}:${entry.macAddress}`, entry]),
  );
  for (const entry of learned) {
    entries.set(`${entry.switchDeviceId}:${entry.vlanId}:${entry.macAddress}`, entry);
  }
  return [...entries.values()].slice(-1_000);
}
