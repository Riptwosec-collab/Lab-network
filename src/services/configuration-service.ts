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
  ProjectConfigurationState,
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
    if (JSON.stringify(currentState.runningConfig.switching?.vlans) !== JSON.stringify(candidate.switching?.vlans))
      appendAudit(deviceId, "VLAN_CHANGED", source, `Updated VLAN database on ${nextDevice.hostname}`);
    if (
      JSON.stringify(currentState.runningConfig.switching?.spanningTree) !==
      JSON.stringify(candidate.switching?.spanningTree)
    )
      appendAudit(deviceId, "STP_CHANGED", source, `Updated spanning-tree on ${nextDevice.hostname}`);
    if (
      JSON.stringify(currentState.runningConfig.switching?.etherChannels) !==
      JSON.stringify(candidate.switching?.etherChannels)
    )
      appendAudit(deviceId, "ETHERCHANNEL_CHANGED", source, `Updated EtherChannel on ${nextDevice.hostname}`);
    if (JSON.stringify(currentState.runningConfig.routing) !== JSON.stringify(candidate.routing)) {
      const eventType =
        candidate.routing.staticRoutes.length >= currentState.runningConfig.routing.staticRoutes.length
          ? "ROUTE_ADDED"
          : "ROUTE_REMOVED";
      appendAudit(deviceId, eventType, source, `Updated routing table on ${nextDevice.hostname}`);
      if (JSON.stringify(currentState.runningConfig.routing.ospf) !== JSON.stringify(candidate.routing.ospf))
        appendAudit(deviceId, "OSPF_CHANGED", source, `Updated OSPF process on ${nextDevice.hostname}`);
    }
    if (JSON.stringify(currentState.runningConfig.services) !== JSON.stringify(candidate.services)) {
      appendAudit(deviceId, "SERVICE_CHANGED", source, `Updated services on ${nextDevice.hostname}`);
      if (JSON.stringify(currentState.runningConfig.services.acl) !== JSON.stringify(candidate.services.acl))
        appendAudit(deviceId, "ACL_CHANGED", source, `Updated ACL policy on ${nextDevice.hostname}`);
      if (JSON.stringify(currentState.runningConfig.services.nat) !== JSON.stringify(candidate.services.nat))
        appendAudit(deviceId, "NAT_CHANGED", source, `Updated NAT policy on ${nextDevice.hostname}`);
    }
    if (JSON.stringify(currentState.runningConfig.security) !== JSON.stringify(candidate.security)) {
      if (JSON.stringify(currentState.runningConfig.security.firewall) !== JSON.stringify(candidate.security.firewall))
        appendAudit(deviceId, "FIREWALL_CHANGED", source, `Updated firewall policy on ${nextDevice.hostname}`);
      if (JSON.stringify(currentState.runningConfig.security.vpn) !== JSON.stringify(candidate.security.vpn))
        appendAudit(deviceId, "VPN_CHANGED", source, `Updated VPN configuration on ${nextDevice.hostname}`);
      if (JSON.stringify(currentState.runningConfig.security.wireless) !== JSON.stringify(candidate.security.wireless))
        appendAudit(deviceId, "WIRELESS_CHANGED", source, `Updated wireless configuration on ${nextDevice.hostname}`);
      if (JSON.stringify(currentState.runningConfig.security.radius) !== JSON.stringify(candidate.security.radius))
        appendAudit(deviceId, "RADIUS_CHANGED", source, `Updated RADIUS configuration on ${nextDevice.hostname}`);
    }
    if (JSON.stringify(currentState.runningConfig.operations) !== JSON.stringify(candidate.operations)) {
      if (
        JSON.stringify(currentState.runningConfig.operations.highAvailability) !==
        JSON.stringify(candidate.operations.highAvailability)
      )
        appendAudit(deviceId, "HA_CHANGED", source, `Updated high availability on ${nextDevice.hostname}`);
      if (
        JSON.stringify(currentState.runningConfig.operations.monitoring) !==
        JSON.stringify(candidate.operations.monitoring)
      )
        appendAudit(deviceId, "MONITORING_CHANGED", source, `Updated monitoring on ${nextDevice.hostname}`);
    }
    if (JSON.stringify(currentState.runningConfig.storage) !== JSON.stringify(candidate.storage))
      appendAudit(deviceId, "STORAGE_CHANGED", source, `Updated storage configuration on ${nextDevice.hostname}`);
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
  type: ProjectConfigurationState["auditLog"][number]["type"],
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
