import type { NetworkConnection, NetworkDevice, TopologySnapshot } from "@/types/network";

export type PacketProtocol = "arp" | "icmp" | "dhcp" | "dns" | "tcp" | "udp";
export type PacketStatus = "created" | "queued" | "forwarding" | "delivered" | "dropped";
export type PacketEventType =
  | "packet-created"
  | "frame-encapsulated"
  | "arp-requested"
  | "mac-learned"
  | "vlan-tagged"
  | "route-lookup"
  | "packet-forwarded"
  | "packet-dropped"
  | "packet-delivered";

export interface SimulatedPacket {
  readonly id: string;
  readonly timestamp: string;
  readonly sourceMac: string;
  readonly destinationMac: string;
  readonly sourceIp: string;
  readonly destinationIp: string;
  readonly sourcePort?: number;
  readonly destinationPort?: number;
  readonly vlan?: number;
  readonly protocol: PacketProtocol;
  readonly initialTtl: number;
  ttl: number;
  readonly sizeBytes: number;
  currentDeviceId: string;
  currentInterfaceId?: string;
  status: PacketStatus;
  dropReason?: string;
}

export interface PacketEvent {
  readonly id: string;
  readonly packetId: string;
  readonly sequence: number;
  readonly timestamp: string;
  readonly type: PacketEventType;
  readonly deviceId: string;
  readonly interfaceId?: string;
  readonly protocol: PacketProtocol;
  readonly status: "info" | "success" | "failure";
  readonly explanation: string;
  readonly ttl: number;
}

export interface SendPacketRequest {
  readonly sourceDeviceId: string;
  readonly destinationIp: string;
  readonly protocol: PacketProtocol;
  readonly sourcePort?: number;
  readonly destinationPort?: number;
  readonly vlan?: number;
  readonly ttl?: number;
  readonly sizeBytes?: number;
}

export interface PacketTrace {
  readonly packet: SimulatedPacket;
  readonly events: PacketEvent[];
  readonly pathDeviceIds: string[];
  readonly pathConnectionIds: string[];
}

export interface PacketSimulationState {
  readonly status: "idle" | "running" | "paused" | "stopped";
  readonly speed: number;
  readonly cursor: number;
  readonly followPacket: boolean;
  readonly protocolFilter: PacketProtocol | "all";
  readonly packets: SimulatedPacket[];
  readonly events: PacketEvent[];
  readonly currentEvent?: PacketEvent;
}

const EVENT_LIMIT = 1_000;

export class PacketSimulationEngine {
  private topology: TopologySnapshot = { devices: [], connections: [], groups: [] };
  private packetSequence = 0;
  private state: PacketSimulationState = {
    status: "idle",
    speed: 1,
    cursor: -1,
    followPacket: true,
    protocolFilter: "all",
    packets: [],
    events: [],
  };

  loadTopology(topology: TopologySnapshot): void {
    this.topology = structuredClone(topology);
  }

  sendPacket(request: SendPacketRequest): PacketTrace {
    this.packetSequence += 1;
    const source = this.topology.devices.find((device) => device.id === request.sourceDeviceId);
    const sourceInterface = source?.interfaces.find((item) => item.ipv4);
    const destination = this.topology.devices.find((device) =>
      device.interfaces.some((item) => item.ipv4 === request.destinationIp),
    );
    const destinationInterface = destination?.interfaces.find((item) => item.ipv4 === request.destinationIp);
    const timestamp = new Date(this.packetSequence * 1_000).toISOString();
    const packet: SimulatedPacket = {
      id: `packet-${this.packetSequence}`,
      timestamp,
      sourceMac: sourceInterface?.macAddress ?? "00:00:00:00:00:00",
      destinationMac: destinationInterface?.macAddress ?? "ff:ff:ff:ff:ff:ff",
      sourceIp: sourceInterface?.ipv4 ?? "0.0.0.0",
      destinationIp: request.destinationIp,
      sourcePort: request.sourcePort,
      destinationPort: request.destinationPort,
      vlan: request.vlan ?? sourceInterface?.vlan,
      protocol: request.protocol,
      initialTtl: Math.max(1, request.ttl ?? 64),
      ttl: Math.max(1, request.ttl ?? 64),
      sizeBytes: Math.max(64, request.sizeBytes ?? defaultPacketSize(request.protocol)),
      currentDeviceId: source?.id ?? request.sourceDeviceId,
      currentInterfaceId: sourceInterface?.id,
      status: "created",
    };
    const events: PacketEvent[] = [];
    const addEvent = (
      type: PacketEventType,
      deviceId: string,
      explanation: string,
      status: PacketEvent["status"] = "info",
      interfaceId?: string,
    ) => {
      const sequence = events.length;
      events.push({
        id: `${packet.id}-event-${sequence + 1}`,
        packetId: packet.id,
        sequence,
        timestamp: new Date(this.packetSequence * 1_000 + sequence).toISOString(),
        type,
        deviceId,
        interfaceId,
        protocol: packet.protocol,
        status,
        explanation,
        ttl: packet.ttl,
      });
    };
    const drop = (reason: string, deviceId = packet.currentDeviceId, interfaceId?: string): PacketTrace => {
      packet.status = "dropped";
      packet.dropReason = reason;
      packet.currentDeviceId = deviceId;
      packet.currentInterfaceId = interfaceId;
      addEvent("packet-dropped", deviceId, reason, "failure", interfaceId);
      return this.commitTrace(packet, events, [], []);
    };

    if (!source || !sourceInterface) return drop("Source device has no configured IPv4 interface");
    addEvent(
      "packet-created",
      source.id,
      `${packet.protocol.toUpperCase()} packet created for ${packet.destinationIp}`,
      "info",
      sourceInterface.id,
    );
    addEvent(
      "frame-encapsulated",
      source.id,
      `Ethernet frame ${packet.sourceMac} → ${packet.destinationMac}, ${packet.sizeBytes} bytes`,
      "info",
      sourceInterface.id,
    );
    if (["arp", "icmp", "tcp", "udp", "dns"].includes(packet.protocol)) {
      addEvent(
        "arp-requested",
        source.id,
        `Resolve next-hop MAC for ${packet.destinationIp}`,
        "info",
        sourceInterface.id,
      );
      if (destinationInterface)
        addEvent(
          "mac-learned",
          source.id,
          `Learned ${destinationInterface.macAddress ?? packet.destinationMac}`,
          "success",
          sourceInterface.id,
        );
    }
    if (packet.vlan)
      addEvent("vlan-tagged", source.id, `Tagged frame for VLAN ${packet.vlan}`, "info", sourceInterface.id);
    if (!destination)
      return drop(`Destination ${packet.destinationIp} is not present in the topology`, source.id, sourceInterface.id);

    const path = findPath(this.topology, source.id, destination.id);
    if (!path) return drop(`No active path to ${destination.hostname}`, source.id, sourceInterface.id);
    const pathDevices = path.deviceIds.map((id) => this.topology.devices.find((device) => device.id === id)!);
    const pathConnections = path.connectionIds.map((id) => this.topology.connections.find((item) => item.id === id)!);
    const minimumMtu = Math.min(
      sourceInterface.mtu,
      destinationInterface?.mtu ?? 1_500,
      ...pathConnections.map((item) => item.mtu),
    );
    if (packet.sizeBytes > minimumMtu)
      return drop(`Packet size ${packet.sizeBytes} exceeds path MTU ${minimumMtu}`, source.id, sourceInterface.id);
    const destinationVlan = destinationInterface?.vlan;
    const hasLayer3Hop = pathDevices.some((device) => supportsRouting(device));
    if (packet.vlan && destinationVlan && packet.vlan !== destinationVlan && !hasLayer3Hop)
      return drop(
        `VLAN ${packet.vlan} cannot reach VLAN ${destinationVlan} without a Layer 3 hop`,
        source.id,
        sourceInterface.id,
      );

    for (let index = 0; index < pathConnections.length; index += 1) {
      const connection = pathConnections[index]!;
      const current = pathDevices[index]!;
      const next = pathDevices[index + 1]!;
      if (connection.status !== "up") return drop(`Connection ${connection.id} is ${connection.status}`, current.id);
      if (supportsRouting(current) && index > 0) {
        packet.ttl -= 1;
        addEvent("route-lookup", current.id, `Longest-prefix route lookup; TTL decremented to ${packet.ttl}`, "info");
        if (packet.ttl <= 0) return drop("TTL expired during route forwarding", current.id);
      }
      packet.status = "forwarding";
      packet.currentDeviceId = next.id;
      packet.currentInterfaceId = interfaceForConnection(connection, next.id);
      addEvent(
        "packet-forwarded",
        next.id,
        `${current.hostname} forwarded packet across ${connection.cableType} link to ${next.hostname}`,
        "success",
        packet.currentInterfaceId,
      );
    }
    packet.status = "delivered";
    packet.currentDeviceId = destination.id;
    packet.currentInterfaceId = destinationInterface?.id;
    addEvent(
      "packet-delivered",
      destination.id,
      `${packet.protocol.toUpperCase()} payload delivered to ${destination.hostname}`,
      "success",
      destinationInterface?.id,
    );
    return this.commitTrace(packet, events, path.deviceIds, path.connectionIds);
  }

  start(): PacketSimulationState {
    this.state = { ...this.state, status: "running" };
    return this.getState();
  }

  pause(): PacketSimulationState {
    this.state = { ...this.state, status: "paused" };
    return this.getState();
  }

  stop(): PacketSimulationState {
    this.state = { ...this.state, status: "stopped" };
    return this.getState();
  }

  reset(): PacketSimulationState {
    this.state = { ...this.state, status: "idle", cursor: -1, packets: [], events: [], currentEvent: undefined };
    this.packetSequence = 0;
    return this.getState();
  }

  step(): PacketSimulationState {
    if (!this.state.events.length) return this.getState();
    const nextCursor = Math.min(this.state.cursor + 1, this.state.events.length - 1);
    const complete = nextCursor >= this.state.events.length - 1;
    this.state = {
      ...this.state,
      cursor: nextCursor,
      currentEvent: this.state.events[nextCursor],
      status: complete ? "stopped" : this.state.status === "idle" ? "paused" : this.state.status,
    };
    return this.getState();
  }

  setSpeed(speed: number): PacketSimulationState {
    this.state = { ...this.state, speed: Math.max(0.25, Math.min(8, speed)) };
    return this.getState();
  }

  setFilter(protocolFilter: PacketProtocol | "all"): PacketSimulationState {
    this.state = { ...this.state, protocolFilter };
    return this.getState();
  }

  setFollow(followPacket: boolean): PacketSimulationState {
    this.state = { ...this.state, followPacket };
    return this.getState();
  }

  getState(): PacketSimulationState {
    return structuredClone(this.state);
  }

  private commitTrace(
    packet: SimulatedPacket,
    events: PacketEvent[],
    pathDeviceIds: string[],
    pathConnectionIds: string[],
  ): PacketTrace {
    const nextEvents = [...this.state.events, ...events].slice(-EVENT_LIMIT);
    const nextPackets = [...this.state.packets, structuredClone(packet)].slice(-200);
    this.state = {
      ...this.state,
      status: "paused",
      cursor: nextEvents.length - events.length - 1,
      packets: nextPackets,
      events: nextEvents,
      currentEvent: undefined,
    };
    return { packet: structuredClone(packet), events: structuredClone(events), pathDeviceIds, pathConnectionIds };
  }
}

function findPath(
  topology: TopologySnapshot,
  sourceId: string,
  destinationId: string,
): { deviceIds: string[]; connectionIds: string[] } | undefined {
  if (sourceId === destinationId) return { deviceIds: [sourceId], connectionIds: [] };
  const queue: Array<{ deviceIds: string[]; connectionIds: string[] }> = [{ deviceIds: [sourceId], connectionIds: [] }];
  const visited = new Set([sourceId]);
  while (queue.length) {
    const current = queue.shift()!;
    const deviceId = current.deviceIds.at(-1)!;
    for (const connection of topology.connections.filter(
      (item) => item.status === "up" && (item.sourceDeviceId === deviceId || item.targetDeviceId === deviceId),
    )) {
      const nextId = connection.sourceDeviceId === deviceId ? connection.targetDeviceId : connection.sourceDeviceId;
      if (visited.has(nextId)) continue;
      const next = {
        deviceIds: [...current.deviceIds, nextId],
        connectionIds: [...current.connectionIds, connection.id],
      };
      if (nextId === destinationId) return next;
      visited.add(nextId);
      queue.push(next);
    }
  }
  return undefined;
}

function supportsRouting(device: NetworkDevice): boolean {
  return device.category === "router" || device.category === "security" || device.capabilities.includes("routing");
}

function interfaceForConnection(connection: NetworkConnection, deviceId: string): string | undefined {
  return connection.sourceDeviceId === deviceId ? connection.sourceInterfaceId : connection.targetInterfaceId;
}

function defaultPacketSize(protocol: PacketProtocol): number {
  if (protocol === "arp") return 64;
  if (protocol === "icmp") return 84;
  if (protocol === "dhcp" || protocol === "dns") return 300;
  return 512;
}
