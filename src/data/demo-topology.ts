import { nanoid } from "nanoid";

import { deviceRegistry } from "@/data/device-catalog";
import { createProjectConfigurationState } from "@/domain/configuration/configuration-engine";
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  type NetLabProject,
  type NetworkConnection,
  type NetworkDevice,
} from "@/types/network";

const positions: ReadonlyArray<[string, number, number]> = [
  ["internet-cloud", 420, 40],
  ["firewall", 420, 190],
  ["layer-2-switch", 420, 340],
  ["pc", 120, 520],
  ["access-point", 420, 520],
  ["nas", 720, 520],
  ["laptop", 420, 690],
];

function connect(
  source: NetworkDevice,
  target: NetworkDevice,
  cableType: NetworkConnection["cableType"] = "copper",
  sourceInterfaceIndex = 0,
  targetInterfaceIndex = 0,
): NetworkConnection {
  if (source.interfaces[sourceInterfaceIndex]) {
    source.interfaces[sourceInterfaceIndex] = { ...source.interfaces[sourceInterfaceIndex], status: "up" };
  }
  if (target.interfaces[targetInterfaceIndex]) {
    target.interfaces[targetInterfaceIndex] = { ...target.interfaces[targetInterfaceIndex], status: "up" };
  }
  return {
    id: nanoid(),
    sourceDeviceId: source.id,
    sourceInterfaceId: source.interfaces[sourceInterfaceIndex]?.id,
    targetDeviceId: target.id,
    targetInterfaceId: target.interfaces[targetInterfaceIndex]?.id,
    cableType,
    status: "up",
    bandwidthMbps: cableType === "wireless" ? 600 : 1000,
    latencyMs: 1,
    jitterMs: 0,
    packetLossPercent: 0,
    duplex: "full",
    mtu: 1500,
    protocol: cableType === "wireless" ? "802.11" : "ethernet",
    direction: "bidirectional",
    pathStyle: cableType === "wireless" ? "wireless" : cableType === "virtual" ? "logical" : "physical",
    createdAt: new Date().toISOString(),
  };
}

export function createDemoProject(): NetLabProject {
  const now = new Date().toISOString();
  const devices = positions.map(([type, x, y]) => deviceRegistry.create(type, { x, y }));
  const [cloud, firewall, networkSwitch, pc, ap, nas, laptop] = devices;
  if (!cloud || !firewall || !networkSwitch || !pc || !ap || !nas || !laptop)
    throw new Error("Demo topology is incomplete");

  firewall.interfaces[1] = {
    ...firewall.interfaces[1]!,
    ipv4: "192.168.1.1",
    prefixLength: 24,
    subnetMask: "255.255.255.0",
    status: "up",
  };
  networkSwitch.interfaces[0] = {
    ...networkSwitch.interfaces[0]!,
    ipv4: "192.168.1.2",
    prefixLength: 24,
    subnetMask: "255.255.255.0",
    status: "up",
  };
  nas.interfaces[0] = {
    ...nas.interfaces[0]!,
    ipv4: "192.168.1.10",
    prefixLength: 24,
    subnetMask: "255.255.255.0",
    defaultGateway: "192.168.1.1",
    status: "up",
  };
  pc.interfaces[0] = {
    ...pc.interfaces[0]!,
    ipv4: "192.168.1.100",
    prefixLength: 24,
    subnetMask: "255.255.255.0",
    defaultGateway: "192.168.1.1",
    status: "up",
  };
  laptop.configuration = { addressing: "dhcp" };
  ap.configuration = { ssid: "NetLab-Demo", security: "WPA2" };
  devices.forEach((device) => {
    device.status = "online";
  });

  return {
    id: "demo-project",
    name: "NetLab Demo Campus",
    description: "Topology ตัวอย่าง Internet, Firewall, Switching, Wi-Fi และ NAS",
    version: "0.1.0",
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    devices,
    connections: [
      connect(cloud, firewall, "virtual", 0, 0),
      connect(firewall, networkSwitch, "copper", 1, 0),
      connect(networkSwitch, pc, "copper", 1, 0),
      connect(networkSwitch, ap, "copper", 2, 0),
      connect(networkSwitch, nas, "copper", 3, 0),
      connect(ap, laptop, "wireless", 1, 0),
    ],
    groups: [],
    canvasSettings: { snapToGrid: true, showGrid: true, zoom: 0.85 },
    simulationSettings: { speed: 1, autoStart: false },
    configurationState: createProjectConfigurationState(devices),
    createdAt: now,
    updatedAt: now,
  };
}
