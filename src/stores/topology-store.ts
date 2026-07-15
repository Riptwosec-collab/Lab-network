import { nanoid } from "nanoid";
import { create } from "zustand";

import { applyRuntimeConfig, createDeviceConfigurationState } from "@/domain/configuration/configuration-engine";
import { canUseCable, isInterfaceAvailable } from "@/domain/interfaces/port-compatibility";
import { connectionSchema, deviceSchema } from "@/schemas/network.schema";
import { useConfigurationStore } from "@/stores/configuration-store";
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
  updateConnection(
    connectionId: string,
    updates: Partial<Omit<NetworkConnection, "id">>,
    recordHistory?: boolean,
  ): void;
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
    const parsedDevice = deviceSchema.parse(input);
    const deviceState = createDeviceConfigurationState(parsedDevice);
    const device = deviceSchema.parse(applyRuntimeConfig(parsedDevice, deviceState.runningConfig));
    useHistoryStore.getState().record(snapshotFrom(get()));
    set((state) => ({
      devices: [...state.devices, device],
      selectedDeviceId: device.id,
      selectedConnectionId: undefined,
    }));
    useConfigurationStore.getState().replaceDeviceState(deviceState);
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
    useConfigurationStore.getState().removeDeviceState(deviceId);
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
    const sourceDevice = state.devices.find((device) => device.id === connection.sourceDeviceId);
    const targetDevice = state.devices.find((device) => device.id === connection.targetDeviceId);
    if (!sourceDevice || !targetDevice) {
      throw new Error("Connection references an unknown device");
    }
    const sourceInterface = sourceDevice.interfaces.find((item) => item.id === connection.sourceInterfaceId);
    const targetInterface = targetDevice.interfaces.find((item) => item.id === connection.targetInterfaceId);
    if (connection.sourceInterfaceId && connection.targetInterfaceId && (!sourceInterface || !targetInterface)) {
      throw new Error("Connection references an unknown interface");
    }
    if (sourceInterface && targetInterface) {
      if (!isInterfaceAvailable(state, sourceInterface.id) || !isInterfaceAvailable(state, targetInterface.id)) {
        throw new Error("Selected interface is already connected");
      }
      const compatibility = canUseCable(sourceInterface, targetInterface, connection.cableType);
      if (!compatibility.compatible) throw new Error(compatibility.reason ?? "Incompatible interfaces");
    }
    useHistoryStore.getState().record(snapshotFrom(state));
    set((current) => ({ connections: [...current.connections, connection], selectedConnectionId: connection.id }));
  },
  updateConnection: (connectionId, updates, recordHistory = true) => {
    if (recordHistory) useHistoryStore.getState().record(snapshotFrom(get()));
    set((state) => ({
      connections: state.connections.map((connection) =>
        connection.id === connectionId ? connectionSchema.parse({ ...connection, ...updates }) : connection,
      ),
    }));
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
    const configuration = useConfigurationStore.getState();
    configuration.hydrate(configuration.configurationState, snapshot.devices);
  },
  undo: () => {
    const snapshot = useHistoryStore.getState().undo(snapshotFrom(get()));
    if (snapshot) {
      set({ ...snapshot, selectedDeviceId: undefined, selectedConnectionId: undefined });
      const configuration = useConfigurationStore.getState();
      configuration.hydrate(configuration.configurationState, snapshot.devices);
    }
  },
  redo: () => {
    const snapshot = useHistoryStore.getState().redo(snapshotFrom(get()));
    if (snapshot) {
      set({ ...snapshot, selectedDeviceId: undefined, selectedConnectionId: undefined });
      const configuration = useConfigurationStore.getState();
      configuration.hydrate(configuration.configurationState, snapshot.devices);
    }
  },
}));
