import { analyzeIPv4, isAddressInSubnet } from "@/engine/protocols/ipv4";
import type {
  DeviceRuntimeConfig,
  NetworkConnection,
  NetworkDevice,
  NetworkInterface,
  TopologySnapshot,
} from "@/types/network";

export type OspfNeighborState = "FULL" | "DOWN";

export interface OspfNeighbor {
  readonly localDeviceId: string;
  readonly neighborDeviceId: string;
  readonly neighborRouterId: string;
  readonly localInterfaceId: string;
  readonly remoteInterfaceId: string;
  readonly areaId: string;
  readonly state: OspfNeighborState;
  readonly cost: number;
  readonly reason: string;
}

export interface OspfLsa {
  readonly advertisingRouterId: string;
  readonly deviceId: string;
  readonly network: string;
  readonly prefixLength: number;
  readonly areaId: string;
  readonly metric: number;
  readonly type: "router" | "external" | "default";
}

export interface OspfRoute {
  readonly deviceId: string;
  readonly source: "ospf";
  readonly destination: string;
  readonly prefixLength: number;
  readonly nextHop: string;
  readonly outgoingInterfaceId: string;
  readonly administrativeDistance: 110;
  readonly metric: number;
  readonly active: boolean;
  readonly areaId: string;
}

interface InterfaceOwner {
  device: NetworkDevice;
  networkInterface: NetworkInterface;
}

interface OspfEdge {
  from: string;
  to: string;
  cost: number;
  localInterfaceId: string;
  remoteIp: string;
}

export class OspfEngine {
  constructor(private readonly topology: TopologySnapshot) {}

  neighbors(device: NetworkDevice): OspfNeighbor[] {
    const config = runtimeConfig(device);
    if (!config?.routing.ospf?.enabled || !config.routing.ipRouting) return [];
    return this.topology.connections.flatMap((connection) => {
      const pair = this.connectionPair(connection, device.id);
      if (!pair) return [];
      const remoteConfig = runtimeConfig(pair.remote.device);
      if (!remoteConfig?.routing.ospf?.enabled || !remoteConfig.routing.ipRouting) return [];
      const localNetwork = matchingOspfNetwork(config, pair.local.networkInterface);
      const remoteNetwork = matchingOspfNetwork(remoteConfig, pair.remote.networkInterface);
      const common =
        pair.local.networkInterface.ipv4 &&
        pair.remote.networkInterface.ipv4 &&
        pair.local.networkInterface.prefixLength !== undefined &&
        isAddressInSubnet(
          pair.remote.networkInterface.ipv4,
          pair.local.networkInterface.ipv4,
          pair.local.networkInterface.prefixLength,
        );
      const passive = config.routing.ospf.passiveInterfaceIds.includes(pair.local.networkInterface.id);
      const linkUp =
        connection.status === "up" &&
        pair.local.networkInterface.status === "up" &&
        pair.remote.networkInterface.status === "up";
      const areaMatches = !!localNetwork && !!remoteNetwork && localNetwork.areaId === remoteNetwork.areaId;
      const authMatches = (localNetwork?.authenticationKey ?? "") === (remoteNetwork?.authenticationKey ?? "");
      const full = !!common && linkUp && !passive && areaMatches && authMatches;
      const reason = !linkUp
        ? "Link or interface is down"
        : passive
          ? "Passive interface suppresses OSPF hellos"
          : !common
            ? "Interfaces are not in the same IPv4 subnet"
            : !areaMatches
              ? "OSPF area mismatch"
              : !authMatches
                ? "OSPF authentication mismatch"
                : "Hello and database exchange completed";
      return [
        {
          localDeviceId: device.id,
          neighborDeviceId: pair.remote.device.id,
          neighborRouterId: routerId(remoteConfig, pair.remote.device),
          localInterfaceId: pair.local.networkInterface.id,
          remoteInterfaceId: pair.remote.networkInterface.id,
          areaId: localNetwork?.areaId ?? remoteNetwork?.areaId ?? "unknown",
          state: full ? "FULL" : "DOWN",
          cost: Math.max(localNetwork?.cost ?? 1, 1),
          reason,
        },
      ];
    });
  }

  database(device: NetworkDevice): OspfLsa[] {
    const reachable = this.reachableDevices(device.id);
    return this.topology.devices
      .filter((candidate) => reachable.has(candidate.id))
      .flatMap((candidate) => advertisedNetworks(candidate));
  }

  buildRoutes(device: NetworkDevice): OspfRoute[] {
    const config = runtimeConfig(device);
    if (!config?.routing.ospf?.enabled || !config.routing.ipRouting) return [];
    const edges = this.fullEdges();
    const { distances, previous } = shortestPaths(device.id, edges);
    const routes = new Map<string, OspfRoute>();
    for (const candidate of this.topology.devices) {
      if (candidate.id === device.id || distances.get(candidate.id) === undefined) continue;
      const firstHopId = firstHop(device.id, candidate.id, previous);
      if (!firstHopId) continue;
      const edge = edges.find((item) => item.from === device.id && item.to === firstHopId);
      if (!edge) continue;
      for (const lsa of advertisedNetworks(candidate)) {
        if (this.isLocalNetwork(device, lsa.network, lsa.prefixLength)) continue;
        const metric = (distances.get(candidate.id) ?? 0) + lsa.metric;
        const key = `${lsa.network}/${lsa.prefixLength}`;
        const route: OspfRoute = {
          deviceId: device.id,
          source: "ospf",
          destination: lsa.network,
          prefixLength: lsa.prefixLength,
          nextHop: edge.remoteIp,
          outgoingInterfaceId: edge.localInterfaceId,
          administrativeDistance: 110,
          metric,
          active: true,
          areaId: lsa.areaId,
        };
        const existing = routes.get(key);
        if (!existing || route.metric < existing.metric) routes.set(key, route);
      }
    }
    return [...routes.values()];
  }

  private fullEdges(): OspfEdge[] {
    return this.topology.devices.flatMap((device) =>
      this.neighbors(device)
        .filter((neighbor) => neighbor.state === "FULL")
        .flatMap((neighbor) => {
          const remote = interfaceOwner(this.topology, neighbor.neighborDeviceId, neighbor.remoteInterfaceId);
          return remote?.networkInterface.ipv4
            ? [
                {
                  from: device.id,
                  to: neighbor.neighborDeviceId,
                  cost: neighbor.cost,
                  localInterfaceId: neighbor.localInterfaceId,
                  remoteIp: remote.networkInterface.ipv4,
                },
              ]
            : [];
        }),
    );
  }

  private reachableDevices(sourceDeviceId: string): Set<string> {
    const edges = this.fullEdges();
    const reached = new Set([sourceDeviceId]);
    const queue = [sourceDeviceId];
    while (queue.length) {
      const current = queue.shift()!;
      for (const edge of edges.filter((item) => item.from === current)) {
        if (!reached.has(edge.to)) {
          reached.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
    return reached;
  }

  private isLocalNetwork(device: NetworkDevice, network: string, prefixLength: number): boolean {
    return routedInterfaces(device).some((item) => {
      if (!item.ipv4 || item.prefixLength === undefined) return false;
      const analysis = analyzeIPv4(item.ipv4, item.prefixLength);
      return analysis?.networkAddress === network && analysis.prefixLength === prefixLength;
    });
  }

  private connectionPair(
    connection: NetworkConnection,
    localDeviceId: string,
  ): { local: InterfaceOwner; remote: InterfaceOwner } | undefined {
    const forward = connection.sourceDeviceId === localDeviceId;
    const reverse = connection.targetDeviceId === localDeviceId;
    if (!forward && !reverse) return undefined;
    const local = interfaceOwner(
      this.topology,
      localDeviceId,
      forward ? connection.sourceInterfaceId : connection.targetInterfaceId,
    );
    const remote = interfaceOwner(
      this.topology,
      forward ? connection.targetDeviceId : connection.sourceDeviceId,
      forward ? connection.targetInterfaceId : connection.sourceInterfaceId,
    );
    return local && remote ? { local, remote } : undefined;
  }
}

function runtimeConfig(device: NetworkDevice): DeviceRuntimeConfig | undefined {
  const value = device.configuration.runtimeConfig;
  return value && typeof value === "object" ? (value as DeviceRuntimeConfig) : undefined;
}

function routedInterfaces(device: NetworkDevice): NetworkInterface[] {
  const config = runtimeConfig(device);
  const svis = Object.values(config?.routing.svis ?? {}).map((svi): NetworkInterface => ({
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
  return [...device.interfaces, ...svis];
}

function interfaceOwner(
  topology: TopologySnapshot,
  deviceId: string,
  interfaceId?: string,
): InterfaceOwner | undefined {
  if (!interfaceId) return undefined;
  const device = topology.devices.find((item) => item.id === deviceId);
  const networkInterface = device && routedInterfaces(device).find((item) => item.id === interfaceId);
  return device && networkInterface ? { device, networkInterface } : undefined;
}

function matchingOspfNetwork(config: DeviceRuntimeConfig, networkInterface: NetworkInterface) {
  if (!networkInterface.ipv4) return undefined;
  return config.routing.ospf?.networks.find((network) =>
    isAddressInSubnet(networkInterface.ipv4!, network.network, network.prefixLength),
  );
}

function routerId(config: DeviceRuntimeConfig, device: NetworkDevice): string {
  if (config.routing.ospf?.routerId && config.routing.ospf.routerId !== "0.0.0.0") return config.routing.ospf.routerId;
  return (
    routedInterfaces(device)
      .map((item) => item.ipv4)
      .filter((value): value is string => !!value)
      .sort()
      .at(-1) ?? "0.0.0.0"
  );
}

function advertisedNetworks(device: NetworkDevice): OspfLsa[] {
  const config = runtimeConfig(device);
  if (!config?.routing.ospf?.enabled) return [];
  const seen = new Set<string>();
  const result: OspfLsa[] = [];
  for (const networkInterface of routedInterfaces(device)) {
    if (!networkInterface.ipv4 || networkInterface.prefixLength === undefined || networkInterface.status !== "up")
      continue;
    const info = analyzeIPv4(networkInterface.ipv4, networkInterface.prefixLength);
    if (!info) continue;
    const ospfNetwork = matchingOspfNetwork(config, networkInterface);
    if (!ospfNetwork && !config.routing.ospf.redistributeConnected) continue;
    const key = `${info.networkAddress}/${info.prefixLength}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      advertisingRouterId: routerId(config, device),
      deviceId: device.id,
      network: info.networkAddress,
      prefixLength: info.prefixLength,
      areaId: ospfNetwork?.areaId ?? "external",
      metric: ospfNetwork?.cost ?? 20,
      type: ospfNetwork ? "router" : "external",
    });
  }
  if (config.routing.ospf.defaultInformationOriginate) {
    result.push({
      advertisingRouterId: routerId(config, device),
      deviceId: device.id,
      network: "0.0.0.0",
      prefixLength: 0,
      areaId: "external",
      metric: 1,
      type: "default",
    });
  }
  return result;
}

function shortestPaths(source: string, edges: readonly OspfEdge[]) {
  const nodes = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  nodes.add(source);
  const distances = new Map<string, number>([[source, 0]]);
  const previous = new Map<string, string>();
  const unvisited = new Set(nodes);
  while (unvisited.size) {
    const current = [...unvisited].sort((a, b) => (distances.get(a) ?? Infinity) - (distances.get(b) ?? Infinity))[0]!;
    unvisited.delete(current);
    const currentDistance = distances.get(current);
    if (currentDistance === undefined) break;
    for (const edge of edges.filter((item) => item.from === current)) {
      const candidate = currentDistance + edge.cost;
      if (candidate < (distances.get(edge.to) ?? Infinity)) {
        distances.set(edge.to, candidate);
        previous.set(edge.to, current);
      }
    }
  }
  return { distances, previous };
}

function firstHop(source: string, destination: string, previous: ReadonlyMap<string, string>): string | undefined {
  let current = destination;
  let parent = previous.get(current);
  if (!parent) return undefined;
  while (parent !== source) {
    current = parent;
    parent = previous.get(current);
    if (!parent) return undefined;
  }
  return current;
}
