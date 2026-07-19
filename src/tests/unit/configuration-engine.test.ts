import { beforeEach, describe, expect, it } from "vitest";

import { executeCliCommand, type CliContext } from "@/domain/configuration/cli-engine";
import {
  applyConfiguration,
  createDeviceConfigurationState,
  diffConfiguration,
  saveStartupConfig,
} from "@/domain/configuration/configuration-engine";
import { createDemoProject } from "@/data/demo-topology";
import { deviceRegistry } from "@/data/device-catalog";
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

  it("rejects overlapping DHCP pools and invalid service addresses", () => {
    const device = deviceRegistry.create("dhcp-server");
    const state = createDeviceConfigurationState(device);
    const candidate = structuredClone(state.runningConfig);
    candidate.services.dhcp.enabled = true;
    candidate.services.dhcp.pools.A = {
      name: "A",
      network: "10.10.0.0",
      prefixLength: 24,
      defaultGateway: "10.10.0.1",
      dnsServers: ["10.10.0.53"],
      leaseSeconds: 3600,
      excludedRanges: [],
      reservations: [],
      relayAddresses: [],
    };
    candidate.services.dhcp.pools.B = {
      ...candidate.services.dhcp.pools.A,
      name: "B",
      network: "10.10.0.128",
      prefixLength: 25,
    };
    const result = applyConfiguration(state, device, candidate, "form");
    expect(result.nextState.validationResult.valid).toBe(false);
    expect(result.nextState.validationResult.issues.some((issue) => issue.message.includes("ซ้อนทับ"))).toBe(true);
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

  it("creates VLANs and configures a real access switchport", () => {
    let device = createDemoProject().devices.find((item) => item.category === "switch")!;
    let state = createDeviceConfigurationState(device);
    let context: CliContext = { mode: "global-config" };
    const vlan = executeCliCommand("vlan 10", context, device, state);
    expect(vlan.action).toBe("apply");
    ({ nextDevice: device, nextState: state } = applyConfiguration(state, device, vlan.nextConfig!, "cli"));
    context = vlan.context;
    const name = executeCliCommand("name USERS", context, device, state);
    ({ nextDevice: device, nextState: state } = applyConfiguration(state, device, name.nextConfig!, "cli"));
    context = executeCliCommand("exit", name.context, device, state).context;
    context = executeCliCommand(`interface ${device.interfaces[0]!.name}`, context, device, state).context;
    const access = executeCliCommand("switchport access vlan 10", context, device, state);
    expect(access.nextConfig?.switching?.vlans["10"]?.name).toBe("USERS");
    expect(access.nextConfig?.interfaces[device.interfaces[0]!.id]?.switchport?.accessVlan).toBe(10);
  });

  it("adds a static default route and configures an SVI", () => {
    const router = createDemoProject().devices.find((item) => item.category === "security")!;
    const routerState = createDeviceConfigurationState(router);
    const defaultRoute = executeCliCommand(
      "ip route 0.0.0.0 0 192.168.1.254",
      { mode: "global-config" },
      router,
      routerState,
    );
    expect(defaultRoute.nextConfig?.routing.staticRoutes[0]).toMatchObject({
      destination: "0.0.0.0",
      prefixLength: 0,
      nextHop: "192.168.1.254",
    });

    let layer3Switch = deviceRegistry.create("layer-3-switch");
    let switchState = createDeviceConfigurationState(layer3Switch);
    const vlan = executeCliCommand("vlan 10", { mode: "global-config" }, layer3Switch, switchState);
    ({ nextDevice: layer3Switch, nextState: switchState } = applyConfiguration(
      switchState,
      layer3Switch,
      vlan.nextConfig!,
      "cli",
    ));
    const sviContext = executeCliCommand(
      "interface vlan 10",
      { mode: "global-config" },
      layer3Switch,
      switchState,
    ).context;
    const svi = executeCliCommand("ip address 10.10.10.1 255.255.255.0", sviContext, layer3Switch, switchState);
    expect(svi.nextConfig?.routing.svis["10"]).toMatchObject({
      vlanId: 10,
      ipv4: "10.10.10.1",
      prefixLength: 24,
      enabled: true,
    });
  });

  it("configures DHCP, NAT and an ordered ACL through real CLI commands", () => {
    let router = deviceRegistry.create("branch-router");
    let state = createDeviceConfigurationState(router);
    const context: CliContext = { mode: "global-config" };
    const dhcp = executeCliCommand("ip dhcp pool LAN 10.20.0.0 24 10.20.0.1 10.20.0.53", context, router, state);
    ({ nextDevice: router, nextState: state } = applyConfiguration(state, router, dhcp.nextConfig!, "cli"));
    const nat = executeCliCommand("ip nat inside source static 10.20.0.10 203.0.113.10", context, router, state);
    ({ nextDevice: router, nextState: state } = applyConfiguration(state, router, nat.nextConfig!, "cli"));
    const acl = executeCliCommand("access-list EDGE 10 permit icmp 10.20.0.0/24 any log", context, router, state);
    ({ nextDevice: router, nextState: state } = applyConfiguration(state, router, acl.nextConfig!, "cli"));
    const interfaceContext = executeCliCommand(
      `interface ${router.interfaces[0]!.name}`,
      context,
      router,
      state,
    ).context;
    const assignment = executeCliCommand("ip access-group EDGE out", interfaceContext, router, state);

    expect(assignment.nextConfig?.services.dhcp.pools.LAN).toMatchObject({ network: "10.20.0.0" });
    expect(assignment.nextConfig?.services.nat.rules[0]).toMatchObject({ type: "static" });
    expect(assignment.nextConfig?.services.acl.accessLists.EDGE.rules[0]).toMatchObject({
      sequence: 10,
      action: "permit",
    });
    expect(assignment.nextConfig?.services.acl.assignments[0]).toMatchObject({
      aclName: "EDGE",
      direction: "out",
    });
    const shown = executeCliCommand("show access-lists", { mode: "privileged" }, router, state);
    expect(shown.output.join("\n")).toContain("EDGE");
  });

  it("inspects and changes cloud routes through vendor-neutral CLI commands", () => {
    const cloudDevice = createDemoProject().devices.find((item) => item.category === "cloud")!;
    const state = createDeviceConfigurationState(cloudDevice);
    const shown = executeCliCommand("show cloud routes", { mode: "privileged" }, cloudDevice, state);
    expect(shown.output.join("\n")).toContain("Public Routes");
    expect(shown.output.join("\n")).toContain("internet-gateway");

    const changed = executeCliCommand(
      "cloud route-table rt-private default via internet-gateway igw-main",
      { mode: "global-config" },
      cloudDevice,
      state,
    );
    expect(changed.nextConfig?.cloud.resources["rt-private"]?.configuration.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ destinationCidr: "0.0.0.0/0", targetType: "internet-gateway" }),
      ]),
    );

    const flow = executeCliCommand(
      "test cloud flow vm-private internet tcp 443",
      { mode: "privileged" },
      cloudDevice,
      state,
    );
    expect(flow.output[0]).toContain("ALLOW REACHABLE");
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
