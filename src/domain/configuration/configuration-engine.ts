import { nanoid } from "nanoid";

import { analyzeIPv4, ipv4ToInteger } from "@/engine/protocols/ipv4";
import {
  createServicesRuntimeConfig,
  normalizeServicesRuntimeConfig,
  renderServicesRunningConfig,
  validateServicesRuntimeConfig,
} from "@/domain/configuration/services-configuration";
import {
  createSecurityRuntimeConfig,
  normalizeSecurityRuntimeConfig,
  renderSecurityRunningConfig,
  validateSecurityRuntimeConfig,
} from "@/domain/configuration/security-configuration";
import type {
  ConfigurationSource,
  ConfigurationValidationResult,
  DeviceConfigurationState,
  DeviceRuntimeConfig,
  NetworkDevice,
  ProjectConfigurationState,
} from "@/types/network";
import {
  createOperationsRuntimeConfig,
  normalizeOperationsRuntimeConfig,
  renderOperationsRunningConfig,
  validateOperationsRuntimeConfig,
} from "@/domain/configuration/operations-configuration";

const REVISION_LIMIT = 40;

const cleanValidation = (): ConfigurationValidationResult => ({ valid: true, issues: [] });

export function createDeviceRuntimeConfig(device: NetworkDevice): DeviceRuntimeConfig {
  const supportsSwitching = device.category === "switch" || device.capabilities.includes("switching");
  const supportsRouting =
    device.category === "router" ||
    device.category === "security" ||
    device.capabilities.includes("routing") ||
    device.capabilities.includes("svi");
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
          switchport: supportsSwitching
            ? {
                mode: networkInterface.portMode ?? "access",
                accessVlan: networkInterface.vlan ?? 1,
                nativeVlan: networkInterface.nativeVlan ?? 1,
                allowedVlans: networkInterface.allowedVlans ?? [1],
                stpPriority: 128,
                portFast: false,
                bpduGuard: false,
                rootGuard: false,
                loopGuard: false,
              }
            : undefined,
        },
      ]),
    ),
    switching: supportsSwitching
      ? {
          vlans: { "1": { id: 1, name: "default", status: "active" } },
          macAgingSeconds: 300,
          staticMacEntries: [],
          spanningTree: { mode: "rapid-pvst", priority: 32_768, enabledVlans: [1] },
          etherChannels: {},
        }
      : undefined,
    routing: {
      ipRouting: supportsRouting,
      staticRoutes: [],
      svis: {},
      ospf: {
        enabled: false,
        processId: 1,
        routerId: "0.0.0.0",
        referenceBandwidthMbps: 100_000,
        passiveInterfaceIds: [],
        networks: [],
        redistributeConnected: false,
        defaultInformationOriginate: false,
      },
    },
    services: createServicesRuntimeConfig(),
    security: createSecurityRuntimeConfig(device),
    operations: createOperationsRuntimeConfig(device),
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
      devices.map((device) => [
        device.id,
        existing[device.id]
          ? normalizeDeviceConfigurationState(device, existing[device.id])
          : createDeviceConfigurationState(device),
      ]),
    ),
    auditLog: current?.auditLog ?? [],
  };
}

function normalizeDeviceConfigurationState(
  device: NetworkDevice,
  current: DeviceConfigurationState,
): DeviceConfigurationState {
  const defaults = createDeviceRuntimeConfig(device);
  const normalizeConfig = (config: DeviceRuntimeConfig): DeviceRuntimeConfig => ({
    ...defaults,
    ...config,
    system: { ...defaults.system, ...config.system },
    interfaces: Object.fromEntries(
      Object.entries(defaults.interfaces).map(([interfaceId, value]) => {
        const existing = config.interfaces[interfaceId];
        return [
          interfaceId,
          {
            ...value,
            ...existing,
            switchport: value.switchport ? { ...value.switchport, ...existing?.switchport } : existing?.switchport,
          },
        ];
      }),
    ),
    switching: defaults.switching
      ? {
          ...defaults.switching,
          ...config.switching,
          vlans: { ...defaults.switching.vlans, ...config.switching?.vlans },
          spanningTree: { ...defaults.switching.spanningTree, ...config.switching?.spanningTree },
          etherChannels: { ...defaults.switching.etherChannels, ...config.switching?.etherChannels },
        }
      : config.switching,
    routing: {
      ...defaults.routing,
      ...config.routing,
      staticRoutes: (config.routing?.staticRoutes ?? []).map((route) => ({
        ...route,
        administrativeDistance: route.administrativeDistance ?? 1,
        metric: route.metric ?? 0,
      })),
      svis: { ...defaults.routing.svis, ...config.routing?.svis },
      ospf: {
        ...defaults.routing.ospf,
        ...config.routing?.ospf,
        passiveInterfaceIds: config.routing?.ospf?.passiveInterfaceIds ?? [],
        networks: config.routing?.ospf?.networks ?? [],
      },
    },
    services: normalizeServicesRuntimeConfig(config.services),
    security: normalizeSecurityRuntimeConfig(device, config.security),
    operations: normalizeOperationsRuntimeConfig(device, config.operations),
  });
  return {
    ...current,
    defaultConfig: normalizeConfig(current.defaultConfig),
    runningConfig: normalizeConfig(current.runningConfig),
    startupConfig: normalizeConfig(current.startupConfig),
    candidateConfig: normalizeConfig(current.candidateConfig),
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
  const supportsSwitching = device.category === "switch" || device.capabilities.includes("switching");
  if (config.switching && !supportsSwitching)
    issues.push({ path: "switching", message: "อุปกรณ์นี้ไม่รองรับ Layer 2 switching configuration" });
  if (supportsSwitching && !config.switching)
    issues.push({ path: "switching", message: "Switch ต้องมี switching configuration" });
  if (config.switching) {
    const vlanIds = new Set(Object.values(config.switching.vlans).map((vlan) => vlan.id));
    if (!vlanIds.has(1)) issues.push({ path: "switching.vlans.1", message: "VLAN 1 ต้องอยู่ใน VLAN database" });
    for (const [interfaceId, value] of Object.entries(config.interfaces)) {
      const switchport = value.switchport;
      if (!switchport) continue;
      if (!vlanIds.has(switchport.accessVlan))
        issues.push({
          path: `interfaces.${interfaceId}.switchport.accessVlan`,
          message: "Access VLAN ไม่มีใน VLAN database",
        });
      if (!vlanIds.has(switchport.nativeVlan))
        issues.push({
          path: `interfaces.${interfaceId}.switchport.nativeVlan`,
          message: "Native VLAN ไม่มีใน VLAN database",
        });
      for (const vlanId of switchport.allowedVlans) {
        if (!vlanIds.has(vlanId))
          issues.push({
            path: `interfaces.${interfaceId}.switchport.allowedVlans`,
            message: `Allowed VLAN ${vlanId} ไม่มีใน VLAN database`,
          });
      }
    }
    for (const [channelId, channel] of Object.entries(config.switching.etherChannels)) {
      for (const interfaceId of channel.memberInterfaceIds) {
        if (!config.interfaces[interfaceId])
          issues.push({
            path: `switching.etherChannels.${channelId}`,
            message: `ไม่พบ member interface ${interfaceId}`,
          });
      }
    }
  }
  const supportsRouting =
    device.category === "router" ||
    device.category === "security" ||
    device.capabilities.includes("routing") ||
    device.capabilities.includes("svi");
  if (
    !supportsRouting &&
    (config.routing.ipRouting || config.routing.staticRoutes.length || Object.keys(config.routing.svis).length)
  )
    issues.push({ path: "routing", message: "อุปกรณ์นี้ไม่รองรับ IP routing" });
  const routeKeys = new Set<string>();
  for (const [index, route] of config.routing.staticRoutes.entries()) {
    const path = `routing.staticRoutes.${index}`;
    const analysis = analyzeIPv4(route.destination, route.prefixLength);
    if (!analysis || analysis.networkAddress !== route.destination)
      issues.push({ path: `${path}.destination`, message: "Route destination ต้องเป็น network address ที่ถูกต้อง" });
    if (ipv4ToInteger(route.nextHop) === undefined)
      issues.push({ path: `${path}.nextHop`, message: "Static route next-hop ไม่ใช่ IPv4 ที่ถูกต้อง" });
    if (
      !Number.isInteger(route.administrativeDistance) ||
      route.administrativeDistance < 1 ||
      route.administrativeDistance > 255
    )
      issues.push({ path: `${path}.administrativeDistance`, message: "Administrative distance ต้องอยู่ระหว่าง 1–255" });
    if (!Number.isInteger(route.metric) || route.metric < 0)
      issues.push({ path: `${path}.metric`, message: "Route metric ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป" });
    const key = `${route.destination}/${route.prefixLength}`;
    if (routeKeys.has(key)) issues.push({ path, message: `มี route ${key} ซ้ำใน configuration` });
    routeKeys.add(key);
  }
  const sviAddresses = new Set<string>();
  for (const [vlanKey, svi] of Object.entries(config.routing.svis)) {
    const path = `routing.svis.${vlanKey}`;
    if (!config.switching?.vlans[String(svi.vlanId)])
      issues.push({ path: `${path}.vlanId`, message: `VLAN ${svi.vlanId} ไม่มีใน VLAN database` });
    const analysis = analyzeIPv4(svi.ipv4, svi.prefixLength);
    if (!analysis?.isUsableHost)
      issues.push({ path: `${path}.ipv4`, message: "SVI IPv4 ต้องเป็น usable host address" });
    if (sviAddresses.has(svi.ipv4)) issues.push({ path: `${path}.ipv4`, message: "SVI IPv4 ซ้ำในอุปกรณ์" });
    sviAddresses.add(svi.ipv4);
  }
  for (const [index, network] of config.routing.ospf.networks.entries()) {
    const path = `routing.ospf.networks.${index}`;
    const analysis = analyzeIPv4(network.network, network.prefixLength);
    if (!analysis || analysis.networkAddress !== network.network)
      issues.push({ path: `${path}.network`, message: "OSPF network must be a valid network address" });
    if (!network.areaId.trim()) issues.push({ path: `${path}.areaId`, message: "OSPF area is required" });
    if (!Number.isInteger(network.cost) || network.cost < 1 || network.cost > 65_535)
      issues.push({ path: `${path}.cost`, message: "OSPF cost must be between 1 and 65535" });
  }
  if (config.routing.ospf.enabled && !supportsRouting)
    issues.push({ path: "routing.ospf", message: "This device does not support OSPF routing" });
  if (config.routing.ospf.enabled && ipv4ToInteger(config.routing.ospf.routerId) === undefined)
    issues.push({ path: "routing.ospf.routerId", message: "OSPF router ID must be a valid IPv4 address" });
  issues.push(...validateServicesRuntimeConfig(device, config.services));
  issues.push(...validateSecurityRuntimeConfig(device, config.security));
  issues.push(...validateOperationsRuntimeConfig(device, config.operations));
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
        vlan: item.switchport?.accessVlan ?? networkInterface.vlan,
        nativeVlan: item.switchport?.nativeVlan ?? networkInterface.nativeVlan,
        allowedVlans: item.switchport?.allowedVlans ?? networkInterface.allowedVlans,
        portMode: item.switchport?.mode ?? networkInterface.portMode,
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
  if (JSON.stringify(before.switching) !== JSON.stringify(after.switching))
    changes.push("switching configuration modified");
  if (JSON.stringify(before.routing) !== JSON.stringify(after.routing)) changes.push("routing configuration modified");
  if (JSON.stringify(before.services) !== JSON.stringify(after.services))
    changes.push("services configuration modified");
  if (JSON.stringify(before.security) !== JSON.stringify(after.security))
    changes.push("security configuration modified");
  if (JSON.stringify(before.operations) !== JSON.stringify(after.operations))
    changes.push("operations configuration modified");
  return changes.length ? changes : ["No effective configuration changes"];
}

export function renderRunningConfig(config: DeviceRuntimeConfig, device: NetworkDevice): string {
  const lines = [`hostname ${config.system.hostname}`];
  if (config.system.domainName) lines.push(`ip domain name ${config.system.domainName}`);
  if (config.switching) {
    for (const vlan of Object.values(config.switching.vlans).sort((left, right) => left.id - right.id)) {
      lines.push("!", `vlan ${vlan.id}`, ` name ${vlan.name}`);
      if (vlan.status === "suspended") lines.push(" state suspend");
    }
    lines.push("!", `spanning-tree mode ${config.switching.spanningTree.mode}`);
    lines.push(
      `spanning-tree vlan ${config.switching.spanningTree.enabledVlans.join(",")} priority ${config.switching.spanningTree.priority}`,
    );
  }
  if (config.routing.ipRouting) lines.push("!", "ip routing");
  for (const svi of Object.values(config.routing.svis).sort((left, right) => left.vlanId - right.vlanId)) {
    lines.push("!", `interface Vlan${svi.vlanId}`, ` ip address ${svi.ipv4}/${svi.prefixLength}`);
    lines.push(svi.enabled ? " no shutdown" : " shutdown");
  }
  for (const route of config.routing.staticRoutes) {
    lines.push(`ip route ${route.destination}/${route.prefixLength} ${route.nextHop} ${route.administrativeDistance}`);
  }
  if (config.routing.ospf.enabled) {
    lines.push("!", `router ospf ${config.routing.ospf.processId}`, ` router-id ${config.routing.ospf.routerId}`);
    for (const network of config.routing.ospf.networks)
      lines.push(` network ${network.network}/${network.prefixLength} area ${network.areaId} cost ${network.cost}`);
    for (const interfaceId of config.routing.ospf.passiveInterfaceIds) lines.push(` passive-interface ${interfaceId}`);
    if (config.routing.ospf.redistributeConnected) lines.push(" redistribute connected");
    if (config.routing.ospf.defaultInformationOriginate) lines.push(" default-information originate");
  }
  lines.push(...renderServicesRunningConfig(config.services));
  lines.push(...renderSecurityRunningConfig(config.security));
  lines.push(...renderOperationsRunningConfig(config.operations));
  for (const networkInterface of device.interfaces) {
    const item = config.interfaces[networkInterface.id];
    if (!item) continue;
    lines.push("!", `interface ${networkInterface.name}`);
    if (item.description) lines.push(` description ${item.description}`);
    if (item.ipv4 && item.prefixLength !== undefined) lines.push(` ip address ${item.ipv4}/${item.prefixLength}`);
    if (item.switchport) {
      lines.push(` switchport mode ${item.switchport.mode}`);
      if (item.switchport.mode === "access") lines.push(` switchport access vlan ${item.switchport.accessVlan}`);
      if (item.switchport.mode === "trunk") {
        lines.push(` switchport trunk native vlan ${item.switchport.nativeVlan}`);
        lines.push(` switchport trunk allowed vlan ${item.switchport.allowedVlans.join(",")}`);
      }
      if (item.switchport.portFast) lines.push(" spanning-tree portfast");
      if (item.switchport.bpduGuard) lines.push(" spanning-tree bpduguard enable");
      if (item.switchport.channelGroup)
        lines.push(` channel-group ${item.switchport.channelGroup} mode ${item.switchport.lacpMode ?? "on"}`);
    }
    lines.push(item.enabled ? " no shutdown" : " shutdown");
  }
  return lines.join("\n");
}
