import { analyzeIPv4 } from "@/engine/protocols/ipv4";
import type { DeviceRuntimeConfig, NetworkDevice } from "@/types/network";

export type ConfigInsightSeverity = "ok" | "warning" | "error";

export interface ConfigSearchResult {
  readonly path: string;
  readonly value: string;
  readonly domain: string;
}

export interface ConfigDependencyEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: "uses" | "protects" | "advertises" | "monitors" | "depends-on";
  readonly label: string;
}

export interface ConfigStatusRow {
  readonly id: string;
  readonly label: string;
  readonly domain: string;
  readonly status: ConfigInsightSeverity;
  readonly detail: string;
}

export interface ConfigInsights {
  readonly searchIndex: readonly ConfigSearchResult[];
  readonly dependencyEdges: readonly ConfigDependencyEdge[];
  readonly statusRows: readonly ConfigStatusRow[];
}

export function buildConfigurationInsights(device: NetworkDevice, config: DeviceRuntimeConfig): ConfigInsights {
  return {
    searchIndex: buildSearchIndex(config),
    dependencyEdges: buildDependencyEdges(device, config),
    statusRows: buildStatusRows(device, config),
  };
}

export function searchConfiguration(
  insights: Pick<ConfigInsights, "searchIndex">,
  query: string,
): readonly ConfigSearchResult[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return insights.searchIndex.slice(0, 24);
  return insights.searchIndex
    .filter((entry) => `${entry.path} ${entry.value} ${entry.domain}`.toLowerCase().includes(normalized))
    .slice(0, 24);
}

function buildSearchIndex(config: DeviceRuntimeConfig): ConfigSearchResult[] {
  const rows: ConfigSearchResult[] = [];
  const walk = (value: unknown, path: readonly string[]) => {
    if (value === undefined) return;
    if (value === null || typeof value !== "object") {
      rows.push({ path: path.join("."), value: String(value), domain: path[0] ?? "config" });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, [...path, String(index)]));
      return;
    }
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => walk(child, [...path, key]));
  };
  walk(config, []);
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}

function buildDependencyEdges(device: NetworkDevice, config: DeviceRuntimeConfig): ConfigDependencyEdge[] {
  const edges: ConfigDependencyEdge[] = [];
  for (const networkInterface of device.interfaces) {
    const runtimeInterface = config.interfaces[networkInterface.id];
    if (!runtimeInterface) continue;
    const interfaceNode = `interface:${networkInterface.id}`;
    if (runtimeInterface.switchport?.mode === "access") {
      edges.push({
        from: interfaceNode,
        to: `vlan:${runtimeInterface.switchport.accessVlan}`,
        kind: "uses",
        label: "access vlan",
      });
    }
    if (runtimeInterface.switchport?.mode === "trunk") {
      runtimeInterface.switchport.allowedVlans.forEach((vlanId) =>
        edges.push({ from: interfaceNode, to: `vlan:${vlanId}`, kind: "uses", label: "allowed vlan" }),
      );
    }
  }
  for (const network of config.routing.ospf.networks) {
    edges.push({
      from: `ospf:${config.routing.ospf.processId}`,
      to: `${network.network}/${network.prefixLength}`,
      kind: "advertises",
      label: `area ${network.areaId}`,
    });
  }
  for (const route of config.routing.staticRoutes) {
    edges.push({
      from: `route:${route.destination}/${route.prefixLength}`,
      to: route.nextHop,
      kind: "depends-on",
      label: "next hop",
    });
  }
  for (const rule of config.services.nat.rules) {
    if (!rule.enabled) continue;
    if (rule.insideInterfaceId)
      edges.push({ from: `nat:${rule.id}`, to: `interface:${rule.insideInterfaceId}`, kind: "uses", label: "inside" });
    if (rule.outsideInterfaceId)
      edges.push({
        from: `nat:${rule.id}`,
        to: `interface:${rule.outsideInterfaceId}`,
        kind: "uses",
        label: "outside",
      });
  }
  for (const assignment of config.services.acl.assignments) {
    edges.push({
      from: `acl:${assignment.aclName}`,
      to: `interface:${assignment.interfaceId}`,
      kind: "protects",
      label: assignment.direction,
    });
  }
  const ha = config.operations.highAvailability;
  if (ha.enabled) {
    ha.trackedInterfaceIds.forEach((interfaceId) =>
      edges.push({ from: `ha:${ha.groupId}`, to: `interface:${interfaceId}`, kind: "depends-on", label: "tracked" }),
    );
  }
  config.operations.monitoring.monitoredInterfaceIds.forEach((interfaceId) =>
    edges.push({ from: "monitoring", to: `interface:${interfaceId}`, kind: "monitors", label: "polls" }),
  );
  return edges.sort((a, b) => `${a.from}${a.to}${a.label}`.localeCompare(`${b.from}${b.to}${b.label}`));
}

function buildStatusRows(device: NetworkDevice, config: DeviceRuntimeConfig): ConfigStatusRow[] {
  const rows: ConfigStatusRow[] = [
    {
      id: "system.hostname",
      label: "Hostname",
      domain: "system",
      status: config.system.hostname === device.hostname ? "ok" : "warning",
      detail: config.system.hostname,
    },
    {
      id: "interfaces.enabled",
      label: "Enabled interfaces",
      domain: "interfaces",
      status: enabledInterfaces(config) > 0 ? "ok" : "warning",
      detail: `${enabledInterfaces(config)} / ${device.interfaces.length}`,
    },
    {
      id: "routing.ipRouting",
      label: "IP routing",
      domain: "routing",
      status: config.routing.ipRouting ? "ok" : "warning",
      detail: config.routing.ipRouting ? "enabled" : "disabled",
    },
  ];
  if (config.routing.ospf.enabled)
    rows.push({
      id: "routing.ospf",
      label: "OSPF",
      domain: "routing",
      status: config.routing.ospf.networks.some((network) => network.areaId === "0") ? "ok" : "warning",
      detail: `${config.routing.ospf.networks.length} network(s)`,
    });
  if (config.services.dhcp.enabled)
    rows.push({
      id: "services.dhcp",
      label: "DHCP",
      domain: "services",
      status: Object.keys(config.services.dhcp.pools).length > 0 ? "ok" : "warning",
      detail: `${Object.keys(config.services.dhcp.pools).length} pool(s)`,
    });
  if (config.services.nat.enabled)
    rows.push({
      id: "services.nat",
      label: "NAT/PAT",
      domain: "services",
      status: config.services.nat.rules.every((rule) => rule.translatedAddress || rule.poolName || rule.translatedPort)
        ? "ok"
        : "error",
      detail: `${config.services.nat.rules.length} rule(s)`,
    });
  if (config.operations.highAvailability.enabled)
    rows.push({
      id: "operations.ha",
      label: config.operations.highAvailability.protocol.toUpperCase(),
      domain: "operations",
      status: ipInAnyLocalSubnet(config.operations.highAvailability.virtualIp, config) ? "ok" : "error",
      detail: `VIP ${config.operations.highAvailability.virtualIp}`,
    });
  return rows;
}

function enabledInterfaces(config: DeviceRuntimeConfig): number {
  return Object.values(config.interfaces).filter((networkInterface) => networkInterface.enabled).length;
}

function ipInAnyLocalSubnet(ipv4: string, config: DeviceRuntimeConfig): boolean {
  return Object.values(config.interfaces).some((networkInterface) => {
    if (!networkInterface.ipv4 || networkInterface.prefixLength === undefined) return false;
    const local = analyzeIPv4(networkInterface.ipv4, networkInterface.prefixLength);
    const target = analyzeIPv4(ipv4, networkInterface.prefixLength);
    return !!local && !!target && local.networkAddress === target.networkAddress;
  });
}
