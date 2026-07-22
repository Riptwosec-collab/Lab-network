import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { deviceRegistry } from "@/data/device-catalog";
import { applyRuntimeConfig, createDeviceRuntimeConfig } from "@/domain/configuration/configuration-engine";
import { advancedProtocolModules } from "@/engine/protocols/advanced-protocol-modules";
import { ProtocolRegistry } from "@/engine/protocols/protocol-registry";
import type { ProtocolModule } from "@/engine/protocols/protocol-types";
import type { WorkerRequest, WorkerResponse } from "@/engine/workers/worker-messages";
import type { DeviceRuntimeConfig, NetworkConnection, NetworkDevice, TopologySnapshot } from "@/types/network";

describe("protocol registry", () => {
  it("initializes advanced modules in dependency order with deterministic snapshots", () => {
    const topology = advancedTopology();
    const first = new ProtocolRegistry(advancedProtocolModules).initialize(topology, {
      now: "2026-01-01T00:00:00.000Z",
      seed: "phase-23",
    });
    const second = new ProtocolRegistry(advancedProtocolModules).initialize(topology, {
      now: "2026-01-01T00:00:00.000Z",
      seed: "phase-23",
    });

    expect(first).toEqual(second);
    expect(Object.keys(first.states)).toEqual([
      "hsrp",
      "stp",
      "lacp",
      "nat",
      "ospf.multi-area",
      "sd-wan.sla-path-selection",
      "vrrp",
    ]);
    expect(first.states["lacp"]).toMatchObject({ status: "converged" });
  });

  it("rejects circular protocol dependencies before runtime", () => {
    const one = stubModule("one", ["two"]);
    const two = stubModule("two", ["one"]);

    expect(() => new ProtocolRegistry([one, two])).toThrow("Circular protocol dependency");
  });

  it("validates advanced protocol configuration issues", () => {
    const router = routedDevice("r1", "10.0.0.1", 24);
    const config = createDeviceRuntimeConfig(router);
    config.routing.ospf.enabled = true;
    config.routing.ospf.networks = [
      { id: "ospf-10", network: "10.0.0.0", prefixLength: 24, areaId: "10", cost: 10 },
      { id: "ospf-20", network: "10.1.0.0", prefixLength: 24, areaId: "20", cost: 10 },
    ];
    const topology: TopologySnapshot = { devices: [applyRuntimeConfig(router, config)], connections: [], groups: [] };

    expect(new ProtocolRegistry(advancedProtocolModules).validate(topology)).toContainEqual(
      expect.objectContaining({
        protocolId: "ospf.multi-area",
        code: "MISSING_BACKBONE_AREA",
        severity: "error",
      }),
    );
  });

  it("emits convergence events and restores snapshots after link state changes", () => {
    const topology = advancedTopology();
    const registry = new ProtocolRegistry(advancedProtocolModules);
    registry.initialize(topology, { now: "2026-01-01T00:00:00.000Z", seed: "phase-23" });
    const result = registry.handleEvent(topology, {
      id: "event-1",
      type: "LINK_DOWN",
      timestamp: "2026-01-01T00:00:01.000Z",
      payload: { connectionId: topology.connections[0]!.id },
    });
    const restored = new ProtocolRegistry(advancedProtocolModules).restore(result.snapshot, topology);

    expect(result.events.map((event) => event.type)).toContain("ospf.multi-area.convergence");
    expect(result.snapshot.tick).toBe(1);
    expect(restored).toEqual(result.snapshot);
  });

  it("keeps protocol modules independent from React and Zustand", () => {
    const files = ["protocol-types.ts", "protocol-registry.ts", "advanced-protocol-modules.ts"].map((file) =>
      readFileSync(join(process.cwd(), "src", "engine", "protocols", file), "utf8"),
    );
    expect(files.join("\n")).not.toMatch(/from ["'](?:react|zustand)/);
  });

  it("supports the worker protocol event contract with serializable messages", () => {
    const topology = advancedTopology();
    const registry = new ProtocolRegistry(advancedProtocolModules);
    const initial = registry.initialize(topology);
    const request: WorkerRequest = {
      type: "PROTOCOL_EVENT",
      requestId: "req-1",
      payload: { id: "event-2", type: "LINK_UP", timestamp: "2026-01-01T00:00:02.000Z", payload: {} },
    };
    const response: WorkerResponse = {
      type: "PROTOCOL_EVENT_RESULT",
      requestId: request.requestId,
      payload: registry.handleEvent(topology, request.payload),
    };

    expect(JSON.parse(JSON.stringify(initial))).toEqual(initial);
    expect(JSON.parse(JSON.stringify(response))).toMatchObject({
      type: "PROTOCOL_EVENT_RESULT",
      requestId: "req-1",
    });
  });
});

function stubModule(id: string, dependencies: readonly string[]): ProtocolModule {
  return {
    id,
    version: "test",
    dependencies,
    initialize: () => ({ status: "converged" }),
    handleEvent: (_event, state) => ({ state, events: [] }),
    validateConfiguration: () => [],
  };
}

function advancedTopology(): TopologySnapshot {
  let r1 = routedDevice("r1", "10.0.12.1", 30);
  let r2 = routedDevice("r2", "10.0.12.2", 30);
  const switchA = switchDevice("sw1");
  const switchB = switchDevice("sw2");
  const r1Config = createDeviceRuntimeConfig(r1);
  const r2Config = createDeviceRuntimeConfig(r2);
  enableOspf(r1Config, "1.1.1.1", "0");
  enableOspf(r2Config, "2.2.2.2", "0");
  r1Config.services.nat.enabled = true;
  r1Config.services.nat.rules.push({
    id: "nat-1",
    order: 10,
    enabled: true,
    type: "dynamic",
    source: "10.0.0.0",
    sourcePrefixLength: 8,
    destination: "0.0.0.0",
    destinationPrefixLength: 0,
    translatedAddress: "203.0.113.10",
  });
  r1Config.operations.highAvailability = {
    enabled: true,
    protocol: "hsrp",
    groupId: 10,
    virtualIp: "10.0.12.254",
    priority: 110,
    preempt: true,
    trackedInterfaceIds: [],
    trackingDecrement: 20,
    peerDeviceId: r2.id,
  };
  r2Config.operations.highAvailability = {
    ...r1Config.operations.highAvailability,
    priority: 100,
    peerDeviceId: r1.id,
  };
  r1 = applyRuntimeConfig(r1, r1Config);
  r2 = applyRuntimeConfig(r2, r2Config);
  return {
    devices: [r1, r2, switchA, switchB],
    connections: [link(r1, 0, r2, 0, "copper"), link(switchA, 0, switchB, 0, "copper"), link(r1, 1, r2, 1, "sd-wan")],
    groups: [],
  };
}

function routedDevice(hostname: string, ipv4: string, prefixLength: number): NetworkDevice {
  const device = deviceRegistry.create("branch-router");
  device.hostname = hostname;
  device.interfaces = device.interfaces.map((networkInterface, index) => ({
    ...networkInterface,
    status: "up",
    ipv4: index === 0 ? ipv4 : networkInterface.ipv4,
    prefixLength: index === 0 ? prefixLength : networkInterface.prefixLength,
  }));
  return device;
}

function switchDevice(hostname: string): NetworkDevice {
  const device = deviceRegistry.create("layer-2-switch");
  device.hostname = hostname;
  const config = createDeviceRuntimeConfig(device);
  config.switching!.etherChannels["1"] = {
    id: 1,
    protocol: "lacp",
    mode: "active",
    memberInterfaceIds: [device.interfaces[0]!.id, device.interfaces[1]!.id],
  };
  return applyRuntimeConfig(
    {
      ...device,
      interfaces: device.interfaces.map((networkInterface) => ({
        ...networkInterface,
        status: "up",
        portMode: "trunk",
        allowedVlans: [1, 10, 20],
      })),
    },
    config,
  );
}

function enableOspf(config: DeviceRuntimeConfig, routerId: string, areaId: string): void {
  config.routing.ipRouting = true;
  config.routing.ospf.enabled = true;
  config.routing.ospf.routerId = routerId;
  config.routing.ospf.networks = [{ id: `ospf-${routerId}`, network: "10.0.12.0", prefixLength: 30, areaId, cost: 10 }];
}

function link(
  source: NetworkDevice,
  sourcePort: number,
  target: NetworkDevice,
  targetPort: number,
  cableType: NetworkConnection["cableType"],
): NetworkConnection {
  return {
    id: `${source.id}-${target.id}-${sourcePort}-${targetPort}`,
    sourceDeviceId: source.id,
    sourceInterfaceId: source.interfaces[sourcePort]!.id,
    targetDeviceId: target.id,
    targetInterfaceId: target.interfaces[targetPort]!.id,
    cableType,
    status: "up",
    bandwidthMbps: 1000,
    latencyMs: cableType === "sd-wan" ? 35 : 1,
    jitterMs: 1,
    packetLossPercent: 0,
    duplex: "full",
    mtu: 1500,
    protocol: "ethernet",
    direction: "bidirectional",
    pathStyle: cableType === "sd-wan" ? "logical" : "physical",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}
