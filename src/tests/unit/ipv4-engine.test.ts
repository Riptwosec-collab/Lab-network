import { beforeEach, describe, expect, it } from "vitest";

import { createDemoProject } from "@/data/demo-topology";
import { ArpCache } from "@/engine/protocols/arp-cache";
import { analyzeIPv4, validateTopologyIPv4 } from "@/engine/protocols/ipv4";
import { IPv4PingEngine } from "@/engine/protocols/ping-engine";
import type { NetLabProject, NetworkDevice } from "@/types/network";

describe("IPv4 network model", () => {
  it("calculates mask, network, broadcast and host range", () => {
    const info = analyzeIPv4("192.168.10.42", 24);
    expect(info).toMatchObject({
      subnetMask: "255.255.255.0",
      networkAddress: "192.168.10.0",
      broadcastAddress: "192.168.10.255",
      firstHost: "192.168.10.1",
      lastHost: "192.168.10.254",
      totalHosts: 254,
      isUsableHost: true,
    });
  });

  it("expires dynamic ARP entries while retaining static entries", () => {
    const cache = new ArpCache(100);
    cache.set("pc-1", "192.168.1.10", "02:00:00:00:00:10", "dynamic", 1_000);
    cache.set("pc-1", "192.168.1.1", "02:00:00:00:00:01", "static", 1_000);
    expect(cache.get("pc-1", "192.168.1.10", 1_099)).toBeDefined();
    expect(cache.get("pc-1", "192.168.1.10", 1_100)).toBeUndefined();
    expect(cache.get("pc-1", "192.168.1.1", 50_000)).toBeDefined();
  });

  it("rejects duplicate addresses and gateways outside the subnet", () => {
    const project = createDemoProject();
    const pc = project.devices.find((device) => device.type === "pc")!;
    const nas = project.devices.find((device) => device.type === "nas")!;
    nas.interfaces[0] = { ...nas.interfaces[0]!, ipv4: pc.interfaces[0]!.ipv4 };
    pc.interfaces[0] = { ...pc.interfaces[0]!, defaultGateway: "10.0.0.1" };
    const issues = validateTopologyIPv4(project);
    expect(issues.some((issue) => issue.code === "DUPLICATE_IP")).toBe(true);
    expect(issues.some((issue) => issue.code === "GATEWAY_OUTSIDE_SUBNET")).toBe(true);
  });

  it("rejects network and broadcast addresses", () => {
    const project = createDemoProject();
    const pc = project.devices.find((device) => device.type === "pc")!;
    const nas = project.devices.find((device) => device.type === "nas")!;
    pc.interfaces[0] = { ...pc.interfaces[0]!, ipv4: "192.168.1.0" };
    nas.interfaces[0] = { ...nas.interfaces[0]!, ipv4: "192.168.1.255" };
    const issues = validateTopologyIPv4(project);
    expect(issues.some((issue) => issue.code === "NETWORK_ADDRESS")).toBe(true);
    expect(issues.some((issue) => issue.code === "BROADCAST_ADDRESS")).toBe(true);
  });
});

describe("same-subnet ping engine", () => {
  let project: NetLabProject;
  let pc: NetworkDevice;
  let nas: NetworkDevice;

  beforeEach(() => {
    project = createDemoProject();
    pc = project.devices.find((device) => device.type === "pc")!;
    nas = project.devices.find((device) => device.type === "nas")!;
  });

  const ping = (arpCache = new ArpCache()) =>
    new IPv4PingEngine(project, arpCache).ping({
      sourceDeviceId: pc.id,
      destinationIp: nas.interfaces[0]!.ipv4!,
    });

  it("pings across an active layer-2 path and resolves ARP", () => {
    const result = ping();
    expect(result.success).toBe(true);
    expect(result.latencyMs).toBe(4);
    expect(result.timeline.map((step) => step.kind)).toEqual([
      "validation",
      "arp-request",
      "arp-reply",
      "icmp-request",
      "icmp-reply",
    ]);
    expect(result.arpEntries).toHaveLength(1);
    expect(result.arpEntries[0]?.ipAddress).toBe("192.168.1.10");
  });

  it("uses a live ARP cache entry on the next ping", () => {
    const arpCache = new ArpCache();
    expect(ping(arpCache).success).toBe(true);
    const second = ping(arpCache);
    expect(second.timeline.some((step) => step.label === "ARP cache hit")).toBe(true);
    expect(second.timeline.some((step) => step.kind === "arp-request")).toBe(false);
  });

  it("reports duplicate IP", () => {
    nas.interfaces[0] = { ...nas.interfaces[0]!, ipv4: pc.interfaces[0]!.ipv4 };
    expect(ping()).toMatchObject({ success: false, failureCode: "DUPLICATE_IP" });
  });

  it("reports an invalid gateway", () => {
    pc.interfaces[0] = { ...pc.interfaces[0]!, defaultGateway: "10.20.30.1" };
    expect(ping()).toMatchObject({ success: false, failureCode: "INVALID_GATEWAY" });
  });

  it("reports interface down", () => {
    pc.interfaces[0] = { ...pc.interfaces[0]!, status: "down" };
    expect(ping()).toMatchObject({ success: false, failureCode: "INTERFACE_DOWN" });
  });

  it("reports link down", () => {
    const pcLink = project.connections.find(
      (connection) => connection.sourceDeviceId === pc.id || connection.targetDeviceId === pc.id,
    )!;
    project.connections = project.connections.map((connection) =>
      connection.id === pcLink.id ? { ...connection, status: "down" } : connection,
    );
    expect(ping()).toMatchObject({ success: false, failureCode: "LINK_DOWN" });
  });

  it("reports destination unreachable after ARP timeout", () => {
    const result = new IPv4PingEngine(project).ping({
      sourceDeviceId: pc.id,
      destinationIp: "192.168.1.250",
    });
    expect(result).toMatchObject({ success: false, failureCode: "DESTINATION_UNREACHABLE" });
    expect(result.timeline.at(-1)?.label).toBe("ARP timeout");
  });

  it("defers cross-subnet forwarding until the routing phase", () => {
    nas.interfaces[0] = {
      ...nas.interfaces[0]!,
      ipv4: "10.0.0.10",
      prefixLength: 24,
      subnetMask: "255.255.255.0",
      defaultGateway: "10.0.0.1",
    };
    const result = new IPv4PingEngine(project).ping({ sourceDeviceId: pc.id, destinationIp: "10.0.0.10" });
    expect(result).toMatchObject({ success: false, failureCode: "ROUTING_NOT_SUPPORTED" });
  });
});
