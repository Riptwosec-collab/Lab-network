import { describe, expect, it } from "vitest";

import { deviceRegistry } from "@/data/device-catalog";
import { createDeviceRuntimeConfig } from "@/domain/configuration/configuration-engine";
import { buildConfigurationInsights, searchConfiguration } from "@/domain/configuration/configuration-insights";

describe("configuration insights", () => {
  it("builds searchable config rows from real running config values", () => {
    const device = deviceRegistry.create("branch-router");
    const config = createDeviceRuntimeConfig(device);
    config.system.hostname = "EDGE-01";
    config.interfaces[device.interfaces[0]!.id]!.ipv4 = "10.10.10.1";
    config.interfaces[device.interfaces[0]!.id]!.prefixLength = 24;

    const insights = buildConfigurationInsights(device, config);

    expect(searchConfiguration(insights, "EDGE-01")).toContainEqual(
      expect.objectContaining({ path: "system.hostname", value: "EDGE-01" }),
    );
    expect(searchConfiguration(insights, "10.10.10.1")).toHaveLength(1);
  });

  it("creates dependency edges for VLAN, OSPF, NAT, ACL, HA and monitoring config", () => {
    const device = deviceRegistry.create("layer-3-switch");
    const config = createDeviceRuntimeConfig(device);
    const firstInterfaceId = device.interfaces[0]!.id;
    config.interfaces[firstInterfaceId]!.switchport!.mode = "trunk";
    config.interfaces[firstInterfaceId]!.switchport!.allowedVlans = [10, 20];
    config.interfaces[firstInterfaceId]!.ipv4 = "10.0.0.1";
    config.interfaces[firstInterfaceId]!.prefixLength = 24;
    config.routing.ospf.enabled = true;
    config.routing.ospf.networks = [{ id: "ospf-1", network: "10.0.0.0", prefixLength: 24, areaId: "0", cost: 10 }];
    config.services.nat.enabled = true;
    config.services.nat.rules.push({
      id: "nat-1",
      order: 10,
      enabled: true,
      type: "static",
      source: "10.0.0.0",
      sourcePrefixLength: 24,
      destination: "0.0.0.0",
      destinationPrefixLength: 0,
      translatedAddress: "203.0.113.5",
      insideInterfaceId: firstInterfaceId,
    });
    config.services.acl.assignments.push({ interfaceId: firstInterfaceId, direction: "in", aclName: "EDGE-IN" });
    config.operations.highAvailability = {
      enabled: true,
      protocol: "hsrp",
      groupId: 10,
      virtualIp: "10.0.0.254",
      priority: 110,
      preempt: true,
      trackedInterfaceIds: [firstInterfaceId],
      trackingDecrement: 20,
    };
    config.operations.monitoring.monitoredInterfaceIds = [firstInterfaceId];

    const edges = buildConfigurationInsights(device, config).dependencyEdges;

    expect(edges).toContainEqual(expect.objectContaining({ from: `interface:${firstInterfaceId}`, to: "vlan:10" }));
    expect(edges).toContainEqual(expect.objectContaining({ from: "ospf:1", to: "10.0.0.0/24" }));
    expect(edges).toContainEqual(expect.objectContaining({ from: "nat:nat-1", to: `interface:${firstInterfaceId}` }));
    expect(edges).toContainEqual(expect.objectContaining({ from: "acl:EDGE-IN", kind: "protects" }));
    expect(edges).toContainEqual(expect.objectContaining({ from: "ha:10", kind: "depends-on" }));
    expect(edges).toContainEqual(expect.objectContaining({ from: "monitoring", kind: "monitors" }));
  });
});
