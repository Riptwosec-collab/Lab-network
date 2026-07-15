import { describe, expect, it } from "vitest";

import { deviceCatalog, deviceRegistry } from "@/data/device-catalog";
import { canUseCable } from "@/domain/interfaces/port-compatibility";
import { createDemoProject } from "@/data/demo-topology";
import { projectSchema } from "@/schemas/network.schema";
import { migrateProject } from "@/services/project-migrations";

describe("device foundation", () => {
  it("keeps a data-driven catalog with broad category coverage and multilingual search", () => {
    expect(deviceCatalog.length).toBeGreaterThanOrEqual(80);
    expect(deviceRegistry.search("เราเตอร์บ้าน").map((device) => device.type)).toContain("home-router");
    expect(deviceRegistry.search("VXLAN").map((device) => device.type)).toContain("leaf-switch");
    expect(deviceRegistry.search("Cisco-style").map((device) => device.type)).toContain("isr-1000");
  });

  it("creates distinct models with independent interface collections", () => {
    const access = deviceRegistry.create("layer-2-switch");
    const core = deviceRegistry.create("core-router");
    expect(access.interfaces).toHaveLength(8);
    expect(core.interfaces.some((networkInterface) => networkInterface.type === "10-gigabit-ethernet")).toBe(true);
    expect(access.interfaces[0]?.id).not.toBe(core.interfaces[0]?.id);
  });

  it("validates media and cable compatibility without device-model conditionals", () => {
    const fiber = { type: "fiber" as const, medium: "fiber" as const };
    const copper = { type: "gigabit-ethernet" as const, medium: "copper" as const };
    expect(canUseCable(fiber, fiber, "fiber-single-mode").compatible).toBe(true);
    expect(canUseCable(fiber, copper, "fiber-single-mode").compatible).toBe(false);
    expect(canUseCable(copper, copper, "serial-dce").compatible).toBe(false);
  });

  it("migrates schema-v1 projects without losing topology", () => {
    const demo = createDemoProject();
    const legacy = {
      ...demo,
      schemaVersion: 1,
      connections: demo.connections.map((connection) => {
        const legacyConnection = structuredClone(connection) as Record<string, unknown>;
        ["mtu", "protocol", "direction", "pathStyle"].forEach((key) => delete legacyConnection[key]);
        return legacyConnection;
      }),
    };
    const migrated = projectSchema.parse(migrateProject(legacy));
    expect(migrated.schemaVersion).toBe(5);
    expect(Object.keys(migrated.configurationState.devices)).toHaveLength(demo.devices.length);
    const migratedSwitch = migrated.devices.find((device) => device.category === "switch")!;
    expect(migrated.configurationState.devices[migratedSwitch.id]?.runningConfig.switching?.vlans["1"]).toBeDefined();
    expect(migrated.configurationState.devices[migratedSwitch.id]?.runningConfig.routing.svis).toEqual({});
    expect(migrated.devices).toHaveLength(demo.devices.length);
    expect(migrated.connections[0]).toMatchObject({ mtu: 1500, protocol: "ethernet", direction: "bidirectional" });
  });
});
