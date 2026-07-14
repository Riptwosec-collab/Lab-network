import type { NetworkInterface, TopologySnapshot } from "@/types/network";

export interface IPv4NetworkInfo {
  readonly address: string;
  readonly prefixLength: number;
  readonly subnetMask: string;
  readonly networkAddress: string;
  readonly broadcastAddress: string;
  readonly firstHost: string;
  readonly lastHost: string;
  readonly totalHosts: number;
  readonly isUsableHost: boolean;
}

export type IPv4ValidationCode =
  | "INVALID_IP"
  | "PREFIX_REQUIRED"
  | "INVALID_PREFIX"
  | "SUBNET_MASK_MISMATCH"
  | "NETWORK_ADDRESS"
  | "BROADCAST_ADDRESS"
  | "DUPLICATE_IP"
  | "INVALID_GATEWAY"
  | "GATEWAY_OUTSIDE_SUBNET";

export interface IPv4ValidationIssue {
  readonly code: IPv4ValidationCode;
  readonly message: string;
  readonly deviceId: string;
  readonly interfaceId: string;
}

const IPV4_PATTERN = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;

export function ipv4ToInteger(address: string): number | undefined {
  const match = IPV4_PATTERN.exec(address.trim());
  if (!match) return undefined;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return undefined;
  return ((octets[0]! << 24) | (octets[1]! << 16) | (octets[2]! << 8) | octets[3]!) >>> 0;
}

export function integerToIPv4(value: number): string {
  const normalized = value >>> 0;
  return [normalized >>> 24, (normalized >>> 16) & 255, (normalized >>> 8) & 255, normalized & 255].join(".");
}

export function prefixToMask(prefixLength: number): string | undefined {
  if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 32) return undefined;
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return integerToIPv4(mask);
}

export function analyzeIPv4(address: string, prefixLength: number): IPv4NetworkInfo | undefined {
  const addressValue = ipv4ToInteger(address);
  const subnetMask = prefixToMask(prefixLength);
  if (addressValue === undefined || !subnetMask) return undefined;
  const maskValue = ipv4ToInteger(subnetMask)!;
  const networkValue = (addressValue & maskValue) >>> 0;
  const broadcastValue = (networkValue | (~maskValue >>> 0)) >>> 0;
  const firstHostValue = prefixLength >= 31 ? networkValue : networkValue + 1;
  const lastHostValue = prefixLength >= 31 ? broadcastValue : broadcastValue - 1;
  const totalHosts = prefixLength === 32 ? 1 : prefixLength === 31 ? 2 : Math.max(0, 2 ** (32 - prefixLength) - 2);

  return {
    address: integerToIPv4(addressValue),
    prefixLength,
    subnetMask,
    networkAddress: integerToIPv4(networkValue),
    broadcastAddress: integerToIPv4(broadcastValue),
    firstHost: integerToIPv4(firstHostValue),
    lastHost: integerToIPv4(lastHostValue),
    totalHosts,
    isUsableHost: prefixLength >= 31 || (addressValue !== networkValue && addressValue !== broadcastValue),
  };
}

export function isAddressInSubnet(address: string, networkAddress: string, prefixLength: number): boolean {
  const addressValue = ipv4ToInteger(address);
  const networkValue = ipv4ToInteger(networkAddress);
  const mask = prefixToMask(prefixLength);
  if (addressValue === undefined || networkValue === undefined || !mask) return false;
  const maskValue = ipv4ToInteger(mask)!;
  return (addressValue & maskValue) >>> 0 === (networkValue & maskValue) >>> 0;
}

function validateInterface(
  networkInterface: NetworkInterface,
  deviceId: string,
  duplicateCount: ReadonlyMap<string, number>,
): IPv4ValidationIssue[] {
  if (!networkInterface.ipv4) return [];
  const issue = (code: IPv4ValidationCode, message: string): IPv4ValidationIssue => ({
    code,
    message,
    deviceId,
    interfaceId: networkInterface.id,
  });
  const addressValue = ipv4ToInteger(networkInterface.ipv4);
  if (addressValue === undefined) return [issue("INVALID_IP", "รูปแบบ IPv4 ไม่ถูกต้อง")];
  if (networkInterface.prefixLength === undefined) return [issue("PREFIX_REQUIRED", "กรุณาระบุ Prefix Length")];
  const info = analyzeIPv4(networkInterface.ipv4, networkInterface.prefixLength);
  if (!info) return [issue("INVALID_PREFIX", "Prefix Length ต้องอยู่ระหว่าง 0–32")];

  const issues: IPv4ValidationIssue[] = [];
  if (networkInterface.subnetMask && networkInterface.subnetMask !== info.subnetMask) {
    issues.push(issue("SUBNET_MASK_MISMATCH", `Subnet Mask ต้องเป็น ${info.subnetMask}`));
  }
  if (!info.isUsableHost && info.address === info.networkAddress) {
    issues.push(issue("NETWORK_ADDRESS", "ไม่สามารถใช้ Network Address กับ interface ได้"));
  }
  if (!info.isUsableHost && info.address === info.broadcastAddress) {
    issues.push(issue("BROADCAST_ADDRESS", "ไม่สามารถใช้ Broadcast Address กับ interface ได้"));
  }
  if ((duplicateCount.get(info.address) ?? 0) > 1) {
    issues.push(issue("DUPLICATE_IP", `IPv4 ${info.address} ถูกใช้งานมากกว่าหนึ่ง interface`));
  }
  if (networkInterface.defaultGateway) {
    const gatewayValue = ipv4ToInteger(networkInterface.defaultGateway);
    if (gatewayValue === undefined) {
      issues.push(issue("INVALID_GATEWAY", "รูปแบบ Default Gateway ไม่ถูกต้อง"));
    } else if (!isAddressInSubnet(networkInterface.defaultGateway, info.networkAddress, info.prefixLength)) {
      issues.push(issue("GATEWAY_OUTSIDE_SUBNET", "Default Gateway ต้องอยู่ใน subnet เดียวกับ interface"));
    } else {
      const gatewayInfo = analyzeIPv4(networkInterface.defaultGateway, info.prefixLength);
      if (!gatewayInfo?.isUsableHost || networkInterface.defaultGateway === info.address) {
        issues.push(issue("INVALID_GATEWAY", "Default Gateway ต้องเป็น host address อื่นใน subnet"));
      }
    }
  }
  return issues;
}

export function validateTopologyIPv4(topology: TopologySnapshot): IPv4ValidationIssue[] {
  const duplicateCount = new Map<string, number>();
  topology.devices.forEach((device) =>
    device.interfaces.forEach((networkInterface) => {
      if (!networkInterface.ipv4) return;
      const normalized = ipv4ToInteger(networkInterface.ipv4);
      if (normalized === undefined) return;
      const address = integerToIPv4(normalized);
      duplicateCount.set(address, (duplicateCount.get(address) ?? 0) + 1);
    }),
  );
  return topology.devices.flatMap((device) =>
    device.interfaces.flatMap((networkInterface) => validateInterface(networkInterface, device.id, duplicateCount)),
  );
}

export function validateInterfaceIPv4(
  topology: TopologySnapshot,
  deviceId: string,
  interfaceId: string,
): IPv4ValidationIssue[] {
  return validateTopologyIPv4(topology).filter(
    (issue) => issue.deviceId === deviceId && issue.interfaceId === interfaceId,
  );
}
