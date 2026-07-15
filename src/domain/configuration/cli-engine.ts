import { ipv4ToInteger } from "@/engine/protocols/ipv4";
import { Layer2Engine, type MacAddressEntry } from "@/engine/protocols/layer2-engine";
import { renderRunningConfig } from "@/domain/configuration/configuration-engine";
import type { DeviceConfigurationState, DeviceRuntimeConfig, NetworkDevice, TopologySnapshot } from "@/types/network";

export type CliMode = "user" | "privileged" | "global-config" | "interface-config" | "vlan-config";

export interface CliContext {
  readonly mode: CliMode;
  readonly interfaceId?: string;
  readonly vlanId?: number;
}

export interface CliCommandResult {
  readonly context: CliContext;
  readonly output: string[];
  readonly nextConfig?: DeviceRuntimeConfig;
  readonly action?: "apply" | "save-startup" | "restore-startup";
}

interface CommandDefinition {
  readonly id: string;
  readonly modes: readonly CliMode[];
  readonly usage: string;
  matches(tokens: readonly string[]): boolean;
  execute(input: CliExecutionInput): CliCommandResult;
}

interface CliExecutionInput {
  readonly tokens: readonly string[];
  readonly context: CliContext;
  readonly device: NetworkDevice;
  readonly state: DeviceConfigurationState;
  readonly topology?: TopologySnapshot;
  readonly macTable?: readonly MacAddressEntry[];
}

export function tokenizeCli(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  for (const character of input.trim()) {
    if ((character === '"' || character === "'") && (!quote || quote === character)) {
      quote = quote ? undefined : character;
      continue;
    }
    if (/\s/.test(character) && !quote) {
      if (current) tokens.push(current);
      current = "";
    } else current += character;
  }
  if (current) tokens.push(current);
  return tokens;
}

export function executeCliCommand(
  input: string,
  context: CliContext,
  device: NetworkDevice,
  state: DeviceConfigurationState,
  topology?: TopologySnapshot,
  macTable?: readonly MacAddressEntry[],
): CliCommandResult {
  const tokens = tokenizeCli(input);
  if (!tokens.length) return { context, output: [] };
  if (tokens[0]?.toLowerCase() === "help" || tokens[0] === "?") {
    return {
      context,
      output: commandRegistry.filter((command) => command.modes.includes(context.mode)).map((command) => command.usage),
    };
  }
  const command = commandRegistry.find(
    (definition) =>
      definition.modes.includes(context.mode) && definition.matches(tokens.map((token) => token.toLowerCase())),
  );
  if (!command) return { context, output: [`% Unsupported command in ${context.mode} mode: ${input}`] };
  return command.execute({ tokens, context, device, state, topology, macTable });
}

export function cliPrompt(hostname: string, context: CliContext): string {
  if (context.mode === "user") return `${hostname}>`;
  if (context.mode === "privileged") return `${hostname}#`;
  if (context.mode === "global-config") return `${hostname}(config)#`;
  if (context.mode === "vlan-config") return `${hostname}(config-vlan)#`;
  return `${hostname}(config-if)#`;
}

export function getCliCompletions(prefix: string, context: CliContext): string[] {
  const normalized = prefix.trim().toLowerCase();
  return commandRegistry
    .filter((command) => command.modes.includes(context.mode))
    .map((command) => command.usage)
    .filter((usage) => usage.toLowerCase().startsWith(normalized));
}

const exact = (expected: readonly string[]) => (tokens: readonly string[]) =>
  tokens.length === expected.length && expected.every((token, index) => tokens[index] === token);

const starts = (expected: readonly string[]) => (tokens: readonly string[]) =>
  tokens.length >= expected.length && expected.every((token, index) => tokens[index] === token);

const cloneRunning = (state: DeviceConfigurationState): DeviceRuntimeConfig => structuredClone(state.runningConfig);

const commandRegistry: readonly CommandDefinition[] = [
  {
    id: "enable",
    modes: ["user"],
    usage: "enable",
    matches: exact(["enable"]),
    execute: ({ context }) => ({ context: { ...context, mode: "privileged" }, output: [] }),
  },
  {
    id: "disable",
    modes: ["privileged"],
    usage: "disable",
    matches: exact(["disable"]),
    execute: ({ context }) => ({ context: { ...context, mode: "user" }, output: [] }),
  },
  {
    id: "configure-terminal",
    modes: ["privileged"],
    usage: "configure terminal",
    matches: exact(["configure", "terminal"]),
    execute: () => ({ context: { mode: "global-config" }, output: ["Enter configuration commands, one per line."] }),
  },
  {
    id: "show-running",
    modes: ["privileged", "user"],
    usage: "show running-config",
    matches: exact(["show", "running-config"]),
    execute: ({ context, device, state }) => ({
      context,
      output: renderCliConfig(state.runningConfig, device).split("\n"),
    }),
  },
  {
    id: "show-startup",
    modes: ["privileged", "user"],
    usage: "show startup-config",
    matches: exact(["show", "startup-config"]),
    execute: ({ context, device, state }) => ({
      context,
      output: renderCliConfig(state.startupConfig, device).split("\n"),
    }),
  },
  {
    id: "show-ip-interface-brief",
    modes: ["privileged", "user"],
    usage: "show ip interface brief",
    matches: exact(["show", "ip", "interface", "brief"]),
    execute: ({ context, device, state }) => ({
      context,
      output: [
        "Interface                  IP-Address      Status",
        ...device.interfaces.map((networkInterface) => {
          const config = state.runningConfig.interfaces[networkInterface.id];
          return `${networkInterface.name.padEnd(26)} ${(config?.ipv4 ?? "unassigned").padEnd(15)} ${config?.enabled ? networkInterface.status : "administratively down"}`;
        }),
      ],
    }),
  },
  {
    id: "show-vlan-brief",
    modes: ["privileged", "user"],
    usage: "show vlan brief",
    matches: exact(["show", "vlan", "brief"]),
    execute: ({ context, device, state }) => {
      const switching = state.runningConfig.switching;
      if (!switching) return { context, output: ["% Switching is not supported on this device"] };
      return {
        context,
        output: [
          "VLAN  Name                             Status    Ports",
          ...Object.values(switching.vlans)
            .sort((left, right) => left.id - right.id)
            .map((vlan) => {
              const ports = device.interfaces
                .filter((item) => state.runningConfig.interfaces[item.id]?.switchport?.accessVlan === vlan.id)
                .map((item) => item.name)
                .join(",");
              return `${String(vlan.id).padEnd(5)} ${vlan.name.padEnd(32)} ${vlan.status.padEnd(9)} ${ports}`;
            }),
        ],
      };
    },
  },
  {
    id: "show-interfaces-switchport",
    modes: ["privileged", "user"],
    usage: "show interfaces switchport",
    matches: exact(["show", "interfaces", "switchport"]),
    execute: ({ context, device, state }) => ({
      context,
      output: device.interfaces.flatMap((item) => {
        const switchport = state.runningConfig.interfaces[item.id]?.switchport;
        return switchport
          ? [
              `Name: ${item.name}`,
              `  Mode: ${switchport.mode}  Access VLAN: ${switchport.accessVlan}  Native VLAN: ${switchport.nativeVlan}`,
            ]
          : [];
      }),
    }),
  },
  {
    id: "show-interfaces-trunk",
    modes: ["privileged", "user"],
    usage: "show interfaces trunk",
    matches: exact(["show", "interfaces", "trunk"]),
    execute: ({ context, device, state }) => ({
      context,
      output: [
        "Port                 Native  Allowed VLANs",
        ...device.interfaces.flatMap((item) => {
          const switchport = state.runningConfig.interfaces[item.id]?.switchport;
          return switchport?.mode === "trunk"
            ? [
                `${item.name.padEnd(20)} ${String(switchport.nativeVlan).padEnd(7)} ${switchport.allowedVlans.join(",")}`,
              ]
            : [];
        }),
      ],
    }),
  },
  {
    id: "show-mac-address-table",
    modes: ["privileged", "user"],
    usage: "show mac address-table",
    matches: exact(["show", "mac", "address-table"]),
    execute: ({ context, device, macTable }) => {
      const entries = macTable?.filter((entry) => entry.switchDeviceId === device.id) ?? [];
      return {
        context,
        output: [
          "Vlan  Mac Address        Type       Ports",
          ...entries.map((entry) => {
            const name = device.interfaces.find((item) => item.id === entry.interfaceId)?.name ?? entry.interfaceId;
            return `${String(entry.vlanId).padEnd(5)} ${entry.macAddress.padEnd(18)} ${entry.type.padEnd(10)} ${name}`;
          }),
          ...(entries.length ? [] : ["No MAC addresses learned. Run a frame or Ping first."]),
        ],
      };
    },
  },
  {
    id: "show-spanning-tree",
    modes: ["privileged", "user"],
    usage: "show spanning-tree",
    matches: exact(["show", "spanning-tree"]),
    execute: ({ context, device, state, topology }) => {
      const vlanId = state.runningConfig.switching?.spanningTree.enabledVlans[0] ?? 1;
      if (!topology) return { context, output: ["% Topology state is not available"] };
      const result = new Layer2Engine(topology).calculateSpanningTree(vlanId);
      return {
        context,
        output: [
          `VLAN${String(vlanId).padStart(4, "0")}`,
          `  Root bridge: ${result.rootBridgeDeviceId ?? "none"}`,
          ...result.ports
            .filter((port) => port.switchDeviceId === device.id)
            .map((port) => {
              const name = device.interfaces.find((item) => item.id === port.interfaceId)?.name ?? port.interfaceId;
              return `  ${name.padEnd(20)} ${port.role.padEnd(10)} ${port.state}`;
            }),
        ],
      };
    },
  },
  {
    id: "show-etherchannel-summary",
    modes: ["privileged", "user"],
    usage: "show etherchannel summary",
    matches: exact(["show", "etherchannel", "summary"]),
    execute: ({ context, device, topology }) => {
      if (!topology) return { context, output: ["% Topology state is not available"] };
      const channels = new Layer2Engine(topology)
        .calculateEtherChannels()
        .filter((channel) => channel.switchDeviceId === device.id);
      return {
        context,
        output: [
          "Group  Protocol  Status      Ports",
          ...channels.map(
            (channel) =>
              `${String(channel.channelId).padEnd(6)} ${channel.protocol.padEnd(9)} ${channel.status.padEnd(11)} ${channel.activeMemberInterfaceIds.length}/${channel.memberInterfaceIds.length}`,
          ),
        ],
      };
    },
  },
  {
    id: "save-startup",
    modes: ["privileged"],
    usage: "write memory | copy running-config startup-config",
    matches: (tokens) =>
      exact(["write", "memory"])(tokens) || exact(["copy", "running-config", "startup-config"])(tokens),
    execute: ({ context }) => ({ context, output: ["Configuration saved to startup-config."], action: "save-startup" }),
  },
  {
    id: "restore-startup",
    modes: ["privileged"],
    usage: "reload startup-config",
    matches: exact(["reload", "startup-config"]),
    execute: ({ context }) => ({ context, output: ["Startup configuration restored."], action: "restore-startup" }),
  },
  {
    id: "hostname",
    modes: ["global-config"],
    usage: "hostname <name>",
    matches: starts(["hostname"]),
    execute: ({ tokens, context, state }) => {
      const hostname = tokens[1];
      if (!hostname) return { context, output: ["% Hostname is required"] };
      const nextConfig = cloneRunning(state);
      nextConfig.system.hostname = hostname;
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "vlan",
    modes: ["global-config"],
    usage: "vlan <1-4094>",
    matches: starts(["vlan"]),
    execute: ({ tokens, context, state }) => {
      const id = Number(tokens[1]);
      const nextConfig = cloneRunning(state);
      if (!nextConfig.switching) return { context, output: ["% Switching is not supported on this device"] };
      if (!Number.isInteger(id) || id < 1 || id > 4094) return { context, output: ["% VLAN ID must be 1-4094"] };
      nextConfig.switching.vlans[String(id)] ??= { id, name: `VLAN${id}`, status: "active" };
      if (!nextConfig.switching.spanningTree.enabledVlans.includes(id))
        nextConfig.switching.spanningTree.enabledVlans.push(id);
      return { context: { mode: "vlan-config", vlanId: id }, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "no-vlan",
    modes: ["global-config"],
    usage: "no vlan <2-4094>",
    matches: starts(["no", "vlan"]),
    execute: ({ tokens, context, state }) => {
      const id = Number(tokens[2]);
      const nextConfig = cloneRunning(state);
      if (!nextConfig.switching) return { context, output: ["% Switching is not supported on this device"] };
      if (!Number.isInteger(id) || id < 2 || id > 4094) return { context, output: ["% VLAN ID must be 2-4094"] };
      delete nextConfig.switching.vlans[String(id)];
      nextConfig.switching.spanningTree.enabledVlans = nextConfig.switching.spanningTree.enabledVlans.filter(
        (vlanId) => vlanId !== id,
      );
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "vlan-name",
    modes: ["vlan-config"],
    usage: "name <vlan-name>",
    matches: starts(["name"]),
    execute: ({ tokens, context, state }) => {
      const nextConfig = cloneRunning(state);
      const vlan = context.vlanId ? nextConfig.switching?.vlans[String(context.vlanId)] : undefined;
      const name = tokens.slice(1).join(" ").trim();
      if (!vlan || !name) return { context, output: ["% VLAN context and name are required"] };
      vlan.name = name;
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "interface",
    modes: ["global-config"],
    usage: "interface <name>",
    matches: starts(["interface"]),
    execute: ({ tokens, context, device }) => {
      const name = tokens.slice(1).join(" ");
      const networkInterface = device.interfaces.find((item) => item.name.toLowerCase() === name.toLowerCase());
      return networkInterface
        ? { context: { mode: "interface-config", interfaceId: networkInterface.id }, output: [] }
        : { context, output: [`% Interface ${name || "<missing>"} not found`] };
    },
  },
  {
    id: "spanning-tree-mode",
    modes: ["global-config"],
    usage: "spanning-tree mode <rstp|rapid-pvst|pvst>",
    matches: starts(["spanning-tree", "mode"]),
    execute: ({ tokens, context, state }) => {
      const mode = tokens[2]?.toLowerCase();
      const nextConfig = cloneRunning(state);
      if (!nextConfig.switching) return { context, output: ["% Switching is not supported on this device"] };
      if (mode !== "rstp" && mode !== "rapid-pvst" && mode !== "pvst")
        return { context, output: ["% STP mode must be rstp, rapid-pvst or pvst"] };
      nextConfig.switching.spanningTree.mode = mode;
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "spanning-tree-priority",
    modes: ["global-config"],
    usage: "spanning-tree vlan <id> priority <0-61440>",
    matches: starts(["spanning-tree", "vlan"]),
    execute: ({ tokens, context, state }) => {
      const vlanId = Number(tokens[2]);
      const priorityIndex = tokens.findIndex((token) => token.toLowerCase() === "priority");
      const priority = Number(tokens[priorityIndex + 1]);
      const nextConfig = cloneRunning(state);
      if (!nextConfig.switching) return { context, output: ["% Switching is not supported on this device"] };
      if (
        !nextConfig.switching.vlans[String(vlanId)] ||
        priorityIndex < 0 ||
        priority % 4096 !== 0 ||
        priority > 61_440
      )
        return { context, output: ["% Usage: spanning-tree vlan <existing-id> priority <4096-step>"] };
      nextConfig.switching.spanningTree.priority = priority;
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "interface-description",
    modes: ["interface-config"],
    usage: "description <text>",
    matches: starts(["description"]),
    execute: ({ tokens, context, state }) =>
      updateInterface(context, state, (item) => ({ ...item, description: tokens.slice(1).join(" ") })),
  },
  {
    id: "shutdown",
    modes: ["interface-config"],
    usage: "shutdown",
    matches: exact(["shutdown"]),
    execute: ({ context, state }) => updateInterface(context, state, (item) => ({ ...item, enabled: false })),
  },
  {
    id: "no-shutdown",
    modes: ["interface-config"],
    usage: "no shutdown",
    matches: exact(["no", "shutdown"]),
    execute: ({ context, state }) => updateInterface(context, state, (item) => ({ ...item, enabled: true })),
  },
  {
    id: "ip-address",
    modes: ["interface-config"],
    usage: "ip address <address> <mask|prefix>",
    matches: starts(["ip", "address"]),
    execute: ({ tokens, context, state }) => {
      const address = tokens[2];
      const prefixLength = prefixFrom(tokens[3]);
      if (!address || ipv4ToInteger(address) === undefined || prefixLength === undefined)
        return { context, output: ["% Usage: ip address <valid-address> <valid-mask-or-prefix>"] };
      return updateInterface(context, state, (item) => ({ ...item, ipv4: address, prefixLength }));
    },
  },
  {
    id: "no-ip-address",
    modes: ["interface-config"],
    usage: "no ip address",
    matches: exact(["no", "ip", "address"]),
    execute: ({ context, state }) =>
      updateInterface(context, state, (item) => ({
        ...item,
        ipv4: undefined,
        prefixLength: undefined,
        defaultGateway: undefined,
      })),
  },
  {
    id: "switchport-mode",
    modes: ["interface-config"],
    usage: "switchport mode <access|trunk|routed|dynamic|disabled>",
    matches: starts(["switchport", "mode"]),
    execute: ({ tokens, context, state }) => {
      const mode = tokens[2]?.toLowerCase();
      if (!mode || !["access", "trunk", "routed", "dynamic", "disabled"].includes(mode))
        return { context, output: ["% Invalid switchport mode"] };
      return updateSwitchport(context, state, (switchport) => ({
        ...switchport,
        mode: mode as typeof switchport.mode,
      }));
    },
  },
  {
    id: "switchport-access-vlan",
    modes: ["interface-config"],
    usage: "switchport access vlan <id>",
    matches: starts(["switchport", "access", "vlan"]),
    execute: ({ tokens, context, state }) => {
      const vlanId = Number(tokens[3]);
      if (!state.runningConfig.switching?.vlans[String(vlanId)])
        return { context, output: [`% VLAN ${tokens[3] ?? "<missing>"} does not exist`] };
      return updateSwitchport(context, state, (switchport) => ({ ...switchport, accessVlan: vlanId }));
    },
  },
  {
    id: "switchport-trunk-native",
    modes: ["interface-config"],
    usage: "switchport trunk native vlan <id>",
    matches: starts(["switchport", "trunk", "native", "vlan"]),
    execute: ({ tokens, context, state }) => {
      const vlanId = Number(tokens[4]);
      if (!state.runningConfig.switching?.vlans[String(vlanId)])
        return { context, output: [`% VLAN ${tokens[4] ?? "<missing>"} does not exist`] };
      return updateSwitchport(context, state, (switchport) => ({ ...switchport, nativeVlan: vlanId }));
    },
  },
  {
    id: "switchport-trunk-allowed",
    modes: ["interface-config"],
    usage: "switchport trunk allowed vlan <id,id,...>",
    matches: starts(["switchport", "trunk", "allowed", "vlan"]),
    execute: ({ tokens, context, state }) => {
      const vlanIds = (tokens[4] ?? "")
        .split(",")
        .map(Number)
        .filter((vlanId) => Number.isInteger(vlanId));
      if (!vlanIds.length || vlanIds.some((vlanId) => !state.runningConfig.switching?.vlans[String(vlanId)]))
        return { context, output: ["% Every allowed VLAN must exist in the VLAN database"] };
      return updateSwitchport(context, state, (switchport) => ({ ...switchport, allowedVlans: vlanIds }));
    },
  },
  {
    id: "channel-group",
    modes: ["interface-config"],
    usage: "channel-group <1-255> mode <active|passive|on>",
    matches: starts(["channel-group"]),
    execute: ({ tokens, context, state }) => {
      const channelGroup = Number(tokens[1]);
      const modeIndex = tokens.findIndex((token) => token.toLowerCase() === "mode");
      const mode = tokens[modeIndex + 1]?.toLowerCase();
      if (
        !Number.isInteger(channelGroup) ||
        channelGroup < 1 ||
        channelGroup > 255 ||
        !["active", "passive", "on"].includes(mode ?? "")
      )
        return { context, output: ["% Usage: channel-group <1-255> mode <active|passive|on>"] };
      if (!context.interfaceId) return { context, output: ["% Interface context is missing"] };
      const nextConfig = cloneRunning(state);
      const switching = nextConfig.switching;
      const item = nextConfig.interfaces[context.interfaceId];
      if (!switching || !item?.switchport) return { context, output: ["% Interface is not a switchport"] };
      item.switchport.channelGroup = channelGroup;
      item.switchport.lacpMode = mode as "active" | "passive" | "on";
      const current = switching.etherChannels[String(channelGroup)];
      switching.etherChannels[String(channelGroup)] = {
        id: channelGroup,
        protocol: mode === "on" ? "static" : "lacp",
        mode: mode as "active" | "passive" | "on",
        memberInterfaceIds: Array.from(new Set([...(current?.memberInterfaceIds ?? []), context.interfaceId])),
      };
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "exit",
    modes: ["global-config", "interface-config", "vlan-config"],
    usage: "exit",
    matches: exact(["exit"]),
    execute: ({ context }) => ({
      context: {
        mode: context.mode === "interface-config" || context.mode === "vlan-config" ? "global-config" : "privileged",
      },
      output: [],
    }),
  },
  {
    id: "end",
    modes: ["global-config", "interface-config", "vlan-config"],
    usage: "end",
    matches: exact(["end"]),
    execute: () => ({ context: { mode: "privileged" }, output: [] }),
  },
];

function updateInterface(
  context: CliContext,
  state: DeviceConfigurationState,
  update: (item: DeviceRuntimeConfig["interfaces"][string]) => DeviceRuntimeConfig["interfaces"][string],
): CliCommandResult {
  if (!context.interfaceId) return { context, output: ["% Interface context is missing"] };
  const current = state.runningConfig.interfaces[context.interfaceId];
  if (!current) return { context, output: ["% Interface configuration is missing"] };
  const nextConfig = cloneRunning(state);
  nextConfig.interfaces[context.interfaceId] = update(current);
  return { context, output: [], nextConfig, action: "apply" };
}

function updateSwitchport(
  context: CliContext,
  state: DeviceConfigurationState,
  update: (
    switchport: NonNullable<DeviceRuntimeConfig["interfaces"][string]["switchport"]>,
  ) => NonNullable<DeviceRuntimeConfig["interfaces"][string]["switchport"]>,
): CliCommandResult {
  if (!context.interfaceId) return { context, output: ["% Interface context is missing"] };
  const current = state.runningConfig.interfaces[context.interfaceId];
  if (!current?.switchport) return { context, output: ["% Interface is not a switchport"] };
  const nextConfig = cloneRunning(state);
  nextConfig.interfaces[context.interfaceId]!.switchport = update(current.switchport);
  return { context, output: [], nextConfig, action: "apply" };
}

function prefixFrom(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const numeric = Number(value.replace(/^\//, ""));
  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 32) return numeric;
  const mask = ipv4ToInteger(value);
  if (mask === undefined) return undefined;
  const bits = mask.toString(2).padStart(32, "0");
  if (!/^1*0*$/.test(bits)) return undefined;
  return bits.indexOf("0") === -1 ? 32 : bits.indexOf("0");
}

function renderCliConfig(config: DeviceRuntimeConfig, device: NetworkDevice): string {
  return renderRunningConfig(config, device);
}
