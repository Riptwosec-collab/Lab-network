import type { Edge, Node, XYPosition } from "@xyflow/react";

export const DEVICE_CATEGORIES = [
  "router",
  "switch",
  "security",
  "wireless",
  "server",
  "storage",
  "end-device",
  "iot",
  "cloud",
  "infrastructure",
] as const;

export const INTERFACE_TYPES = [
  "ethernet",
  "fast-ethernet",
  "gigabit-ethernet",
  "2.5-gigabit-ethernet",
  "5-gigabit-ethernet",
  "10-gigabit-ethernet",
  "25-gigabit-ethernet",
  "40-gigabit-ethernet",
  "100-gigabit-ethernet",
  "serial",
  "console",
  "aux",
  "management",
  "loopback",
  "tunnel",
  "vlan",
  "port-channel",
  "wireless",
  "cellular",
  "dsl",
  "cable",
  "fiber",
  "sfp",
  "sfp-plus",
  "qsfp",
  "qsfp28",
  "cloud",
  "storage",
] as const;

export const CABLE_TYPES = [
  "copper",
  "copper-crossover",
  "fiber-single-mode",
  "fiber-multi-mode",
  "serial-dce",
  "serial-dte",
  "console",
  "coaxial",
  "usb",
  "wireless",
  "vpn",
  "gre",
  "ipsec",
  "mpls",
  "internet",
  "cellular",
  "satellite",
  "virtual",
  "port-channel",
  "sd-wan",
] as const;

export const CURRENT_PROJECT_SCHEMA_VERSION = 3;

export type DeviceCategory = (typeof DEVICE_CATEGORIES)[number];
export type DeviceStatus =
  "online" | "offline" | "warning" | "critical" | "configuring" | "validation-failed" | "unknown";
export type InterfaceStatus =
  | "administratively-down"
  | "down"
  | "negotiating"
  | "up"
  | "blocked"
  | "err-disabled"
  | "suspended"
  | "monitoring"
  | "disabled";
export type InterfaceType = (typeof INTERFACE_TYPES)[number];
export type CableType = (typeof CABLE_TYPES)[number];
export type InterfaceMedium = "copper" | "fiber" | "serial" | "wireless" | "logical" | "management" | "service";

export interface NetworkInterface {
  readonly id: string;
  name: string;
  type: InterfaceType;
  status: InterfaceStatus;
  medium?: InterfaceMedium;
  macAddress?: string;
  ipv4?: string;
  ipv6?: string;
  subnetMask?: string;
  prefixLength?: number;
  defaultGateway?: string;
  vlan?: number;
  nativeVlan?: number;
  allowedVlans?: number[];
  portMode?: "access" | "trunk" | "routed" | "dynamic" | "disabled";
  poeState?: "off" | "delivering" | "fault";
  speedMbps?: number;
  duplex?: "half" | "full" | "auto";
  mtu: number;
  description?: string;
  connectedEdgeId?: string;
  errorCount?: number;
  inputRateMbps?: number;
  outputRateMbps?: number;
  packetLossPercent?: number;
}

export interface NetworkDevice {
  readonly id: string;
  type: string;
  name: string;
  hostname: string;
  category: DeviceCategory;
  model: string;
  status: DeviceStatus;
  position: XYPosition;
  interfaces: NetworkInterface[];
  configuration: Record<string, unknown>;
  capabilities: string[];
  locked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NetworkConnection extends Record<string, unknown> {
  readonly id: string;
  sourceDeviceId: string;
  sourceInterfaceId?: string;
  targetDeviceId: string;
  targetInterfaceId?: string;
  cableType: CableType;
  status: "up" | "down" | "degraded" | "administratively-down";
  bandwidthMbps: number;
  latencyMs: number;
  jitterMs: number;
  packetLossPercent: number;
  duplex: "half" | "full" | "auto";
  mtu: number;
  protocol: string;
  label?: string;
  direction: "bidirectional" | "source-to-target" | "target-to-source";
  pathStyle: "physical" | "logical" | "wireless" | "tunnel" | "aggregated";
  createdAt: string;
}

export interface TopologyGroup {
  readonly id: string;
  name: string;
  deviceIds: string[];
  color: string;
}

export interface CanvasSettings {
  snapToGrid: boolean;
  showGrid: boolean;
  zoom: number;
}

export interface SimulationSettings {
  speed: number;
  autoStart: boolean;
}

export type ConfigurationSource = "form" | "cli" | "raw" | "import" | "template" | "lab-solution" | "system";
export type ConfigurationStatus =
  "clean" | "modified" | "validating" | "invalid" | "committed" | "saved" | "rollback-available";

export interface InterfaceRuntimeConfig {
  readonly interfaceId: string;
  enabled: boolean;
  description?: string;
  macAddress?: string;
  ipv4?: string;
  prefixLength?: number;
  defaultGateway?: string;
  mtu?: number;
  speedMbps?: number;
  duplex?: "half" | "full" | "auto";
}

export interface DeviceRuntimeConfig {
  system: {
    hostname: string;
    domainName?: string;
    description?: string;
    location?: string;
    dnsServers: string[];
  };
  interfaces: Record<string, InterfaceRuntimeConfig>;
  routing: { staticRoutes: Array<{ destination: string; prefixLength: number; nextHop: string }> };
  services: Record<string, { enabled: boolean; port?: number }>;
}

export interface ConfigurationValidationResult {
  readonly valid: boolean;
  readonly issues: Array<{ path: string; message: string }>;
}

export interface ConfigurationRevision {
  readonly revisionId: string;
  readonly deviceId: string;
  readonly timestamp: string;
  readonly source: ConfigurationSource;
  readonly changedBy: string;
  readonly changes: string[];
  readonly previousRevision?: string;
  readonly validationResult: ConfigurationValidationResult;
  readonly commitStatus: "applied" | "saved" | "rolled-back";
  readonly before: DeviceRuntimeConfig;
  readonly after: DeviceRuntimeConfig;
}

export interface DeviceConfigurationState {
  readonly deviceId: string;
  defaultConfig: DeviceRuntimeConfig;
  runningConfig: DeviceRuntimeConfig;
  startupConfig: DeviceRuntimeConfig;
  candidateConfig: DeviceRuntimeConfig;
  revisions: ConfigurationRevision[];
  status: ConfigurationStatus;
  validationResult: ConfigurationValidationResult;
}

export interface ProjectConfigurationState {
  readonly devices: Record<string, DeviceConfigurationState>;
  readonly auditLog: Array<{
    id: string;
    timestamp: string;
    deviceId: string;
    type:
      "CONFIG_CHANGED" | "CONFIG_COMMITTED" | "CONFIG_SAVED" | "CONFIG_ROLLBACK" | "INTERFACE_UP" | "INTERFACE_DOWN";
    source: ConfigurationSource;
    message: string;
    revisionId?: string;
  }>;
}

export interface NetLabProject {
  readonly id: string;
  name: string;
  description: string;
  version: string;
  schemaVersion: number;
  devices: NetworkDevice[];
  connections: NetworkConnection[];
  groups: TopologyGroup[];
  canvasSettings: CanvasSettings;
  simulationSettings: SimulationSettings;
  configurationState: ProjectConfigurationState;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectExport {
  schemaVersion: number;
  project: Omit<NetLabProject, "devices" | "connections" | "groups">;
  devices: NetworkDevice[];
  connections: NetworkConnection[];
  groups: TopologyGroup[];
  settings: { canvas: CanvasSettings; simulation: SimulationSettings };
}

export interface DeviceNodeData extends Record<string, unknown> {
  deviceId: string;
}

export type NetworkFlowNode = Node<DeviceNodeData, "device">;
export type NetworkFlowEdge = Edge<NetworkConnection, "network">;

export interface TopologySnapshot {
  devices: NetworkDevice[];
  connections: NetworkConnection[];
  groups: TopologyGroup[];
}

export interface DeviceDefinition {
  readonly id: string;
  readonly type: string;
  readonly category: DeviceCategory;
  readonly vendor: string;
  readonly family: string;
  readonly model: string;
  readonly displayName: string;
  readonly shortName: string;
  readonly description: string;
  readonly icon: string;
  readonly diagramSymbol: string;
  readonly layer: readonly string[];
  readonly defaultInterfaces: ReadonlyArray<Omit<NetworkInterface, "id">>;
  readonly supportedProtocols: readonly string[];
  readonly defaultConfiguration: Readonly<Record<string, unknown>>;
  readonly defaultServices: readonly string[];
  readonly powerState: "on" | "off";
  readonly formFactor: string;
  readonly difficultyLevel: "starter" | "beginner" | "intermediate" | "advanced" | "professional";
  readonly capabilities: readonly string[];
  readonly tags: readonly string[];
  readonly searchableKeywords: readonly string[];
  readonly inspectorTabs: readonly string[];
}

export interface DiagramSymbolDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly category: "device" | "link" | "zone";
}
