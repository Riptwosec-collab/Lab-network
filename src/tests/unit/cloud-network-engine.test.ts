import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/data/demo-topology";
import { labs } from "@/data/labs";
import { validateRuntimeConfig } from "@/domain/configuration/configuration-engine";
import { TopologyLabValidator } from "@/domain/labs/lab-validator";
import { CloudNetworkEngine } from "@/engine/cloud/cloud-network-engine";
import type { CloudRuntimeConfig, DeviceRuntimeConfig, NetworkDevice } from "@/types/network";

describe("cloud network engine", () => {
  it("routes a public VM to the Internet through an Internet Gateway", () => {
    const result = new CloudNetworkEngine(cloudConfig()).simulate({
      sourceResourceId: "vm-public",
      destination: "internet",
      protocol: "tcp",
      port: 443,
    });
    expect(result).toMatchObject({
      success: true,
      code: "REACHABLE",
      translatedSourceIp: "203.0.113.10",
      route: { targetType: "internet-gateway", targetResourceId: "igw-main" },
    });
  });

  it("routes a private VM to the Internet only through NAT", () => {
    const result = new CloudNetworkEngine(cloudConfig()).simulate({
      sourceResourceId: "vm-private",
      destination: "internet",
      protocol: "tcp",
      port: 443,
    });
    expect(result).toMatchObject({
      success: true,
      code: "REACHABLE",
      translatedSourceIp: "198.51.100.20",
      route: { targetType: "nat-gateway", targetResourceId: "nat-main" },
    });
  });

  it("rejects a missing route and direct private-subnet Internet access", () => {
    const cloud = cloudConfig();
    cloud.resources["rt-private"]!.configuration.routes = cloud.resources["rt-private"]!.configuration.routes?.filter(
      (route) => route.destinationCidr !== "0.0.0.0/0",
    );
    expect(simulatePrivateInternet(cloud)).toMatchObject({ success: false, code: "MISSING_ROUTE" });

    cloud.resources["rt-private"]!.configuration.routes?.push({
      id: "direct-internet",
      destinationCidr: "0.0.0.0/0",
      targetType: "internet-gateway",
      targetResourceId: "igw-main",
      enabled: true,
    });
    expect(simulatePrivateInternet(cloud)).toMatchObject({
      success: false,
      code: "PRIVATE_SUBNET_DIRECT_INTERNET",
    });
  });

  it("applies stateful Security Group outbound policy", () => {
    const cloud = cloudConfig();
    const outbound = cloud.resources["sg-web"]!.configuration.rules!.find((rule) => rule.id === "sg-out-all")!;
    outbound.action = "deny";
    expect(simulatePrivateInternet(cloud)).toMatchObject({ success: false, code: "SECURITY_GROUP_BLOCK" });
  });

  it("applies ordered stateless Network ACL policy", () => {
    const cloud = cloudConfig();
    const outbound = cloud.resources["acl-main"]!.configuration.rules!.find((rule) => rule.id === "acl-out")!;
    outbound.action = "deny";
    expect(simulatePrivateInternet(cloud)).toMatchObject({ success: false, code: "NETWORK_ACL_BLOCK" });
  });

  it("routes cross-network traffic through active VPC peering", () => {
    const cloud = cloudConfig();
    addRemoteVm(cloud, "10.30.0.0/16", "10.30.1.10");
    cloud.resources["peering-main"] = {
      id: "peering-main",
      name: "Peer Network",
      type: "vpc-peering",
      region: "generic-1",
      networkId: "network-main",
      tags: {},
      status: "available",
      configuration: { targetNetworkId: "network-peer", targetCidr: "10.30.0.0/16" },
    };
    cloud.resources["rt-private"]!.configuration.routes!.push({
      id: "peer-route",
      destinationCidr: "10.30.0.0/16",
      targetType: "vpc-peering",
      targetResourceId: "peering-main",
      enabled: true,
    });
    expect(
      new CloudNetworkEngine(cloud).simulate({
        sourceResourceId: "vm-private",
        destination: "vm-peer",
        protocol: "tcp",
        port: 443,
      }),
    ).toMatchObject({ success: true, route: { targetType: "vpc-peering" } });
  });

  it("supports the site-to-site VPN routing framework", () => {
    const cloud = cloudConfig();
    addRemoteVm(cloud, "172.16.0.0/16", "172.16.1.10");
    cloud.resources["rt-private"]!.configuration.routes!.push({
      id: "vpn-route",
      destinationCidr: "172.16.0.0/16",
      targetType: "vpn-gateway",
      targetResourceId: "vpn-main",
      enabled: true,
    });
    expect(
      new CloudNetworkEngine(cloud).simulate({
        sourceResourceId: "vm-private",
        destination: "vm-peer",
        protocol: "tcp",
        port: 443,
      }),
    ).toMatchObject({ success: true, route: { targetType: "vpn-gateway" } });
  });

  it("rejects overlapping peering CIDRs during configuration validation", () => {
    const device = cloudDevice();
    const runtime = structuredClone(device.configuration.runtimeConfig as DeviceRuntimeConfig);
    runtime.cloud.resources["peering-overlap"] = {
      id: "peering-overlap",
      name: "Overlapping Peer",
      type: "vpc-peering",
      region: "generic-1",
      networkId: "network-main",
      tags: {},
      status: "available",
      configuration: { targetNetworkId: "network-overlap", targetCidr: "10.20.128.0/17" },
    };
    expect(validateRuntimeConfig(device, runtime)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: "cloud.resources.peering-overlap.configuration.targetCidr",
          message: "Peering CIDR overlaps the local cloud network",
        }),
      ]),
    });
  });

  it("validates the cloud networking lab from live route and policy state", async () => {
    const project = createDemoProject();
    const topology = { devices: project.devices, connections: project.connections, groups: project.groups };
    const results = await new TopologyLabValidator(topology, project.configurationState).validate(
      labs.find((lab) => lab.id === "cloud-networking")!,
    );
    expect(results.map((result) => result.status)).toEqual(["passed", "passed", "passed"]);
  });
});

function cloudDevice(): NetworkDevice {
  return createDemoProject().devices.find((device) => device.category === "cloud")!;
}

function cloudConfig(): CloudRuntimeConfig {
  return structuredClone((cloudDevice().configuration.runtimeConfig as DeviceRuntimeConfig).cloud);
}

function simulatePrivateInternet(cloud: CloudRuntimeConfig) {
  return new CloudNetworkEngine(cloud).simulate({
    sourceResourceId: "vm-private",
    destination: "internet",
    protocol: "tcp",
    port: 443,
  });
}

function addRemoteVm(cloud: CloudRuntimeConfig, networkCidr: string, privateIp: string) {
  cloud.resources["network-peer"] = {
    id: "network-peer",
    name: "Remote Network",
    type: "cloud-network",
    region: "generic-2",
    tags: {},
    status: "available",
    configuration: { cidr: networkCidr },
  };
  cloud.resources["subnet-peer"] = {
    id: "subnet-peer",
    name: "Remote Private Subnet",
    type: "private-subnet",
    region: "generic-2",
    networkId: "network-peer",
    tags: {},
    status: "available",
    configuration: {
      cidr: networkCidr.replace(".0.0/16", ".1.0/24"),
      networkAclId: "acl-main",
      routeTableId: "rt-private",
    },
  };
  cloud.resources["vm-peer"] = {
    id: "vm-peer",
    name: "Remote VM",
    type: "virtual-machine",
    region: "generic-2",
    networkId: "network-peer",
    subnetId: "subnet-peer",
    tags: {},
    status: "available",
    configuration: { privateIp, securityGroupIds: ["sg-web"] },
  };
}
