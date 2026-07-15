import { nanoid } from "nanoid";

import { analyzeIPv4, ipv4ToInteger } from "@/engine/protocols/ipv4";
import type {
  ConfigurationSource,
  ConfigurationValidationResult,
  DeviceConfigurationState,
  DeviceRuntimeConfig,
  NetworkDevice,
  ProjectConfigurationState,
} from "@/types/network";

const REVISION_LIMIT = 40;

const cleanValidation = (): ConfigurationValidationResult => ({ valid: true, issues: [] });

export function createDeviceRuntimeConfig(device: NetworkDevice): DeviceRuntimeConfig {
  return {
    system: {
      hostname: device.hostname,
      dnsServers: [],
      description: typeof device.configuration.description === "string" ? device.configuration.description : undefined,
    },
    interfaces: Object.fromEntries(
      device.interfaces.map((networkInterface) => [
        networkInterface.id,
        {
          interfaceId: networkInterface.id,
          enabled: networkInterface.status !== "administratively-down" && networkInterface.status !== "disabled",
          description: networkInterface.description,
          macAddress: networkInterface.macAddress,
          ipv4: networkInterface.ipv4,
          prefixLength: networkInterface.prefixLength,
          defaultGateway: networkInterface.defaultGateway,
          mtu: networkInterface.mtu,
          speedMbps: networkInterface.speedMbps,
          duplex: networkInterface.duplex,
        },
      ]),
    ),
    routing: { staticRoutes: [] },
    services: {},
  };
}

export function createDeviceConfigurationState(device: NetworkDevice): DeviceConfigurationState {
  const defaults = createDeviceRuntimeConfig(device);
  return {
    deviceId: device.id,
    defaultConfig: structuredClone(defaults),
    runningConfig: structuredClone(defaults),
    startupConfig: structuredClone(defaults),
    candidateConfig: structuredClone(defaults),
    revisions: [],
    status: "clean",
    validationResult: cleanValidation(),
  };
}

export function createProjectConfigurationState(
  devices: readonly NetworkDevice[],
  current?: ProjectConfigurationState,
): ProjectConfigurationState {
  const existing = current?.devices ?? {};
  return {
    devices: Object.fromEntries(
      devices.map((device) => [device.id, existing[device.id] ?? createDeviceConfigurationState(device)]),
    ),
    auditLog: current?.auditLog ?? [],
  };
}

export function validateRuntimeConfig(
  device: NetworkDevice,
  config: DeviceRuntimeConfig,
): ConfigurationValidationResult {
  const issues: ConfigurationValidationResult["issues"] = [];
  if (!config.system.hostname.trim()) issues.push({ path: "system.hostname", message: "Hostname ต้องไม่ว่าง" });
  if (config.system.hostname.length > 63)
    issues.push({ path: "system.hostname", message: "Hostname ต้องไม่เกิน 63 ตัวอักษร" });
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(config.system.hostname))
    issues.push({ path: "system.hostname", message: "Hostname ใช้ได้เฉพาะตัวอักษร ตัวเลข และขีดกลาง" });

  const knownInterfaces = new Set(device.interfaces.map((networkInterface) => networkInterface.id));
  for (const networkInterface of device.interfaces) {
    if (!config.interfaces[networkInterface.id])
      issues.push({
        path: `interfaces.${networkInterface.id}`,
        message: "Configuration ต้องมีทุก interface ของอุปกรณ์",
      });
  }
  for (const [interfaceId, value] of Object.entries(config.interfaces)) {
    const path = `interfaces.${interfaceId}`;
    if (!knownInterfaces.has(interfaceId)) {
      issues.push({ path, message: "ไม่พบ interface ที่ระบุในอุปกรณ์" });
      continue;
    }
    if (value.ipv4 && ipv4ToInteger(value.ipv4) === undefined)
      issues.push({ path: `${path}.ipv4`, message: "รูปแบบ IPv4 ไม่ถูกต้อง" });
    if (value.ipv4 && (value.prefixLength === undefined || value.prefixLength < 0 || value.prefixLength > 32))
      issues.push({ path: `${path}.prefixLength`, message: "IPv4 ต้องมี Prefix ระหว่าง 0–32" });
    if (value.defaultGateway && ipv4ToInteger(value.defaultGateway) === undefined)
      issues.push({ path: `${path}.defaultGateway`, message: "รูปแบบ Default Gateway ไม่ถูกต้อง" });
    if (value.ipv4 && value.prefixLength !== undefined) {
      const analysis = analyzeIPv4(value.ipv4, value.prefixLength);
      if (analysis && !analysis.isUsableHost)
        issues.push({ path: `${path}.ipv4`, message: "IPv4 นี้เป็น network หรือ broadcast address" });
      if (value.defaultGateway && analysis && ipv4ToInteger(value.defaultGateway) !== undefined) {
        const gateway = analyzeIPv4(value.defaultGateway, value.prefixLength);
        if (!gateway || gateway.networkAddress !== analysis.networkAddress)
          issues.push({ path: `${path}.defaultGateway`, message: "Gateway ต้องอยู่ subnet เดียวกับ interface" });
      }
    }
  }
  return { valid: issues.length === 0, issues };
}

export function applyRuntimeConfig(device: NetworkDevice, config: DeviceRuntimeConfig): NetworkDevice {
  return {
    ...device,
    hostname: config.system.hostname,
    interfaces: device.interfaces.map((networkInterface) => {
      const item = config.interfaces[networkInterface.id];
      if (!item) return networkInterface;
      const ipv4Info =
        item.ipv4 && item.prefixLength !== undefined ? analyzeIPv4(item.ipv4, item.prefixLength) : undefined;
      return {
        ...networkInterface,
        description: item.description,
        macAddress: item.macAddress ?? networkInterface.macAddress,
        ipv4: item.ipv4,
        prefixLength: item.prefixLength,
        subnetMask: ipv4Info?.subnetMask,
        defaultGateway: item.defaultGateway,
        mtu: item.mtu ?? networkInterface.mtu,
        speedMbps: item.speedMbps ?? networkInterface.speedMbps,
        duplex: item.duplex ?? networkInterface.duplex,
        status: item.enabled
          ? networkInterface.status === "administratively-down" || networkInterface.status === "disabled"
            ? "down"
            : networkInterface.status
          : "administratively-down",
      };
    }),
    configuration: { ...device.configuration, runtimeConfig: structuredClone(config) },
    updatedAt: new Date().toISOString(),
  };
}

export interface ConfigurationApplyResult {
  readonly nextDevice: NetworkDevice;
  readonly nextState: DeviceConfigurationState;
}

export function applyConfiguration(
  state: DeviceConfigurationState,
  device: NetworkDevice,
  candidate: DeviceRuntimeConfig,
  source: ConfigurationSource,
): ConfigurationApplyResult {
  const validation = validateRuntimeConfig(device, candidate);
  if (!validation.valid) {
    return {
      nextDevice: device,
      nextState: {
        ...state,
        candidateConfig: structuredClone(candidate),
        status: "invalid",
        validationResult: validation,
      },
    };
  }
  const revision = {
    revisionId: nanoid(),
    deviceId: device.id,
    timestamp: new Date().toISOString(),
    source,
    changedBy: "local-user",
    changes: diffConfiguration(state.runningConfig, candidate),
    previousRevision: state.revisions.at(-1)?.revisionId,
    validationResult: validation,
    commitStatus: "applied" as const,
    before: structuredClone(state.runningConfig),
    after: structuredClone(candidate),
  };
  const nextState: DeviceConfigurationState = {
    ...state,
    runningConfig: structuredClone(candidate),
    candidateConfig: structuredClone(candidate),
    revisions: [...state.revisions, revision].slice(-REVISION_LIMIT),
    status: "committed",
    validationResult: validation,
  };
  return { nextDevice: applyRuntimeConfig(device, candidate), nextState };
}

export function saveStartupConfig(state: DeviceConfigurationState): DeviceConfigurationState {
  const revision = state.revisions.at(-1);
  return {
    ...state,
    startupConfig: structuredClone(state.runningConfig),
    status: "saved",
    revisions: revision
      ? state.revisions.map((item) =>
          item.revisionId === revision.revisionId ? { ...item, commitStatus: "saved" } : item,
        )
      : [],
  };
}

export function rollbackLastConfiguration(
  state: DeviceConfigurationState,
  device: NetworkDevice,
): ConfigurationApplyResult | undefined {
  const revision = state.revisions.at(-1);
  if (!revision) return undefined;
  const validation = validateRuntimeConfig(device, revision.before);
  const nextState: DeviceConfigurationState = {
    ...state,
    runningConfig: structuredClone(revision.before),
    candidateConfig: structuredClone(revision.before),
    revisions: state.revisions.slice(0, -1),
    status: "rollback-available",
    validationResult: validation,
  };
  return { nextDevice: applyRuntimeConfig(device, revision.before), nextState };
}

export function restoreStartupConfiguration(
  state: DeviceConfigurationState,
  device: NetworkDevice,
): ConfigurationApplyResult {
  return applyConfiguration(state, device, state.startupConfig, "system");
}

export function diffConfiguration(before: DeviceRuntimeConfig, after: DeviceRuntimeConfig): string[] {
  const changes: string[] = [];
  if (before.system.hostname !== after.system.hostname)
    changes.push(`system.hostname: ${before.system.hostname} -> ${after.system.hostname}`);
  for (const interfaceId of new Set([...Object.keys(before.interfaces), ...Object.keys(after.interfaces)])) {
    const previous = before.interfaces[interfaceId];
    const next = after.interfaces[interfaceId];
    if (JSON.stringify(previous) !== JSON.stringify(next)) changes.push(`interfaces.${interfaceId} modified`);
  }
  return changes.length ? changes : ["No effective configuration changes"];
}

export function renderRunningConfig(config: DeviceRuntimeConfig, device: NetworkDevice): string {
  const lines = [`hostname ${config.system.hostname}`];
  if (config.system.domainName) lines.push(`ip domain name ${config.system.domainName}`);
  for (const networkInterface of device.interfaces) {
    const item = config.interfaces[networkInterface.id];
    if (!item) continue;
    lines.push("!", `interface ${networkInterface.name}`);
    if (item.description) lines.push(` description ${item.description}`);
    if (item.ipv4 && item.prefixLength !== undefined) lines.push(` ip address ${item.ipv4}/${item.prefixLength}`);
    lines.push(item.enabled ? " no shutdown" : " shutdown");
  }
  return lines.join("\n");
}
