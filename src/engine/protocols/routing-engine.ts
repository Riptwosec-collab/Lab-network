import { analyzeIPv4, isAddressInSubnet, ipv4ToInteger } from "@/engine/protocols/ipv4";
import { Layer2Engine, type Layer2TraceResult } from "@/engine/protocols/layer2-engine";
import { OspfEngine } from "@/engine/protocols/ospf-engine";
import { HighAvailabilityEngine } from "@/engine/operations/operations-engine";
import type {
  DeviceRuntimeConfig,
  NetworkDevice,
  NetworkInterface,
  StaticRouteRuntimeConfig,
  TopologySnapshot,
} from "@/types/network";

export type RoutingFailureCode =
  | "GATEWAY_NOT_FOUND"
  | "IP_ROUTING_DISABLED"
  | "ROUTE_NOT_FOUND"
  | "NEXT_HOP_UNREACHABLE"
  | "ROUTING_LOOP"
  | "ROUTED_LAYER2_FAILURE";

export interface RouteTableEntry {
  readonly deviceId: string;
  readonly source: "connected" | "static" | "default" | "ospf";
  readonly destination: string;
  readonly prefixLength: number;
  readonly nextHop?: string;
  readonly outgoingInterfaceId: string;
  readonly administrativeDistance: number;
  readonly metric: number;
  readonly active: boolean;
  readonly reason?: string;
}

export interface RoutingHop {
  readonly deviceId: string;
  readonly hostname: string;
  readonly route: RouteTableEntry;
  readonly layer2: Layer2TraceResult;
}

export interface RoutingTraceResult {
  readonly success: boolean;
  readonly sourceDeviceId: string;
  readonly destinationDeviceId: string;
  readonly destinationIp: string;
  readonly hops: readonly RoutingHop[];
  readonly layer2Segments: readonly Layer2TraceResult[];
  readonly failureCode?: RoutingFailureCode;
  readonly reason: string;
}

interface InterfaceOwner {
  readonly device: NetworkDevice;
  readonly networkInterface: NetworkInterface;
}

export class IPv4RoutingEngine {
  constructor(private readonly topology: TopologySnapshot) {}

  buildRoutingTable(device: NetworkDevice): RouteTableEntry[] {
    const config = this.runtimeConfig(device);
    const connected = this.routedInterfaces(device).flatMap((networkInterface) => {
      if (!networkInterface.ipv4 || networkInterface.prefixLength === undefined || networkInterface.status !== "up")
        return [];
      const info = analyzeIPv4(networkInterface.ipv4, networkInterface.prefixLength);
      return info
        ? [
            {
              deviceId: device.id,
              source: "connected" as const,
              destination: info.networkAddress,
              prefixLength: info.prefixLength,
              outgoingInterfaceId: networkInterface.id,
              administrativeDistance: 0,
              metric: 0,
              active: true,
            },
          ]
        : [];
    });
    const staticRoutes = (config?.routing.staticRoutes ?? []).map((route) =>
      this.staticRouteEntry(device, route, connected),
    );
    const ospfRoutes = new OspfEngine(this.topology).buildRoutes(device);
    return [...connected, ...staticRoutes, ...ospfRoutes].sort(compareRoutes);
  }

  longestPrefixMatch(device: NetworkDevice, destinationIp: string): RouteTableEntry | undefined {
    if (ipv4ToInteger(destinationIp) === undefined) return undefined;
    return this.buildRoutingTable(device)
      .filter((route) => route.active && isAddressInSubnet(destinationIp, route.destination, route.prefixLength))
      .sort(compareRoutes)[0];
  }

  isRoutingEnabled(device: NetworkDevice): boolean {
    return this.runtimeConfig(device)?.routing.ipRouting ?? false;
  }

  trace(source: InterfaceOwner, destination: InterfaceOwner, gatewayIp: string): RoutingTraceResult {
    const layer2Segments: Layer2TraceResult[] = [];
    const fail = (
      failureCode: RoutingFailureCode,
      reason: string,
      hops: readonly RoutingHop[] = [],
    ): RoutingTraceResult => ({
      success: false,
      sourceDeviceId: source.device.id,
      destinationDeviceId: destination.device.id,
      destinationIp: destination.networkInterface.ipv4!,
      hops,
      layer2Segments,
      failureCode,
      reason,
    });
    const gateway = this.findInterfaceByIp(gatewayIp);
    if (!gateway) return fail("GATEWAY_NOT_FOUND", `ไม่พบอุปกรณ์ที่ใช้ IPv4 ${gatewayIp} เป็น Default Gateway`);
    const firstLayer2 = new Layer2Engine(this.topology).trace(source, gateway);
    if (!firstLayer2.success)
      return fail("ROUTED_LAYER2_FAILURE", `Source ไป Default Gateway ไม่สำเร็จ: ${firstLayer2.reason}`);
    layer2Segments.push(firstLayer2);

    const hops: RoutingHop[] = [];
    const visited = new Set<string>();
    let current = gateway.device;
    while (hops.length <= this.topology.devices.length) {
      if (visited.has(current.id)) return fail("ROUTING_LOOP", `ตรวจพบ routing loop ที่ ${current.hostname}`, hops);
      visited.add(current.id);
      const config = this.runtimeConfig(current);
      if (!config?.routing.ipRouting)
        return fail("IP_ROUTING_DISABLED", `${current.hostname} ยังไม่ได้เปิด ip routing`, hops);
      const route = this.longestPrefixMatch(current, destination.networkInterface.ipv4!);
      if (!route)
        return fail("ROUTE_NOT_FOUND", `${current.hostname} ไม่มี route ไป ${destination.networkInterface.ipv4}`, hops);
      if (route.source === "connected") {
        const outgoing = this.interfaceOwner(current, route.outgoingInterfaceId);
        if (!outgoing) return fail("ROUTE_NOT_FOUND", `ไม่พบ outgoing interface ของ connected route`, hops);
        const layer2 = new Layer2Engine(this.topology).trace(outgoing, destination);
        if (!layer2.success)
          return fail("ROUTED_LAYER2_FAILURE", `${current.hostname} ส่งต่อถึงปลายทางไม่สำเร็จ: ${layer2.reason}`, hops);
        layer2Segments.push(layer2);
        hops.push({ deviceId: current.id, hostname: current.hostname, route, layer2 });
        return {
          success: true,
          sourceDeviceId: source.device.id,
          destinationDeviceId: destination.device.id,
          destinationIp: destination.networkInterface.ipv4!,
          hops,
          layer2Segments,
          reason: `Routed ผ่าน ${hops.length} Layer 3 hop(s) ด้วย longest-prefix match`,
        };
      }
      const nextHop = route.nextHop ? this.findInterfaceByIp(route.nextHop) : undefined;
      const outgoing = this.interfaceOwner(current, route.outgoingInterfaceId);
      if (!nextHop || !outgoing)
        return fail("NEXT_HOP_UNREACHABLE", `${current.hostname} ไป next-hop ${route.nextHop} ไม่ได้`, hops);
      const layer2 = new Layer2Engine(this.topology).trace(outgoing, nextHop);
      if (!layer2.success)
        return fail(
          "ROUTED_LAYER2_FAILURE",
          `${current.hostname} ไป next-hop ${route.nextHop} ไม่สำเร็จ: ${layer2.reason}`,
          hops,
        );
      layer2Segments.push(layer2);
      hops.push({ deviceId: current.id, hostname: current.hostname, route, layer2 });
      current = nextHop.device;
    }
    return fail("ROUTING_LOOP", "Routing hop limit exceeded", hops);
  }

  findInterfaceByIp(ipAddress: string): InterfaceOwner | undefined {
    for (const device of this.topology.devices) {
      const networkInterface = this.routedInterfaces(device).find((item) => item.ipv4 === ipAddress);
      if (networkInterface) return { device, networkInterface };
    }
    return new HighAvailabilityEngine(this.topology).resolveVirtualIp(ipAddress);
  }

  private staticRouteEntry(
    device: NetworkDevice,
    route: StaticRouteRuntimeConfig,
    connected: readonly RouteTableEntry[],
  ): RouteTableEntry {
    const outgoing = connected.find((entry) => isAddressInSubnet(route.nextHop, entry.destination, entry.prefixLength));
    return {
      deviceId: device.id,
      source: route.prefixLength === 0 ? "default" : "static",
      destination: route.destination,
      prefixLength: route.prefixLength,
      nextHop: route.nextHop,
      outgoingInterfaceId: outgoing?.outgoingInterfaceId ?? "unresolved",
      administrativeDistance: route.administrativeDistance,
      metric: route.metric,
      active: !!outgoing,
      reason: outgoing ? undefined : "Next-hop is not reachable through a connected route",
    };
  }

  private routedInterfaces(device: NetworkDevice): NetworkInterface[] {
    const physical = device.interfaces;
    const svis = Object.values(this.runtimeConfig(device)?.routing.svis ?? {}).map((svi): NetworkInterface => ({
      id: `svi:${device.id}:${svi.vlanId}`,
      name: `Vlan${svi.vlanId}`,
      type: "vlan",
      status: svi.enabled ? "up" : "administratively-down",
      medium: "logical",
      ipv4: svi.ipv4,
      prefixLength: svi.prefixLength,
      vlan: svi.vlanId,
      mtu: 1500,
    }));
    return [...physical, ...svis];
  }

  private interfaceOwner(device: NetworkDevice, interfaceId: string): InterfaceOwner | undefined {
    const networkInterface = this.routedInterfaces(device).find((item) => item.id === interfaceId);
    return networkInterface ? { device, networkInterface } : undefined;
  }

  private runtimeConfig(device: NetworkDevice): DeviceRuntimeConfig | undefined {
    const value = device.configuration.runtimeConfig;
    return value && typeof value === "object" ? (value as DeviceRuntimeConfig) : undefined;
  }
}

function compareRoutes(left: RouteTableEntry, right: RouteTableEntry): number {
  return (
    right.prefixLength - left.prefixLength ||
    left.administrativeDistance - right.administrativeDistance ||
    left.metric - right.metric ||
    left.destination.localeCompare(right.destination)
  );
}
