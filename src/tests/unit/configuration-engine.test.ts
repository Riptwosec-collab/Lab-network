import { beforeEach, describe, expect, it } from "vitest";

import { executeCliCommand, type CliContext } from "@/domain/configuration/cli-engine";
import {
  applyConfiguration,
  createDeviceConfigurationState,
  diffConfiguration,
  saveStartupConfig,
} from "@/domain/configuration/configuration-engine";
import { createDemoProject } from "@/data/demo-topology";
import { IPv4PingEngine } from "@/engine/protocols/ping-engine";
import { applyDeviceConfiguration } from "@/services/configuration-service";
import { useConfigurationStore } from "@/stores/configuration-store";
import { useProjectStore } from "@/stores/project-store";
import { useTopologyStore } from "@/stores/topology-store";

describe("configuration engine", () => {
  it("applies a validated hostname and interface configuration as a revision", () => {
    const project = createDemoProject();
    const device = project.devices.find((item) => item.type === "pc")!;
    const state = createDeviceConfigurationState(device);
    const candidate = structuredClone(state.runningConfig);
    candidate.system.hostname = "PC-SALES-01";
    candidate.interfaces[device.interfaces[0]!.id]!.enabled = false;
    const result = applyConfiguration(state, device, candidate, "form");
    expect(result.nextState.validationResult.valid).toBe(true);
    expect(result.nextState.revisions).toHaveLength(1);
    expect(result.nextDevice.hostname).toBe("PC-SALES-01");
    expect(result.nextDevice.interfaces[0]!.status).toBe("administratively-down");
  });

  it("rejects a broadcast IPv4 without changing running config", () => {
    const project = createDemoProject();
    const device = project.devices.find((item) => item.type === "pc")!;
    const state = createDeviceConfigurationState(device);
    const candidate = structuredClone(state.runningConfig);
    const interfaceId = device.interfaces[0]!.id;
    candidate.interfaces[interfaceId] = {
      ...candidate.interfaces[interfaceId]!,
      ipv4: "192.168.1.255",
      prefixLength: 24,
    };
    const result = applyConfiguration(state, device, candidate, "raw");
    expect(result.nextState.status).toBe("invalid");
    expect(result.nextState.runningConfig).toEqual(state.runningConfig);
    expect(result.nextState.validationResult.issues[0]?.path).toContain("ipv4");
  });

  it("rejects malformed hostnames, gateways and incomplete interface maps", () => {
    const device = createDemoProject().devices.find((item) => item.type === "firewall")!;
    const state = createDeviceConfigurationState(device);
    const candidate = structuredClone(state.runningConfig);
    candidate.system.hostname = "invalid hostname";
    const interfaceId = device.interfaces[0]!.id;
    candidate.interfaces[interfaceId]!.defaultGateway = "999.1.1.1";
    delete candidate.interfaces[device.interfaces[1]!.id];
    const result = applyConfiguration(state, device, candidate, "raw");
    expect(result.nextState.validationResult.valid).toBe(false);
    expect(result.nextState.validationResult.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "system.hostname",
        `interfaces.${interfaceId}.defaultGateway`,
        `interfaces.${device.interfaces[1]!.id}`,
      ]),
    );
  });

  it("saves running config independently as startup config", () => {
    const project = createDemoProject();
    const device = project.devices[0]!;
    const state = createDeviceConfigurationState(device);
    const candidate = structuredClone(state.runningConfig);
    candidate.system.hostname = "EDGE-01";
    const applied = applyConfiguration(state, device, candidate, "cli").nextState;
    expect(applied.startupConfig.system.hostname).not.toBe("EDGE-01");
    expect(saveStartupConfig(applied).startupConfig.system.hostname).toBe("EDGE-01");
  });

  it("produces a deterministic configuration diff", () => {
    const device = createDemoProject().devices[0]!;
    const state = createDeviceConfigurationState(device);
    const next = structuredClone(state.runningConfig);
    next.system.hostname = "WAN-EDGE";
    expect(diffConfiguration(state.runningConfig, next)).toContain(`system.hostname: ${device.hostname} -> WAN-EDGE`);
  });
});

describe("structured CLI engine", () => {
  it("changes mode and converts interface commands into runtime config", () => {
    const device = createDemoProject().devices.find((item) => item.type === "pc")!;
    const state = createDeviceConfigurationState(device);
    let context: CliContext = { mode: "user" };
    context = executeCliCommand("enable", context, device, state).context;
    context = executeCliCommand("configure terminal", context, device, state).context;
    context = executeCliCommand(`interface ${device.interfaces[0]!.name}`, context, device, state).context;
    const shutdown = executeCliCommand("shutdown", context, device, state);
    expect(shutdown.action).toBe("apply");
    expect(shutdown.nextConfig?.interfaces[device.interfaces[0]!.id]?.enabled).toBe(false);
    const address = executeCliCommand("ip address 10.10.10.2 255.255.255.0", context, device, state);
    expect(address.nextConfig?.interfaces[device.interfaces[0]!.id]).toMatchObject({
      ipv4: "10.10.10.2",
      prefixLength: 24,
    });
  });
});

describe("configuration integration", () => {
  beforeEach(() => {
    const project = createDemoProject();
    useTopologyStore.getState().replaceTopology(project);
    useConfigurationStore.getState().hydrate(project.configurationState, project.devices);
    useProjectStore.getState().setCurrentProject(project);
  });

  it("shutdown makes Ping fail and no shutdown restores reachability", () => {
    const topology = useTopologyStore.getState();
    const pc = topology.devices.find((item) => item.type === "pc")!;
    const nas = topology.devices.find((item) => item.type === "nas")!;
    const state = useConfigurationStore.getState().configurationState.devices[pc.id]!;
    const shutdown = structuredClone(state.runningConfig);
    shutdown.interfaces[pc.interfaces[0]!.id]!.enabled = false;
    expect(applyDeviceConfiguration(pc.id, shutdown, "form").applied).toBe(true);
    let snapshot = useTopologyStore.getState();
    expect(
      new IPv4PingEngine(snapshot).ping({ sourceDeviceId: pc.id, destinationIp: nas.interfaces[0]!.ipv4! }).success,
    ).toBe(false);

    const current = useConfigurationStore.getState().configurationState.devices[pc.id]!;
    const enabled = structuredClone(current.runningConfig);
    enabled.interfaces[pc.interfaces[0]!.id]!.enabled = true;
    expect(applyDeviceConfiguration(pc.id, enabled, "cli").applied).toBe(true);
    snapshot = useTopologyStore.getState();
    expect(
      new IPv4PingEngine(snapshot).ping({ sourceDeviceId: pc.id, destinationIp: nas.interfaces[0]!.ipv4! }).success,
    ).toBe(true);
  });
});
