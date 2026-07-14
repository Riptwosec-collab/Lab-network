import { beforeEach, describe, expect, it } from "vitest";

import { deviceRegistry } from "@/data/device-catalog";
import { createDemoProject } from "@/data/demo-topology";
import { useHistoryStore } from "@/stores/history-store";
import { useTopologyStore } from "@/stores/topology-store";

describe("topology store", () => {
  beforeEach(() => {
    useTopologyStore.getState().replaceTopology({ devices: [], connections: [], groups: [] });
    useHistoryStore.getState().clear();
  });

  it("adds and removes devices", () => {
    const device = deviceRegistry.create("pc");
    useTopologyStore.getState().addDevice(device);
    expect(useTopologyStore.getState().devices).toHaveLength(1);
    useTopologyStore.getState().removeDevice(device.id);
    expect(useTopologyStore.getState().devices).toHaveLength(0);
  });

  it("supports undo and redo", () => {
    useTopologyStore.getState().addDevice(deviceRegistry.create("pc"));
    useTopologyStore.getState().undo();
    expect(useTopologyStore.getState().devices).toHaveLength(0);
    useTopologyStore.getState().redo();
    expect(useTopologyStore.getState().devices).toHaveLength(1);
  });

  it("adds a validated connection between known devices", () => {
    const project = createDemoProject();
    useTopologyStore.getState().replaceTopology({ devices: project.devices, connections: [], groups: [] });
    useTopologyStore.getState().addConnection(project.connections[0]!);
    expect(useTopologyStore.getState().connections).toHaveLength(1);
  });
});
