import { ipv4ToInteger } from "@/engine/protocols/ipv4";
import type { DeviceConfigurationState, DeviceRuntimeConfig, NetworkDevice } from "@/types/network";

export type CliMode = "user" | "privileged" | "global-config" | "interface-config";

export interface CliContext {
  readonly mode: CliMode;
  readonly interfaceId?: string;
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
  return command.execute({ tokens, context, device, state });
}

export function cliPrompt(hostname: string, context: CliContext): string {
  if (context.mode === "user") return `${hostname}>`;
  if (context.mode === "privileged") return `${hostname}#`;
  if (context.mode === "global-config") return `${hostname}(config)#`;
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
    id: "exit",
    modes: ["global-config", "interface-config"],
    usage: "exit",
    matches: exact(["exit"]),
    execute: ({ context }) => ({
      context: { mode: context.mode === "interface-config" ? "global-config" : "privileged" },
      output: [],
    }),
  },
  {
    id: "end",
    modes: ["global-config", "interface-config"],
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
  const lines = [`hostname ${config.system.hostname}`];
  for (const networkInterface of device.interfaces) {
    const item = config.interfaces[networkInterface.id];
    if (!item) continue;
    lines.push("!", `interface ${networkInterface.name}`);
    if (item.description) lines.push(` description ${item.description}`);
    if (item.ipv4 && item.prefixLength !== undefined) lines.push(` ip address ${item.ipv4}/${item.prefixLength}`);
    lines.push(item.enabled ? " no shutdown" : " shutdown");
  }
  return lines.join("\n");
}
