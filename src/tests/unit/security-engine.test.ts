import { describe, expect, it } from "vitest";

import { deviceRegistry } from "@/data/device-catalog";
import { applyRuntimeConfig, createDeviceRuntimeConfig } from "@/domain/configuration/configuration-engine";
import { IPv4PingEngine } from "@/engine/protocols/ping-engine";
import { SecuritySimulationEngine } from "@/engine/protocols/security-engine";
import type { NetworkConnection, NetworkDevice, TopologySnapshot } from "@/types/network";

describe("security simulation engine", () => {
  it("enforces first-match firewall policy and permits return traffic through a stateful session", () => {
    const allowed = firewallTopology(true);
    const success = new IPv4PingEngine(allowed).ping({
      sourceDeviceId: allowed.devices[0]!.id,
      destinationIp: "10.0.2.10",
    });
    expect(success.success).toBe(true);
    expect(success.firewall?.decisions[0]).toMatchObject({
      policyName: "TRUST-OUT",
      permitted: true,
      sessionMatch: false,
    });
    expect(success.returnFirewall?.decisions[0]).toMatchObject({ permitted: true, sessionMatch: true });

    const denied = firewallTopology(false);
    const failure = new IPv4PingEngine(denied).ping({
      sourceDeviceId: denied.devices[0]!.id,
      destinationIp: "10.0.2.10",
    });
    expect(failure).toMatchObject({ success: false, failureCode: "FIREWALL_DENY" });
    expect(failure.firewall?.reason).toContain("Implicit deny");
  });

  it("negotiates matching IPSec peers and reports authentication failure", () => {
    const { topology, left, right } = vpnTopology("shared-key", "shared-key");
    expect(new SecuritySimulationEngine(topology).negotiateVpn(left.id, "SITE")).toMatchObject({
      success: true,
      state: "up",
      reason: "ESTABLISHED",
      remoteDeviceId: right.id,
    });
    const mismatch = vpnTopology("left-key", "right-key");
    expect(new SecuritySimulationEngine(mismatch.topology).negotiateVpn(mismatch.left.id, "SITE")).toMatchObject({
      success: false,
      reason: "AUTHENTICATION_FAILED",
    });
  });

  it("associates WPA clients only with the correct SSID password", () => {
    const actualAp = deviceRegistry.create("access-point");
    const config = createDeviceRuntimeConfig(actualAp);
    const configuredAp = applyRuntimeConfig(actualAp, config);
    const client = deviceRegistry.create("laptop");
    const topology = {
      devices: [configuredAp, client],
      connections: [link(configuredAp, 1, client, 0, "wireless")],
      groups: [],
    };
    const engine = new SecuritySimulationEngine(topology);
    const ssid = Object.values(config.security.wireless.ssids)[0]!.name;
    expect(engine.associateWireless(client.id, configuredAp.id, ssid, { password: "wrong" })).toMatchObject({
      success: false,
      code: "AUTHENTICATION_FAILED",
    });
    expect(engine.associateWireless(client.id, configuredAp.id, ssid, { password: "netlab-demo" })).toMatchObject({
      success: true,
      association: { authenticatedBy: "psk", vlanId: 1 },
    });
  });

  it("uses RADIUS Access-Accept and dynamic VLAN for enterprise wireless", () => {
    let ap = deviceRegistry.create("access-point");
    let radius = deviceRegistry.create("radius-server");
    const client = deviceRegistry.create("laptop");
    setInterface(radius, 0, "192.168.70.20", 24);
    const radiusConfig = createDeviceRuntimeConfig(radius);
    radiusConfig.security.radius = {
      enabled: true,
      port: 1812,
      sharedSecret: "radius-secret",
      users: { student: { username: "student", password: "correct-password", vlanId: 30, enabled: true } },
      clients: [{ deviceId: ap.id, secret: "radius-secret" }],
    };
    radius = applyRuntimeConfig(radius, radiusConfig);
    const apConfig = createDeviceRuntimeConfig(ap);
    const ssid = Object.values(apConfig.security.wireless.ssids)[0]!;
    ssid.securityMode = "wpa2-enterprise";
    ssid.preSharedKey = undefined;
    ssid.radiusServer = "192.168.70.20";
    ssid.radiusSecret = "radius-secret";
    ap = applyRuntimeConfig(ap, apConfig);
    const engine = new SecuritySimulationEngine({
      devices: [ap, radius, client],
      connections: [link(ap, 1, client, 0, "wireless")],
      groups: [],
    });
    expect(
      engine.associateWireless(client.id, ap.id, ssid.name, { username: "student", password: "correct-password" }),
    ).toMatchObject({ success: true, association: { authenticatedBy: "radius", vlanId: 30 } });
  });
});

function firewallTopology(allow: boolean): TopologySnapshot {
  const source = endpoint("10.0.1.10", "10.0.1.1");
  let firewall = deviceRegistry.create("firewall");
  setInterface(firewall, 0, "10.0.1.1", 24);
  setInterface(firewall, 1, "10.0.2.1", 24);
  const destination = endpoint("10.0.2.10", "10.0.2.1");
  const config = createDeviceRuntimeConfig(firewall);
  config.security.firewall.zones = {
    trust: { name: "trust", interfaceIds: [firewall.interfaces[0]!.id] },
    untrust: { name: "untrust", interfaceIds: [firewall.interfaces[1]!.id] },
  };
  if (allow)
    config.security.firewall.policies.push({
      id: "allow",
      order: 10,
      enabled: true,
      name: "TRUST-OUT",
      sourceZone: "trust",
      destinationZone: "untrust",
      sourceAddress: "any",
      destinationAddress: "any",
      service: "any",
      action: "allow",
      logging: true,
    });
  firewall = applyRuntimeConfig(firewall, config);
  return {
    devices: [source, firewall, destination],
    connections: [link(source, 0, firewall, 0), link(firewall, 1, destination, 0)],
    groups: [],
  };
}

function vpnTopology(leftKey: string, rightKey: string) {
  let left = deviceRegistry.create("branch-router");
  let right = deviceRegistry.create("branch-router");
  setInterface(left, 0, "192.0.2.1", 30);
  setInterface(right, 0, "192.0.2.2", 30);
  const leftConfig = createDeviceRuntimeConfig(left);
  const rightConfig = createDeviceRuntimeConfig(right);
  leftConfig.security.vpn.tunnels.SITE = tunnel("192.0.2.1", "192.0.2.2", "10.1.0.0", "10.2.0.0", leftKey);
  rightConfig.security.vpn.tunnels.SITE = tunnel("192.0.2.2", "192.0.2.1", "10.2.0.0", "10.1.0.0", rightKey);
  left = applyRuntimeConfig(left, leftConfig);
  right = applyRuntimeConfig(right, rightConfig);
  return { topology: { devices: [left, right], connections: [link(left, 0, right, 0)], groups: [] }, left, right };
}

function tunnel(
  localPeer: string,
  remotePeer: string,
  localNetwork: string,
  remoteNetwork: string,
  preSharedKey: string,
) {
  return {
    id: "SITE",
    name: "SITE",
    type: "site-to-site" as const,
    enabled: true,
    localPeer,
    remotePeer,
    localNetwork,
    localPrefixLength: 24,
    remoteNetwork,
    remotePrefixLength: 24,
    preSharedKey,
    encryption: "aes256" as const,
    hash: "sha256" as const,
    ikeVersion: "ikev2" as const,
    lifetimeSeconds: 3600,
    routeThroughTunnel: true,
  };
}
function endpoint(ipv4: string, defaultGateway: string) {
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
) {
  device.interfaces[index] = { ...device.interfaces[index]!, ipv4, prefixLength, defaultGateway, status: "up" };
}
function link(
  source: NetworkDevice,
  sourcePort: number,
  target: NetworkDevice,
  targetPort: number,
  cableType: "copper" | "wireless" = "copper",
): NetworkConnection {
  return {
    id: crypto.randomUUID(),
    sourceDeviceId: source.id,
    sourceInterfaceId: source.interfaces[sourcePort]!.id,
    targetDeviceId: target.id,
    targetInterfaceId: target.interfaces[targetPort]!.id,
    cableType,
    status: "up",
    bandwidthMbps: 1000,
    latencyMs: 1,
    jitterMs: 0,
    packetLossPercent: 0,
    duplex: "full",
    mtu: 1500,
    protocol: cableType === "wireless" ? "802.11" : "ethernet",
    direction: "bidirectional",
    pathStyle: cableType === "wireless" ? "wireless" : "physical",
    createdAt: new Date().toISOString(),
  };
}
