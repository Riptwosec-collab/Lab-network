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
import { NetworkServicesEngine } from "@/engine/protocols/services-engine";
import type { NetworkConnection, NetworkDevice, TopologySnapshot } from "@/types/network";

describe("network services engine", () => {
  it("executes DHCP DORA, honors exclusions and reservations, and releases leases", () => {
    let server = deviceRegistry.create("dhcp-server");
    const config = createDeviceRuntimeConfig(server);
    config.services.dhcp.enabled = true;
    config.services.dhcp.pools.LAN = {
      name: "LAN",
      network: "192.168.50.0",
      prefixLength: 29,
      defaultGateway: "192.168.50.1",
      dnsServers: ["192.168.50.2"],
      domainName: "lab.local",
      leaseSeconds: 3600,
      maximumLeases: 4,
      excludedRanges: [{ start: "192.168.50.1", end: "192.168.50.2" }],
      reservations: [{ ipAddress: "192.168.50.6", clientIdentifier: "reserved-client" }],
      relayAddresses: ["10.0.0.1"],
    };
    server = applyRuntimeConfig(server, config);
    const client = deviceRegistry.create("pc");
    const reserved = deviceRegistry.create("pc");
    const engine = new NetworkServicesEngine({ devices: [server, client, reserved], connections: [], groups: [] });

    const first = engine.requestDhcp(client.id, server.id, "LAN");
    expect(first).toMatchObject({ success: true, code: "ACK", lease: { ipAddress: "192.168.50.3" } });
    expect(first.timeline).toEqual(["DHCPDISCOVER", "DHCPOFFER 192.168.50.3", "DHCPREQUEST 192.168.50.3", "DHCPACK"]);
    expect(engine.requestDhcp(reserved.id, server.id, "LAN", "reserved-client").lease?.ipAddress).toBe("192.168.50.6");
    expect(engine.listDhcpLeases()).toHaveLength(2);
    expect(engine.releaseDhcp(client.id)?.state).toBe("released");
  });

  it("validates the DHCP lab from a real pool and DORA result", async () => {
    let server = deviceRegistry.create("dhcp-server");
    const client = deviceRegistry.create("pc");
    const config = createDeviceRuntimeConfig(server);
    config.services.dhcp.enabled = true;
    config.services.dhcp.pools.LAB = {
      name: "LAB",
      network: "10.50.0.0",
      prefixLength: 24,
      defaultGateway: "10.50.0.1",
      dnsServers: [],
      leaseSeconds: 3600,
      excludedRanges: [],
      reservations: [],
      relayAddresses: [],
    };
    server = applyRuntimeConfig(server, config);
    const state = createDeviceConfigurationState(server);
    state.runningConfig = structuredClone(config);
    const topology = { devices: [server, client], connections: [], groups: [] };
    const results = await new TopologyLabValidator(topology, {
      devices: { [server.id]: state },
      auditLog: [],
    }).validate(labs.find((lab) => lab.id === "dhcp")!);
    expect(results.map((result) => result.status)).toEqual(["passed", "passed"]);
  });

  it("resolves authoritative DNS records and returns cache hit and NXDOMAIN states", () => {
    let client = configuredEndpoint("192.168.60.10", "192.168.60.1");
    let server = deviceRegistry.create("dns-server");
    setInterface(server, 0, "192.168.60.53", 24);
    const serverConfig = createDeviceRuntimeConfig(server);
    serverConfig.services.dns.enabled = true;
    serverConfig.services.dns.zones["lab.local"] = {
      name: "lab.local",
      authoritative: true,
      reverse: false,
      records: [{ id: "web-a", name: "web.lab.local", type: "A", value: "192.168.60.80", ttl: 120 }],
    };
    server = applyRuntimeConfig(server, serverConfig);
    const clientConfig = createDeviceRuntimeConfig(client);
    clientConfig.system.dnsServers = ["192.168.60.53"];
    client = applyRuntimeConfig(client, clientConfig);
    const topology = {
      devices: [client, server],
      connections: [link(client, 0, server, 0)],
      groups: [],
    };
    const engine = new NetworkServicesEngine(topology);

    expect(engine.queryDns(client.id, "web.lab.local")).toMatchObject({
      success: true,
      code: "ANSWER",
      cache: "miss",
      values: ["192.168.60.80"],
    });
    expect(engine.queryDns(client.id, "web.lab.local").cache).toBe("hit");
    expect(engine.queryDns(client.id, "missing.lab.local")).toMatchObject({ success: false, code: "NXDOMAIN" });
    expect(engine.listDnsCache()).toHaveLength(1);
  });

  it("evaluates ACLs in sequence with implicit deny and counts hits", () => {
    let router = deviceRegistry.create("branch-router");
    const config = createDeviceRuntimeConfig(router);
    config.services.acl.enabled = true;
    config.services.acl.accessLists.EDGE = {
      name: "EDGE",
      type: "extended",
      rules: [
        {
          sequence: 10,
          action: "deny",
          protocol: "icmp",
          source: "10.0.1.0",
          sourcePrefixLength: 24,
          destination: "10.0.2.0",
          destinationPrefixLength: 24,
          logging: true,
        },
        {
          sequence: 20,
          action: "permit",
          protocol: "ip",
          source: "0.0.0.0",
          sourcePrefixLength: 0,
          destination: "0.0.0.0",
          destinationPrefixLength: 0,
          logging: false,
        },
      ],
    };
    config.services.acl.assignments.push({
      interfaceId: router.interfaces[0]!.id,
      direction: "out",
      aclName: "EDGE",
    });
    router = applyRuntimeConfig(router, config);
    const engine = new NetworkServicesEngine({ devices: [router], connections: [], groups: [] });

    expect(
      engine.evaluateAcl(router, router.interfaces[0]!.id, "out", {
        sourceIp: "10.0.1.10",
        destinationIp: "10.0.2.10",
        protocol: "icmp",
      }),
    ).toMatchObject({ action: "deny", ruleSequence: 10, implicit: false });
    expect(
      engine.evaluateAcl(router, router.interfaces[0]!.id, "out", {
        sourceIp: "172.16.1.10",
        destinationIp: "10.0.2.10",
        protocol: "tcp",
        destinationPort: 443,
      }),
    ).toMatchObject({ action: "permit", ruleSequence: 20 });
    expect(Object.values(engine.listAclHits())).toEqual([1, 1]);
  });

  it("applies ACL deny and PAT translation to a routed Ping", () => {
    const denied = routedServiceTopology("deny");
    const deniedResult = new IPv4PingEngine(denied).ping({
      sourceDeviceId: denied.devices[0]!.id,
      destinationIp: denied.devices[2]!.interfaces[0]!.ipv4!,
    });
    expect(deniedResult).toMatchObject({ success: false, failureCode: "ACL_DENY" });
    expect(deniedResult.policy?.aclEvaluations[0]).toMatchObject({ aclName: "EDGE", ruleSequence: 10 });

    const permitted = routedServiceTopology("permit");
    const success = new IPv4PingEngine(permitted).ping({
      sourceDeviceId: permitted.devices[0]!.id,
      destinationIp: permitted.devices[2]!.interfaces[0]!.ipv4!,
    });
    expect(success.success).toBe(true);
    expect(success.policy?.natTranslations[0]).toMatchObject({
      type: "pat",
      insideLocal: "10.0.1.10",
      insideGlobal: "203.0.113.10",
    });
    expect(success.timeline.some((step) => step.kind === "policy")).toBe(true);
  });
});

function routedServiceTopology(action: "permit" | "deny"): TopologySnapshot {
  const source = configuredEndpoint("10.0.1.10", "10.0.1.1");
  let router = deviceRegistry.create("branch-router");
  setInterface(router, 0, "10.0.1.1", 24);
  setInterface(router, 1, "10.0.2.1", 24);
  const destination = configuredEndpoint("10.0.2.10", "10.0.2.1");
  const config = createDeviceRuntimeConfig(router);
  config.services.acl.enabled = true;
  config.services.acl.accessLists.EDGE = {
    name: "EDGE",
    type: "extended",
    rules: [
      {
        sequence: 10,
        action,
        protocol: "icmp",
        source: "10.0.1.0",
        sourcePrefixLength: 24,
        destination: "10.0.2.0",
        destinationPrefixLength: 24,
        logging: action === "deny",
      },
    ],
  };
  config.services.acl.assignments.push({
    interfaceId: router.interfaces[1]!.id,
    direction: "out",
    aclName: "EDGE",
  });
  config.services.nat.enabled = true;
  config.services.nat.rules.push({
    id: "internet-pat",
    order: 10,
    enabled: true,
    type: "pat",
    source: "10.0.1.0",
    sourcePrefixLength: 24,
    destination: "0.0.0.0",
    destinationPrefixLength: 0,
    translatedAddress: "203.0.113.10",
    insideInterfaceId: router.interfaces[0]!.id,
    outsideInterfaceId: router.interfaces[1]!.id,
    protocol: "ip",
  });
  router = applyRuntimeConfig(router, config);
  return {
    devices: [source, router, destination],
    connections: [link(source, 0, router, 0), link(router, 1, destination, 0)],
    groups: [],
  };
}

function configuredEndpoint(ipv4: string, defaultGateway: string): NetworkDevice {
  const device = deviceRegistry.create("pc");
  setInterface(device, 0, ipv4, 24, defaultGateway);
  return applyRuntimeConfig(device, createDeviceRuntimeConfig(device));
}

function setInterface(
  device: NetworkDevice,
  index: number,
  ipv4: string,
  prefixLength: number,
  defaultGateway?: string,
): void {
  device.interfaces[index] = {
    ...device.interfaces[index]!,
    ipv4,
    prefixLength,
    defaultGateway,
    status: "up",
  };
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
