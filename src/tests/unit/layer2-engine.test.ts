import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/data/demo-topology";
import { deviceRegistry } from "@/data/device-catalog";
import {
  applyRuntimeConfig,
  createDeviceConfigurationState,
  createDeviceRuntimeConfig,
} from "@/domain/configuration/configuration-engine";
import { TopologyLabValidator } from "@/domain/labs/lab-validator";
import { Layer2Engine } from "@/engine/protocols/layer2-engine";
import { IPv4PingEngine } from "@/engine/protocols/ping-engine";
import { labs } from "@/data/labs";
import type { NetworkConnection, NetworkDevice, TopologySnapshot } from "@/types/network";

describe("Layer 2 switching engine", () => {
  it("isolates access VLANs and learns MAC addresses after they match", () => {
    const project = createDemoProject();
    const networkSwitch = project.devices.find((device) => device.category === "switch")!;
    const pc = project.devices.find((device) => device.type === "pc")!;
    const nas = project.devices.find((device) => device.type === "nas")!;
    const pcLink = project.connections.find(
      (connection) => connection.sourceDeviceId === pc.id || connection.targetDeviceId === pc.id,
    )!;
    const nasLink = project.connections.find(
      (connection) => connection.sourceDeviceId === nas.id || connection.targetDeviceId === nas.id,
    )!;
    const pcPort = interfaceFor(pcLink, networkSwitch.id);
    const nasPort = interfaceFor(nasLink, networkSwitch.id);
    const config = createDeviceRuntimeConfig(networkSwitch);
    config.switching!.vlans["10"] = { id: 10, name: "USERS", status: "active" };
    config.switching!.vlans["20"] = { id: 20, name: "SERVERS", status: "active" };
    config.interfaces[pcPort]!.switchport!.accessVlan = 10;
    config.interfaces[nasPort]!.switchport!.accessVlan = 20;
    const configuredSwitch = applyRuntimeConfig(networkSwitch, config);
    let topology = replaceDevice(project, configuredSwitch);
    let result = new IPv4PingEngine(topology).ping({ sourceDeviceId: pc.id, destinationIp: nas.interfaces[0]!.ipv4! });
    expect(result).toMatchObject({ success: false, failureCode: "VLAN_MISMATCH" });

    config.interfaces[nasPort]!.switchport!.accessVlan = 10;
    topology = replaceDevice(project, applyRuntimeConfig(networkSwitch, config));
    result = new IPv4PingEngine(topology).ping({ sourceDeviceId: pc.id, destinationIp: nas.interfaces[0]!.ipv4! });
    expect(result.success).toBe(true);
    expect(result.layer2?.vlanId).toBe(10);
    expect(result.layer2?.macTable.filter((entry) => entry.switchDeviceId === networkSwitch.id)).toHaveLength(2);
  });

  it("drops VLAN traffic when a trunk does not allow it", () => {
    const { topology, left, right, rightSwitch, rightTrunkConfig } = createTwoSwitchTopology();
    let result = new IPv4PingEngine(topology).ping({
      sourceDeviceId: left.id,
      destinationIp: right.interfaces[0]!.ipv4!,
    });
    expect(result).toMatchObject({ success: false, failureCode: "TRUNK_VLAN_NOT_ALLOWED" });

    rightTrunkConfig.interfaces[rightSwitch.interfaces[0]!.id]!.switchport!.allowedVlans = [10];
    const updated = replaceDevice(topology, applyRuntimeConfig(rightSwitch, rightTrunkConfig));
    result = new IPv4PingEngine(updated).ping({ sourceDeviceId: left.id, destinationIp: right.interfaces[0]!.ipv4! });
    expect(result.success).toBe(true);
  });

  it("elects a root bridge and blocks one port in a switch loop", () => {
    const switches = [0, 1, 2].map(() => configuredSwitch([1, 2], [1]));
    const connections = [
      link(switches[0]!, 0, switches[1]!, 0),
      link(switches[1]!, 1, switches[2]!, 0),
      link(switches[2]!, 1, switches[0]!, 1),
    ];
    const topology = { devices: switches, connections, groups: [] };
    const spanningTree = new Layer2Engine(topology).calculateSpanningTree(1);
    expect(spanningTree.rootBridgeDeviceId).toBeDefined();
    expect(spanningTree.ports.filter((port) => port.state === "blocking")).toHaveLength(1);
  });

  it("forms an LACP EtherChannel from two active links", () => {
    let left = configuredSwitch([1, 2], [1]);
    let right = configuredSwitch([1, 2], [1]);
    const leftConfig = createDeviceRuntimeConfig(left);
    const rightConfig = createDeviceRuntimeConfig(right);
    const leftMembers = left.interfaces.slice(0, 2).map((item) => item.id);
    const rightMembers = right.interfaces.slice(0, 2).map((item) => item.id);
    leftConfig.switching!.etherChannels["1"] = {
      id: 1,
      protocol: "lacp",
      mode: "active",
      memberInterfaceIds: leftMembers,
    };
    rightConfig.switching!.etherChannels["1"] = {
      id: 1,
      protocol: "lacp",
      mode: "passive",
      memberInterfaceIds: rightMembers,
    };
    leftMembers.forEach((interfaceId) => {
      leftConfig.interfaces[interfaceId]!.switchport!.channelGroup = 1;
      leftConfig.interfaces[interfaceId]!.switchport!.lacpMode = "active";
    });
    rightMembers.forEach((interfaceId) => {
      rightConfig.interfaces[interfaceId]!.switchport!.channelGroup = 1;
      rightConfig.interfaces[interfaceId]!.switchport!.lacpMode = "passive";
    });
    left = applyRuntimeConfig(left, leftConfig);
    right = applyRuntimeConfig(right, rightConfig);
    const topology = {
      devices: [left, right],
      connections: [link(left, 0, right, 0), link(left, 1, right, 1)],
      groups: [],
    };
    const engine = new Layer2Engine(topology);
    const channels = engine.calculateEtherChannels();
    expect(channels).toHaveLength(2);
    expect(channels.every((channel) => channel.status === "up")).toBe(true);
    expect(engine.calculateSpanningTree(1).ports.some((port) => port.state === "blocking")).toBe(false);
  });

  it("validates the VLAN lab from real running configuration", async () => {
    const project = createDemoProject();
    const networkSwitch = project.devices.find((device) => device.category === "switch")!;
    const state = createDeviceConfigurationState(networkSwitch);
    state.runningConfig.switching!.vlans["10"] = { id: 10, name: "USERS", status: "active" };
    state.runningConfig.switching!.vlans["20"] = { id: 20, name: "SERVERS", status: "active" };
    state.runningConfig.interfaces[networkSwitch.interfaces[0]!.id]!.switchport!.accessVlan = 10;
    state.runningConfig.interfaces[networkSwitch.interfaces[1]!.id]!.switchport!.accessVlan = 20;
    const validator = new TopologyLabValidator(project, {
      devices: { ...project.configurationState.devices, [networkSwitch.id]: state },
      auditLog: [],
    });
    const result = await validator.validate(labs.find((lab) => lab.id === "vlan")!);
    expect(result.map((item) => item.status)).toEqual(["passed", "passed"]);
  });
});

function createTwoSwitchTopology() {
  const left = configuredEndpoint("192.168.10.10");
  const right = configuredEndpoint("192.168.10.20");
  const leftSwitch = configuredSwitch([10], [10]);
  const rightSwitch = configuredSwitch([10], [1]);
  const leftConfig = createDeviceRuntimeConfig(leftSwitch);
  const rightTrunkConfig = createDeviceRuntimeConfig(rightSwitch);
  leftConfig.switching!.vlans["10"] = { id: 10, name: "USERS", status: "active" };
  rightTrunkConfig.switching!.vlans["10"] = { id: 10, name: "USERS", status: "active" };
  leftConfig.interfaces[leftSwitch.interfaces[0]!.id]!.switchport = switchport("trunk", 10, [10]);
  leftConfig.interfaces[leftSwitch.interfaces[1]!.id]!.switchport = switchport("access", 10, [10]);
  rightTrunkConfig.interfaces[rightSwitch.interfaces[0]!.id]!.switchport = switchport("trunk", 10, [1]);
  rightTrunkConfig.interfaces[rightSwitch.interfaces[1]!.id]!.switchport = switchport("access", 10, [10]);
  const configuredLeftSwitch = applyRuntimeConfig(leftSwitch, leftConfig);
  const configuredRightSwitch = applyRuntimeConfig(rightSwitch, rightTrunkConfig);
  return {
    left,
    right,
    leftSwitch: configuredLeftSwitch,
    rightSwitch: configuredRightSwitch,
    rightTrunkConfig,
    topology: {
      devices: [left, configuredLeftSwitch, configuredRightSwitch, right],
      connections: [
        link(left, 0, configuredLeftSwitch, 1),
        link(configuredLeftSwitch, 0, configuredRightSwitch, 0),
        link(configuredRightSwitch, 1, right, 0),
      ],
      groups: [],
    } satisfies TopologySnapshot,
  };
}

function configuredEndpoint(ipv4: string): NetworkDevice {
  const device = deviceRegistry.create("pc");
  device.interfaces[0] = { ...device.interfaces[0]!, ipv4, prefixLength: 24, status: "up" };
  return device;
}

function configuredSwitch(vlans: number[], allowedVlans: number[]): NetworkDevice {
  const device = deviceRegistry.create("layer-2-switch");
  device.interfaces = device.interfaces.map((item) => ({ ...item, status: "up" }));
  const config = createDeviceRuntimeConfig(device);
  vlans.forEach((vlanId) => {
    config.switching!.vlans[String(vlanId)] ??= { id: vlanId, name: `VLAN${vlanId}`, status: "active" };
  });
  Object.values(config.interfaces).forEach((item) => {
    if (item.switchport) item.switchport.allowedVlans = allowedVlans;
  });
  return applyRuntimeConfig(device, config);
}

function switchport(mode: "access" | "trunk", accessVlan: number, allowedVlans: number[]) {
  return {
    mode,
    accessVlan,
    nativeVlan: 1,
    allowedVlans,
    stpPriority: 128,
    portFast: mode === "access",
    bpduGuard: false,
    rootGuard: false,
    loopGuard: false,
  } as const;
}

function link(source: NetworkDevice, sourcePort: number, target: NetworkDevice, targetPort: number): NetworkConnection {
  return {
    id: crypto.randomUUID(),
    sourceDeviceId: source.id,
    sourceInterfaceId: source.interfaces[sourcePort]!.id,
    targetDeviceId: target.id,
    targetInterfaceId: target.interfaces[targetPort]!.id,
    cableType: "copper",
    status: "up",
    bandwidthMbps: 1000,
    latencyMs: 1,
    jitterMs: 0,
    packetLossPercent: 0,
    duplex: "full",
    mtu: 1500,
    protocol: "ethernet",
    direction: "bidirectional",
    pathStyle: "physical",
    createdAt: new Date().toISOString(),
  };
}

function interfaceFor(connection: NetworkConnection, deviceId: string): string {
  return connection.sourceDeviceId === deviceId ? connection.sourceInterfaceId! : connection.targetInterfaceId!;
}

function replaceDevice(topology: TopologySnapshot, device: NetworkDevice): TopologySnapshot {
  return { ...topology, devices: topology.devices.map((item) => (item.id === device.id ? device : item)) };
}
