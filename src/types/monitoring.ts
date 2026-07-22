export type MonitoringMetricName =
  | "device-availability"
  | "interface-status"
  | "bandwidth"
  | "cpu"
  | "memory"
  | "temperature"
  | "latency"
  | "jitter"
  | "packet-loss"
  | "wifi-clients"
  | "rssi"
  | "nas-capacity"
  | "raid-state"
  | "vpn-status"
  | "cloud-resource-status";

export type MonitoringSource = "icmp" | "snmp" | "syslog" | "netflow" | "health-check" | "storage" | "wireless";
export type AlertSeverity = "info" | "warning" | "high" | "critical";
export type AlertLifecycleState = "triggered" | "active" | "acknowledged" | "resolved" | "suppressed" | "maintenance";

export interface MonitoringMetricSample {
  readonly id: string;
  readonly timestamp: string;
  readonly metric: MonitoringMetricName;
  readonly source: MonitoringSource;
  readonly scopeId: string;
  readonly scopeType: "device" | "interface" | "link" | "wireless" | "storage" | "cloud" | "vpn";
  readonly label: string;
  readonly value: number;
  readonly unit: string;
  readonly healthy: boolean;
}

export interface MonitoringAlertRule {
  readonly id: string;
  readonly metric: MonitoringMetricName;
  readonly operator: ">" | ">=" | "<" | "<=" | "==";
  readonly threshold: number;
  readonly durationSeconds: number;
  readonly severity: AlertSeverity;
  readonly scopeId?: string;
  readonly message: string;
  readonly enabled: boolean;
}

export interface StatefulMonitoringAlert {
  readonly id: string;
  readonly ruleId: string;
  readonly metric: MonitoringMetricName;
  readonly scopeId: string;
  readonly label: string;
  readonly severity: AlertSeverity;
  readonly state: AlertLifecycleState;
  readonly value: number;
  readonly threshold: number;
  readonly message: string;
  readonly triggeredAt: string;
  readonly updatedAt: string;
  readonly acknowledgedAt?: string;
  readonly resolvedAt?: string;
  readonly occurrenceCount: number;
}

export interface MonitoringEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly type: "metric-collected" | "alert-triggered" | "alert-updated" | "alert-resolved" | "maintenance";
  readonly scopeId: string;
  readonly message: string;
  readonly severity: AlertSeverity;
}

export interface MonitoringSnapshot {
  readonly collectedAt: string;
  readonly metrics: readonly MonitoringMetricSample[];
  readonly alerts: readonly StatefulMonitoringAlert[];
  readonly events: readonly MonitoringEvent[];
  readonly overallHealthPercent: number;
  readonly slaPercent: number;
}
