import { OspfEngine } from "@/engine/protocols/ospf-engine";
import { isAddressInSubnet } from "@/engine/protocols/ipv4";
import type { DeviceRuntimeConfig, NetworkDevice, NetworkInterface, TopologySnapshot } from "@/types/network";

export type HaRole = "active" | "standby" | "master" | "backup" | "isolated" | "disabled";

export interface HaMemberState {
  readonly deviceId: string;
  readonly hostname: string;
  readonly protocol: string;
  readonly groupId: number;
  readonly virtualIp: string;
  readonly role: HaRole;
  readonly configuredPriority: number;
  readonly effectivePriority: number;
  readonly eligible: boolean;
  readonly trackedInterfacesDown: readonly string[];
  readonly reason: string;
}

export interface InterfaceMetric {
  readonly deviceId: string;
  readonly hostname: string;
  readonly interfaceId: string;
  readonly interfaceName: string;
  readonly availability: "up" | "down" | "degraded";
  readonly bandwidthUtilizationPercent: number;
  readonly latencyMs: number;
  readonly jitterMs: number;
  readonly packetLossPercent: number;
  readonly errorCount: number;
}

export interface MonitoringAlert {
  readonly id: string;
  readonly deviceId: string;
  readonly interfaceId?: string;
  readonly severity: "critical" | "warning";
  readonly state: "active" | "acknowledged" | "resolved" | "suppressed";
  readonly metric: string;
  readonly value: number | string;
  readonly threshold?: number;
  readonly message: string;
}

export interface NetworkIncident {
  readonly id: string;
  readonly alertId: string;
  readonly deviceId: string;
  readonly severity: "critical" | "warning";
  readonly status: "open" | "acknowledged" | "investigating" | "resolved";
  readonly title: string;
  readonly evidence: readonly string[];
  readonly suggestedAction: string;
}

export interface DiagnosticFinding {
  readonly id: string;
  readonly deviceId?: string;
  readonly layer: "L1" | "L2" | "L3" | "SERVICE" | "SECURITY";
  readonly severity: "critical" | "warning" | "info";
  readonly symptom: string;
  readonly evidence: string;
  readonly recommendation: string;
}

export class HighAvailabilityEngine {
  constructor(private readonly topology: TopologySnapshot) {}

  members(): HaMemberState[] {
    const candidates = this.topology.devices.flatMap((device) => {
      const config = runtimeConfig(device);
      const ha = config?.operations?.highAvailability;
      if (!ha?.enabled) return [];
      const trackedInterfacesDown = ha.trackedInterfaceIds.filter((interfaceId) => {
        const item = device.interfaces.find((candidate) => candidate.id === interfaceId);
        return !item || item.status !== "up" || !this.interfaceLinkUp(device.id, interfaceId);
      });
      const eligible =
        device.status !== "critical" &&
        (ha.trackedInterfaceIds.length
          ? ha.trackedInterfaceIds.some(
              (interfaceId) => device.interfaces.find((item) => item.id === interfaceId)?.status === "up",
            )
          : device.interfaces.some((item) => item.status === "up"));
      return [
        {
          device,
          ha,
          trackedInterfacesDown,
          eligible,
          effectivePriority: Math.max(0, ha.priority - trackedInterfacesDown.length * ha.trackingDecrement),
        },
      ];
    });
    const result: HaMemberState[] = [];
    for (const candidate of candidates) {
      const group = candidates.filter(
        (peer) =>
          peer.ha.protocol === candidate.ha.protocol &&
          peer.ha.groupId === candidate.ha.groupId &&
          peer.ha.virtualIp === candidate.ha.virtualIp,
      );
      const winner = group
        .filter((item) => item.eligible)
        .sort(
          (left, right) =>
            right.effectivePriority - left.effectivePriority ||
            Number(right.ha.preempt) - Number(left.ha.preempt) ||
            left.device.id.localeCompare(right.device.id),
        )[0];
      const active = winner?.device.id === candidate.device.id;
      const routerProtocol = candidate.ha.protocol === "hsrp" || candidate.ha.protocol === "vrrp";
      result.push({
        deviceId: candidate.device.id,
        hostname: candidate.device.hostname,
        protocol: candidate.ha.protocol,
        groupId: candidate.ha.groupId,
        virtualIp: candidate.ha.virtualIp,
        role: !candidate.eligible
          ? "isolated"
          : active
            ? routerProtocol
              ? "master"
              : "active"
            : routerProtocol
              ? "backup"
              : "standby",
        configuredPriority: candidate.ha.priority,
        effectivePriority: candidate.effectivePriority,
        eligible: candidate.eligible,
        trackedInterfacesDown: candidate.trackedInterfacesDown,
        reason: !candidate.eligible
          ? "Device health state is not eligible"
          : candidate.trackedInterfacesDown.length
            ? `Priority decremented by tracked interfaces: ${candidate.trackedInterfacesDown.join(", ")}`
            : active
              ? "Highest eligible priority owns the virtual IP"
              : `Standby for ${winner?.device.hostname ?? "no active peer"}`,
      });
    }
    return result;
  }

  resolveVirtualIp(ipAddress: string): { device: NetworkDevice; networkInterface: NetworkInterface } | undefined {
    const owner = this.members().find(
      (item) => item.virtualIp === ipAddress && (item.role === "active" || item.role === "master"),
    );
    const device = owner && this.topology.devices.find((item) => item.id === owner.deviceId);
    if (!device) return undefined;
    const config = runtimeConfig(device)!;
    const tracked = config.operations.highAvailability.trackedInterfaceIds;
    const networkInterface =
      device.interfaces.find((item) => tracked.includes(item.id) && item.status === "up") ??
      device.interfaces.find((item) => item.status === "up" && !!item.ipv4);
    return networkInterface ? { device, networkInterface } : undefined;
  }

  private interfaceLinkUp(deviceId: string, interfaceId: string): boolean {
    const links = this.topology.connections.filter(
      (item) =>
        (item.sourceDeviceId === deviceId && item.sourceInterfaceId === interfaceId) ||
        (item.targetDeviceId === deviceId && item.targetInterfaceId === interfaceId),
    );
    return links.length === 0 || links.some((item) => item.status === "up" || item.status === "degraded");
  }
}

export class MonitoringEngine {
  constructor(private readonly topology: TopologySnapshot) {}

  metrics(): InterfaceMetric[] {
    return this.topology.devices.flatMap((device) => {
      const config = runtimeConfig(device);
      const monitoring = config?.operations?.monitoring;
      if (!monitoring?.enabled) return [];
      return device.interfaces
        .filter((item) => monitoring.monitoredInterfaceIds.includes(item.id))
        .map((networkInterface) => {
          const connections = this.topology.connections.filter(
            (connection) =>
              (connection.sourceDeviceId === device.id && connection.sourceInterfaceId === networkInterface.id) ||
              (connection.targetDeviceId === device.id && connection.targetInterfaceId === networkInterface.id),
          );
          const primary = connections[0];
          const rate = (networkInterface.inputRateMbps ?? 0) + (networkInterface.outputRateMbps ?? 0);
          const speed = networkInterface.speedMbps ?? primary?.bandwidthMbps ?? 1;
          const degraded = primary?.status === "degraded" || (networkInterface.packetLossPercent ?? 0) > 0;
          return {
            deviceId: device.id,
            hostname: device.hostname,
            interfaceId: networkInterface.id,
            interfaceName: networkInterface.name,
            availability:
              device.status === "offline" || networkInterface.status !== "up" || primary?.status === "down"
                ? ("down" as const)
                : degraded
                  ? ("degraded" as const)
                  : ("up" as const),
            bandwidthUtilizationPercent: Math.min(100, Math.round((rate / Math.max(speed, 1)) * 1000) / 10),
            latencyMs: primary?.latencyMs ?? 0,
            jitterMs: primary?.jitterMs ?? 0,
            packetLossPercent: Math.max(primary?.packetLossPercent ?? 0, networkInterface.packetLossPercent ?? 0),
            errorCount: networkInterface.errorCount ?? 0,
          };
        });
    });
  }

  alerts(): MonitoringAlert[] {
    return this.metrics().flatMap((metric) => {
      const threshold = runtimeConfig(this.topology.devices.find((item) => item.id === metric.deviceId)!)?.operations
        ?.monitoring.thresholds;
      if (!threshold) return [];
      const alerts: MonitoringAlert[] = [];
      const add = (
        metricName: string,
        value: number | string,
        limit: number | undefined,
        severity: "critical" | "warning",
        message: string,
      ) =>
        alerts.push({
          id: `${metric.deviceId}:${metric.interfaceId}:${metricName}`,
          deviceId: metric.deviceId,
          interfaceId: metric.interfaceId,
          severity,
          state: "active",
          metric: metricName,
          value,
          threshold: limit,
          message,
        });
      if (metric.availability === "down")
        add("availability", "down", undefined, "critical", `${metric.hostname} ${metric.interfaceName} is down`);
      if (metric.latencyMs > threshold.latencyMs)
        add(
          "latency",
          metric.latencyMs,
          threshold.latencyMs,
          "warning",
          `${metric.interfaceName} latency exceeded threshold`,
        );
      if (metric.packetLossPercent > threshold.packetLossPercent)
        add(
          "packetLoss",
          metric.packetLossPercent,
          threshold.packetLossPercent,
          "critical",
          `${metric.interfaceName} packet loss exceeded threshold`,
        );
      if (metric.errorCount > threshold.errorCount)
        add(
          "errors",
          metric.errorCount,
          threshold.errorCount,
          "warning",
          `${metric.interfaceName} error counter exceeded threshold`,
        );
      if (metric.bandwidthUtilizationPercent > threshold.bandwidthUtilizationPercent)
        add(
          "bandwidth",
          metric.bandwidthUtilizationPercent,
          threshold.bandwidthUtilizationPercent,
          "warning",
          `${metric.interfaceName} bandwidth utilization exceeded threshold`,
        );
      return alerts;
    });
  }

  incidents(): NetworkIncident[] {
    return this.alerts().flatMap((alert) => {
      const device = this.topology.devices.find((item) => item.id === alert.deviceId);
      const autoCreate = device && runtimeConfig(device)?.operations?.monitoring.autoCreateIncidents;
      return autoCreate
        ? [
            {
              id: `incident:${alert.id}`,
              alertId: alert.id,
              deviceId: alert.deviceId,
              severity: alert.severity,
              status: "open" as const,
              title: alert.message,
              evidence: [
                `Metric ${alert.metric}=${alert.value}`,
                alert.threshold === undefined ? "State threshold triggered" : `Threshold=${alert.threshold}`,
              ],
              suggestedAction: remediationFor(alert.metric),
            },
          ]
        : [];
    });
  }
}

export class TroubleshootingEngine {
  constructor(private readonly topology: TopologySnapshot) {}

  analyze(): DiagnosticFinding[] {
    const findings: DiagnosticFinding[] = [];
    for (const connection of this.topology.connections) {
      if (connection.status === "down" || connection.status === "administratively-down")
        findings.push({
          id: `l1:${connection.id}`,
          layer: "L1",
          severity: "critical",
          symptom: "Physical link is down",
          evidence: `${connection.id} state=${connection.status}`,
          recommendation: "Inspect both interface states, cable type, and tracked link state.",
        });
      if (connection.duplex === "half" || connection.packetLossPercent > 0)
        findings.push({
          id: `l2:${connection.id}`,
          layer: "L2",
          severity: "warning",
          symptom: "Link quality is degraded",
          evidence: `duplex=${connection.duplex}, loss=${connection.packetLossPercent}%`,
          recommendation: "Match speed/duplex and inspect errors, VLAN and STP state.",
        });
    }
    for (const device of this.topology.devices) {
      const config = runtimeConfig(device);
      if (!config) continue;
      if (config.routing.ospf?.enabled) {
        const down = new OspfEngine(this.topology).neighbors(device).filter((item) => item.state === "DOWN");
        for (const neighbor of down)
          findings.push({
            id: `ospf:${device.id}:${neighbor.neighborDeviceId}`,
            deviceId: device.id,
            layer: "L3",
            severity: "critical",
            symptom: "OSPF neighbor is down",
            evidence: neighbor.reason,
            recommendation: "Compare subnet, area, authentication and passive-interface settings.",
          });
      }
      const unresolvedRoutes = config.routing.staticRoutes.filter(
        (route) =>
          !device.interfaces.some(
            (item) =>
              item.ipv4 &&
              item.prefixLength !== undefined &&
              item.status === "up" &&
              isAddressInSubnet(route.nextHop, item.ipv4, item.prefixLength),
          ),
      );
      for (const route of unresolvedRoutes)
        findings.push({
          id: `route:${device.id}:${route.destination}/${route.prefixLength}`,
          deviceId: device.id,
          layer: "L3",
          severity: "warning",
          symptom: "Route is inactive",
          evidence: `Next hop ${route.nextHop} is unresolved`,
          recommendation: "Verify the next-hop is reachable through an operational connected network.",
        });
      if (config.services.dhcp.enabled && Object.keys(config.services.dhcp.pools).length === 0)
        findings.push({
          id: `dhcp:${device.id}`,
          deviceId: device.id,
          layer: "SERVICE",
          severity: "warning",
          symptom: "DHCP enabled without a pool",
          evidence: "No DHCP pools are configured",
          recommendation: "Create a pool with gateway, DNS and an available lease range.",
        });
      if (config.security.firewall.enabled && config.security.firewall.policies.length === 0)
        findings.push({
          id: `firewall:${device.id}`,
          deviceId: device.id,
          layer: "SECURITY",
          severity: "info",
          symptom: "Firewall implicit deny is the only policy",
          evidence: "Policy table is empty",
          recommendation: "Add explicit least-privilege allow rules for required traffic.",
        });
    }
    return findings;
  }
}

function runtimeConfig(device: NetworkDevice): DeviceRuntimeConfig | undefined {
  const value = device.configuration.runtimeConfig;
  return value && typeof value === "object" ? (value as DeviceRuntimeConfig) : undefined;
}

function remediationFor(metric: string): string {
  if (metric === "availability") return "Check device power, interface administration state and both ends of the link.";
  if (metric === "latency" || metric === "packetLoss")
    return "Trace the path and inspect congestion, errors and link quality.";
  if (metric === "bandwidth") return "Review top talkers or NetFlow data and increase capacity or apply policy.";
  return "Inspect interface counters and replace or reconfigure the affected link.";
}
