import { nanoid } from "nanoid";
import { create } from "zustand";

import { connectionSchema, deviceSchema } from "@/schemas/network.schema";
import { useHistoryStore } from "@/stores/history-store";
import type { NetworkConnection, NetworkDevice, TopologySnapshot } from "@/types/network";

interface TopologyState extends TopologySnapshot {
  readonly selectedDeviceId?: string;
  readonly selectedConnectionId?: string;
  addDevice(device: NetworkDevice): void;
  updateDevice(deviceId: string, updates: Partial<Omit<NetworkDevice, "id">>, recordHistory?: boolean): void;
  moveDevice(deviceId: string, position: { x: number; y: number }): void;
  removeDevice(deviceId: string): void;
  duplicateDevice(deviceId: string): void;
  addConnection(connection: NetworkConnection): void;
  removeConnection(connectionId: string): void;
  selectDevice(deviceId?: string): void;
  selectConnection(connectionId?: string): void;
  replaceTopology(snapshot: TopologySnapshot, resetHistory?: boolean): void;
  undo(): void;
  redo(): void;
}

const emptySnapshot = (): TopologySnapshot => ({ devices: [], connections: [], groups: [] });
const snapshotFrom = (state: Pick<TopologyState, "devices" | "connections" | "groups">): TopologySnapshot => ({
  devices: state.devices,
  connections: state.connections,
  groups: state.groups,
});

export const useTopologyStore = create<TopologyState>((set, get) => ({
  ...emptySnapshot(),
  selectedDeviceId: undefined,
  selectedConnectionId: undefined,
  addDevice: (input) => {
    const device = deviceSchema.parse(input);
    useHistoryStore.getState().record(snapshotFrom(get()));
    set((state) => ({
      devices: [...state.devices, device],
      selectedDeviceId: device.id,
      selectedConnectionId: undefined,
    }));
  },
  updateDevice: (deviceId, updates, recordHistory = true) => {
    if (recordHistory) useHistoryStore.getState().record(snapshotFrom(get()));
    set((state) => ({
      devices: state.devices.map((device) =>
        device.id === deviceId
          ? deviceSchema.parse({ ...device, ...updates, updatedAt: new Date().toISOString() })
          : device,
      ),
    }));
  },
  moveDevice: (deviceId, position) => get().updateDevice(deviceId, { position }, false),
  removeDevice: (deviceId) => {
    useHistoryStore.getState().record(snapshotFrom(get()));
    set((state) => ({
      devices: state.devices.filter((device) => device.id !== deviceId),
      connections: state.connections.filter(
        (connection) => connection.sourceDeviceId !== deviceId && connection.targetDeviceId !== deviceId,
      ),
      selectedDeviceId: state.selectedDeviceId === deviceId ? undefined : state.selectedDeviceId,
    }));
  },
  duplicateDevice: (deviceId) => {
    const source = get().devices.find((device) => device.id === deviceId);
    if (!source) return;
    const now = new Date().toISOString();
    get().addDevice({
      ...structuredClone(source),
      id: nanoid(),
      name: `${source.name} Copy`,
      hostname: `${source.hostname}-copy`,
      position: { x: source.position.x + 36, y: source.position.y + 36 },
      interfaces: source.interfaces.map((networkInterface) => ({
        ...networkInterface,
        id: nanoid(),
        connectedEdgeId: undefined,
      })),
      createdAt: now,
      updatedAt: now,
    });
  },
  addConnection: (input) => {
    const connection = connectionSchema.parse(input);
    const state = get();
    if (
      !state.devices.some((device) => device.id === connection.sourceDeviceId) ||
      !state.devices.some((device) => device.id === connection.targetDeviceId)
    ) {
      throw new Error("Connection references an unknown device");
    }
    useHistoryStore.getState().record(snapshotFrom(state));
    set((current) => ({ connections: [...current.connections, connection], selectedConnectionId: connection.id }));
  },
  removeConnection: (connectionId) => {
    useHistoryStore.getState().record(snapshotFrom(get()));
    set((state) => ({ connections: state.connections.filter((connection) => connection.id !== connectionId) }));
  },
  selectDevice: (selectedDeviceId) => set({ selectedDeviceId, selectedConnectionId: undefined }),
  selectConnection: (selectedConnectionId) => set({ selectedConnectionId, selectedDeviceId: undefined }),
  replaceTopology: (snapshot, resetHistory = true) => {
    if (resetHistory) useHistoryStore.getState().clear();
    set({ ...structuredClone(snapshot), selectedDeviceId: undefined, selectedConnectionId: undefined });
  },
  undo: () => {
    const snapshot = useHistoryStore.getState().undo(snapshotFrom(get()));
    if (snapshot) set({ ...snapshot, selectedDeviceId: undefined, selectedConnectionId: undefined });
  },
  redo: () => {
    const snapshot = useHistoryStore.getState().redo(snapshotFrom(get()));
    if (snapshot) set({ ...snapshot, selectedDeviceId: undefined, selectedConnectionId: undefined });
  },
}));
