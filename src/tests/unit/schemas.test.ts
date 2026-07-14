import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/data/demo-topology";
import { deviceRegistry } from "@/data/device-catalog";
import { connectionSchema, deviceSchema, projectSchema } from "@/schemas/network.schema";

describe("network schemas", () => {
  it("validates a device produced by the registry", () => {
    expect(deviceSchema.parse(deviceRegistry.create("branch-router", { x: 0, y: 0 })).type).toBe("branch-router");
  });

  it("validates the complete demo project", () => {
    const project = createDemoProject();
    expect(projectSchema.parse(project).devices).toHaveLength(7);
  });

  it("rejects a connection that loops to the same device", () => {
    const project = createDemoProject();
    const connection = { ...project.connections[0]!, targetDeviceId: project.connections[0]!.sourceDeviceId };
    expect(connectionSchema.safeParse(connection).success).toBe(false);
  });
});
