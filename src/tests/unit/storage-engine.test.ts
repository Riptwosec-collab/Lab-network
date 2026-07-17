import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/data/demo-topology";
import { labs } from "@/data/labs";
import { applyRuntimeConfig, validateRuntimeConfig } from "@/domain/configuration/configuration-engine";
import { TopologyLabValidator } from "@/domain/labs/lab-validator";
import { StorageSimulationEngine } from "@/engine/storage/storage-engine";
import type { DeviceRuntimeConfig, NetworkDevice, TopologySnapshot } from "@/types/network";

describe("storage simulation engine", () => {
  it.each([
    ["raid0", 8_000],
    ["raid1", 2_000],
    ["raid5", 6_000],
    ["raid6", 4_000],
    ["raid10", 4_000],
  ] as const)("calculates %s usable capacity", (raidLevel, expectedCapacityGb) => {
    let topology = demoTopology();
    let nas = storageDevice(topology);
    const config = runtimeConfig(nas);
    config.storage.pools.primary!.raidLevel = raidLevel;
    nas = applyRuntimeConfig(nas, config);
    topology = replaceDevice(topology, nas);
    expect(new StorageSimulationEngine(topology).analyzePool(nas.id, "primary")?.usableCapacityGb).toBe(
      expectedCapacityGb,
    );
  });

  it("rejects a pool below the RAID minimum disk count", () => {
    const topology = demoTopology();
    const nas = storageDevice(topology);
    const config = runtimeConfig(nas);
    config.storage.pools.primary!.raidLevel = "raid6";
    config.storage.pools.primary!.diskIds = config.storage.pools.primary!.diskIds.slice(0, 3);
    expect(validateRuntimeConfig(nas, config)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: "storage.pools.primary.diskIds", message: "RAID6 requires at least 4 disks" }),
      ]),
    });
  });

  it("calculates RAID capacity, fault tolerance and real degraded/failed state", () => {
    const topology = demoTopology();
    const nas = storageDevice(topology);
    const engine = new StorageSimulationEngine(topology);
    expect(engine.analyzePool(nas.id, "primary")).toMatchObject({
      raidLevel: "raid5",
      rawCapacityGb: 8_000,
      usableCapacityGb: 6_000,
      faultTolerance: 1,
      state: "healthy",
    });

    let config = runtimeConfig(nas);
    config.storage = engine.failDisk(config.storage, "disk-1");
    let nextNas = applyRuntimeConfig(nas, config);
    let nextTopology = replaceDevice(topology, nextNas);
    expect(new StorageSimulationEngine(nextTopology).analyzePool(nextNas.id, "primary")).toMatchObject({
      failedDisks: 1,
      state: "degraded",
    });

    config = runtimeConfig(nextNas);
    config.storage = engine.failDisk(config.storage, "disk-2");
    nextNas = applyRuntimeConfig(nextNas, config);
    nextTopology = replaceDevice(nextTopology, nextNas);
    expect(new StorageSimulationEngine(nextTopology).analyzePool(nextNas.id, "primary")).toMatchObject({
      failedDisks: 2,
      state: "failed",
    });
  });

  it("rebuilds a failed disk and returns the pool to healthy state", () => {
    let topology = demoTopology();
    let nas = storageDevice(topology);
    let engine = new StorageSimulationEngine(topology);
    const config = runtimeConfig(nas);
    config.storage = engine.failDisk(config.storage, "disk-1");
    config.storage = engine.startRebuild(config.storage, "primary", "disk-1");
    for (let index = 0; index < 4; index += 1) config.storage = engine.advanceRebuild(config.storage, "primary", 25);
    nas = applyRuntimeConfig(nas, config);
    topology = replaceDevice(topology, nas);
    engine = new StorageSimulationEngine(topology);
    expect(config.storage.disks["disk-1"]).toMatchObject({ status: "healthy", healthPercent: 100 });
    expect(engine.analyzePool(nas.id, "primary")).toMatchObject({ state: "healthy", rebuildProgress: 0 });
  });

  it("requires network reachability, authentication and permission before opening a session", () => {
    const topology = demoTopology();
    const nas = storageDevice(topology);
    const client = topology.devices.find((device) => device.type === "pc")!;
    const engine = new StorageSimulationEngine(topology);
    const base = {
      clientDeviceId: client.id,
      storageDeviceId: nas.id,
      shareId: "public",
      username: "student",
      password: "netlab123",
      protocol: "smb" as const,
      operation: "read" as const,
    };
    expect(engine.access(base)).toMatchObject({ success: true, code: "CONNECTED", session: { state: "connected" } });
    expect(engine.access({ ...base, password: "wrong" })).toMatchObject({
      success: false,
      code: "AUTHENTICATION_FAILED",
    });

    const disconnected = {
      ...topology,
      connections: topology.connections.map((connection) => ({ ...connection, status: "down" as const })),
    };
    expect(new StorageSimulationEngine(disconnected).access(base)).toMatchObject({
      success: false,
      code: "NETWORK_DOWN",
    });
  });

  it("enforces write permission, quota and usable pool capacity", () => {
    let topology = demoTopology();
    let nas = storageDevice(topology);
    const client = topology.devices.find((device) => device.type === "pc")!;
    const request = {
      clientDeviceId: client.id,
      storageDeviceId: nas.id,
      shareId: "public",
      username: "student",
      password: "netlab123",
      protocol: "smb" as const,
      operation: "write" as const,
      sizeGb: 100,
    };
    const success = new StorageSimulationEngine(topology).access(request);
    expect(success).toMatchObject({ success: true, code: "CONNECTED" });
    expect(success.nextStorage?.shares.public?.usedCapacityGb).toBe(100);

    const config = runtimeConfig(nas);
    config.storage.shares.public!.permissions = [{ principalType: "user", principal: "student", access: "deny" }];
    nas = applyRuntimeConfig(nas, config);
    topology = replaceDevice(topology, nas);
    expect(new StorageSimulationEngine(topology).access(request)).toMatchObject({
      success: false,
      code: "PERMISSION_DENIED",
    });

    config.storage.shares.public!.permissions = [{ principalType: "user", principal: "student", access: "write" }];
    config.storage.shares.public!.quotaGb = 50;
    nas = applyRuntimeConfig(nas, config);
    topology = replaceDevice(topology, nas);
    expect(new StorageSimulationEngine(topology).access(request)).toMatchObject({
      success: false,
      code: "QUOTA_EXCEEDED",
    });
  });

  it("validates the NAS lab through real IP and share access state", async () => {
    const project = createDemoProject();
    const topology = { devices: project.devices, connections: project.connections, groups: project.groups };
    const results = await new TopologyLabValidator(topology, project.configurationState).validate(
      labs.find((lab) => lab.id === "nas-sharing")!,
    );
    expect(results.map((result) => result.status)).toEqual(["passed", "passed"]);
  });
});

function demoTopology(): TopologySnapshot {
  const project = createDemoProject();
  return { devices: project.devices, connections: project.connections, groups: project.groups };
}

function storageDevice(topology: TopologySnapshot): NetworkDevice {
  return topology.devices.find((device) => device.category === "storage")!;
}

function runtimeConfig(device: NetworkDevice): DeviceRuntimeConfig {
  return structuredClone(device.configuration.runtimeConfig as DeviceRuntimeConfig);
}

function replaceDevice(topology: TopologySnapshot, device: NetworkDevice): TopologySnapshot {
  return { ...topology, devices: topology.devices.map((item) => (item.id === device.id ? device : item)) };
}
