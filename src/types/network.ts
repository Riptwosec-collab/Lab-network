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

export const CURRENT_PROJECT_SCHEMA_VERSION = 6;

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
  switchport?: SwitchportRuntimeConfig;
}

export interface SwitchportRuntimeConfig {
  mode: "access" | "trunk" | "routed" | "dynamic" | "disabled";
  accessVlan: number;
  nativeVlan: number;
  allowedVlans: number[];
  voiceVlan?: number;
  stpCost?: number;
  stpPriority: number;
  portFast: boolean;
  bpduGuard: boolean;
  rootGuard: boolean;
  loopGuard: boolean;
  channelGroup?: number;
  lacpMode?: "active" | "passive" | "on";
}

export interface VlanRuntimeConfig {
  id: number;
  name: string;
  status: "active" | "suspended";
}

export interface EtherChannelRuntimeConfig {
  id: number;
  protocol: "lacp" | "static";
  mode: "active" | "passive" | "on";
  memberInterfaceIds: string[];
}

export interface SwitchingRuntimeConfig {
  vlans: Record<string, VlanRuntimeConfig>;
  macAgingSeconds: number;
  staticMacEntries: Array<{ macAddress: string; vlanId: number; interfaceId: string }>;
  spanningTree: {
    mode: "rstp" | "rapid-pvst" | "pvst";
    priority: number;
    enabledVlans: number[];
  };
  etherChannels: Record<string, EtherChannelRuntimeConfig>;
}

export interface StaticRouteRuntimeConfig {
  destination: string;
  prefixLength: number;
  nextHop: string;
  administrativeDistance: number;
  metric: number;
  name?: string;
}

export interface SviRuntimeConfig {
  vlanId: number;
  enabled: boolean;
  ipv4: string;
  prefixLength: number;
  description?: string;
}

export interface RoutingRuntimeConfig {
  ipRouting: boolean;
  staticRoutes: StaticRouteRuntimeConfig[];
  svis: Record<string, SviRuntimeConfig>;
}

export interface DhcpExcludedRange {
  start: string;
  end: string;
}

export interface DhcpReservation {
  ipAddress: string;
  clientIdentifier: string;
  description?: string;
}

export interface DhcpPoolRuntimeConfig {
  name: string;
  network: string;
  prefixLength: number;
  defaultGateway: string;
  dnsServers: string[];
  domainName?: string;
  leaseSeconds: number;
  maximumLeases?: number;
  excludedRanges: DhcpExcludedRange[];
  reservations: DhcpReservation[];
  relayAddresses: string[];
}

export interface DhcpServiceRuntimeConfig {
  enabled: boolean;
  pools: Record<string, DhcpPoolRuntimeConfig>;
}

export type DnsRecordType = "A" | "AAAA" | "CNAME" | "MX" | "PTR" | "TXT" | "NS";

export interface DnsRecordRuntimeConfig {
  id: string;
  name: string;
  type: DnsRecordType;
  value: string;
  ttl: number;
  priority?: number;
}

export interface DnsZoneRuntimeConfig {
  name: string;
  authoritative: boolean;
  reverse: boolean;
  records: DnsRecordRuntimeConfig[];
}

export interface DnsServiceRuntimeConfig {
  enabled: boolean;
  recursive: boolean;
  forwarders: string[];
  cacheTtlSeconds: number;
  zones: Record<string, DnsZoneRuntimeConfig>;
}

export type NatRuleType = "static" | "dynamic" | "pat" | "source" | "destination" | "port-forward" | "exemption";

export interface NatPoolRuntimeConfig {
  name: string;
  startAddress: string;
  endAddress: string;
  prefixLength: number;
}

export interface NatRuleRuntimeConfig {
  id: string;
  order: number;
  enabled: boolean;
  type: NatRuleType;
  source: string;
  sourcePrefixLength: number;
  destination: string;
  destinationPrefixLength: number;
  translatedAddress?: string;
  poolName?: string;
  insideInterfaceId?: string;
  outsideInterfaceId?: string;
  protocol?: "ip" | "tcp" | "udp" | "icmp";
  originalPort?: number;
  translatedPort?: number;
}

export interface NatServiceRuntimeConfig {
  enabled: boolean;
  translationTimeoutSeconds: number;
  pools: Record<string, NatPoolRuntimeConfig>;
  rules: NatRuleRuntimeConfig[];
}

export type AclProtocol = "ip" | "icmp" | "tcp" | "udp";

export interface AclRuleRuntimeConfig {
  sequence: number;
  action: "permit" | "deny";
  protocol: AclProtocol;
  source: string;
  sourcePrefixLength: number;
  destination: string;
  destinationPrefixLength: number;
  sourcePort?: number;
  destinationPort?: number;
  logging: boolean;
  remark?: string;
}

export interface AccessListRuntimeConfig {
  name: string;
  type: "standard" | "extended";
  number?: number;
  rules: AclRuleRuntimeConfig[];
}

export interface AclAssignmentRuntimeConfig {
  interfaceId: string;
  direction: "in" | "out";
  aclName: string;
}

export interface AclServiceRuntimeConfig {
  enabled: boolean;
  accessLists: Record<string, AccessListRuntimeConfig>;
  assignments: AclAssignmentRuntimeConfig[];
}

export interface ServicesRuntimeConfig {
  dhcp: DhcpServiceRuntimeConfig;
  dns: DnsServiceRuntimeConfig;
  nat: NatServiceRuntimeConfig;
  acl: AclServiceRuntimeConfig;
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
  switching?: SwitchingRuntimeConfig;
  routing: RoutingRuntimeConfig;
  services: ServicesRuntimeConfig;
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
      | "CONFIG_CHANGED"
      | "CONFIG_COMMITTED"
      | "CONFIG_SAVED"
      | "CONFIG_ROLLBACK"
      | "INTERFACE_UP"
      | "INTERFACE_DOWN"
      | "VLAN_CHANGED"
      | "STP_CHANGED"
      | "ETHERCHANNEL_CHANGED"
      | "ROUTE_ADDED"
      | "ROUTE_REMOVED"
      | "SERVICE_CHANGED"
      | "ACL_CHANGED"
      | "NAT_CHANGED";
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
