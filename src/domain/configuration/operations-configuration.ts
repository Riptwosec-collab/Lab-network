import { ipv4ToInteger } from "@/engine/protocols/ipv4";
import type { ConfigurationValidationResult, NetworkDevice, OperationsRuntimeConfig } from "@/types/network";

export function createOperationsRuntimeConfig(device: NetworkDevice): OperationsRuntimeConfig {
  return {
    highAvailability: {
      enabled: false,
      protocol: device.category === "security" ? "active-standby" : "hsrp",
      groupId: 1,
      virtualIp: "",
      priority: 100,
      preempt: true,
      trackedInterfaceIds: [],
      trackingDecrement: 10,
    },
    monitoring: {
      enabled: true,
      pollingIntervalSeconds: 30,
      monitoredInterfaceIds: device.interfaces.map((item) => item.id),
      sources: { icmp: true, snmp: true, syslog: true, netflow: false },
      thresholds: {
        latencyMs: 100,
        packetLossPercent: 5,
        errorCount: 100,
        bandwidthUtilizationPercent: 85,
      },
      autoCreateIncidents: true,
    },
  };
}

export function normalizeOperationsRuntimeConfig(
  device: NetworkDevice,
  current?: Partial<OperationsRuntimeConfig>,
): OperationsRuntimeConfig {
  const defaults = createOperationsRuntimeConfig(device);
  return {
    highAvailability: { ...defaults.highAvailability, ...current?.highAvailability },
    monitoring: {
      ...defaults.monitoring,
      ...current?.monitoring,
      sources: { ...defaults.monitoring.sources, ...current?.monitoring?.sources },
      thresholds: { ...defaults.monitoring.thresholds, ...current?.monitoring?.thresholds },
      monitoredInterfaceIds: current?.monitoring?.monitoredInterfaceIds ?? defaults.monitoring.monitoredInterfaceIds,
    },
  };
}

export function validateOperationsRuntimeConfig(
  device: NetworkDevice,
  config: OperationsRuntimeConfig,
): ConfigurationValidationResult["issues"] {
  const issues: ConfigurationValidationResult["issues"] = [];
  const knownInterfaces = new Set(device.interfaces.map((item) => item.id));
  const ha = config.highAvailability;
  if (ha.enabled && ipv4ToInteger(ha.virtualIp) === undefined)
    issues.push({ path: "operations.highAvailability.virtualIp", message: "HA virtual IP must be valid" });
  if (ha.priority < 1 || ha.priority > 255)
    issues.push({ path: "operations.highAvailability.priority", message: "HA priority must be between 1 and 255" });
  for (const interfaceId of ha.trackedInterfaceIds)
    if (!knownInterfaces.has(interfaceId))
      issues.push({
        path: "operations.highAvailability.trackedInterfaceIds",
        message: `Unknown interface ${interfaceId}`,
      });
  for (const interfaceId of config.monitoring.monitoredInterfaceIds)
    if (!knownInterfaces.has(interfaceId))
      issues.push({ path: "operations.monitoring.monitoredInterfaceIds", message: `Unknown interface ${interfaceId}` });
  if (config.monitoring.pollingIntervalSeconds < 5)
    issues.push({
      path: "operations.monitoring.pollingIntervalSeconds",
      message: "Polling interval must be at least 5 seconds",
    });
  return issues;
}

export function renderOperationsRunningConfig(config: OperationsRuntimeConfig): string[] {
  const lines: string[] = [];
  const ha = config.highAvailability;
  if (ha.enabled) {
    lines.push(
      "!",
      `redundancy ${ha.protocol} group ${ha.groupId}`,
      ` virtual-ip ${ha.virtualIp}`,
      ` priority ${ha.priority}`,
      ha.preempt ? " preempt" : " no preempt",
    );
    for (const interfaceId of ha.trackedInterfaceIds)
      lines.push(` track ${interfaceId} decrement ${ha.trackingDecrement}`);
    if (ha.healthCheckTarget) lines.push(` health-check ${ha.healthCheckTarget}`);
  }
  const monitoring = config.monitoring;
  if (monitoring.enabled) {
    lines.push("!", `monitoring poll-interval ${monitoring.pollingIntervalSeconds}`);
    if (monitoring.sources.icmp) lines.push(" monitoring source icmp");
    if (monitoring.sources.snmp) lines.push(" monitoring source snmp");
    if (monitoring.sources.syslog) lines.push(" monitoring source syslog");
    if (monitoring.sources.netflow) lines.push(" monitoring source netflow");
  }
  return lines;
}
