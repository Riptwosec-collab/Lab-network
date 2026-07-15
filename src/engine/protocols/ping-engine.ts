import { ArpCache, type ArpEntry } from "@/engine/protocols/arp-cache";
import { analyzeIPv4, isAddressInSubnet, validateTopologyIPv4 } from "@/engine/protocols/ipv4";
import { Layer2Engine, type Layer2FailureCode, type Layer2TraceResult } from "@/engine/protocols/layer2-engine";
import type { NetworkConnection, NetworkDevice, NetworkInterface, TopologySnapshot } from "@/types/network";

export type PingFailureCode =
  | "SOURCE_NOT_FOUND"
  | "SOURCE_IP_INVALID"
  | "DUPLICATE_IP"
  | "INVALID_GATEWAY"
  | "INTERFACE_DOWN"
  | "DESTINATION_UNREACHABLE"
  | "LINK_DOWN"
  | "ROUTING_NOT_SUPPORTED"
  | Layer2FailureCode;

export type PingStepKind = "validation" | "layer2" | "arp-request" | "arp-reply" | "icmp-request" | "icmp-reply";

export interface PingTimelineStep {
  readonly id: string;
  readonly kind: PingStepKind;
  readonly status: "success" | "failure" | "info";
  readonly atMs: number;
  readonly label: string;
  readonly detail: string;
}

export interface PingRequest {
  readonly sourceDeviceId: string;
  readonly destinationIp: string;
}

export interface PingResult {
  readonly success: boolean;
  readonly sourceDeviceId: string;
  readonly sourceInterfaceId?: string;
  readonly destinationDeviceId?: string;
  readonly destinationInterfaceId?: string;
  readonly destinationIp: string;
  readonly latencyMs?: number;
  readonly failureCode?: PingFailureCode;
  readonly reason: string;
  readonly timeline: readonly PingTimelineStep[];
  readonly arpEntries: readonly ArpEntry[];
  readonly layer2?: Layer2TraceResult;
}

interface InterfaceOwner {
  readonly device: NetworkDevice;
  readonly networkInterface: NetworkInterface;
}

interface GraphPath {
  readonly devices: readonly string[];
  readonly connections: readonly NetworkConnection[];
}

export class IPv4PingEngine {
  constructor(
    private readonly topology: TopologySnapshot,
    private readonly arpCache = new ArpCache(),
  ) {}

  ping(request: PingRequest, now = Date.now()): PingResult {
    const timeline: PingTimelineStep[] = [];
    let atMs = 0;
    const step = (kind: PingStepKind, status: PingTimelineStep["status"], label: string, detail: string) => {
      timeline.push({ id: `${timeline.length + 1}-${kind}`, kind, status, atMs, label, detail });
      atMs += 1;
    };
    const fail = (
      failureCode: PingFailureCode,
      reason: string,
      source?: InterfaceOwner,
      destination?: InterfaceOwner,
      layer2?: Layer2TraceResult,
    ): PingResult => ({
      success: false,
      sourceDeviceId: request.sourceDeviceId,
      sourceInterfaceId: source?.networkInterface.id,
      destinationDeviceId: destination?.device.id,
      destinationInterfaceId: destination?.networkInterface.id,
      destinationIp: request.destinationIp,
      failureCode,
      reason,
      timeline,
      arpEntries: this.arpCache.list(now),
      layer2,
    });

    const sourceDevice = this.topology.devices.find((device) => device.id === request.sourceDeviceId);
    if (!sourceDevice) {
      step("validation", "failure", "Source validation failed", "ไม่พบ source device ใน topology");
      return fail("SOURCE_NOT_FOUND", "ไม่พบ Source Device");
    }
    const source = this.findSourceInterface(sourceDevice, request.destinationIp);
    if (!source) {
      step("validation", "failure", "Source IPv4 missing", "Source ไม่มี interface ที่ตั้งค่า IPv4 และ prefix ถูกต้อง");
      return fail("SOURCE_IP_INVALID", "Source ยังไม่มี IPv4 configuration ที่ถูกต้อง");
    }

    const sourceIssues = validateTopologyIPv4(this.topology).filter(
      (issue) => issue.deviceId === sourceDevice.id && issue.interfaceId === source.networkInterface.id,
    );
    const duplicateIssue = sourceIssues.find((issue) => issue.code === "DUPLICATE_IP");
    if (duplicateIssue) {
      step("validation", "failure", "Duplicate IPv4", duplicateIssue.message);
      return fail("DUPLICATE_IP", duplicateIssue.message, source);
    }
    const gatewayIssue = sourceIssues.find(
      (issue) => issue.code === "INVALID_GATEWAY" || issue.code === "GATEWAY_OUTSIDE_SUBNET",
    );
    if (gatewayIssue) {
      step("validation", "failure", "Gateway validation failed", gatewayIssue.message);
      return fail("INVALID_GATEWAY", gatewayIssue.message, source);
    }
    const otherSourceIssue = sourceIssues[0];
    if (otherSourceIssue) {
      step("validation", "failure", "IPv4 validation failed", otherSourceIssue.message);
      return fail("SOURCE_IP_INVALID", otherSourceIssue.message, source);
    }
    if (source.networkInterface.status !== "up") {
      step("validation", "failure", "Source interface down", source.networkInterface.name);
      return fail("INTERFACE_DOWN", `Source interface ${source.networkInterface.name} ไม่อยู่ในสถานะ up`, source);
    }

    const sourceInfo = analyzeIPv4(source.networkInterface.ipv4!, source.networkInterface.prefixLength!);
    if (!sourceInfo) return fail("SOURCE_IP_INVALID", "Source IPv4 configuration ไม่ถูกต้อง", source);
    const destination = this.findInterfaceByIp(request.destinationIp);
    const sameSubnet = isAddressInSubnet(request.destinationIp, sourceInfo.networkAddress, sourceInfo.prefixLength);
    step(
      "validation",
      "success",
      "IPv4 configuration valid",
      `${sourceInfo.address}/${sourceInfo.prefixLength} → ${request.destinationIp}`,
    );

    if (!sameSubnet) {
      if (!source.networkInterface.defaultGateway) {
        step(
          "validation",
          "failure",
          "Default gateway missing",
          "ปลายทางอยู่นอก subnet แต่ source ไม่มี default gateway",
        );
        return fail("INVALID_GATEWAY", "ต้องกำหนด Default Gateway สำหรับปลายทางต่าง subnet", source, destination);
      }
      step(
        "validation",
        "failure",
        "Routing deferred",
        `ส่งต่อผ่าน ${source.networkInterface.defaultGateway} ต้องใช้ routing engine`,
      );
      return fail("ROUTING_NOT_SUPPORTED", "Ping ข้าม subnet จะรองรับใน Phase 4", source, destination);
    }

    const cached = this.arpCache.get(source.device.id, request.destinationIp, now);
    if (cached) {
      step("arp-reply", "success", "ARP cache hit", `${request.destinationIp} is-at ${cached.macAddress}`);
    } else {
      step("arp-request", "info", "ARP Request", `Who has ${request.destinationIp}? Tell ${sourceInfo.address}`);
      if (!destination) {
        step("arp-reply", "failure", "ARP timeout", `ไม่มี interface ตอบกลับสำหรับ ${request.destinationIp}`);
        return fail("DESTINATION_UNREACHABLE", "Destination ไม่ตอบ ARP Request", source);
      }
    }

    if (!destination) {
      step("arp-reply", "failure", "Destination missing", "ARP cache entry ไม่ตรงกับ topology ปัจจุบัน");
      return fail("DESTINATION_UNREACHABLE", "ไม่พบ Destination ใน topology", source);
    }
    const destinationIssues = validateTopologyIPv4(this.topology).filter(
      (issue) => issue.deviceId === destination.device.id && issue.interfaceId === destination.networkInterface.id,
    );
    if (destinationIssues.some((issue) => issue.code === "DUPLICATE_IP")) {
      step("validation", "failure", "Duplicate destination IPv4", destinationIssues[0]!.message);
      return fail("DUPLICATE_IP", destinationIssues[0]!.message, source, destination);
    }
    if (destination.networkInterface.status !== "up") {
      step("validation", "failure", "Destination interface down", destination.networkInterface.name);
      return fail(
        "INTERFACE_DOWN",
        `Destination interface ${destination.networkInterface.name} ไม่อยู่ในสถานะ up`,
        source,
        destination,
      );
    }

    const layer2 = new Layer2Engine(this.topology).trace(source, destination);
    if (!layer2.success) {
      step("layer2", "failure", layer2.failureCode ?? "Layer 2 forwarding failed", layer2.reason);
      return fail(layer2.failureCode ?? "DESTINATION_UNREACHABLE", layer2.reason, source, destination, layer2);
    }
    step("layer2", "success", `VLAN ${layer2.vlanId} forwarding`, layer2.reason);
    const activePath: GraphPath = {
      devices: layer2.deviceIds,
      connections: layer2.connectionIds
        .map((connectionId) => this.topology.connections.find((connection) => connection.id === connectionId))
        .filter((connection): connection is NetworkConnection => !!connection),
    };

    if (!cached) {
      const macAddress = destination.networkInterface.macAddress ?? deriveMacAddress(destination.networkInterface.id);
      this.arpCache.set(source.device.id, request.destinationIp, macAddress, "dynamic", now);
      step("arp-reply", "success", "ARP Reply", `${request.destinationIp} is-at ${macAddress}`);
    }

    step("icmp-request", "info", "ICMP Echo Request", `${sourceInfo.address} → ${request.destinationIp}`);
    if (activePath.connections.some((connection) => connection.packetLossPercent >= 100)) {
      step("icmp-reply", "failure", "ICMP timeout", "Packet loss ของลิงก์เท่ากับ 100%");
      return fail("DESTINATION_UNREACHABLE", "ICMP Echo Request สูญหายระหว่างทาง", source, destination);
    }
    const latencyMs = Math.max(
      1,
      activePath.connections.reduce((total, connection) => total + connection.latencyMs * 2 + connection.jitterMs, 0),
    );
    step(
      "icmp-reply",
      "success",
      "ICMP Echo Reply",
      `${request.destinationIp} → ${sourceInfo.address} · ${latencyMs.toFixed(1)} ms`,
    );
    return {
      success: true,
      sourceDeviceId: source.device.id,
      sourceInterfaceId: source.networkInterface.id,
      destinationDeviceId: destination.device.id,
      destinationInterfaceId: destination.networkInterface.id,
      destinationIp: request.destinationIp,
      latencyMs,
      reason: "ได้รับ ICMP Echo Reply",
      timeline,
      arpEntries: this.arpCache.list(now),
      layer2,
    };
  }

  private findSourceInterface(device: NetworkDevice, destinationIp: string): InterfaceOwner | undefined {
    const configured = device.interfaces.filter(
      (networkInterface) => networkInterface.ipv4 && networkInterface.prefixLength !== undefined,
    );
    const matching = configured.find((networkInterface) => {
      const info = analyzeIPv4(networkInterface.ipv4!, networkInterface.prefixLength!);
      return info && isAddressInSubnet(destinationIp, info.networkAddress, info.prefixLength);
    });
    const networkInterface = matching ?? configured[0];
    return networkInterface ? { device, networkInterface } : undefined;
  }

  private findInterfaceByIp(ipAddress: string): InterfaceOwner | undefined {
    for (const device of this.topology.devices) {
      const networkInterface = device.interfaces.find((item) => item.ipv4 === ipAddress);
      if (networkInterface) return { device, networkInterface };
    }
    return undefined;
  }
}

export function deriveMacAddress(seed: string): string {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const bytes = [0x02, (hash >>> 24) & 255, (hash >>> 16) & 255, (hash >>> 8) & 255, hash & 255, seed.length & 255];
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(":");
}
