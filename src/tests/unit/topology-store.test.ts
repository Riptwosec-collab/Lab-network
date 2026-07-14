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

  it("prevents assigning a physical interface to more than one link", () => {
    const first = deviceRegistry.create("pc");
    const second = deviceRegistry.create("layer-2-switch");
    const third = deviceRegistry.create("printer");
    useTopologyStore.getState().replaceTopology({ devices: [first, second, third], connections: [], groups: [] });
    const createConnection = (targetDeviceId: string, targetInterfaceId: string) => ({
      id: crypto.randomUUID(),
      sourceDeviceId: first.id,
      sourceInterfaceId: first.interfaces[0]!.id,
      targetDeviceId,
      targetInterfaceId,
      cableType: "copper" as const,
      status: "up" as const,
      bandwidthMbps: 1000,
      latencyMs: 1,
      jitterMs: 0,
      packetLossPercent: 0,
      duplex: "full" as const,
      mtu: 1500,
      protocol: "ethernet",
      direction: "bidirectional" as const,
      pathStyle: "physical" as const,
      createdAt: new Date().toISOString(),
    });
    useTopologyStore.getState().addConnection(createConnection(second.id, second.interfaces[0]!.id));
    expect(() =>
      useTopologyStore.getState().addConnection(createConnection(third.id, third.interfaces[0]!.id)),
    ).toThrow("already connected");
  });
});
