import { create } from "zustand";

import { createProjectConfigurationState } from "@/domain/configuration/configuration-engine";
import type { DeviceConfigurationState, NetworkDevice, ProjectConfigurationState } from "@/types/network";

interface ConfigurationStoreState {
  readonly configurationState: ProjectConfigurationState;
  hydrate(configurationState: ProjectConfigurationState | undefined, devices: readonly NetworkDevice[]): void;
  replaceDeviceState(deviceState: DeviceConfigurationState): void;
  removeDeviceState(deviceId: string): void;
  appendAudit(event: ProjectConfigurationState["auditLog"][number]): void;
  reset(): void;
}

const emptyState = (): ProjectConfigurationState => ({ devices: {}, auditLog: [] });

export const useConfigurationStore = create<ConfigurationStoreState>((set) => ({
  configurationState: emptyState(),
  hydrate: (configurationState, devices) =>
    set({ configurationState: createProjectConfigurationState(devices, configurationState) }),
  replaceDeviceState: (deviceState) =>
    set((state) => ({
      configurationState: {
        ...state.configurationState,
        devices: { ...state.configurationState.devices, [deviceState.deviceId]: deviceState },
      },
    })),
  removeDeviceState: (deviceId) =>
    set((state) => {
      const devices = { ...state.configurationState.devices };
      delete devices[deviceId];
      return {
        configurationState: {
          devices,
          auditLog: state.configurationState.auditLog.filter((event) => event.deviceId !== deviceId),
        },
      };
    }),
  appendAudit: (event) =>
    set((state) => ({
      configurationState: {
        ...state.configurationState,
        auditLog: [...state.configurationState.auditLog, event].slice(-500),
      },
    })),
  reset: () => set({ configurationState: emptyState() }),
}));
