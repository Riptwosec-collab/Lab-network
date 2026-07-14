import { nanoid } from "nanoid";

import { deriveMacAddress } from "@/engine/protocols/ping-engine";
import type { DeviceDefinition, NetworkDevice, NetworkInterface } from "@/types/network";

const ethernet = (name: string): Omit<NetworkInterface, "id"> => ({
  name,
  type: "gigabit-ethernet",
  status: "down",
  speedMbps: 1000,
  duplex: "auto",
  mtu: 1500,
});

const registryEntries: DeviceDefinition[] = [
  {
    type: "branch-router",
    category: "router",
    displayName: "Branch Router",
    description: "เราเตอร์สำหรับสำนักงานสาขาและ WAN ขนาดเล็ก",
    icon: "Router",
    defaultInterfaces: [ethernet("Gi0/0"), ethernet("Gi0/1")],
    defaultConfiguration: { routing: "static" },
    capabilities: ["routing", "nat", "dhcp", "acl"],
    inspectorTabs: ["overview", "interfaces", "ip", "routing", "security", "logs"],
  },
  {
    type: "enterprise-router",
    category: "router",
    displayName: "Enterprise Router",
    description: "เราเตอร์ประสิทธิภาพสูงสำหรับเครือข่ายองค์กร",
    icon: "Router",
    defaultInterfaces: [ethernet("Gi0/0"), ethernet("Gi0/1"), ethernet("Gi0/2")],
    defaultConfiguration: { routing: "dynamic" },
    capabilities: ["routing", "nat", "dhcp", "acl", "vpn", "qos"],
    inspectorTabs: ["overview", "interfaces", "ip", "routing", "security", "logs"],
  },
  {
    type: "layer-2-switch",
    category: "switch",
    displayName: "Layer 2 Switch",
    description: "สวิตช์ Access สำหรับ VLAN และ Ethernet switching",
    icon: "Network",
    defaultInterfaces: Array.from({ length: 8 }, (_, index) => ethernet(`Gi0/${index + 1}`)),
    defaultConfiguration: { nativeVlan: 1 },
    capabilities: ["switching", "vlan", "stp"],
    inspectorTabs: ["overview", "interfaces", "vlan", "logs"],
  },
  {
    type: "layer-3-switch",
    category: "switch",
    displayName: "Layer 3 Switch",
    description: "สวิตช์ Core ที่รองรับ inter-VLAN routing",
    icon: "Network",
    defaultInterfaces: Array.from({ length: 8 }, (_, index) => ethernet(`Gi0/${index + 1}`)),
    defaultConfiguration: { nativeVlan: 1, ipRouting: true },
    capabilities: ["switching", "vlan", "stp", "routing"],
    inspectorTabs: ["overview", "interfaces", "ip", "vlan", "routing", "logs"],
  },
  {
    type: "firewall",
    category: "security",
    displayName: "Firewall",
    description: "ไฟร์วอลล์สำหรับแบ่ง zone, NAT และ policy",
    icon: "ShieldCheck",
    defaultInterfaces: [ethernet("WAN"), ethernet("LAN"), ethernet("DMZ")],
    defaultConfiguration: { defaultPolicy: "deny" },
    capabilities: ["firewall", "nat", "vpn", "ids"],
    inspectorTabs: ["overview", "interfaces", "ip", "security", "logs"],
  },
  {
    type: "access-point",
    category: "wireless",
    displayName: "Access Point",
    description: "จุดกระจายสัญญาณ Wi-Fi สำหรับ client",
    icon: "Wifi",
    defaultInterfaces: [ethernet("Eth0"), { ...ethernet("Wlan0"), type: "wireless" }],
    defaultConfiguration: { ssid: "NetLab", security: "WPA2" },
    capabilities: ["wireless", "ssid", "guest-network"],
    inspectorTabs: ["overview", "interfaces", "wireless", "logs"],
  },
  {
    type: "wifi-router",
    category: "wireless",
    displayName: "Wi-Fi Router",
    description: "เราเตอร์ไร้สายสำหรับเครือข่ายขนาดเล็ก",
    icon: "Wifi",
    defaultInterfaces: [ethernet("WAN"), ethernet("LAN1"), { ...ethernet("Wlan0"), type: "wireless" }],
    defaultConfiguration: { ssid: "NetLab", dhcp: true },
    capabilities: ["routing", "nat", "dhcp", "wireless"],
    inspectorTabs: ["overview", "interfaces", "ip", "wireless", "security"],
  },
  ...[
    ["general-server", "General Server", "server", "Server", ["services", "storage"]],
    ["dhcp-server", "DHCP Server", "server", "ServerCog", ["dhcp"]],
    ["dns-server", "DNS Server", "server", "ServerCog", ["dns"]],
    ["nas", "NAS", "storage", "HardDrive", ["storage", "file-sharing"]],
    ["pc", "PC", "end-device", "Monitor", ["client"]],
    ["laptop", "Laptop", "end-device", "Laptop", ["client", "wireless"]],
    ["smartphone", "Smartphone", "end-device", "Smartphone", ["client", "wireless"]],
    ["printer", "Printer", "end-device", "Printer", ["printing"]],
    ["internet-cloud", "Internet Cloud", "cloud", "Cloud", ["internet"]],
    ["private-cloud", "Private Cloud", "cloud", "CloudCog", ["cloud", "private"]],
    ["public-cloud", "Public Cloud", "cloud", "Cloud", ["cloud", "public"]],
  ].map(([type, displayName, category, icon, capabilities]) => ({
    type: type as string,
    category: category as DeviceDefinition["category"],
    displayName: displayName as string,
    description: `${displayName as string} สำหรับ topology ในห้องทดลอง`,
    icon: icon as string,
    defaultInterfaces: category === "cloud" ? [{ ...ethernet("Cloud0"), type: "cloud" as const }] : [ethernet("Eth0")],
    defaultConfiguration: {},
    capabilities: capabilities as string[],
    inspectorTabs: ["overview", "interfaces", "ip", category === "storage" ? "storage" : "services", "logs"],
  })),
];

export class DeviceRegistry {
  private readonly definitions = new Map<string, DeviceDefinition>();

  constructor(definitions: readonly DeviceDefinition[] = []) {
    definitions.forEach((definition) => this.register(definition));
  }

  register(definition: DeviceDefinition): void {
    this.definitions.set(definition.type, definition);
  }

  get(type: string): DeviceDefinition | undefined {
    return this.definitions.get(type);
  }

  list(): DeviceDefinition[] {
    return Array.from(this.definitions.values());
  }

  create(type: string, position = { x: 120, y: 120 }): NetworkDevice {
    const definition = this.get(type);
    if (!definition) throw new Error(`Unknown device type: ${type}`);
    const now = new Date().toISOString();
    const suffix = nanoid(4).toUpperCase();
    return {
      id: nanoid(),
      type: definition.type,
      name: `${definition.displayName} ${suffix}`,
      hostname: `${definition.type}-${suffix.toLowerCase()}`,
      category: definition.category,
      model: definition.displayName,
      status: "offline",
      position,
      interfaces: definition.defaultInterfaces.map((networkInterface) => {
        const id = nanoid();
        return {
          ...networkInterface,
          id,
          macAddress: networkInterface.macAddress ?? deriveMacAddress(id),
        };
      }),
      configuration: { ...definition.defaultConfiguration },
      capabilities: [...definition.capabilities],
      locked: false,
      createdAt: now,
      updatedAt: now,
    };
  }
}

export const deviceRegistry = new DeviceRegistry(registryEntries);
export const deviceCatalog = deviceRegistry.list();
