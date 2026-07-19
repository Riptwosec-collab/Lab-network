import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/data/demo-topology";
import { PacketSimulationEngine } from "@/engine/packets/packet-simulation-engine";
import type { TopologySnapshot } from "@/types/network";

describe("packet simulation engine", () => {
  it("creates, encapsulates, forwards and delivers a deterministic ICMP packet", () => {
    const topology = demoTopology();
    const engine = new PacketSimulationEngine();
    engine.loadTopology(topology);
    const source = topology.devices.find((item) => item.type === "pc")!;
    const trace = engine.sendPacket({
      sourceDeviceId: source.id,
      destinationIp: "192.168.1.10",
      protocol: "icmp",
    });
    expect(trace.packet).toMatchObject({
      id: "packet-1",
      sourceIp: "192.168.1.100",
      destinationIp: "192.168.1.10",
      protocol: "icmp",
      status: "delivered",
    });
    expect(trace.events.map((event) => event.type)).toEqual([
      "packet-created",
      "frame-encapsulated",
      "arp-requested",
      "mac-learned",
      "packet-forwarded",
      "packet-forwarded",
      "packet-delivered",
    ]);
    expect(trace.pathDeviceIds).toHaveLength(3);
  });

  it("supports pause, resume, stop, reset, speed and step-forward controls", () => {
    const { engine, topology } = setup();
    engine.sendPacket(request(topology));
    expect(engine.start().status).toBe("running");
    expect(engine.step()).toMatchObject({ status: "running", cursor: 0, currentEvent: { type: "packet-created" } });
    expect(engine.pause().status).toBe("paused");
    expect(engine.setSpeed(4).speed).toBe(4);
    expect(engine.stop().status).toBe("stopped");
    expect(engine.reset()).toMatchObject({ status: "idle", cursor: -1, events: [], packets: [] });
  });

  it("filters protocol state without changing the authoritative event log", () => {
    const { engine, topology } = setup();
    engine.sendPacket(request(topology, "icmp"));
    engine.sendPacket(request(topology, "dns"));
    const before = engine.getState().events.length;
    expect(engine.setFilter("dns")).toMatchObject({ protocolFilter: "dns" });
    expect(engine.getState().events).toHaveLength(before);
    expect(engine.setFollow(false).followPacket).toBe(false);
  });

  it("reports a concrete drop reason when there is no active path", () => {
    const topology = demoTopology();
    topology.connections = topology.connections.map((connection) => ({ ...connection, status: "down" }));
    const engine = new PacketSimulationEngine();
    engine.loadTopology(topology);
    const trace = engine.sendPacket(request(topology));
    expect(trace.packet).toMatchObject({ status: "dropped", dropReason: expect.stringContaining("No active path") });
    expect(trace.events.at(-1)).toMatchObject({ type: "packet-dropped", status: "failure" });
  });

  it("drops oversized packets using the real path MTU", () => {
    const { engine, topology } = setup();
    const trace = engine.sendPacket({ ...request(topology), sizeBytes: 9_000 });
    expect(trace.packet).toMatchObject({ status: "dropped", dropReason: "Packet size 9000 exceeds path MTU 1500" });
  });

  it("decrements TTL at a routed hop and reports TTL expiry", () => {
    const topology = demoTopology();
    const cloud = topology.devices.find((item) => item.category === "cloud")!;
    cloud.interfaces[0] = { ...cloud.interfaces[0]!, ipv4: "203.0.113.1", prefixLength: 24, status: "up" };
    const engine = new PacketSimulationEngine();
    engine.loadTopology(topology);
    const source = topology.devices.find((item) => item.type === "pc")!;
    const trace = engine.sendPacket({
      sourceDeviceId: source.id,
      destinationIp: "203.0.113.1",
      protocol: "icmp",
      ttl: 1,
    });
    expect(trace.packet).toMatchObject({
      status: "dropped",
      ttl: 0,
      dropReason: "TTL expired during route forwarding",
    });
    expect(trace.events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "route-lookup", ttl: 0 })]));
  });

  it("produces identical traces for identical topology and request", () => {
    const topology = demoTopology();
    const firstEngine = new PacketSimulationEngine();
    const secondEngine = new PacketSimulationEngine();
    firstEngine.loadTopology(topology);
    secondEngine.loadTopology(structuredClone(topology));
    const first = firstEngine.sendPacket(request(topology));
    const second = secondEngine.sendPacket(request(topology));
    expect(second).toEqual(first);
  });

  it("bounds the event log at 1,000 entries for UI-safe windowing", () => {
    const { engine, topology } = setup();
    for (let index = 0; index < 180; index += 1) engine.sendPacket(request(topology, index % 2 ? "icmp" : "udp"));
    expect(engine.getState().events).toHaveLength(1_000);
    expect(engine.getState().packets).toHaveLength(180);
  });
});

function demoTopology(): TopologySnapshot {
  const project = createDemoProject();
  return { devices: project.devices, connections: project.connections, groups: project.groups };
}

function setup(): { engine: PacketSimulationEngine; topology: TopologySnapshot } {
  const topology = demoTopology();
  const engine = new PacketSimulationEngine();
  engine.loadTopology(topology);
  return { engine, topology };
}

function request(topology: TopologySnapshot, protocol: "icmp" | "dns" | "udp" = "icmp") {
  return {
    sourceDeviceId: topology.devices.find((item) => item.type === "pc")!.id,
    destinationIp: "192.168.1.10",
    protocol,
    destinationPort: protocol === "dns" ? 53 : protocol === "udp" ? 5000 : undefined,
  } as const;
}
