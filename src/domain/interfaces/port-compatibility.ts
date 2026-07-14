import type { CableType, NetworkInterface, TopologySnapshot } from "@/types/network";

const cableMedia: Readonly<Record<CableType, readonly NetworkInterface["medium"][]>> = {
  copper: ["copper"],
  "copper-crossover": ["copper"],
  "fiber-single-mode": ["fiber"],
  "fiber-multi-mode": ["fiber"],
  "serial-dce": ["serial"],
  "serial-dte": ["serial"],
  console: ["management"],
  coaxial: ["service"],
  usb: ["management"],
  wireless: ["wireless"],
  vpn: ["logical"],
  gre: ["logical"],
  ipsec: ["logical"],
  mpls: ["service", "logical"],
  internet: ["service", "logical"],
  cellular: ["service"],
  satellite: ["service"],
  virtual: ["logical", "service"],
  "port-channel": ["copper", "fiber", "logical"],
  "sd-wan": ["logical", "service"],
};

export interface PortCompatibilityResult {
  readonly compatible: boolean;
  readonly reason?: string;
}

export function canUseCable(
  source: Pick<NetworkInterface, "medium" | "type">,
  target: Pick<NetworkInterface, "medium" | "type">,
  cableType: CableType,
): PortCompatibilityResult {
  if (cableType === "virtual") return { compatible: true };
  const allowedMedia = cableMedia[cableType];
  const sourceMedium = source.medium ?? inferMedium(source.type);
  const targetMedium = target.medium ?? inferMedium(target.type);
  if (!allowedMedia.includes(sourceMedium) || !allowedMedia.includes(targetMedium)) {
    return { compatible: false, reason: `${cableType} does not match the selected interface media` };
  }
  if (cableType.startsWith("fiber") && sourceMedium !== "fiber") {
    return { compatible: false, reason: "Fiber links require fiber interfaces at both ends" };
  }
  if (cableType.startsWith("serial") && (sourceMedium !== "serial" || targetMedium !== "serial")) {
    return { compatible: false, reason: "Serial links require serial interfaces at both ends" };
  }
  return { compatible: true };
}

export function isInterfaceAvailable(topology: TopologySnapshot, interfaceId: string): boolean {
  return !topology.connections.some(
    (connection) => connection.sourceInterfaceId === interfaceId || connection.targetInterfaceId === interfaceId,
  );
}

function inferMedium(type: NetworkInterface["type"]): NonNullable<NetworkInterface["medium"]> {
  if (["fiber", "sfp", "sfp-plus", "qsfp", "qsfp28"].includes(type)) return "fiber";
  if (type === "serial") return "serial";
  if (type === "wireless") return "wireless";
  if (["console", "aux", "management"].includes(type)) return "management";
  if (["tunnel", "vlan", "loopback", "port-channel", "cloud"].includes(type)) return "logical";
  if (["cellular", "dsl", "cable"].includes(type)) return "service";
  return "copper";
}
