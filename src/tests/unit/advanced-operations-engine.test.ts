import { describe, expect, it } from "vitest";

import { deviceRegistry } from "@/data/device-catalog";
import { applyRuntimeConfig, createDeviceRuntimeConfig } from "@/domain/configuration/configuration-engine";
import { HighAvailabilityEngine, MonitoringEngine, TroubleshootingEngine } from "@/engine/operations/operations-engine";
import { OspfEngine } from "@/engine/protocols/ospf-engine";
import { IPv4RoutingEngine } from "@/engine/protocols/routing-engine";
import type { NetworkConnection, NetworkDevice, TopologySnapshot } from "@/types/network";

describe("advanced routing and operations engines", () => {
  it("forms an OSPF adjacency, synchronizes the LSDB and installs learned routes", () => {
    const topology = ospfTopology();
    const first = topology.devices[0]!;
    const engine = new OspfEngine(topology);
    expect(engine.neighbors(first)).toEqual([
      expect.objectContaining({ state: "FULL", areaId: "0", neighborRouterId: "2.2.2.2" }),
    ]);
    expect(engine.database(first)).toEqual(
      expect.arrayContaining([expect.objectContaining({ network: "10.0.2.0", prefixLength: 24 })]),
    );
    expect(new IPv4RoutingEngine(topology).longestPrefixMatch(first, "10.0.2.25")).toMatchObject({
      source: "ospf",
      nextHop: "10.0.12.2",
      administrativeDistance: 110,
      active: true,
    });
  });

  it("reports area mismatch instead of creating a false OSPF route", () => {
    const topology = ospfTopology("1");
    const first = topology.devices[0]!;
    expect(new OspfEngine(topology).neighbors(first)[0]).toMatchObject({ state: "DOWN", reason: "OSPF area mismatch" });
    expect(new IPv4RoutingEngine(topology).buildRoutingTable(first).some((route) => route.source === "ospf")).toBe(
      false,
    );
  });

  it("elects HA by effective priority and fails over when a tracked link is down", () => {
    const topology = haTopology();
    const initial = new HighAvailabilityEngine(topology).members();
    expect(initial.find((item) => item.hostname === "edge-a")?.role).toBe("master");
    topology.connections[0] = { ...topology.connections[0]!, status: "down" };
    const failedOver = new HighAvailabilityEngine(topology).members();
    expect(failedOver.find((item) => item.hostname === "edge-a")).toMatchObject({
      role: "backup",
      effectivePriority: 70,
    });
    expect(failedOver.find((item) => item.hostname === "edge-b")?.role).toBe("master");
    expect(new HighAvailabilityEngine(topology).resolveVirtualIp("10.10.10.1")?.device.hostname).toBe("edge-b");
  });

  it("derives monitoring alerts, incidents and troubleshooting evidence from real topology state", () => {
    const topology = ospfTopology();
    topology.connections[0] = { ...topology.connections[0]!, status: "down", latencyMs: 150, packetLossPercent: 20 };
    const monitoring = new MonitoringEngine(topology);
    expect(monitoring.metrics().some((metric) => metric.availability === "down")).toBe(true);
    expect(monitoring.alerts()).toEqual(
      expect.arrayContaining([expect.objectContaining({ metric: "availability", severity: "critical" })]),
    );
    expect(monitoring.incidents()[0]).toMatchObject({ status: "open", severity: "critical" });
    expect(new TroubleshootingEngine(topology).analyze()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ layer: "L1", symptom: "Physical link is down" }),
        expect.objectContaining({ layer: "L3", symptom: "OSPF neighbor is down" }),
      ]),
    );
  });
});

function ospfTopology(secondArea = "0"): TopologySnapshot {
  let first = deviceRegistry.create("branch-router");
  let second = deviceRegistry.create("branch-router");
  first.hostname = "r1";
  second.hostname = "r2";
  first.status = "online";
  second.status = "online";
  setInterface(first, 0, "10.0.12.1", 30);
  setInterface(first, 1, "10.0.1.1", 24);
  setInterface(second, 0, "10.0.12.2", 30);
  setInterface(second, 1, "10.0.2.1", 24);
  const firstConfig = createDeviceRuntimeConfig(first);
  firstConfig.routing.ospf = ospfConfig("1.1.1.1", "0", ["10.0.12.0/30", "10.0.1.0/24"]);
  first = applyRuntimeConfig(first, firstConfig);
  const secondConfig = createDeviceRuntimeConfig(second);
  secondConfig.routing.ospf = ospfConfig("2.2.2.2", secondArea, ["10.0.12.0/30", "10.0.2.0/24"]);
  second = applyRuntimeConfig(second, secondConfig);
  return { devices: [first, second], connections: [link(first, 0, second, 0)], groups: [] };
}

function haTopology(): TopologySnapshot {
  let first = deviceRegistry.create("branch-router");
  let second = deviceRegistry.create("branch-router");
  const upstream = deviceRegistry.create("branch-router");
  first.hostname = "edge-a";
  second.hostname = "edge-b";
  first.status = "online";
  second.status = "online";
  upstream.status = "online";
  setInterface(first, 0, "10.10.10.2", 24);
  setInterface(first, 1, "192.0.2.1", 30);
  setInterface(second, 0, "10.10.10.3", 24);
  setInterface(second, 1, "198.51.100.1", 30);
  const configure = (device: NetworkDevice, priority: number) => {
    const config = createDeviceRuntimeConfig(device);
    config.operations.highAvailability = {
      enabled: true,
      protocol: "hsrp",
      groupId: 10,
      virtualIp: "10.10.10.1",
      priority,
      preempt: true,
      trackedInterfaceIds: [device.interfaces[1]!.id],
      trackingDecrement: 40,
    };
    return applyRuntimeConfig(device, config);
  };
  first = configure(first, 110);
  second = configure(second, 100);
  return {
    devices: [first, second, upstream],
    connections: [link(first, 1, upstream, 0), link(second, 1, upstream, 1)],
    groups: [],
  };
}

function ospfConfig(routerId: string, transitArea: string, networks: string[]) {
  return {
    enabled: true,
    processId: 1,
    routerId,
    referenceBandwidthMbps: 100_000,
    passiveInterfaceIds: [],
    networks: networks.map((value, index) => {
      const [network, prefix] = value.split("/");
      return {
        id: `${routerId}-${index}`,
        network: network!,
        prefixLength: Number(prefix),
        areaId: index === 0 ? transitArea : "0",
        cost: 10,
      };
    }),
    redistributeConnected: false,
    defaultInformationOriginate: false,
  };
}

function setInterface(device: NetworkDevice, index: number, ipv4: string, prefixLength: number) {
  device.interfaces[index] = { ...device.interfaces[index]!, ipv4, prefixLength, status: "up" };
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
