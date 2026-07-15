import { nanoid } from "nanoid";

import {
  applyConfiguration,
  createDeviceConfigurationState,
  restoreStartupConfiguration,
  rollbackLastConfiguration,
  saveStartupConfig,
} from "@/domain/configuration/configuration-engine";
import { useConfigurationStore } from "@/stores/configuration-store";
import { useProjectStore } from "@/stores/project-store";
import { useTopologyStore } from "@/stores/topology-store";
import type {
  ConfigurationSource,
  ConfigurationValidationResult,
  DeviceConfigurationState,
  DeviceRuntimeConfig,
  NetworkDevice,
} from "@/types/network";

export interface ConfigurationActionResult {
  readonly applied: boolean;
  readonly validation: ConfigurationValidationResult;
  readonly deviceState: DeviceConfigurationState;
}

export function applyDeviceConfiguration(
  deviceId: string,
  candidate: DeviceRuntimeConfig,
  source: ConfigurationSource,
): ConfigurationActionResult {
  const topology = useTopologyStore.getState();
  const device = topology.devices.find((item) => item.id === deviceId);
  if (!device) throw new Error("Device not found");
  const currentState = ensureDeviceState(device);
  const result = applyConfiguration(currentState, device, candidate, source);
  useConfigurationStore.getState().replaceDeviceState(result.nextState);
  if (result.nextState.validationResult.valid) {
    const nextDevice = withOperationalInterfaceState(result.nextDevice);
    topology.updateDevice(deviceId, withoutId(nextDevice));
    recalculateAttachedLinks(nextDevice);
    appendAudit(
      deviceId,
      "CONFIG_COMMITTED",
      source,
      `Applied configuration to ${nextDevice.hostname}`,
      result.nextState.revisions.at(-1)?.revisionId,
    );
  } else {
    appendAudit(deviceId, "CONFIG_CHANGED", source, "Configuration validation failed");
  }
  syncProjectConfiguration();
  return {
    applied: result.nextState.validationResult.valid,
    validation: result.nextState.validationResult,
    deviceState: result.nextState,
  };
}

export function saveDeviceStartupConfig(
  deviceId: string,
  source: ConfigurationSource = "system",
): DeviceConfigurationState {
  const device = useTopologyStore.getState().devices.find((item) => item.id === deviceId);
  if (!device) throw new Error("Device not found");
  const nextState = saveStartupConfig(ensureDeviceState(device));
  useConfigurationStore.getState().replaceDeviceState(nextState);
  appendAudit(
    deviceId,
    "CONFIG_SAVED",
    source,
    `Saved running configuration for ${device.hostname}`,
    nextState.revisions.at(-1)?.revisionId,
  );
  syncProjectConfiguration();
  return nextState;
}

export function rollbackDeviceConfiguration(deviceId: string): ConfigurationActionResult | undefined {
  const topology = useTopologyStore.getState();
  const device = topology.devices.find((item) => item.id === deviceId);
  if (!device) throw new Error("Device not found");
  const result = rollbackLastConfiguration(ensureDeviceState(device), device);
  if (!result) return undefined;
  useConfigurationStore.getState().replaceDeviceState(result.nextState);
  const nextDevice = withOperationalInterfaceState(result.nextDevice);
  topology.updateDevice(deviceId, withoutId(nextDevice));
  recalculateAttachedLinks(nextDevice);
  appendAudit(deviceId, "CONFIG_ROLLBACK", "system", `Rolled back configuration on ${result.nextDevice.hostname}`);
  syncProjectConfiguration();
  return { applied: true, validation: result.nextState.validationResult, deviceState: result.nextState };
}

export function restoreDeviceStartupConfig(deviceId: string): ConfigurationActionResult {
  const topology = useTopologyStore.getState();
  const device = topology.devices.find((item) => item.id === deviceId);
  if (!device) throw new Error("Device not found");
  const result = restoreStartupConfiguration(ensureDeviceState(device), device);
  useConfigurationStore.getState().replaceDeviceState(result.nextState);
  const nextDevice = withOperationalInterfaceState(result.nextDevice);
  topology.updateDevice(deviceId, withoutId(nextDevice));
  recalculateAttachedLinks(nextDevice);
  appendAudit(
    deviceId,
    "CONFIG_COMMITTED",
    "system",
    `Restored startup configuration on ${result.nextDevice.hostname}`,
  );
  syncProjectConfiguration();
  return { applied: true, validation: result.nextState.validationResult, deviceState: result.nextState };
}

export function ensureDeviceState(device: NetworkDevice): DeviceConfigurationState {
  const store = useConfigurationStore.getState();
  const existing = store.configurationState.devices[device.id];
  if (existing) return existing;
  const created = createDeviceConfigurationState(device);
  store.replaceDeviceState(created);
  return created;
}

function recalculateAttachedLinks(updatedDevice: NetworkDevice): void {
  const topology = useTopologyStore.getState();
  for (const connection of topology.connections) {
    if (connection.sourceDeviceId !== updatedDevice.id && connection.targetDeviceId !== updatedDevice.id) continue;
    const sourceDevice =
      connection.sourceDeviceId === updatedDevice.id
        ? updatedDevice
        : topology.devices.find((item) => item.id === connection.sourceDeviceId);
    const targetDevice =
      connection.targetDeviceId === updatedDevice.id
        ? updatedDevice
        : topology.devices.find((item) => item.id === connection.targetDeviceId);
    const sourceInterface = sourceDevice?.interfaces.find((item) => item.id === connection.sourceInterfaceId);
    const targetInterface = targetDevice?.interfaces.find((item) => item.id === connection.targetInterfaceId);
    const active = sourceInterface?.status === "up" && targetInterface?.status === "up";
    topology.updateConnection(connection.id, { status: active ? "up" : "down" }, false);
  }
}

function withOperationalInterfaceState(device: NetworkDevice): NetworkDevice {
  const connections = useTopologyStore.getState().connections;
  return {
    ...device,
    interfaces: device.interfaces.map((networkInterface) => {
      if (networkInterface.status === "administratively-down" || networkInterface.status === "disabled")
        return networkInterface;
      const connected = connections.some(
        (connection) =>
          connection.sourceInterfaceId === networkInterface.id || connection.targetInterfaceId === networkInterface.id,
      );
      return { ...networkInterface, status: connected ? "up" : "down" };
    }),
  };
}

function appendAudit(
  deviceId: string,
  type: "CONFIG_CHANGED" | "CONFIG_COMMITTED" | "CONFIG_SAVED" | "CONFIG_ROLLBACK",
  source: ConfigurationSource,
  message: string,
  revisionId?: string,
): void {
  useConfigurationStore.getState().appendAudit({
    id: nanoid(),
    timestamp: new Date().toISOString(),
    deviceId,
    type,
    source,
    message,
    revisionId,
  });
}

function syncProjectConfiguration(): void {
  useProjectStore.getState().updateConfigurationState(useConfigurationStore.getState().configurationState);
}

function withoutId(device: NetworkDevice): Partial<Omit<NetworkDevice, "id">> {
  const { id, ...updates } = device;
  void id;
  return updates;
}
