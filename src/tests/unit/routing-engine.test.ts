import { describe, expect, it } from "vitest";

import { deviceRegistry } from "@/data/device-catalog";
import { labs } from "@/data/labs";
import {
  applyRuntimeConfig,
  createDeviceConfigurationState,
  createDeviceRuntimeConfig,
} from "@/domain/configuration/configuration-engine";
import { TopologyLabValidator } from "@/domain/labs/lab-validator";
import { IPv4PingEngine } from "@/engine/protocols/ping-engine";
import { IPv4RoutingEngine } from "@/engine/protocols/routing-engine";
import type { DeviceRuntimeConfig, NetworkConnection, NetworkDevice, TopologySnapshot } from "@/types/network";

describe("IPv4 routing engine", () => {
  it("routes a Ping between two directly connected subnets", () => {
    const topology = createSingleRouterTopology();
    const [source, , destination] = topology.devices;
    const result = new IPv4PingEngine(topology).ping({
      sourceDeviceId: source!.id,
      destinationIp: destination!.interfaces[0]!.ipv4!,
    });
    expect(result.success).toBe(true);
    expect(result.routing?.hops).toHaveLength(1);
    expect(result.returnRouting?.hops).toHaveLength(1);
    expect(result.timeline.some((step) => step.kind === "routing")).toBe(true);
  });

  it("fails when the Layer 3 device has ip routing disabled", () => {
    const topology = createSingleRouterTopology(false);
    const [source, , destination] = topology.devices;
    expect(
      new IPv4PingEngine(topology).ping({
        sourceDeviceId: source!.id,
        destinationIp: destination!.interfaces[0]!.ipv4!,
      }),
    ).toMatchObject({ success: false, failureCode: "IP_ROUTING_DISABLED" });
  });

  it("chooses the active route with the longest prefix", () => {
    const topology = createSingleRouterTopology();
    const router = topology.devices[1]!;
    const config = createDeviceRuntimeConfig(router);
    config.routing.staticRoutes.push(
      route("10.0.0.0", 8, "10.0.2.2"),
      route("10.10.10.0", 24, "10.0.2.2"),
      route("0.0.0.0", 0, "10.0.2.2"),
    );
    const configuredRouter = applyRuntimeConfig(router, config);
    const engine = new IPv4RoutingEngine(replaceDevice(topology, configuredRouter));
    expect(engine.longestPrefixMatch(configuredRouter, "10.10.10.42")).toMatchObject({
      destination: "10.10.10.0",
      prefixLength: 24,
    });
  });

  it("supports inter-VLAN routing through two live SVIs", () => {
    const topology = createInterVlanTopology();
    const [source, , destination] = topology.devices;
    const result = new IPv4PingEngine(topology).ping({
      sourceDeviceId: source!.id,
      destinationIp: destination!.interfaces[0]!.ipv4!,
    });
    expect(result.success).toBe(true);
    expect(result.routing?.hops[0]?.route.outgoingInterfaceId).toContain("svi:");
    expect(result.layer2?.vlanId).toBe(20);
  });

  it("requires a valid reverse route for ICMP Echo Reply", () => {
    const topology = createTwoRouterTopology(false);
    const source = topology.devices[0]!;
    const destination = topology.devices.at(-1)!;
    const failed = new IPv4PingEngine(topology).ping({
      sourceDeviceId: source.id,
      destinationIp: destination.interfaces[0]!.ipv4!,
    });
    expect(failed.success).toBe(false);
    expect(failed.reason).toContain("Return path");

    const working = createTwoRouterTopology(true);
    const success = new IPv4PingEngine(working).ping({
      sourceDeviceId: working.devices[0]!.id,
      destinationIp: working.devices.at(-1)!.interfaces[0]!.ipv4!,
    });
    expect(success.success).toBe(true);
    expect(success.routing?.hops).toHaveLength(2);
    expect(success.returnRouting?.hops).toHaveLength(2);
  });

  it("validates an inter-VLAN lab from SVI and routed Ping state", async () => {
    const topology = createInterVlanTopology();
    const layer3Switch = topology.devices[1]!;
    const state = createDeviceConfigurationState(layer3Switch);
    state.runningConfig = structuredClone(layer3Switch.configuration.runtimeConfig as DeviceRuntimeConfig);
    const validator = new TopologyLabValidator(topology, {
      devices: { [layer3Switch.id]: state },
      auditLog: [],
    });
    const results = await validator.validate(labs.find((lab) => lab.id === "inter-vlan")!);
    expect(results.map((result) => result.status)).toEqual(["passed", "passed"]);
  });
});

function createSingleRouterTopology(ipRouting = true): TopologySnapshot {
  const source = endpoint("10.0.1.10", "10.0.1.1");
  const router = deviceRegistry.create("branch-router");
  setInterface(router, 0, "10.0.1.1", 24);
  setInterface(router, 1, "10.0.2.1", 24);
  const config = createDeviceRuntimeConfig(router);
  config.routing.ipRouting = ipRouting;
  const configuredRouter = applyRuntimeConfig(router, config);
  const destination = endpoint("10.0.2.10", "10.0.2.1");
  return {
    devices: [source, configuredRouter, destination],
    connections: [link(source, 0, configuredRouter, 0), link(configuredRouter, 1, destination, 0)],
    groups: [],
  };
}

function createInterVlanTopology(): TopologySnapshot {
  const source = endpoint("10.10.10.10", "10.10.10.1");
  const layer3Switch = deviceRegistry.create("layer-3-switch");
  layer3Switch.interfaces = layer3Switch.interfaces.map((item) => ({ ...item, status: "up" }));
  const destination = endpoint("10.20.20.10", "10.20.20.1");
  const config = createDeviceRuntimeConfig(layer3Switch);
  config.switching!.vlans["10"] = { id: 10, name: "USERS", status: "active" };
  config.switching!.vlans["20"] = { id: 20, name: "SERVERS", status: "active" };
  config.interfaces[layer3Switch.interfaces[0]!.id]!.switchport!.accessVlan = 10;
  config.interfaces[layer3Switch.interfaces[1]!.id]!.switchport!.accessVlan = 20;
  config.routing.ipRouting = true;
  config.routing.svis["10"] = { vlanId: 10, enabled: true, ipv4: "10.10.10.1", prefixLength: 24 };
  config.routing.svis["20"] = { vlanId: 20, enabled: true, ipv4: "10.20.20.1", prefixLength: 24 };
  const configuredSwitch = applyRuntimeConfig(layer3Switch, config);
  return {
    devices: [source, configuredSwitch, destination],
    connections: [link(source, 0, configuredSwitch, 0), link(configuredSwitch, 1, destination, 0)],
    groups: [],
  };
}

function createTwoRouterTopology(withReturnRoute: boolean): TopologySnapshot {
  const source = endpoint("10.0.1.10", "10.0.1.1");
  let firstRouter = deviceRegistry.create("branch-router");
  let secondRouter = deviceRegistry.create("branch-router");
  const destination = endpoint("10.0.2.10", "10.0.2.1");
  setInterface(firstRouter, 0, "10.0.1.1", 24);
  setInterface(firstRouter, 1, "10.0.12.1", 30);
  setInterface(secondRouter, 0, "10.0.12.2", 30);
  setInterface(secondRouter, 1, "10.0.2.1", 24);
  const firstConfig = createDeviceRuntimeConfig(firstRouter);
  firstConfig.routing.staticRoutes.push(route("10.0.2.0", 24, "10.0.12.2"));
  firstRouter = applyRuntimeConfig(firstRouter, firstConfig);
  const secondConfig = createDeviceRuntimeConfig(secondRouter);
  if (withReturnRoute) secondConfig.routing.staticRoutes.push(route("10.0.1.0", 24, "10.0.12.1"));
  secondRouter = applyRuntimeConfig(secondRouter, secondConfig);
  return {
    devices: [source, firstRouter, secondRouter, destination],
    connections: [
      link(source, 0, firstRouter, 0),
      link(firstRouter, 1, secondRouter, 0),
      link(secondRouter, 1, destination, 0),
    ],
    groups: [],
  };
}

function endpoint(ipv4: string, defaultGateway: string): NetworkDevice {
  const device = deviceRegistry.create("pc");
  device.interfaces[0] = {
    ...device.interfaces[0]!,
    ipv4,
    prefixLength: 24,
    defaultGateway,
    status: "up",
  };
  return device;
}

function setInterface(device: NetworkDevice, index: number, ipv4: string, prefixLength: number): void {
  device.interfaces[index] = { ...device.interfaces[index]!, ipv4, prefixLength, status: "up" };
}

function route(
  destination: string,
  prefixLength: number,
  nextHop: string,
): DeviceRuntimeConfig["routing"]["staticRoutes"][number] {
  return { destination, prefixLength, nextHop, administrativeDistance: 1, metric: 0 };
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

function replaceDevice(topology: TopologySnapshot, device: NetworkDevice): TopologySnapshot {
  return { ...topology, devices: topology.devices.map((item) => (item.id === device.id ? device : item)) };
}
