import { analyzeIPv4, integerToIPv4, ipv4ToInteger, isAddressInSubnet } from "@/engine/protocols/ipv4";
import { Layer2Engine } from "@/engine/protocols/layer2-engine";
import { IPv4RoutingEngine, type RoutingTraceResult } from "@/engine/protocols/routing-engine";
import type {
  AccessListRuntimeConfig,
  AclRuleRuntimeConfig,
  DeviceRuntimeConfig,
  DhcpPoolRuntimeConfig,
  DnsRecordType,
  NatRuleRuntimeConfig,
  NetworkDevice,
  TopologySnapshot,
} from "@/types/network";

export interface DhcpLease {
  readonly id: string;
  readonly serverDeviceId: string;
  readonly poolName: string;
  readonly clientDeviceId: string;
  readonly clientIdentifier: string;
  readonly ipAddress: string;
  readonly defaultGateway: string;
  readonly dnsServers: readonly string[];
  readonly domainName?: string;
  readonly state: "active" | "released" | "expired";
  readonly leasedAt: string;
  readonly expiresAt: string;
  readonly timeline: readonly string[];
}

export interface DhcpRequestResult {
  readonly success: boolean;
  readonly code: "ACK" | "NAK" | "SCOPE_EXHAUSTED" | "SERVER_DISABLED" | "POOL_NOT_FOUND";
  readonly reason: string;
  readonly lease?: DhcpLease;
  readonly timeline: readonly string[];
}

export interface DnsCacheEntry {
  readonly key: string;
  readonly serverDeviceId: string;
  readonly name: string;
  readonly type: DnsRecordType;
  readonly values: readonly string[];
  readonly expiresAt: string;
}

export interface DnsQueryResult {
  readonly success: boolean;
  readonly code: "ANSWER" | "NXDOMAIN" | "TIMEOUT" | "WRONG_DNS" | "CLIENT_DNS_MISSING";
  readonly name: string;
  readonly type: DnsRecordType;
  readonly values: readonly string[];
  readonly cache: "hit" | "miss";
  readonly reason: string;
}

export interface ServicePacket {
  readonly sourceIp: string;
  readonly destinationIp: string;
  readonly protocol: "ip" | "icmp" | "tcp" | "udp";
  readonly sourcePort?: number;
  readonly destinationPort?: number;
}

export interface AclEvaluation {
  readonly deviceId: string;
  readonly hostname: string;
  readonly interfaceId: string;
  readonly direction: "in" | "out";
  readonly aclName: string;
  readonly action: "permit" | "deny";
  readonly ruleSequence?: number;
  readonly implicit: boolean;
  readonly reason: string;
}

export interface NatTranslation {
  readonly id: string;
  readonly deviceId: string;
  readonly ruleId: string;
  readonly type: NatRuleRuntimeConfig["type"];
  readonly protocol: ServicePacket["protocol"];
  readonly insideLocal: string;
  readonly insideGlobal: string;
  readonly outsideLocal: string;
  readonly outsideGlobal: string;
  readonly originalPort?: number;
  readonly translatedPort?: number;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface PacketPolicyResult {
  readonly permitted: boolean;
  readonly aclEvaluations: readonly AclEvaluation[];
  readonly natTranslations: readonly NatTranslation[];
  readonly packet: ServicePacket;
  readonly reason: string;
}

export class NetworkServicesEngine {
  private readonly leases = new Map<string, DhcpLease>();
  private readonly dnsCache = new Map<string, DnsCacheEntry>();
  private readonly translations = new Map<string, NatTranslation>();
  private readonly aclHits = new Map<string, number>();

  constructor(private readonly topology: TopologySnapshot) {}

  requestDhcp(
    clientDeviceId: string,
    serverDeviceId: string,
    poolName: string,
    clientIdentifier = clientDeviceId,
    now = new Date(),
  ): DhcpRequestResult {
    this.expire(now);
    const server = this.topology.devices.find((device) => device.id === serverDeviceId);
    const services = server ? runtimeConfig(server)?.services : undefined;
    const timeline = ["DHCPDISCOVER"];
    if (!server || !services?.dhcp.enabled)
      return { success: false, code: "SERVER_DISABLED", reason: "DHCP server ปิดอยู่หรือไม่พบ server", timeline };
    const pool = services.dhcp.pools[poolName];
    if (!pool) return { success: false, code: "POOL_NOT_FOUND", reason: `ไม่พบ DHCP pool ${poolName}`, timeline };
    const current = [...this.leases.values()].find(
      (lease) => lease.clientIdentifier === clientIdentifier && lease.poolName === poolName && lease.state === "active",
    );
    if (current) {
      const renewed = this.createLease(server, pool, clientDeviceId, clientIdentifier, current.ipAddress, now, [
        "DHCPREQUEST (renew)",
        "DHCPACK",
      ]);
      this.leases.set(renewed.id, renewed);
      return {
        success: true,
        code: "ACK",
        reason: `ต่ออายุ lease ${renewed.ipAddress}`,
        lease: renewed,
        timeline: renewed.timeline,
      };
    }
    const reservation = pool.reservations.find((item) => item.clientIdentifier === clientIdentifier);
    const address = reservation?.ipAddress ?? this.nextLeaseAddress(pool);
    if (!address)
      return {
        success: false,
        code: "SCOPE_EXHAUSTED",
        reason: `DHCP pool ${poolName} ไม่มี IPv4 ว่าง`,
        timeline: [...timeline, "DHCPOFFER unavailable", "DHCPNAK"],
      };
    const offerTimeline = [...timeline, `DHCPOFFER ${address}`, `DHCPREQUEST ${address}`, "DHCPACK"];
    const lease = this.createLease(server, pool, clientDeviceId, clientIdentifier, address, now, offerTimeline);
    this.leases.set(lease.id, lease);
    return { success: true, code: "ACK", reason: `ได้รับ lease ${address}`, lease, timeline: offerTimeline };
  }

  releaseDhcp(clientIdentifier: string, now = new Date()): DhcpLease | undefined {
    const lease = [...this.leases.values()].find(
      (item) => item.clientIdentifier === clientIdentifier && item.state === "active",
    );
    if (!lease) return undefined;
    const released = {
      ...lease,
      state: "released" as const,
      expiresAt: now.toISOString(),
      timeline: [...lease.timeline, "DHCPRELEASE"],
    };
    this.leases.set(lease.id, released);
    return released;
  }

  listDhcpLeases(now = new Date()): readonly DhcpLease[] {
    this.expire(now);
    return [...this.leases.values()].sort((a, b) => a.ipAddress.localeCompare(b.ipAddress));
  }

  queryDns(clientDeviceId: string, name: string, type: DnsRecordType = "A", now = new Date()): DnsQueryResult {
    this.expire(now);
    const client = this.topology.devices.find((device) => device.id === clientDeviceId);
    const dnsAddress = client ? runtimeConfig(client)?.system.dnsServers[0] : undefined;
    if (!client || !dnsAddress)
      return {
        success: false,
        code: "CLIENT_DNS_MISSING",
        name,
        type,
        values: [],
        cache: "miss",
        reason: "Client ยังไม่ได้ตั้ง DNS server",
      };
    const server = this.findDeviceByIp(dnsAddress);
    if (!server)
      return {
        success: false,
        code: "WRONG_DNS",
        name,
        type,
        values: [],
        cache: "miss",
        reason: `ไม่พบ DNS server ${dnsAddress}`,
      };
    const services = runtimeConfig(server)?.services;
    if (!services?.dns.enabled)
      return {
        success: false,
        code: "TIMEOUT",
        name,
        type,
        values: [],
        cache: "miss",
        reason: `${server.hostname} ปิด DNS service`,
      };
    const clientInterface = client.interfaces.find((item) => item.ipv4 && item.prefixLength !== undefined);
    const serverInterface = server.interfaces.find((item) => item.ipv4 === dnsAddress);
    if (clientInterface && serverInterface && !this.canReach(client, clientInterface, server, serverInterface))
      return {
        success: false,
        code: "TIMEOUT",
        name,
        type,
        values: [],
        cache: "miss",
        reason: "DNS server ไปไม่ถึงจาก client",
      };
    const key = `${server.id}:${name.toLowerCase()}:${type}`;
    const cached = this.dnsCache.get(key);
    if (cached && Date.parse(cached.expiresAt) > now.getTime())
      return {
        success: true,
        code: "ANSWER",
        name,
        type,
        values: cached.values,
        cache: "hit",
        reason: "DNS cache hit",
      };
    let records = Object.values(services.dns.zones)
      .flatMap((zone) => zone.records)
      .filter((record) => record.name.toLowerCase() === name.toLowerCase() && record.type === type);
    let forwarded = false;
    if (!records.length && services.dns.recursive) {
      for (const forwarder of services.dns.forwarders) {
        const upstream = this.findDeviceByIp(forwarder);
        const upstreamDns = upstream ? runtimeConfig(upstream)?.services.dns : undefined;
        if (!upstreamDns?.enabled) continue;
        records = Object.values(upstreamDns.zones)
          .flatMap((zone) => zone.records)
          .filter((record) => record.name.toLowerCase() === name.toLowerCase() && record.type === type);
        if (records.length) {
          forwarded = true;
          break;
        }
      }
    }
    if (!records.length)
      return {
        success: false,
        code: "NXDOMAIN",
        name,
        type,
        values: [],
        cache: "miss",
        reason: `${name} ไม่มีใน authoritative zones`,
      };
    const values = records.map((record) => record.value);
    const ttl = Math.min(services.dns.cacheTtlSeconds, ...records.map((record) => record.ttl));
    this.dnsCache.set(key, {
      key,
      serverDeviceId: server.id,
      name,
      type,
      values,
      expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
    });
    return {
      success: true,
      code: "ANSWER",
      name,
      type,
      values,
      cache: "miss",
      reason: forwarded ? "DNS recursive response from configured forwarder" : "DNS authoritative response",
    };
  }

  listDnsCache(now = new Date()): readonly DnsCacheEntry[] {
    this.expire(now);
    return [...this.dnsCache.values()];
  }

  evaluateRoutedPacket(trace: RoutingTraceResult, packet: ServicePacket, now = new Date()): PacketPolicyResult {
    this.expire(now);
    const aclEvaluations: AclEvaluation[] = [];
    const natTranslations: NatTranslation[] = [];
    let translatedPacket = { ...packet };
    for (const [hopIndex, hop] of trace.hops.entries()) {
      const device = this.topology.devices.find((item) => item.id === hop.deviceId);
      if (!device) continue;
      const ingressInterfaceId = this.ingressInterfaceId(device, trace.layer2Segments[hopIndex]);
      const inbound = ingressInterfaceId
        ? this.evaluateAcl(device, ingressInterfaceId, "in", translatedPacket)
        : undefined;
      if (inbound) {
        aclEvaluations.push(inbound);
        if (inbound.action === "deny")
          return {
            permitted: false,
            aclEvaluations,
            natTranslations,
            packet: translatedPacket,
            reason: `${device.hostname} ${inbound.aclName} sequence ${inbound.ruleSequence ?? "implicit"} deny`,
          };
      }
      const acl = this.evaluateAcl(device, hop.route.outgoingInterfaceId, "out", translatedPacket);
      if (acl) {
        aclEvaluations.push(acl);
        if (acl.action === "deny")
          return {
            permitted: false,
            aclEvaluations,
            natTranslations,
            packet: translatedPacket,
            reason: `${device.hostname} ${acl.aclName} sequence ${acl.ruleSequence ?? "implicit"} deny`,
          };
      }
      const translated = this.translateNat(device, hop.route.outgoingInterfaceId, translatedPacket, now);
      if (translated) {
        natTranslations.push(translated.translation);
        translatedPacket = translated.packet;
      }
    }
    return {
      permitted: true,
      aclEvaluations,
      natTranslations,
      packet: translatedPacket,
      reason: aclEvaluations.length ? "ACL permit ตามลำดับ rule" : "ไม่มี ACL ที่ผูกกับ routed path",
    };
  }

  evaluateAcl(
    device: NetworkDevice,
    interfaceId: string,
    direction: "in" | "out",
    packet: ServicePacket,
  ): AclEvaluation | undefined {
    const aclConfig = runtimeConfig(device)?.services.acl;
    if (!aclConfig?.enabled) return undefined;
    const assignment = aclConfig.assignments.find(
      (item) => item.interfaceId === interfaceId && item.direction === direction,
    );
    const acl = assignment ? aclConfig.accessLists[assignment.aclName] : undefined;
    if (!assignment || !acl) return undefined;
    const rule = [...acl.rules].sort((a, b) => a.sequence - b.sequence).find((item) => matchesAclRule(item, packet));
    if (rule) {
      const hitKey = `${device.id}:${acl.name}:${rule.sequence}`;
      this.aclHits.set(hitKey, (this.aclHits.get(hitKey) ?? 0) + 1);
      return evaluation(
        device,
        interfaceId,
        direction,
        acl,
        rule.action,
        false,
        rule.sequence,
        `${rule.action} ${rule.protocol}`,
      );
    }
    return evaluation(device, interfaceId, direction, acl, "deny", true, undefined, "Implicit deny any");
  }

  listAclHits(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.aclHits);
  }

  listNatTranslations(now = new Date()): readonly NatTranslation[] {
    this.expire(now);
    return [...this.translations.values()];
  }

  private translateNat(
    device: NetworkDevice,
    outgoingInterfaceId: string,
    packet: ServicePacket,
    now: Date,
  ): { packet: ServicePacket; translation: NatTranslation } | undefined {
    const nat = runtimeConfig(device)?.services.nat;
    if (!nat?.enabled) return undefined;
    const rule = [...nat.rules]
      .filter((item) => item.enabled)
      .sort((a, b) => a.order - b.order)
      .find(
        (item) =>
          (!item.outsideInterfaceId || item.outsideInterfaceId === outgoingInterfaceId) && matchesNatRule(item, packet),
      );
    if (!rule || rule.type === "exemption") return undefined;
    const pool = rule.poolName ? nat.pools[rule.poolName] : undefined;
    const insideGlobal = rule.translatedAddress ?? pool?.startAddress;
    if (!insideGlobal) return undefined;
    const translatedPort = rule.type === "pat" ? 10_000 + this.translations.size : rule.translatedPort;
    const translatedPacket: ServicePacket =
      rule.type === "destination" || rule.type === "port-forward"
        ? { ...packet, destinationIp: insideGlobal, destinationPort: translatedPort ?? packet.destinationPort }
        : { ...packet, sourceIp: insideGlobal, sourcePort: translatedPort ?? packet.sourcePort };
    const id = `${device.id}:${rule.id}:${packet.sourceIp}:${packet.destinationIp}:${packet.sourcePort ?? 0}`;
    const translation: NatTranslation = {
      id,
      deviceId: device.id,
      ruleId: rule.id,
      type: rule.type,
      protocol: packet.protocol,
      insideLocal: packet.sourceIp,
      insideGlobal: translatedPacket.sourceIp,
      outsideLocal: packet.destinationIp,
      outsideGlobal: translatedPacket.destinationIp,
      originalPort: packet.sourcePort ?? packet.destinationPort,
      translatedPort,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + nat.translationTimeoutSeconds * 1000).toISOString(),
    };
    this.translations.set(id, translation);
    return { packet: translatedPacket, translation };
  }

  private createLease(
    server: NetworkDevice,
    pool: DhcpPoolRuntimeConfig,
    clientDeviceId: string,
    clientIdentifier: string,
    address: string,
    now: Date,
    timeline: readonly string[],
  ): DhcpLease {
    return {
      id: `${server.id}:${pool.name}:${clientIdentifier}`,
      serverDeviceId: server.id,
      poolName: pool.name,
      clientDeviceId,
      clientIdentifier,
      ipAddress: address,
      defaultGateway: pool.defaultGateway,
      dnsServers: pool.dnsServers,
      domainName: pool.domainName,
      state: "active",
      leasedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + pool.leaseSeconds * 1000).toISOString(),
      timeline,
    };
  }

  private nextLeaseAddress(pool: DhcpPoolRuntimeConfig): string | undefined {
    const info = analyzeIPv4(pool.network, pool.prefixLength);
    if (!info) return undefined;
    const first = ipv4ToInteger(info.firstHost)!;
    const last = ipv4ToInteger(info.lastHost)!;
    const inUse = new Set([
      ...this.topology.devices.flatMap((device) => device.interfaces.flatMap((item) => (item.ipv4 ? [item.ipv4] : []))),
      ...[...this.leases.values()].filter((lease) => lease.state === "active").map((lease) => lease.ipAddress),
      ...pool.reservations.map((item) => item.ipAddress),
      pool.defaultGateway,
    ]);
    const maximum = pool.maximumLeases ?? Number.POSITIVE_INFINITY;
    let considered = 0;
    for (let value = first; value <= last && considered < maximum; value += 1) {
      const address = integerToIPv4(value);
      if (pool.excludedRanges.some((range) => inRange(address, range.start, range.end))) continue;
      considered += 1;
      if (!inUse.has(address)) return address;
    }
    return undefined;
  }

  private findDeviceByIp(address: string): NetworkDevice | undefined {
    return this.topology.devices.find((device) => device.interfaces.some((item) => item.ipv4 === address));
  }

  private ingressInterfaceId(
    device: NetworkDevice,
    segment: RoutingTraceResult["layer2Segments"][number] | undefined,
  ): string | undefined {
    if (!segment) return undefined;
    for (const connectionId of [...segment.connectionIds].reverse()) {
      const connection = this.topology.connections.find((item) => item.id === connectionId);
      if (!connection) continue;
      if (connection.sourceDeviceId === device.id) return connection.sourceInterfaceId;
      if (connection.targetDeviceId === device.id) return connection.targetInterfaceId;
    }
    return undefined;
  }

  private canReach(
    sourceDevice: NetworkDevice,
    sourceInterface: NetworkDevice["interfaces"][number],
    destinationDevice: NetworkDevice,
    destinationInterface: NetworkDevice["interfaces"][number],
  ): boolean {
    const info = analyzeIPv4(sourceInterface.ipv4!, sourceInterface.prefixLength!);
    const source = { device: sourceDevice, networkInterface: sourceInterface };
    const destination = { device: destinationDevice, networkInterface: destinationInterface };
    if (info && isAddressInSubnet(destinationInterface.ipv4!, info.networkAddress, info.prefixLength))
      return new Layer2Engine(this.topology).trace(source, destination).success;
    const routing = new IPv4RoutingEngine(this.topology);
    const gateway =
      sourceInterface.defaultGateway ?? (routing.isRoutingEnabled(sourceDevice) ? sourceInterface.ipv4 : undefined);
    return !!gateway && routing.trace(source, destination, gateway).success;
  }

  private expire(now: Date): void {
    for (const [id, lease] of this.leases) {
      if (lease.state === "active" && Date.parse(lease.expiresAt) <= now.getTime())
        this.leases.set(id, { ...lease, state: "expired", timeline: [...lease.timeline, "LEASE EXPIRED"] });
    }
    for (const [key, entry] of this.dnsCache)
      if (Date.parse(entry.expiresAt) <= now.getTime()) this.dnsCache.delete(key);
    for (const [key, entry] of this.translations)
      if (Date.parse(entry.expiresAt) <= now.getTime()) this.translations.delete(key);
  }
}

function runtimeConfig(device: NetworkDevice): DeviceRuntimeConfig | undefined {
  const value = device.configuration.runtimeConfig;
  return value && typeof value === "object" ? (value as DeviceRuntimeConfig) : undefined;
}

function matchesAclRule(rule: AclRuleRuntimeConfig, packet: ServicePacket): boolean {
  return (
    (rule.protocol === "ip" || rule.protocol === packet.protocol) &&
    isAddressInSubnet(packet.sourceIp, rule.source, rule.sourcePrefixLength) &&
    isAddressInSubnet(packet.destinationIp, rule.destination, rule.destinationPrefixLength) &&
    (rule.sourcePort === undefined || rule.sourcePort === packet.sourcePort) &&
    (rule.destinationPort === undefined || rule.destinationPort === packet.destinationPort)
  );
}

function matchesNatRule(rule: NatRuleRuntimeConfig, packet: ServicePacket): boolean {
  return (
    (rule.protocol === undefined || rule.protocol === "ip" || rule.protocol === packet.protocol) &&
    isAddressInSubnet(packet.sourceIp, rule.source, rule.sourcePrefixLength) &&
    isAddressInSubnet(packet.destinationIp, rule.destination, rule.destinationPrefixLength) &&
    (rule.originalPort === undefined || rule.originalPort === packet.destinationPort)
  );
}

function evaluation(
  device: NetworkDevice,
  interfaceId: string,
  direction: "in" | "out",
  acl: AccessListRuntimeConfig,
  action: "permit" | "deny",
  implicit: boolean,
  ruleSequence: number | undefined,
  reason: string,
): AclEvaluation {
  return {
    deviceId: device.id,
    hostname: device.hostname,
    interfaceId,
    direction,
    aclName: acl.name,
    action,
    ruleSequence,
    implicit,
    reason,
  };
}

function inRange(address: string, start: string, end: string): boolean {
  const value = ipv4ToInteger(address);
  const left = ipv4ToInteger(start);
  const right = ipv4ToInteger(end);
  return value !== undefined && left !== undefined && right !== undefined && value >= left && value <= right;
}
