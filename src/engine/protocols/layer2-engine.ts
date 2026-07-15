import type {
  DeviceRuntimeConfig,
  EtherChannelRuntimeConfig,
  NetworkConnection,
  NetworkDevice,
  NetworkInterface,
  TopologySnapshot,
} from "@/types/network";

export type Layer2FailureCode =
  "NO_LAYER2_PATH" | "VLAN_MISMATCH" | "TRUNK_VLAN_NOT_ALLOWED" | "STP_BLOCKED" | "ETHERCHANNEL_DOWN" | "LINK_DOWN";

export interface MacAddressEntry {
  readonly switchDeviceId: string;
  readonly vlanId: number;
  readonly macAddress: string;
  readonly interfaceId: string;
  readonly type: "dynamic" | "static";
}

export interface SpanningTreePortState {
  readonly switchDeviceId: string;
  readonly interfaceId: string;
  readonly vlanId: number;
  readonly role: "root" | "designated" | "alternate";
  readonly state: "forwarding" | "blocking";
}

export interface SpanningTreeState {
  readonly vlanId: number;
  readonly rootBridgeDeviceId?: string;
  readonly ports: readonly SpanningTreePortState[];
}

export interface EtherChannelState {
  readonly switchDeviceId: string;
  readonly channelId: number;
  readonly protocol: "lacp" | "static";
  readonly status: "up" | "down" | "suspended";
  readonly memberInterfaceIds: readonly string[];
  readonly activeMemberInterfaceIds: readonly string[];
  readonly reason: string;
}

export interface Layer2TraceResult {
  readonly success: boolean;
  readonly vlanId: number;
  readonly sourceVlanId: number;
  readonly destinationVlanId: number;
  readonly deviceIds: readonly string[];
  readonly connectionIds: readonly string[];
  readonly failureCode?: Layer2FailureCode;
  readonly reason: string;
  readonly macTable: readonly MacAddressEntry[];
  readonly spanningTree: SpanningTreeState;
  readonly etherChannels: readonly EtherChannelState[];
}

interface InterfaceOwner {
  readonly device: NetworkDevice;
  readonly networkInterface: NetworkInterface;
}

interface PathCandidate {
  readonly deviceIds: string[];
  readonly connectionIds: string[];
}

export class Layer2Engine {
  constructor(private readonly topology: TopologySnapshot) {}

  trace(source: InterfaceOwner, destination: InterfaceOwner): Layer2TraceResult {
    const sourceVlanId = this.resolveEndpointVlan(source);
    const destinationVlanId = this.resolveEndpointVlan(destination);
    const spanningTree = this.calculateSpanningTree(sourceVlanId);
    const etherChannels = this.calculateEtherChannels();
    const base = {
      vlanId: sourceVlanId,
      sourceVlanId,
      destinationVlanId,
      macTable: [] as MacAddressEntry[],
      spanningTree,
      etherChannels,
    };
    if (sourceVlanId !== destinationVlanId) {
      return {
        ...base,
        success: false,
        deviceIds: [],
        connectionIds: [],
        failureCode: "VLAN_MISMATCH",
        reason: `Source อยู่ VLAN ${sourceVlanId} แต่ Destination อยู่ VLAN ${destinationVlanId}`,
      };
    }

    const blockedInterfaces = new Set(
      spanningTree.ports.filter((port) => port.state === "blocking").map((port) => port.interfaceId),
    );
    const activePath = this.findPath(source.device.id, destination.device.id, sourceVlanId, blockedInterfaces, true);
    if (!activePath) {
      const physicalPath = this.findPhysicalPath(source.device.id, destination.device.id);
      const trunkDenied = physicalPath?.connectionIds.some((connectionId) => {
        const connection = this.connection(connectionId);
        return connection ? !this.connectionPermitsVlan(connection, sourceVlanId) : false;
      });
      const stpDenied = physicalPath?.connectionIds.some((connectionId) => {
        const connection = this.connection(connectionId);
        return connection
          ? blockedInterfaces.has(connection.sourceInterfaceId ?? "") ||
              blockedInterfaces.has(connection.targetInterfaceId ?? "")
          : false;
      });
      const linkDown = physicalPath?.connectionIds.some(
        (connectionId) => this.connection(connectionId)?.status !== "up",
      );
      return {
        ...base,
        success: false,
        deviceIds: physicalPath?.deviceIds ?? [],
        connectionIds: physicalPath?.connectionIds ?? [],
        failureCode: linkDown
          ? "LINK_DOWN"
          : trunkDenied
            ? "TRUNK_VLAN_NOT_ALLOWED"
            : stpDenied
              ? "STP_BLOCKED"
              : "NO_LAYER2_PATH",
        reason: trunkDenied
          ? `VLAN ${sourceVlanId} ไม่ได้รับอนุญาตบน access/trunk path`
          : linkDown
            ? "ลิงก์หรือ interface ระหว่างทางอยู่ในสถานะ down"
            : stpDenied
              ? "Spanning Tree กำลัง block redundant path"
              : "ไม่พบ Layer 2 path ที่ active",
      };
    }

    return {
      ...base,
      success: true,
      deviceIds: activePath.deviceIds,
      connectionIds: activePath.connectionIds,
      reason: `Layer 2 forwarding ผ่าน VLAN ${sourceVlanId}`,
      macTable: this.learnMacAddresses(activePath, source, destination, sourceVlanId),
    };
  }

  calculateSpanningTree(vlanId: number): SpanningTreeState {
    const switches = this.topology.devices.filter(
      (device) => this.isSwitch(device) && this.vlanIsActive(device, vlanId),
    );
    const root = [...switches].sort(
      (left, right) => this.bridgeId(left) - this.bridgeId(right) || left.id.localeCompare(right.id),
    )[0];
    const parent = new Map(switches.map((device) => [device.id, device.id]));
    const find = (id: string): string => {
      const current = parent.get(id) ?? id;
      if (current === id) return id;
      const rootId = find(current);
      parent.set(id, rootId);
      return rootId;
    };
    const ports: SpanningTreePortState[] = [];
    const seenBundles = new Set<string>();
    const edges = this.topology.connections
      .filter((connection) => {
        const source = this.device(connection.sourceDeviceId);
        const target = this.device(connection.targetDeviceId);
        return (
          connection.status === "up" &&
          !!source &&
          !!target &&
          this.isSwitch(source) &&
          this.isSwitch(target) &&
          this.connectionPermitsVlan(connection, vlanId)
        );
      })
      .sort((left, right) => left.id.localeCompare(right.id));
    for (const edge of edges) {
      const bundle = this.bundleForConnection(edge);
      if (bundle && seenBundles.has(bundle.key)) continue;
      if (bundle) seenBundles.add(bundle.key);
      const leftRoot = find(edge.sourceDeviceId);
      const rightRoot = find(edge.targetDeviceId);
      const redundant = leftRoot === rightRoot;
      if (!redundant) parent.set(leftRoot, rightRoot);
      const sourceInterfaceId = bundle ? `port-channel:${bundle.sourceGroup}` : edge.sourceInterfaceId;
      const targetInterfaceId = bundle ? `port-channel:${bundle.targetGroup}` : edge.targetInterfaceId;
      if (!sourceInterfaceId || !targetInterfaceId) continue;
      if (redundant) {
        const blockSource = edge.sourceDeviceId.localeCompare(edge.targetDeviceId) > 0;
        ports.push({
          switchDeviceId: edge.sourceDeviceId,
          interfaceId: sourceInterfaceId,
          vlanId,
          role: blockSource ? "alternate" : "designated",
          state: blockSource ? "blocking" : "forwarding",
        });
        ports.push({
          switchDeviceId: edge.targetDeviceId,
          interfaceId: targetInterfaceId,
          vlanId,
          role: blockSource ? "designated" : "alternate",
          state: blockSource ? "forwarding" : "blocking",
        });
        continue;
      }
      ports.push({
        switchDeviceId: edge.sourceDeviceId,
        interfaceId: sourceInterfaceId,
        vlanId,
        role: edge.targetDeviceId === root?.id ? "root" : "designated",
        state: "forwarding",
      });
      ports.push({
        switchDeviceId: edge.targetDeviceId,
        interfaceId: targetInterfaceId,
        vlanId,
        role: edge.sourceDeviceId === root?.id ? "root" : "designated",
        state: "forwarding",
      });
    }
    return { vlanId, rootBridgeDeviceId: root?.id, ports };
  }

  calculateEtherChannels(): EtherChannelState[] {
    const states: EtherChannelState[] = [];
    for (const device of this.topology.devices) {
      const config = this.runtimeConfig(device)?.switching;
      if (!config) continue;
      for (const channel of Object.values(config.etherChannels)) {
        states.push(this.etherChannelState(device, channel));
      }
    }
    return states;
  }

  private etherChannelState(device: NetworkDevice, channel: EtherChannelRuntimeConfig): EtherChannelState {
    const activeMembers = channel.memberInterfaceIds.filter((interfaceId) => {
      const item = device.interfaces.find((networkInterface) => networkInterface.id === interfaceId);
      return (
        item?.status === "up" &&
        this.topology.connections.some((connection) => this.usesInterface(connection, interfaceId))
      );
    });
    const protocolReady =
      channel.protocol === "static" ||
      channel.mode === "active" ||
      channel.memberInterfaceIds.some((interfaceId) => this.remoteLacpMode(interfaceId) === "active");
    const status = activeMembers.length >= 2 && protocolReady ? "up" : protocolReady ? "down" : "suspended";
    return {
      switchDeviceId: device.id,
      channelId: channel.id,
      protocol: channel.protocol,
      status,
      memberInterfaceIds: channel.memberInterfaceIds,
      activeMemberInterfaceIds: activeMembers,
      reason:
        status === "up"
          ? `${activeMembers.length} active members`
          : protocolReady
            ? "ต้องมี active member อย่างน้อย 2 ports"
            : "LACP passive/passive ไม่สามารถ negotiate ได้",
    };
  }

  private findPath(
    sourceDeviceId: string,
    destinationDeviceId: string,
    vlanId: number,
    blockedInterfaces: ReadonlySet<string>,
    requireActive: boolean,
  ): PathCandidate | undefined {
    if (sourceDeviceId === destinationDeviceId) return { deviceIds: [sourceDeviceId], connectionIds: [] };
    const queue: PathCandidate[] = [{ deviceIds: [sourceDeviceId], connectionIds: [] }];
    const visited = new Set([sourceDeviceId]);
    while (queue.length) {
      const current = queue.shift()!;
      const deviceId = current.deviceIds.at(-1)!;
      for (const connection of this.topology.connections) {
        const nextDeviceId = this.otherDevice(connection, deviceId);
        if (!nextDeviceId || visited.has(nextDeviceId)) continue;
        if (requireActive && connection.status !== "up") continue;
        if (
          blockedInterfaces.has(connection.sourceInterfaceId ?? "") ||
          blockedInterfaces.has(connection.targetInterfaceId ?? "")
        )
          continue;
        if (!this.connectionPermitsVlan(connection, vlanId)) continue;
        const candidate = {
          deviceIds: [...current.deviceIds, nextDeviceId],
          connectionIds: [...current.connectionIds, connection.id],
        };
        if (nextDeviceId === destinationDeviceId) return candidate;
        visited.add(nextDeviceId);
        queue.push(candidate);
      }
    }
    return undefined;
  }

  private findPhysicalPath(sourceDeviceId: string, destinationDeviceId: string): PathCandidate | undefined {
    if (sourceDeviceId === destinationDeviceId) return { deviceIds: [sourceDeviceId], connectionIds: [] };
    const queue: PathCandidate[] = [{ deviceIds: [sourceDeviceId], connectionIds: [] }];
    const visited = new Set([sourceDeviceId]);
    while (queue.length) {
      const current = queue.shift()!;
      const deviceId = current.deviceIds.at(-1)!;
      for (const connection of this.topology.connections) {
        const nextDeviceId = this.otherDevice(connection, deviceId);
        if (!nextDeviceId || visited.has(nextDeviceId)) continue;
        const candidate = {
          deviceIds: [...current.deviceIds, nextDeviceId],
          connectionIds: [...current.connectionIds, connection.id],
        };
        if (nextDeviceId === destinationDeviceId) return candidate;
        visited.add(nextDeviceId);
        queue.push(candidate);
      }
    }
    return undefined;
  }

  private learnMacAddresses(
    path: PathCandidate,
    source: InterfaceOwner,
    destination: InterfaceOwner,
    vlanId: number,
  ): MacAddressEntry[] {
    const entries: MacAddressEntry[] = [];
    const sourceMac = source.networkInterface.macAddress ?? deriveLayer2Mac(source.networkInterface.id);
    const destinationMac = destination.networkInterface.macAddress ?? deriveLayer2Mac(destination.networkInterface.id);
    path.deviceIds.forEach((deviceId, index) => {
      const device = this.device(deviceId);
      if (!device || !this.isSwitch(device)) return;
      const ingress = index > 0 ? this.connection(path.connectionIds[index - 1]!) : undefined;
      const egress = index < path.connectionIds.length ? this.connection(path.connectionIds[index]!) : undefined;
      const ingressInterface = ingress ? this.interfaceIdForDevice(ingress, deviceId) : undefined;
      const egressInterface = egress ? this.interfaceIdForDevice(egress, deviceId) : undefined;
      if (ingressInterface)
        entries.push({
          switchDeviceId: deviceId,
          vlanId,
          macAddress: sourceMac,
          interfaceId: ingressInterface,
          type: "dynamic",
        });
      if (egressInterface)
        entries.push({
          switchDeviceId: deviceId,
          vlanId,
          macAddress: destinationMac,
          interfaceId: egressInterface,
          type: "dynamic",
        });
      const staticEntries = this.runtimeConfig(device)?.switching?.staticMacEntries ?? [];
      entries.push(...staticEntries.map((entry) => ({ switchDeviceId: deviceId, ...entry, type: "static" as const })));
    });
    return entries;
  }

  private resolveEndpointVlan(owner: InterfaceOwner): number {
    const direct = this.isSwitch(owner.device)
      ? this.switchport(owner.device, owner.networkInterface).accessVlan
      : owner.networkInterface.vlan;
    if (direct) return direct;
    const connection = this.topology.connections.find((item) => this.usesInterface(item, owner.networkInterface.id));
    if (!connection) return 1;
    const remoteDeviceId = this.otherDevice(connection, owner.device.id);
    const remote = remoteDeviceId ? this.device(remoteDeviceId) : undefined;
    const remoteInterfaceId = remoteDeviceId ? this.interfaceIdForDevice(connection, remoteDeviceId) : undefined;
    const remoteInterface = remote?.interfaces.find((item) => item.id === remoteInterfaceId);
    return remote && remoteInterface
      ? (this.switchport(remote, remoteInterface)?.accessVlan ?? remoteInterface.vlan ?? 1)
      : 1;
  }

  private connectionPermitsVlan(connection: NetworkConnection, vlanId: number): boolean {
    const source = this.device(connection.sourceDeviceId);
    const target = this.device(connection.targetDeviceId);
    const sourceInterface = source?.interfaces.find((item) => item.id === connection.sourceInterfaceId);
    const targetInterface = target?.interfaces.find((item) => item.id === connection.targetInterfaceId);
    if (!source || !target || !sourceInterface || !targetInterface) return false;
    return (
      this.interfacePermitsVlan(source, sourceInterface, vlanId) &&
      this.interfacePermitsVlan(target, targetInterface, vlanId)
    );
  }

  private interfacePermitsVlan(device: NetworkDevice, item: NetworkInterface, vlanId: number): boolean {
    if (!this.isSwitch(device)) return item.vlan === undefined || item.vlan === vlanId;
    if (!this.vlanIsActive(device, vlanId)) return false;
    const switchport = this.switchport(device, item);
    if (!switchport || switchport.mode === "routed" || switchport.mode === "disabled") return false;
    if (switchport.mode === "access" || switchport.mode === "dynamic") return switchport.accessVlan === vlanId;
    return switchport.allowedVlans.includes(vlanId);
  }

  private vlanIsActive(device: NetworkDevice, vlanId: number): boolean {
    const vlan = this.runtimeConfig(device)?.switching?.vlans[String(vlanId)];
    return vlan ? vlan.status === "active" : vlanId === 1;
  }

  private switchport(device: NetworkDevice, item: NetworkInterface) {
    return (
      this.runtimeConfig(device)?.interfaces[item.id]?.switchport ?? {
        mode: item.portMode ?? "access",
        accessVlan: item.vlan ?? 1,
        nativeVlan: item.nativeVlan ?? 1,
        allowedVlans: item.allowedVlans ?? [1],
        stpPriority: 128,
        portFast: false,
        bpduGuard: false,
        rootGuard: false,
        loopGuard: false,
      }
    );
  }

  private runtimeConfig(device: NetworkDevice): DeviceRuntimeConfig | undefined {
    const value = device.configuration.runtimeConfig;
    return value && typeof value === "object" ? (value as DeviceRuntimeConfig) : undefined;
  }

  private bridgeId(device: NetworkDevice): number {
    return this.runtimeConfig(device)?.switching?.spanningTree.priority ?? 32_768;
  }

  private remoteLacpMode(interfaceId: string): "active" | "passive" | "on" | undefined {
    const connection = this.topology.connections.find((item) => this.usesInterface(item, interfaceId));
    if (!connection) return undefined;
    const localDeviceId =
      connection.sourceInterfaceId === interfaceId ? connection.sourceDeviceId : connection.targetDeviceId;
    const remoteDeviceId = this.otherDevice(connection, localDeviceId);
    const remoteInterfaceId = remoteDeviceId ? this.interfaceIdForDevice(connection, remoteDeviceId) : undefined;
    const remote = remoteDeviceId ? this.device(remoteDeviceId) : undefined;
    return remote && remoteInterfaceId
      ? this.runtimeConfig(remote)?.interfaces[remoteInterfaceId]?.switchport?.lacpMode
      : undefined;
  }

  private bundleForConnection(
    connection: NetworkConnection,
  ): { key: string; sourceGroup: number; targetGroup: number } | undefined {
    const source = this.device(connection.sourceDeviceId);
    const target = this.device(connection.targetDeviceId);
    const sourceGroup =
      source && connection.sourceInterfaceId
        ? this.runtimeConfig(source)?.interfaces[connection.sourceInterfaceId]?.switchport?.channelGroup
        : undefined;
    const targetGroup =
      target && connection.targetInterfaceId
        ? this.runtimeConfig(target)?.interfaces[connection.targetInterfaceId]?.switchport?.channelGroup
        : undefined;
    if (!sourceGroup || !targetGroup || !source || !target) return undefined;
    const sourceState = this.calculateEtherChannels().find(
      (channel) => channel.switchDeviceId === source.id && channel.channelId === sourceGroup,
    );
    const targetState = this.calculateEtherChannels().find(
      (channel) => channel.switchDeviceId === target.id && channel.channelId === targetGroup,
    );
    if (sourceState?.status !== "up" || targetState?.status !== "up") return undefined;
    const endpoints = [source.id, target.id].sort().join(":");
    return { key: `${endpoints}:${sourceGroup}:${targetGroup}`, sourceGroup, targetGroup };
  }

  private isSwitch(device: NetworkDevice): boolean {
    return device.category === "switch" || device.capabilities.includes("switching");
  }

  private device(deviceId: string): NetworkDevice | undefined {
    return this.topology.devices.find((device) => device.id === deviceId);
  }

  private connection(connectionId: string): NetworkConnection | undefined {
    return this.topology.connections.find((connection) => connection.id === connectionId);
  }

  private otherDevice(connection: NetworkConnection, deviceId: string): string | undefined {
    if (connection.sourceDeviceId === deviceId) return connection.targetDeviceId;
    if (connection.targetDeviceId === deviceId) return connection.sourceDeviceId;
    return undefined;
  }

  private interfaceIdForDevice(connection: NetworkConnection, deviceId: string): string | undefined {
    return connection.sourceDeviceId === deviceId ? connection.sourceInterfaceId : connection.targetInterfaceId;
  }

  private usesInterface(connection: NetworkConnection, interfaceId: string): boolean {
    return connection.sourceInterfaceId === interfaceId || connection.targetInterfaceId === interfaceId;
  }
}

function deriveLayer2Mac(seed: string): string {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const bytes = [0x02, (hash >>> 24) & 255, (hash >>> 16) & 255, (hash >>> 8) & 255, hash & 255, seed.length & 255];
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(":");
}
