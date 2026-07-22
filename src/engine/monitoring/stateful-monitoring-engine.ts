import type { DeviceRuntimeConfig, NetworkDevice, TopologySnapshot } from "@/types/network";
import type {
  MonitoringAlertRule,
  MonitoringEvent,
  MonitoringMetricSample,
  MonitoringSnapshot,
  StatefulMonitoringAlert,
} from "@/types/monitoring";

export const defaultMonitoringRules: readonly MonitoringAlertRule[] = [
  {
    id: "availability-down",
    metric: "device-availability",
    operator: "==",
    threshold: 0,
    durationSeconds: 0,
    severity: "critical",
    message: "Device is unavailable",
    enabled: true,
  },
  {
    id: "interface-down",
    metric: "interface-status",
    operator: "==",
    threshold: 0,
    durationSeconds: 0,
    severity: "high",
    message: "Interface is down",
    enabled: true,
  },
  {
    id: "high-latency",
    metric: "latency",
    operator: ">",
    threshold: 80,
    durationSeconds: 0,
    severity: "warning",
    message: "Link latency is above 80 ms",
    enabled: true,
  },
  {
    id: "packet-loss",
    metric: "packet-loss",
    operator: ">",
    threshold: 2,
    durationSeconds: 0,
    severity: "critical",
    message: "Packet loss is above 2%",
    enabled: true,
  },
  {
    id: "nas-capacity",
    metric: "nas-capacity",
    operator: ">=",
    threshold: 85,
    durationSeconds: 60,
    severity: "high",
    message: "NAS capacity is above 85%",
    enabled: true,
  },
  {
    id: "raid-degraded",
    metric: "raid-state",
    operator: "==",
    threshold: 0,
    durationSeconds: 0,
    severity: "critical",
    message: "RAID pool is degraded",
    enabled: true,
  },
  {
    id: "cloud-health",
    metric: "cloud-resource-status",
    operator: "<",
    threshold: 100,
    durationSeconds: 30,
    severity: "warning",
    message: "One or more cloud resources are unavailable",
    enabled: true,
  },
];

export class StatefulMonitoringEngine {
  private readonly alertsById = new Map<string, StatefulMonitoringAlert>();
  private readonly breachStartedAt = new Map<string, number>();
  private readonly maintenanceScopes = new Set<string>();
  private events: MonitoringEvent[] = [];
  private sequence = 0;

  constructor(private rules: readonly MonitoringAlertRule[] = defaultMonitoringRules) {}

  setRules(rules: readonly MonitoringAlertRule[]): void {
    this.rules = rules;
  }

  collect(topology: TopologySnapshot, now = new Date()): readonly MonitoringMetricSample[] {
    const timestamp = now.toISOString();
    const samples: MonitoringMetricSample[] = [];
    const add = (sample: Omit<MonitoringMetricSample, "id" | "timestamp">) =>
      samples.push({ ...sample, id: `${sample.metric}:${sample.scopeId}`, timestamp });

    for (const device of topology.devices) {
      const config = runtimeConfig(device);
      const available = device.status !== "offline" && device.status !== "critical";
      add({
        metric: "device-availability",
        source: "icmp",
        scopeId: device.id,
        scopeType: "device",
        label: device.hostname,
        value: available ? 1 : 0,
        unit: "state",
        healthy: available,
      });
      const interfaceRates = device.interfaces.map((item) => (item.inputRateMbps ?? 0) + (item.outputRateMbps ?? 0));
      const totalRate = interfaceRates.reduce((total, value) => total + value, 0);
      const totalSpeed = device.interfaces.reduce((total, item) => total + (item.speedMbps ?? 1000), 0) || 1;
      const bandwidth = Math.min(100, round((totalRate / totalSpeed) * 100));
      add({
        metric: "bandwidth",
        source: "netflow",
        scopeId: device.id,
        scopeType: "device",
        label: device.hostname,
        value: bandwidth,
        unit: "%",
        healthy: bandwidth < 85,
      });
      const cpu = Math.min(
        100,
        round(8 + bandwidth * 0.75 + device.interfaces.filter((item) => item.status !== "up").length * 4),
      );
      const memory = Math.min(
        100,
        round(18 + device.interfaces.length * 1.8 + Object.keys(config?.services ?? {}).length * 3),
      );
      add({
        metric: "cpu",
        source: "snmp",
        scopeId: device.id,
        scopeType: "device",
        label: device.hostname,
        value: cpu,
        unit: "%",
        healthy: cpu < 85,
      });
      add({
        metric: "memory",
        source: "snmp",
        scopeId: device.id,
        scopeType: "device",
        label: device.hostname,
        value: memory,
        unit: "%",
        healthy: memory < 90,
      });
      const diskTemperatures = config ? Object.values(config.storage.disks).map((disk) => disk.temperatureC) : [];
      const temperature = diskTemperatures.length ? Math.max(...diskTemperatures) : round(32 + cpu / 12);
      add({
        metric: "temperature",
        source: "health-check",
        scopeId: device.id,
        scopeType: "device",
        label: device.hostname,
        value: temperature,
        unit: "°C",
        healthy: temperature < 70,
      });

      for (const networkInterface of device.interfaces) {
        const provisioned = networkInterface.status === "up" || Boolean(networkInterface.connectedEdgeId);
        if (!provisioned) continue;
        const up = networkInterface.status === "up";
        add({
          metric: "interface-status",
          source: "snmp",
          scopeId: networkInterface.id,
          scopeType: "interface",
          label: `${device.hostname} · ${networkInterface.name}`,
          value: up ? 1 : 0,
          unit: "state",
          healthy: up,
        });
      }

      if (config) this.collectSpecialized(config, device, topology, add);
    }

    for (const link of topology.connections) {
      const label = link.label ?? `${link.sourceDeviceId.slice(0, 6)} ↔ ${link.targetDeviceId.slice(0, 6)}`;
      add({
        metric: "latency",
        source: "icmp",
        scopeId: link.id,
        scopeType: "link",
        label,
        value: link.latencyMs,
        unit: "ms",
        healthy: link.latencyMs <= 80 && link.status === "up",
      });
      add({
        metric: "jitter",
        source: "icmp",
        scopeId: link.id,
        scopeType: "link",
        label,
        value: link.jitterMs,
        unit: "ms",
        healthy: link.jitterMs <= 30,
      });
      add({
        metric: "packet-loss",
        source: "icmp",
        scopeId: link.id,
        scopeType: "link",
        label,
        value: link.packetLossPercent,
        unit: "%",
        healthy: link.packetLossPercent <= 2 && link.status === "up",
      });
    }
    return samples;
  }

  evaluate(samples: readonly MonitoringMetricSample[], now = new Date()): readonly StatefulMonitoringAlert[] {
    const nowMs = now.getTime();
    const evaluatedIds = new Set<string>();
    for (const rule of this.rules.filter((item) => item.enabled)) {
      for (const sample of samples.filter(
        (item) => item.metric === rule.metric && (!rule.scopeId || item.scopeId === rule.scopeId),
      )) {
        const alertId = `${rule.id}:${sample.scopeId}`;
        evaluatedIds.add(alertId);
        const breached = compare(sample.value, rule.operator, rule.threshold);
        if (!breached) {
          this.breachStartedAt.delete(alertId);
          const existing = this.alertsById.get(alertId);
          if (existing && !["resolved", "suppressed"].includes(existing.state))
            this.transition(alertId, "resolved", now, sample.value);
          continue;
        }
        const startedAt = this.breachStartedAt.get(alertId) ?? nowMs;
        this.breachStartedAt.set(alertId, startedAt);
        if (nowMs - startedAt < rule.durationSeconds * 1000) continue;
        const maintenance = this.maintenanceScopes.has("global") || this.maintenanceScopes.has(sample.scopeId);
        const existing = this.alertsById.get(alertId);
        if (existing) {
          const nextState = maintenance ? "maintenance" : existing.state === "resolved" ? "active" : existing.state;
          this.alertsById.set(alertId, {
            ...existing,
            state: nextState,
            value: sample.value,
            updatedAt: now.toISOString(),
            occurrenceCount: existing.occurrenceCount + (existing.state === "resolved" ? 1 : 0),
            resolvedAt: nextState === "active" ? undefined : existing.resolvedAt,
          });
        } else {
          const alert: StatefulMonitoringAlert = {
            id: alertId,
            ruleId: rule.id,
            metric: rule.metric,
            scopeId: sample.scopeId,
            label: sample.label,
            severity: rule.severity,
            state: maintenance ? "maintenance" : "active",
            value: sample.value,
            threshold: rule.threshold,
            message: rule.message,
            triggeredAt: now.toISOString(),
            updatedAt: now.toISOString(),
            occurrenceCount: 1,
          };
          this.alertsById.set(alertId, alert);
          this.pushEvent(
            now,
            "alert-triggered",
            sample.scopeId,
            `${rule.message}: ${sample.value}${sample.unit}`,
            rule.severity,
          );
        }
      }
    }
    for (const [id, alert] of this.alertsById) {
      if (!evaluatedIds.has(id) && !["resolved", "suppressed"].includes(alert.state))
        this.transition(id, "resolved", now, alert.value);
    }
    return this.alerts();
  }

  acknowledge(alertId: string, now = new Date()): void {
    this.transition(alertId, "acknowledged", now);
  }

  suppress(alertId: string, now = new Date()): void {
    this.transition(alertId, "suppressed", now);
  }

  setMaintenance(scopeId: string, enabled: boolean, now = new Date()): void {
    if (enabled) this.maintenanceScopes.add(scopeId);
    else this.maintenanceScopes.delete(scopeId);
    for (const [id, alert] of this.alertsById) {
      if (scopeId === "global" || alert.scopeId === scopeId) {
        if (enabled && !["resolved", "suppressed"].includes(alert.state)) this.transition(id, "maintenance", now);
        if (!enabled && alert.state === "maintenance") this.transition(id, "active", now);
      }
    }
    this.pushEvent(now, "maintenance", scopeId, `Maintenance ${enabled ? "enabled" : "disabled"}`, "info");
  }

  alerts(): readonly StatefulMonitoringAlert[] {
    return [...this.alertsById.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  eventLog(): readonly MonitoringEvent[] {
    return this.events;
  }

  snapshot(topology: TopologySnapshot, now = new Date()): MonitoringSnapshot {
    const metrics = this.collect(topology, now);
    const alerts = this.evaluate(metrics, now);
    const availability = metrics.filter((item) => item.metric === "device-availability");
    const overallHealthPercent = availability.length
      ? round((availability.filter((item) => item.value === 1).length / availability.length) * 100)
      : 100;
    const slaMetrics = metrics.filter((item) =>
      ["device-availability", "latency", "packet-loss"].includes(item.metric),
    );
    const slaPercent = slaMetrics.length
      ? round((slaMetrics.filter((item) => item.healthy).length / slaMetrics.length) * 100)
      : 100;
    return { collectedAt: now.toISOString(), metrics, alerts, events: this.events, overallHealthPercent, slaPercent };
  }

  private collectSpecialized(
    config: DeviceRuntimeConfig,
    device: NetworkDevice,
    topology: TopologySnapshot,
    add: (sample: Omit<MonitoringMetricSample, "id" | "timestamp">) => void,
  ) {
    const wirelessLinks = topology.connections.filter(
      (item) =>
        item.cableType === "wireless" && (item.sourceDeviceId === device.id || item.targetDeviceId === device.id),
    );
    if (Object.keys(config.security.wireless.ssids).length || wirelessLinks.length) {
      const activeClients = wirelessLinks.filter((item) => item.status === "up").length;
      const worstLoss = Math.max(0, ...wirelessLinks.map((item) => item.packetLossPercent));
      add({
        metric: "wifi-clients",
        source: "wireless",
        scopeId: device.id,
        scopeType: "wireless",
        label: device.hostname,
        value: activeClients,
        unit: "clients",
        healthy: true,
      });
      add({
        metric: "rssi",
        source: "wireless",
        scopeId: device.id,
        scopeType: "wireless",
        label: device.hostname,
        value: -40 - worstLoss * 2,
        unit: "dBm",
        healthy: worstLoss < 10,
      });
    }
    if (config.storage.enabled) {
      const capacity = Object.values(config.storage.disks).reduce((total, disk) => total + disk.capacityGb, 0);
      const used = Object.values(config.storage.pools).reduce((total, pool) => total + pool.usedCapacityGb, 0);
      const usage = capacity ? round((used / capacity) * 100) : 0;
      const raidHealthy = Object.values(config.storage.disks).every((disk) => disk.status !== "failed");
      add({
        metric: "nas-capacity",
        source: "storage",
        scopeId: device.id,
        scopeType: "storage",
        label: device.hostname,
        value: usage,
        unit: "%",
        healthy: usage < 85,
      });
      add({
        metric: "raid-state",
        source: "storage",
        scopeId: device.id,
        scopeType: "storage",
        label: device.hostname,
        value: raidHealthy ? 1 : 0,
        unit: "state",
        healthy: raidHealthy,
      });
    }
    const tunnels = Object.values(config.security.vpn.tunnels);
    if (tunnels.length) {
      const active = tunnels.filter((tunnel) => tunnel.enabled).length;
      add({
        metric: "vpn-status",
        source: "health-check",
        scopeId: device.id,
        scopeType: "vpn",
        label: device.hostname,
        value: round((active / tunnels.length) * 100),
        unit: "%",
        healthy: active === tunnels.length,
      });
    }
    if (config.cloud.enabled) {
      const resources = Object.values(config.cloud.resources);
      const available = resources.filter((item) => item.status === "available").length;
      const health = resources.length ? round((available / resources.length) * 100) : 100;
      add({
        metric: "cloud-resource-status",
        source: "health-check",
        scopeId: device.id,
        scopeType: "cloud",
        label: device.hostname,
        value: health,
        unit: "%",
        healthy: health === 100,
      });
    }
  }

  private transition(alertId: string, state: StatefulMonitoringAlert["state"], now: Date, value?: number): void {
    const alert = this.alertsById.get(alertId);
    if (!alert || alert.state === state) return;
    const updated = {
      ...alert,
      state,
      value: value ?? alert.value,
      updatedAt: now.toISOString(),
      acknowledgedAt: state === "acknowledged" ? now.toISOString() : alert.acknowledgedAt,
      resolvedAt: state === "resolved" ? now.toISOString() : alert.resolvedAt,
    };
    this.alertsById.set(alertId, updated);
    this.pushEvent(
      now,
      state === "resolved" ? "alert-resolved" : "alert-updated",
      alert.scopeId,
      `${alert.message} → ${state}`,
      alert.severity,
    );
  }

  private pushEvent(
    now: Date,
    type: MonitoringEvent["type"],
    scopeId: string,
    message: string,
    severity: MonitoringEvent["severity"],
  ): void {
    this.sequence += 1;
    this.events = [
      ...this.events,
      { id: `monitor-event-${this.sequence}`, timestamp: now.toISOString(), type, scopeId, message, severity },
    ].slice(-1_000);
  }
}

function runtimeConfig(device: NetworkDevice): DeviceRuntimeConfig | undefined {
  const value = device.configuration.runtimeConfig;
  return value && typeof value === "object" ? (value as DeviceRuntimeConfig) : undefined;
}

function compare(value: number, operator: MonitoringAlertRule["operator"], threshold: number): boolean {
  if (operator === ">") return value > threshold;
  if (operator === ">=") return value >= threshold;
  if (operator === "<") return value < threshold;
  if (operator === "<=") return value <= threshold;
  return value === threshold;
}

const round = (value: number) => Math.round(value * 10) / 10;
