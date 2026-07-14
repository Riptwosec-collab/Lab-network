import type { Edge, Node, XYPosition } from "@xyflow/react";

export const DEVICE_CATEGORIES = [
  "router",
  "switch",
  "security",
  "wireless",
  "server",
  "storage",
  "end-device",
  "cloud",
] as const;

export type DeviceCategory = (typeof DEVICE_CATEGORIES)[number];
export type DeviceStatus = "online" | "offline" | "warning" | "unknown";
export type InterfaceStatus = "up" | "down" | "administratively-down";
export type InterfaceType =
  | "ethernet"
  | "fast-ethernet"
  | "gigabit-ethernet"
  | "10-gigabit-ethernet"
  | "fiber"
  | "wireless"
  | "serial"
  | "loopback"
  | "vlan"
  | "management"
  | "cloud"
  | "storage";
export type CableType = "copper" | "fiber" | "wireless" | "serial" | "virtual";

export interface NetworkInterface {
  readonly id: string;
  name: string;
  type: InterfaceType;
  status: InterfaceStatus;
  macAddress?: string;
  ipv4?: string;
  ipv6?: string;
  subnetMask?: string;
  prefixLength?: number;
  defaultGateway?: string;
  vlan?: number;
  speedMbps?: number;
  duplex?: "half" | "full" | "auto";
  mtu: number;
  description?: string;
  connectedEdgeId?: string;
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
  status: "up" | "down" | "degraded";
  bandwidthMbps: number;
  latencyMs: number;
  jitterMs: number;
  packetLossPercent: number;
  duplex: "half" | "full" | "auto";
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
  createdAt: string;
  updatedAt: string;
}

export interface ProjectExport {
  schemaVersion: number;
  project: Omit<NetLabProject, "devices" | "connections" | "groups">;
  devices: NetworkDevice[];
  connections: NetworkConnection[];
  groups: TopologyGroup[];
  settings: {
    canvas: CanvasSettings;
    simulation: SimulationSettings;
  };
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
  readonly type: string;
  readonly category: DeviceCategory;
  readonly displayName: string;
  readonly description: string;
  readonly icon: string;
  readonly defaultInterfaces: ReadonlyArray<Omit<NetworkInterface, "id">>;
  readonly defaultConfiguration: Readonly<Record<string, unknown>>;
  readonly capabilities: readonly string[];
  readonly inspectorTabs: readonly string[];
}
