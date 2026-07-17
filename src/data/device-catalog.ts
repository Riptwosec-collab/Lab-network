import { nanoid } from "nanoid";

import { deriveMacAddress } from "@/engine/protocols/ping-engine";
import type { DeviceCategory, DeviceDefinition, NetworkDevice, NetworkInterface } from "@/types/network";

type InterfaceTemplate = Omit<NetworkInterface, "id">;
type Profile = Pick<
  DeviceDefinition,
  | "defaultInterfaces"
  | "capabilities"
  | "supportedProtocols"
  | "defaultConfiguration"
  | "defaultServices"
  | "inspectorTabs"
  | "formFactor"
>;
type CatalogSeed = {
  readonly id: string;
  readonly category: DeviceCategory;
  readonly vendor: string;
  readonly family: string;
  readonly model: string;
  readonly displayName: string;
  readonly description: string;
  readonly icon: string;
  readonly diagramSymbol: string;
  readonly layer: readonly string[];
  readonly profile: keyof typeof profiles;
  readonly keywords: readonly string[];
  readonly difficulty?: DeviceDefinition["difficultyLevel"];
};

const port = (
  name: string,
  type: InterfaceTemplate["type"] = "gigabit-ethernet",
  medium: InterfaceTemplate["medium"] = "copper",
): InterfaceTemplate => ({
  name,
  type,
  medium,
  status: "down",
  speedMbps: speedFor(type),
  duplex: "auto",
  mtu: 1500,
  portMode: medium === "copper" ? "access" : undefined,
});

const ports = (count: number, prefix = "Gi0/"): InterfaceTemplate[] =>
  Array.from({ length: count }, (_, index) => port(`${prefix}${index + 1}`));

const profiles = {
  "router-home": {
    defaultInterfaces: [port("WAN"), port("LAN1"), port("LAN2"), port("Wlan0", "wireless", "wireless")],
    capabilities: ["routing", "nat", "dhcp", "wireless"],
    supportedProtocols: ["IPv4", "DHCP", "NAT", "802.11ac"],
    defaultConfiguration: { routing: "static", dhcp: true },
    defaultServices: ["dhcp"],
    inspectorTabs: ["overview", "interfaces", "ip", "routing", "wireless", "security", "logs"],
    formFactor: "desktop",
  },
  "router-branch": {
    defaultInterfaces: [port("Gi0/0"), port("Gi0/1"), port("Gi0/2"), port("Cell0/0", "cellular", "service")],
    capabilities: ["routing", "nat", "dhcp", "acl", "vpn"],
    supportedProtocols: ["IPv4", "OSPF", "BGP", "IPSec", "GRE"],
    defaultConfiguration: { routing: "static" },
    defaultServices: ["dhcp", "nat"],
    inspectorTabs: ["overview", "interfaces", "ip", "routing", "security", "logs"],
    formFactor: "rack",
  },
  "router-core": {
    defaultInterfaces: [
      port("Te0/0", "10-gigabit-ethernet"),
      port("Te0/1", "10-gigabit-ethernet"),
      port("Te0/2", "10-gigabit-ethernet"),
      port("Lo0", "loopback", "logical"),
    ],
    capabilities: ["routing", "mpls", "bgp", "qos", "vpn", "high-availability"],
    supportedProtocols: ["IPv4", "IPv6", "OSPF", "BGP", "MPLS", "VRRP"],
    defaultConfiguration: { routing: "dynamic" },
    defaultServices: [],
    inspectorTabs: ["overview", "interfaces", "ip", "routing", "qos", "security", "logs"],
    formFactor: "rack",
  },
  "router-virtual": {
    defaultInterfaces: [port("eth0"), port("eth1"), port("Lo0", "loopback", "logical")],
    capabilities: ["routing", "nat", "vpn", "cloud"],
    supportedProtocols: ["IPv4", "IPv6", "BGP", "OSPF", "IPSec"],
    defaultConfiguration: { virtualization: true },
    defaultServices: [],
    inspectorTabs: ["overview", "interfaces", "ip", "routing", "security", "logs"],
    formFactor: "virtual",
  },
  "switch-access": {
    defaultInterfaces: ports(8),
    capabilities: ["switching", "vlan", "trunk", "stp", "port-security"],
    supportedProtocols: ["Ethernet", "802.1Q", "RSTP", "LACP"],
    defaultConfiguration: { nativeVlan: 1 },
    defaultServices: [],
    inspectorTabs: ["overview", "interfaces", "vlan", "security", "logs"],
    formFactor: "rack",
  },
  "switch-distribution": {
    defaultInterfaces: [...ports(20), port("Te1/0/1", "10-gigabit-ethernet"), port("Te1/0/2", "10-gigabit-ethernet")],
    capabilities: ["switching", "vlan", "trunk", "stp", "lacp", "routing", "svi", "mlag"],
    supportedProtocols: ["Ethernet", "802.1Q", "MSTP", "OSPF", "VRRP"],
    defaultConfiguration: { nativeVlan: 1, ipRouting: true },
    defaultServices: [],
    inspectorTabs: ["overview", "interfaces", "ip", "vlan", "routing", "security", "logs"],
    formFactor: "rack",
  },
  "switch-datacenter": {
    defaultInterfaces: Array.from({ length: 8 }, (_, index) => port(`Eth1/${index + 1}`, "25-gigabit-ethernet")),
    capabilities: ["switching", "vlan", "vxlan", "evpn", "mlag", "routing"],
    supportedProtocols: ["Ethernet", "BGP", "EVPN", "VXLAN", "LACP"],
    defaultConfiguration: { ipRouting: true },
    defaultServices: [],
    inspectorTabs: ["overview", "interfaces", "ip", "vlan", "routing", "logs"],
    formFactor: "rack",
  },
  firewall: {
    defaultInterfaces: [port("WAN"), port("LAN"), port("DMZ"), port("Mgmt", "management", "management")],
    capabilities: ["firewall", "nat", "vpn", "ids", "ips", "url-filtering"],
    supportedProtocols: ["IPv4", "IPSec", "SSL VPN", "TLS", "BGP"],
    defaultConfiguration: { defaultPolicy: "deny" },
    defaultServices: ["vpn", "ids"],
    inspectorTabs: ["overview", "interfaces", "ip", "routing", "security", "logs"],
    formFactor: "rack",
  },
  wireless: {
    defaultInterfaces: [port("Eth0"), port("Radio0", "wireless", "wireless"), port("Radio1", "wireless", "wireless")],
    capabilities: ["wireless", "ssid", "guest-network", "vlan-mapping", "mesh"],
    supportedProtocols: ["802.11ac", "802.11ax", "WPA2", "WPA3", "802.1X"],
    defaultConfiguration: { ssid: "NetLab", security: "WPA2" },
    defaultServices: ["wireless"],
    inspectorTabs: ["overview", "interfaces", "ip", "wireless", "security", "logs"],
    formFactor: "ceiling",
  },
  server: {
    defaultInterfaces: [port("Eth0"), port("Mgmt0", "management", "management")],
    capabilities: ["services", "storage", "monitoring"],
    supportedProtocols: ["IPv4", "TCP", "UDP", "DNS", "DHCP"],
    defaultConfiguration: {},
    defaultServices: [],
    inspectorTabs: ["overview", "interfaces", "ip", "services", "logs"],
    formFactor: "rack",
  },
  endpoint: {
    defaultInterfaces: [port("Eth0")],
    capabilities: ["client"],
    supportedProtocols: ["IPv4", "DHCP", "DNS", "ICMP"],
    defaultConfiguration: {},
    defaultServices: [],
    inspectorTabs: ["overview", "interfaces", "ip", "logs"],
    formFactor: "desktop",
  },
  "endpoint-wireless": {
    defaultInterfaces: [port("Wlan0", "wireless", "wireless")],
    capabilities: ["client", "wireless"],
    supportedProtocols: ["IPv4", "DHCP", "DNS", "802.11ax"],
    defaultConfiguration: {},
    defaultServices: [],
    inspectorTabs: ["overview", "interfaces", "ip", "wireless", "logs"],
    formFactor: "portable",
  },
  iot: {
    defaultInterfaces: [port("Eth0"), port("Wlan0", "wireless", "wireless")],
    capabilities: ["iot", "telemetry"],
    supportedProtocols: ["IPv4", "MQTT", "CoAP", "802.11"],
    defaultConfiguration: {},
    defaultServices: [],
    inspectorTabs: ["overview", "interfaces", "ip", "services", "logs"],
    formFactor: "embedded",
  },
  cloud: {
    defaultInterfaces: [port("Cloud0", "cloud", "logical")],
    capabilities: ["cloud", "internet", "wan"],
    supportedProtocols: ["BGP", "IPSec", "MPLS"],
    defaultConfiguration: {},
    defaultServices: [],
    inspectorTabs: ["overview", "interfaces", "routing", "logs"],
    formFactor: "virtual",
  },
  infrastructure: {
    defaultInterfaces: [port("Eth0"), port("Mgmt0", "management", "management")],
    capabilities: ["infrastructure"],
    supportedProtocols: ["IPv4", "SNMP", "NTP"],
    defaultConfiguration: {},
    defaultServices: [],
    inspectorTabs: ["overview", "interfaces", "services", "logs"],
    formFactor: "rack",
  },
} as const satisfies Record<string, Profile>;

const seed = (
  id: string,
  category: DeviceCategory,
  displayName: string,
  profile: CatalogSeed["profile"],
  keywords: readonly string[],
  vendor = "NetLab",
): CatalogSeed => ({
  id,
  category,
  vendor,
  family: category,
  model: displayName,
  displayName,
  description: `${displayName} สำหรับการออกแบบและจำลองเครือข่ายเชิงการศึกษา`,
  icon: iconFor(category),
  diagramSymbol: symbolFor(category),
  layer: layersFor(category),
  profile,
  keywords,
});

const deviceSeeds: readonly CatalogSeed[] = [
  ...[
    ["home-router", "Home Router", "router-home", ["เราเตอร์บ้าน", "home", "wifi"]],
    ["soho-router", "SOHO Router", "router-home", ["สำนักงานเล็ก", "soho"]],
    ["branch-router", "Branch Router", "router-branch", ["สาขา", "wan", "router"]],
    ["enterprise-router", "Enterprise Router", "router-core", ["องค์กร", "enterprise"]],
    ["edge-router", "Edge Router", "router-core", ["edge", "internet"]],
    ["core-router", "Core Router", "router-core", ["core", "backbone"]],
    ["virtual-router", "Virtual Router", "router-virtual", ["virtual", "cloud"]],
    ["cloud-router", "Cloud Router", "router-virtual", ["cloud", "vpc"]],
    ["4g-router", "4G Router", "router-branch", ["cellular", "4g"]],
    ["5g-router", "5G Router", "router-branch", ["cellular", "5g"]],
    ["isr-800", "ISR 800 Series", "router-home", ["cisco-style", "isr"]],
    ["isr-1000", "ISR 1000 Series", "router-branch", ["cisco-style", "isr"]],
    ["isr-4000", "ISR 4000 Series", "router-core", ["cisco-style", "isr"]],
    ["catalyst-8000", "Catalyst 8000 Edge", "router-core", ["cisco-style", "edge"]],
    ["asr-1000", "ASR 1000 Series", "router-core", ["cisco-style", "asr"]],
    ["csr-virtual", "CSR Virtual Router", "router-virtual", ["cisco-style", "virtual"]],
    ["srx-branch", "SRX Branch", "router-branch", ["juniper-style", "srx"]],
    ["mx-edge", "MX Edge Router", "router-core", ["juniper-style", "mx"]],
    ["vmx-router", "vMX Virtual Router", "router-virtual", ["juniper-style", "vmx"]],
    ["mikrotik-hex", "hEX Class Router", "router-home", ["mikrotik-style", "hex"]],
    ["mikrotik-ccr", "CCR Class Router", "router-core", ["mikrotik-style", "ccr"]],
    ["fortinet-sdwan", "SD-WAN Edge Router", "router-branch", ["fortinet-style", "sd-wan"]],
  ].map(([id, name, profile, keywords]) =>
    seed(id as string, "router", name as string, profile as CatalogSeed["profile"], keywords as string[]),
  ),
  ...[
    ["unmanaged-switch", "Unmanaged Switch", "switch-access", ["unmanaged", "5 port"]],
    ["smart-switch", "Smart Switch", "switch-access", ["smart", "8 port"]],
    ["layer-2-switch", "Layer 2 Switch", "switch-access", ["layer 2", "vlan", "access"]],
    ["layer-2-managed-switch", "Layer 2 Managed Switch", "switch-access", ["managed", "trunk"]],
    ["layer-3-switch", "Layer 3 Switch", "switch-distribution", ["layer 3", "inter-vlan", "svi"]],
    ["distribution-switch", "Distribution Switch", "switch-distribution", ["distribution", "campus"]],
    ["core-switch", "Core Switch", "switch-distribution", ["core", "campus"]],
    ["poe-switch", "PoE+ Switch", "switch-access", ["poe", "access point", "ip phone"]],
    ["stackable-switch", "Stackable Switch", "switch-distribution", ["stack", "redundancy"]],
    ["industrial-switch", "Industrial Switch", "switch-access", ["industrial", "ot"]],
    ["tor-switch", "Data Center ToR Switch", "switch-datacenter", ["datacenter", "tor"]],
    ["spine-switch", "Spine Switch", "switch-datacenter", ["spine", "leaf", "evpn"]],
    ["leaf-switch", "Leaf Switch", "switch-datacenter", ["leaf", "spine", "vxlan"]],
    ["virtual-switch", "Virtual Switch", "switch-datacenter", ["virtual", "hypervisor"]],
    ["open-vswitch", "Open vSwitch", "switch-datacenter", ["openvswitch", "overlay"]],
  ].map(([id, name, profile, keywords]) =>
    seed(id as string, "switch", name as string, profile as CatalogSeed["profile"], keywords as string[]),
  ),
  ...[
    ["firewall", "Next-generation Firewall", ["firewall", "ngfw", "policy"]],
    ["branch-firewall", "Branch Firewall", ["branch", "firewall"]],
    ["virtual-firewall", "Virtual Firewall", ["virtual", "firewall"]],
    ["cloud-firewall", "Cloud Firewall", ["cloud", "firewall"]],
    ["web-application-firewall", "Web Application Firewall", ["waf", "http"]],
    ["vpn-concentrator", "VPN Concentrator", ["vpn", "ipsec"]],
    ["ids", "Intrusion Detection System", ["ids", "monitoring"]],
    ["ips", "Intrusion Prevention System", ["ips", "security"]],
    ["secure-web-gateway", "Secure Web Gateway", ["proxy", "url filtering"]],
    ["siem", "SIEM", ["siem", "logs"]],
    ["soar", "SOAR", ["soar", "automation"]],
  ].map(([id, name, keywords]) => seed(id as string, "security", name as string, "firewall", keywords as string[])),
  ...[
    ["access-point", "Indoor Access Point", ["access point", "wifi", "จุดกระจายสัญญาณ"]],
    ["outdoor-access-point", "Outdoor Access Point", ["outdoor", "wifi"]],
    ["mesh-access-point", "Mesh Access Point", ["mesh", "wireless"]],
    ["wifi-6-access-point", "Wi-Fi 6 Access Point", ["wifi 6", "802.11ax"]],
    ["wifi-7-access-point", "Wi-Fi 7 Access Point", ["wifi 7", "802.11be"]],
    ["wifi-router", "Wi-Fi Router", ["wireless router", "home"]],
    ["wireless-controller", "Wireless LAN Controller", ["wlc", "controller"]],
    ["cloud-wireless-controller", "Cloud Wireless Controller", ["cloud", "controller"]],
    ["wireless-bridge", "Wireless Bridge", ["bridge", "backhaul"]],
  ].map(([id, name, keywords]) => seed(id as string, "wireless", name as string, "wireless", keywords as string[])),
  ...[
    ["general-server", "General Server", ["server", "generic"]],
    ["web-server", "Web Server", ["http", "https"]],
    ["application-server", "Application Server", ["application", "api"]],
    ["database-server", "Database Server", ["database", "sql"]],
    ["dns-server", "DNS Server", ["dns", "name resolution"]],
    ["dhcp-server", "DHCP Server", ["dhcp", "lease"]],
    ["ntp-server", "NTP Server", ["ntp", "time"]],
    ["syslog-server", "Syslog Server", ["syslog", "logging"]],
    ["monitoring-server", "Monitoring Server", ["snmp", "monitoring"]],
    ["radius-server", "RADIUS Server", ["radius", "802.1x"]],
    ["tacacs-server", "TACACS+ Server", ["tacacs", "aaa"]],
    ["git-server", "Git Server", ["git", "source control"]],
    ["virtualization-host", "Virtualization Host", ["hypervisor", "vm"]],
    ["kubernetes-control-plane", "Kubernetes Control Plane", ["kubernetes", "container"]],
  ].map(([id, name, keywords]) => seed(id as string, "server", name as string, "server", keywords as string[])),
  seed("nas", "storage", "Network Attached Storage", "server", ["nas", "file sharing", "storage"]),
  seed("backup-server", "storage", "Backup Server", "server", ["backup", "storage"]),
  ...[
    ["pc", "Desktop PC", "endpoint", ["pc", "desktop", "คอมพิวเตอร์"]],
    ["laptop", "Laptop", "endpoint-wireless", ["laptop", "notebook"]],
    ["smartphone", "Smartphone", "endpoint-wireless", ["phone", "mobile"]],
    ["tablet", "Tablet", "endpoint-wireless", ["tablet", "mobile"]],
    ["ip-phone", "IP Phone", "endpoint", ["voice", "voip"]],
    ["printer", "Network Printer", "endpoint", ["printer", "printing"]],
    ["cctv", "CCTV Camera", "iot", ["camera", "surveillance"]],
    ["pos-terminal", "POS Terminal", "endpoint", ["pos", "retail"]],
    ["iot-sensor", "IoT Sensor", "iot", ["iot", "sensor"]],
    ["plc", "Industrial PLC", "iot", ["plc", "industrial", "ot"]],
    ["hmi", "Industrial HMI", "iot", ["hmi", "industrial", "ot"]],
    ["access-control", "Access Control", "iot", ["door", "security"]],
  ].map(([id, name, profile, keywords]) =>
    seed(
      id as string,
      profile === "iot" ? "iot" : "end-device",
      name as string,
      profile as CatalogSeed["profile"],
      keywords as string[],
    ),
  ),
  ...[
    ["internet-cloud", "Internet Cloud", "cloud", ["internet", "wan", "cloud"]],
    ["private-cloud", "Private Cloud", "cloud", ["private", "cloud"]],
    ["public-cloud", "Public Cloud", "cloud", ["public", "cloud"]],
    ["mpls-cloud", "MPLS Cloud", "cloud", ["mpls", "wan"]],
    ["sdwan-fabric", "SD-WAN Fabric", "cloud", ["sd-wan", "overlay"]],
    ["vpc", "Virtual Private Cloud", "cloud", ["vpc", "subnet"]],
    ["nat-gateway", "NAT Gateway", "cloud", ["nat", "gateway"]],
    ["vpn-gateway", "VPN Gateway", "cloud", ["vpn", "gateway"]],
    ["load-balancer", "Cloud Load Balancer", "cloud", ["load balancer", "reverse proxy"]],
    ["bastion-host", "Bastion Host", "infrastructure", ["bastion", "jump server"]],
    ["console-server", "Console Server", "infrastructure", ["console", "management"]],
    ["rack", "Data Center Rack", "infrastructure", ["rack", "datacenter"]],
    ["ups", "UPS", "infrastructure", ["power", "ups"]],
    ["patch-panel", "Patch Panel", "infrastructure", ["patch panel", "cabling"]],
  ].map(([id, name, profile, keywords]) =>
    seed(
      id as string,
      profile === "infrastructure" ? "infrastructure" : "cloud",
      name as string,
      profile as CatalogSeed["profile"],
      keywords as string[],
    ),
  ),
];

function createDefinition(seedValue: CatalogSeed): DeviceDefinition {
  const profile = profiles[seedValue.profile];
  const vendor = vendorFor(seedValue.id) ?? seedValue.vendor;
  return {
    id: seedValue.id,
    type: seedValue.id,
    category: seedValue.category,
    vendor,
    family: seedValue.family,
    model: seedValue.model,
    displayName: seedValue.displayName,
    shortName: seedValue.displayName,
    description: seedValue.description,
    icon: seedValue.icon,
    diagramSymbol: seedValue.diagramSymbol,
    layer: seedValue.layer,
    defaultInterfaces: profile.defaultInterfaces,
    supportedProtocols: profile.supportedProtocols,
    defaultConfiguration: profile.defaultConfiguration,
    defaultServices: profile.defaultServices,
    powerState: "on",
    formFactor: profile.formFactor,
    difficultyLevel: seedValue.difficulty ?? "beginner",
    capabilities: profile.capabilities,
    tags: [seedValue.category, vendor.toLowerCase(), seedValue.family, ...seedValue.keywords],
    searchableKeywords: [seedValue.displayName, seedValue.model, vendor, seedValue.category, ...seedValue.keywords],
    inspectorTabs: profile.inspectorTabs,
  };
}

function vendorFor(id: string): string | undefined {
  return [
    { prefix: "isr-", vendor: "Cisco-style" },
    { prefix: "catalyst-", vendor: "Cisco-style" },
    { prefix: "asr-", vendor: "Cisco-style" },
    { prefix: "csr-", vendor: "Cisco-style" },
    { prefix: "srx-", vendor: "Juniper-style" },
    { prefix: "mx-", vendor: "Juniper-style" },
    { prefix: "vmx-", vendor: "Juniper-style" },
    { prefix: "mikrotik-", vendor: "MikroTik-style" },
    { prefix: "fortinet-", vendor: "Fortinet-style" },
  ].find((rule) => id.startsWith(rule.prefix))?.vendor;
}

export interface DeviceSearchFilters {
  readonly category?: DeviceCategory;
  readonly vendor?: string;
}

export class DeviceRegistry {
  private readonly definitions = new Map<string, DeviceDefinition>();

  constructor(definitions: readonly DeviceDefinition[] = []) {
    definitions.forEach((definition) => this.register(definition));
  }

  register(definition: DeviceDefinition): void {
    if (this.definitions.has(definition.type)) throw new Error(`Duplicate device type: ${definition.type}`);
    this.definitions.set(definition.type, definition);
  }

  get(type: string): DeviceDefinition | undefined {
    return this.definitions.get(type);
  }

  list(filters?: DeviceSearchFilters): DeviceDefinition[] {
    return Array.from(this.definitions.values()).filter(
      (definition) =>
        (!filters?.category || definition.category === filters.category) &&
        (!filters?.vendor || definition.vendor.toLocaleLowerCase() === filters.vendor.toLocaleLowerCase()),
    );
  }

  search(query: string, filters?: DeviceSearchFilters): DeviceDefinition[] {
    const normalized = query.trim().toLocaleLowerCase();
    return this.list(filters).filter((definition) => {
      if (!normalized) return true;
      return [
        definition.displayName,
        definition.shortName,
        definition.model,
        definition.vendor,
        definition.family,
        definition.category,
        ...definition.capabilities,
        ...definition.supportedProtocols,
        ...definition.defaultInterfaces.map((item) => item.name),
        ...definition.searchableKeywords,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }

  create(type: string, position = { x: 120, y: 120 }): NetworkDevice {
    const definition = this.get(type);
    if (!definition) throw new Error(`Unknown device type: ${type}`);
    const now = new Date().toISOString();
    const suffix = nanoid(4)
      .replace(/[^a-zA-Z0-9]/g, "0")
      .toUpperCase();
    return {
      id: nanoid(),
      type: definition.type,
      name: `${definition.displayName} ${suffix}`,
      hostname: `${definition.type}-${suffix.toLowerCase()}`,
      category: definition.category,
      model: definition.model,
      status: "offline",
      position,
      interfaces: definition.defaultInterfaces.map((networkInterface) => {
        const id = nanoid();
        return { ...networkInterface, id, macAddress: networkInterface.macAddress ?? deriveMacAddress(id) };
      }),
      configuration: structuredClone(definition.defaultConfiguration),
      capabilities: [...definition.capabilities],
      locked: false,
      createdAt: now,
      updatedAt: now,
    };
  }
}

function speedFor(type: InterfaceTemplate["type"]): number | undefined {
  const speeds: Partial<Record<InterfaceTemplate["type"], number>> = {
    "fast-ethernet": 100,
    "gigabit-ethernet": 1000,
    "2.5-gigabit-ethernet": 2500,
    "5-gigabit-ethernet": 5000,
    "10-gigabit-ethernet": 10000,
    "25-gigabit-ethernet": 25000,
    "40-gigabit-ethernet": 40000,
    "100-gigabit-ethernet": 100000,
  };
  return speeds[type] ?? (type === "wireless" ? 1200 : undefined);
}

function iconFor(category: DeviceCategory): string {
  return (
    {
      router: "Router",
      switch: "Network",
      security: "ShieldCheck",
      wireless: "Wifi",
      server: "Server",
      storage: "HardDrive",
      "end-device": "Monitor",
      iot: "Cpu",
      cloud: "Cloud",
      infrastructure: "Cable",
    } satisfies Record<DeviceCategory, string>
  )[category];
}

function symbolFor(category: DeviceCategory): string {
  return category === "switch" ? "switch" : category === "security" ? "firewall" : category;
}

function layersFor(category: DeviceCategory): readonly string[] {
  return (
    {
      router: ["L3"],
      switch: ["L2", "L3"],
      security: ["L3", "L4", "L7"],
      wireless: ["L1", "L2"],
      server: ["L4", "L7"],
      storage: ["L4", "L7"],
      "end-device": ["L7"],
      iot: ["L1", "L7"],
      cloud: ["WAN", "L3"],
      infrastructure: ["L1"],
    } satisfies Record<DeviceCategory, readonly string[]>
  )[category];
}

export const deviceRegistry = new DeviceRegistry(deviceSeeds.map(createDefinition));
export const deviceCatalog = deviceRegistry.list();
