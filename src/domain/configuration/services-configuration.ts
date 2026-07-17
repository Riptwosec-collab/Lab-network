import { analyzeIPv4, ipv4ToInteger, isAddressInSubnet } from "@/engine/protocols/ipv4";
import type { ConfigurationValidationResult, NetworkDevice, ServicesRuntimeConfig } from "@/types/network";

export function createServicesRuntimeConfig(): ServicesRuntimeConfig {
  return {
    dhcp: { enabled: false, pools: {} },
    dns: { enabled: false, recursive: true, forwarders: [], cacheTtlSeconds: 300, zones: {} },
    nat: { enabled: false, translationTimeoutSeconds: 300, pools: {}, rules: [] },
    acl: { enabled: false, accessLists: {}, assignments: [] },
  };
}

export function normalizeServicesRuntimeConfig(
  current: Partial<ServicesRuntimeConfig> | undefined,
): ServicesRuntimeConfig {
  const defaults = createServicesRuntimeConfig();
  return {
    dhcp: {
      ...defaults.dhcp,
      ...current?.dhcp,
      pools: Object.fromEntries(
        Object.entries(current?.dhcp?.pools ?? {}).map(([key, pool]) => [
          key,
          {
            ...pool,
            dnsServers: pool.dnsServers ?? [],
            leaseSeconds: pool.leaseSeconds ?? 86_400,
            excludedRanges: pool.excludedRanges ?? [],
            reservations: pool.reservations ?? [],
            relayAddresses: pool.relayAddresses ?? [],
          },
        ]),
      ),
    },
    dns: {
      ...defaults.dns,
      ...current?.dns,
      forwarders: current?.dns?.forwarders ?? [],
      zones: current?.dns?.zones ?? {},
    },
    nat: {
      ...defaults.nat,
      ...current?.nat,
      pools: current?.nat?.pools ?? {},
      rules: current?.nat?.rules ?? [],
    },
    acl: {
      ...defaults.acl,
      ...current?.acl,
      accessLists: current?.acl?.accessLists ?? {},
      assignments: current?.acl?.assignments ?? [],
    },
  };
}

export function validateServicesRuntimeConfig(
  device: NetworkDevice,
  services: ServicesRuntimeConfig,
): ConfigurationValidationResult["issues"] {
  const issues: ConfigurationValidationResult["issues"] = [];
  const supportsDhcp =
    device.category === "router" || device.category === "server" || device.capabilities.includes("dhcp");
  const supportsDns =
    device.category === "server" || device.capabilities.includes("dns") || device.capabilities.includes("services");
  const supportsNat =
    device.category === "router" || device.category === "security" || device.capabilities.includes("nat");
  const supportsAcl =
    device.category === "router" || device.category === "security" || device.capabilities.includes("acl");
  if (services.dhcp.enabled && !supportsDhcp)
    issues.push({ path: "services.dhcp.enabled", message: "อุปกรณ์นี้ไม่รองรับ DHCP Server" });
  if (services.dns.enabled && !supportsDns)
    issues.push({ path: "services.dns.enabled", message: "อุปกรณ์นี้ไม่รองรับ DNS Server" });
  if (services.nat.enabled && !supportsNat)
    issues.push({ path: "services.nat.enabled", message: "อุปกรณ์นี้ไม่รองรับ NAT/PAT" });
  if (services.acl.enabled && !supportsAcl)
    issues.push({ path: "services.acl.enabled", message: "อุปกรณ์นี้ไม่รองรับ ACL" });

  const poolNetworks: Array<{ key: string; network: string; prefixLength: number }> = [];
  for (const [key, pool] of Object.entries(services.dhcp.pools)) {
    const path = `services.dhcp.pools.${key}`;
    const network = analyzeIPv4(pool.network, pool.prefixLength);
    if (!network || network.networkAddress !== pool.network)
      issues.push({ path: `${path}.network`, message: "DHCP pool network ต้องเป็น network address" });
    const gateway = network ? analyzeIPv4(pool.defaultGateway, pool.prefixLength) : undefined;
    if (!gateway?.isUsableHost)
      issues.push({ path: `${path}.defaultGateway`, message: "DHCP default gateway ไม่ถูกต้อง" });
    else if (network && !isAddressInSubnet(pool.defaultGateway, network.networkAddress, network.prefixLength))
      issues.push({ path: `${path}.defaultGateway`, message: "DHCP default gateway ต้องอยู่ใน pool subnet" });
    pool.dnsServers.forEach((address, index) => {
      if (ipv4ToInteger(address) === undefined)
        issues.push({ path: `${path}.dnsServers.${index}`, message: "DHCP DNS server ต้องเป็น IPv4" });
    });
    pool.relayAddresses.forEach((address, index) => {
      if (ipv4ToInteger(address) === undefined)
        issues.push({ path: `${path}.relayAddresses.${index}`, message: "DHCP helper address ต้องเป็น IPv4" });
    });
    for (const [index, range] of pool.excludedRanges.entries()) {
      const start = ipv4ToInteger(range.start);
      const end = ipv4ToInteger(range.end);
      if (start === undefined || end === undefined || start > end)
        issues.push({ path: `${path}.excludedRanges.${index}`, message: "Excluded address range ไม่ถูกต้อง" });
      else if (
        network &&
        (!isAddressInSubnet(range.start, network.networkAddress, network.prefixLength) ||
          !isAddressInSubnet(range.end, network.networkAddress, network.prefixLength))
      )
        issues.push({ path: `${path}.excludedRanges.${index}`, message: "Excluded range ต้องอยู่ใน DHCP subnet" });
    }
    const reservationIps = new Set<string>();
    for (const [index, reservation] of pool.reservations.entries()) {
      if (!network || !isAddressInSubnet(reservation.ipAddress, network.networkAddress, network.prefixLength))
        issues.push({ path: `${path}.reservations.${index}.ipAddress`, message: "Reservation ต้องอยู่ใน DHCP subnet" });
      if (reservationIps.has(reservation.ipAddress))
        issues.push({ path: `${path}.reservations.${index}.ipAddress`, message: "Reservation IPv4 ซ้ำ" });
      reservationIps.add(reservation.ipAddress);
    }
    poolNetworks.push({ key, network: pool.network, prefixLength: pool.prefixLength });
  }
  for (let left = 0; left < poolNetworks.length; left += 1) {
    for (let right = left + 1; right < poolNetworks.length; right += 1) {
      const a = poolNetworks[left]!;
      const b = poolNetworks[right]!;
      if (
        isAddressInSubnet(a.network, b.network, b.prefixLength) ||
        isAddressInSubnet(b.network, a.network, a.prefixLength)
      )
        issues.push({ path: `services.dhcp.pools.${b.key}`, message: `DHCP pool ซ้อนทับกับ ${a.key}` });
    }
  }

  services.dns.forwarders.forEach((address, index) => {
    if (ipv4ToInteger(address) === undefined)
      issues.push({ path: `services.dns.forwarders.${index}`, message: "DNS forwarder ต้องเป็น IPv4" });
  });
  for (const [zoneKey, zone] of Object.entries(services.dns.zones)) {
    const ids = new Set<string>();
    for (const [index, record] of zone.records.entries()) {
      const path = `services.dns.zones.${zoneKey}.records.${index}`;
      if (ids.has(record.id)) issues.push({ path: `${path}.id`, message: "DNS record id ซ้ำ" });
      ids.add(record.id);
      if (record.type === "A" && ipv4ToInteger(record.value) === undefined)
        issues.push({ path: `${path}.value`, message: "A record ต้องชี้ไป IPv4 ที่ถูกต้อง" });
      if (record.type === "MX" && record.priority === undefined)
        issues.push({ path: `${path}.priority`, message: "MX record ต้องกำหนด priority" });
    }
  }

  for (const [poolKey, pool] of Object.entries(services.nat.pools)) {
    const start = ipv4ToInteger(pool.startAddress);
    const end = ipv4ToInteger(pool.endAddress);
    if (start === undefined || end === undefined || start > end)
      issues.push({ path: `services.nat.pools.${poolKey}`, message: "NAT pool address range ไม่ถูกต้อง" });
  }
  const natRuleIds = new Set<string>();
  const natPorts = new Set<string>();
  for (const [index, rule] of services.nat.rules.entries()) {
    const path = `services.nat.rules.${index}`;
    if (natRuleIds.has(rule.id)) issues.push({ path: `${path}.id`, message: "NAT rule id ซ้ำ" });
    natRuleIds.add(rule.id);
    if (analyzeIPv4(rule.source, rule.sourcePrefixLength)?.networkAddress !== rule.source)
      issues.push({ path: `${path}.source`, message: "NAT source ต้องเป็น network address" });
    if (analyzeIPv4(rule.destination, rule.destinationPrefixLength)?.networkAddress !== rule.destination)
      issues.push({ path: `${path}.destination`, message: "NAT destination ต้องเป็น network address" });
    if (rule.translatedAddress && ipv4ToInteger(rule.translatedAddress) === undefined)
      issues.push({ path: `${path}.translatedAddress`, message: "Translated address ต้องเป็น IPv4" });
    if (rule.poolName && !services.nat.pools[rule.poolName])
      issues.push({ path: `${path}.poolName`, message: `ไม่พบ NAT pool ${rule.poolName}` });
    if (rule.type !== "exemption" && !rule.translatedAddress && !rule.poolName)
      issues.push({ path: `${path}.translatedAddress`, message: "NAT rule ต้องกำหนด translated address หรือ pool" });
    if (rule.type === "port-forward" && (!rule.originalPort || !rule.translatedPort))
      issues.push({ path, message: "Port forwarding ต้องกำหนด original และ translated port" });
    if (rule.insideInterfaceId && !device.interfaces.some((item) => item.id === rule.insideInterfaceId))
      issues.push({ path: `${path}.insideInterfaceId`, message: "ไม่พบ NAT inside interface" });
    if (rule.outsideInterfaceId && !device.interfaces.some((item) => item.id === rule.outsideInterfaceId))
      issues.push({ path: `${path}.outsideInterfaceId`, message: "ไม่พบ NAT outside interface" });
    if (rule.type === "port-forward" && rule.originalPort && rule.translatedAddress) {
      const key = `${rule.protocol ?? "tcp"}:${rule.translatedAddress}:${rule.originalPort}`;
      if (natPorts.has(key)) issues.push({ path, message: "NAT port conflict" });
      natPorts.add(key);
    }
  }

  for (const [aclKey, acl] of Object.entries(services.acl.accessLists)) {
    const sequences = new Set<number>();
    for (const [index, rule] of acl.rules.entries()) {
      const path = `services.acl.accessLists.${aclKey}.rules.${index}`;
      if (sequences.has(rule.sequence)) issues.push({ path: `${path}.sequence`, message: "ACL sequence ซ้ำ" });
      sequences.add(rule.sequence);
      if (analyzeIPv4(rule.source, rule.sourcePrefixLength)?.networkAddress !== rule.source)
        issues.push({ path: `${path}.source`, message: "ACL source ต้องเป็น network address" });
      if (analyzeIPv4(rule.destination, rule.destinationPrefixLength)?.networkAddress !== rule.destination)
        issues.push({ path: `${path}.destination`, message: "ACL destination ต้องเป็น network address" });
      if (acl.type === "standard" && (rule.destination !== "0.0.0.0" || rule.destinationPrefixLength !== 0))
        issues.push({ path: `${path}.destination`, message: "Standard ACL ตรวจเฉพาะ source" });
    }
  }
  const assignmentKeys = new Set<string>();
  for (const [index, assignment] of services.acl.assignments.entries()) {
    const path = `services.acl.assignments.${index}`;
    if (!services.acl.accessLists[assignment.aclName])
      issues.push({ path: `${path}.aclName`, message: `ไม่พบ ACL ${assignment.aclName}` });
    if (!device.interfaces.some((item) => item.id === assignment.interfaceId))
      issues.push({ path: `${path}.interfaceId`, message: "ไม่พบ interface สำหรับ ACL" });
    const key = `${assignment.interfaceId}:${assignment.direction}`;
    if (assignmentKeys.has(key)) issues.push({ path, message: "Interface direction ใช้ ACL ได้หนึ่งรายการ" });
    assignmentKeys.add(key);
  }
  return issues;
}

export function renderServicesRunningConfig(services: ServicesRuntimeConfig): string[] {
  const lines: string[] = [];
  for (const pool of Object.values(services.dhcp.pools)) {
    lines.push("!", `ip dhcp pool ${pool.name}`, ` network ${pool.network}/${pool.prefixLength}`);
    lines.push(` default-router ${pool.defaultGateway}`);
    if (pool.dnsServers.length) lines.push(` dns-server ${pool.dnsServers.join(" ")}`);
    if (pool.domainName) lines.push(` domain-name ${pool.domainName}`);
    lines.push(` lease ${pool.leaseSeconds}`);
    pool.relayAddresses.forEach((address) => lines.push(` helper-address ${address}`));
  }
  for (const zone of Object.values(services.dns.zones)) {
    lines.push("!", `dns zone ${zone.name}`);
    zone.records.forEach((record) =>
      lines.push(` dns record ${record.type} ${record.name} ${record.value} ttl ${record.ttl}`),
    );
  }
  for (const rule of [...services.nat.rules].sort((a, b) => a.order - b.order)) {
    lines.push(
      `ip nat rule ${rule.order} ${rule.type} ${rule.source}/${rule.sourcePrefixLength} ${rule.destination}/${rule.destinationPrefixLength}${rule.translatedAddress ? ` translate ${rule.translatedAddress}` : ""}`,
    );
  }
  for (const acl of Object.values(services.acl.accessLists)) {
    lines.push("!", `ip access-list ${acl.type} ${acl.name}`);
    [...acl.rules]
      .sort((a, b) => a.sequence - b.sequence)
      .forEach((rule) =>
        lines.push(
          ` ${rule.sequence} ${rule.action} ${rule.protocol} ${rule.source}/${rule.sourcePrefixLength} ${rule.destination}/${rule.destinationPrefixLength}${rule.destinationPort ? ` eq ${rule.destinationPort}` : ""}${rule.logging ? " log" : ""}`,
        ),
      );
  }
  services.acl.assignments.forEach((assignment) =>
    lines.push(`interface-acl ${assignment.interfaceId} ${assignment.aclName} ${assignment.direction}`),
  );
  return lines;
}
