import { ipv4ToInteger } from "@/engine/protocols/ipv4";
import { Layer2Engine, type MacAddressEntry } from "@/engine/protocols/layer2-engine";
import { IPv4RoutingEngine } from "@/engine/protocols/routing-engine";
import { OspfEngine } from "@/engine/protocols/ospf-engine";
import { HighAvailabilityEngine, MonitoringEngine, TroubleshootingEngine } from "@/engine/operations/operations-engine";
import { NetworkServicesEngine } from "@/engine/protocols/services-engine";
import { renderRunningConfig } from "@/domain/configuration/configuration-engine";
import type { DeviceConfigurationState, DeviceRuntimeConfig, NetworkDevice, TopologySnapshot } from "@/types/network";

export type CliMode = "user" | "privileged" | "global-config" | "interface-config" | "vlan-config";

export interface CliContext {
  readonly mode: CliMode;
  readonly interfaceId?: string;
  readonly vlanId?: number;
  readonly sviVlanId?: number;
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
    id: "show-ip-interface",
    modes: ["privileged", "user"],
    usage: "show ip interface",
    matches: exact(["show", "ip", "interface"]),
    execute: ({ context, device, state }) => ({
      context,
      output: device.interfaces.flatMap((networkInterface) => {
        const item = state.runningConfig.interfaces[networkInterface.id];
        const assignments = state.runningConfig.services.acl.assignments.filter(
          (assignment) => assignment.interfaceId === networkInterface.id,
        );
        return [
          `${networkInterface.name} is ${item?.enabled ? networkInterface.status : "administratively down"}`,
          `  Internet address is ${item?.ipv4 ? `${item.ipv4}/${item.prefixLength}` : "unassigned"}`,
          `  Inbound access list is ${assignments.find((assignment) => assignment.direction === "in")?.aclName ?? "not set"}`,
          `  Outbound access list is ${assignments.find((assignment) => assignment.direction === "out")?.aclName ?? "not set"}`,
        ];
      }),
    }),
  },
  {
    id: "show-ip-route",
    modes: ["privileged", "user"],
    usage: "show ip route",
    matches: exact(["show", "ip", "route"]),
    execute: ({ context, device, topology }) => {
      if (!topology) return { context, output: ["% Topology state is not available"] };
      const routes = new IPv4RoutingEngine(topology).buildRoutingTable(device);
      return {
        context,
        output: [
          "Codes: C - connected, S - static, S* - default, O - OSPF",
          ...routes.map((route) => {
            const code =
              route.source === "connected"
                ? "C"
                : route.source === "default"
                  ? "S*"
                  : route.source === "ospf"
                    ? "O"
                    : "S";
            return `${code.padEnd(3)} ${route.destination}/${route.prefixLength}${route.nextHop ? ` [${route.administrativeDistance}/${route.metric}] via ${route.nextHop}` : ` is directly connected, ${route.outgoingInterfaceId}`}${route.active ? "" : " (unresolved)"}`;
          }),
        ],
      };
    },
  },
  {
    id: "show-ip-protocols",
    modes: ["privileged", "user"],
    usage: "show ip protocols",
    matches: exact(["show", "ip", "protocols"]),
    execute: ({ context, state }) => {
      const ospf = state.runningConfig.routing.ospf;
      return {
        context,
        output: ospf.enabled
          ? [
              `Routing Protocol is \"ospf ${ospf.processId}\"`,
              `  Router ID ${ospf.routerId}`,
              `  Reference bandwidth ${ospf.referenceBandwidthMbps} Mbps`,
              `  Routing for Networks:`,
              ...ospf.networks.map(
                (item) => `    ${item.network}/${item.prefixLength} area ${item.areaId} cost ${item.cost}`,
              ),
            ]
          : ["No dynamic routing protocol is configured."],
      };
    },
  },
  {
    id: "show-ip-ospf-neighbor",
    modes: ["privileged", "user"],
    usage: "show ip ospf neighbor",
    matches: exact(["show", "ip", "ospf", "neighbor"]),
    execute: ({ context, device, topology }) => {
      if (!topology) return { context, output: ["% Topology state is not available"] };
      const neighbors = new OspfEngine(topology).neighbors(device);
      return {
        context,
        output: [
          "Neighbor ID      State  Area  Interface       Cost  Reason",
          ...neighbors.map(
            (item) =>
              `${item.neighborRouterId.padEnd(16)} ${item.state.padEnd(6)} ${item.areaId.padEnd(5)} ${item.localInterfaceId.padEnd(15)} ${String(item.cost).padEnd(5)} ${item.reason}`,
          ),
          ...(neighbors.length ? [] : ["No OSPF neighbors."]),
        ],
      };
    },
  },
  {
    id: "show-ip-ospf-database",
    modes: ["privileged", "user"],
    usage: "show ip ospf database",
    matches: exact(["show", "ip", "ospf", "database"]),
    execute: ({ context, device, topology }) => {
      if (!topology) return { context, output: ["% Topology state is not available"] };
      const database = new OspfEngine(topology).database(device);
      return {
        context,
        output: [
          "Type      Link State ID       Advertising Router Area      Metric",
          ...database.map(
            (item) =>
              `${item.type.padEnd(9)} ${`${item.network}/${item.prefixLength}`.padEnd(19)} ${item.advertisingRouterId.padEnd(18)} ${item.areaId.padEnd(9)} ${item.metric}`,
          ),
          ...(database.length ? [] : ["OSPF link-state database is empty."]),
        ],
      };
    },
  },
  {
    id: "show-redundancy",
    modes: ["privileged", "user"],
    usage: "show redundancy",
    matches: exact(["show", "redundancy"]),
    execute: ({ context, device, topology }) => {
      if (!topology) return { context, output: ["% Topology state is not available"] };
      const member = new HighAvailabilityEngine(topology).members().find((item) => item.deviceId === device.id);
      return {
        context,
        output: member
          ? [
              `${member.protocol.toUpperCase()} group ${member.groupId}, virtual IP ${member.virtualIp}`,
              `State ${member.role}, configured priority ${member.configuredPriority}, effective priority ${member.effectivePriority}`,
              member.reason,
            ]
          : ["High availability is not configured."],
      };
    },
  },
  {
    id: "show-monitoring",
    modes: ["privileged", "user"],
    usage: "show monitoring",
    matches: exact(["show", "monitoring"]),
    execute: ({ context, device, topology }) => {
      if (!topology) return { context, output: ["% Topology state is not available"] };
      const engine = new MonitoringEngine(topology);
      const metrics = engine.metrics().filter((item) => item.deviceId === device.id);
      return {
        context,
        output: [
          "Interface       State      Util%  Latency  Loss%  Errors",
          ...metrics.map(
            (item) =>
              `${item.interfaceName.padEnd(15)} ${item.availability.padEnd(10)} ${String(item.bandwidthUtilizationPercent).padEnd(6)} ${`${item.latencyMs}ms`.padEnd(8)} ${String(item.packetLossPercent).padEnd(6)} ${item.errorCount}`,
          ),
        ],
      };
    },
  },
  {
    id: "show-alerts",
    modes: ["privileged", "user"],
    usage: "show alerts",
    matches: exact(["show", "alerts"]),
    execute: ({ context, device, topology }) => {
      if (!topology) return { context, output: ["% Topology state is not available"] };
      const alerts = new MonitoringEngine(topology).alerts().filter((item) => item.deviceId === device.id);
      return {
        context,
        output: alerts.length
          ? alerts.map((item) => `${item.severity.toUpperCase()} ${item.metric}: ${item.message}`)
          : ["No active alerts."],
      };
    },
  },
  {
    id: "diagnose-network",
    modes: ["privileged", "user"],
    usage: "diagnose network",
    matches: exact(["diagnose", "network"]),
    execute: ({ context, topology }) => {
      if (!topology) return { context, output: ["% Topology state is not available"] };
      const findings = new TroubleshootingEngine(topology).analyze();
      return {
        context,
        output: findings.length
          ? findings.map((item) => `${item.layer} ${item.severity.toUpperCase()}: ${item.symptom} | ${item.evidence}`)
          : ["No Layer 1 through security faults detected."],
      };
    },
  },
  {
    id: "show-ip-dhcp-pool",
    modes: ["privileged", "user"],
    usage: "show ip dhcp pool",
    matches: exact(["show", "ip", "dhcp", "pool"]),
    execute: ({ context, state }) => {
      const pools = Object.values(state.runningConfig.services.dhcp.pools);
      return {
        context,
        output: [
          "Pool                 Network             Gateway         Lease(s)",
          ...pools.map((pool) => {
            const capacity = Math.min(
              pool.maximumLeases ?? Number.MAX_SAFE_INTEGER,
              Math.max(0, (2 ** (32 - pool.prefixLength) || 0) - (pool.prefixLength < 31 ? 2 : 0)),
            );
            return `${pool.name.padEnd(20)} ${`${pool.network}/${pool.prefixLength}`.padEnd(20)} ${pool.defaultGateway.padEnd(16)} ${capacity}`;
          }),
          ...(pools.length ? [] : ["No DHCP pools configured."]),
        ],
      };
    },
  },
  {
    id: "show-ip-dhcp-binding",
    modes: ["privileged", "user"],
    usage: "show ip dhcp binding",
    matches: exact(["show", "ip", "dhcp", "binding"]),
    execute: ({ context }) => ({
      context,
      output: [
        "IP address       Client identifier              Lease expiration",
        "No active bindings in this CLI session.",
      ],
    }),
  },
  {
    id: "show-ip-dhcp-conflict",
    modes: ["privileged", "user"],
    usage: "show ip dhcp conflict",
    matches: exact(["show", "ip", "dhcp", "conflict"]),
    execute: ({ context }) => ({ context, output: ["No DHCP conflicts detected."] }),
  },
  {
    id: "show-access-lists",
    modes: ["privileged", "user"],
    usage: "show access-lists",
    matches: exact(["show", "access-lists"]),
    execute: ({ context, state }) => {
      const lists = Object.values(state.runningConfig.services.acl.accessLists);
      return {
        context,
        output: lists.flatMap((acl) => [
          `${acl.type === "standard" ? "Standard" : "Extended"} IP access list ${acl.name}`,
          ...[...acl.rules]
            .sort((left, right) => left.sequence - right.sequence)
            .map(
              (rule) =>
                `  ${rule.sequence} ${rule.action} ${rule.protocol} ${rule.source}/${rule.sourcePrefixLength} ${rule.destination}/${rule.destinationPrefixLength}${rule.destinationPort ? ` eq ${rule.destinationPort}` : ""}${rule.logging ? " log" : ""}`,
            ),
          "  implicit deny ip any any",
        ]),
      };
    },
  },
  {
    id: "show-security-policy",
    modes: ["privileged", "user"],
    usage: "show security-policy",
    matches: exact(["show", "security-policy"]),
    execute: ({ context, state }) => ({
      context,
      output: [
        "Order  Source     Destination  Action  Name",
        ...[...state.runningConfig.security.firewall.policies]
          .sort((a, b) => a.order - b.order)
          .map(
            (policy) =>
              `${String(policy.order).padEnd(6)} ${policy.sourceZone.padEnd(10)} ${policy.destinationZone.padEnd(12)} ${policy.action.padEnd(7)} ${policy.name}`,
          ),
        ...(state.runningConfig.security.firewall.policies.length ? [] : ["Implicit deny any any"]),
      ],
    }),
  },
  {
    id: "show-security-sessions",
    modes: ["privileged", "user"],
    usage: "show security sessions",
    matches: exact(["show", "security", "sessions"]),
    execute: ({ context }) => ({
      context,
      output: ["No stateful sessions in this CLI session. Run a routed packet to populate the live Security tool."],
    }),
  },
  {
    id: "show-vpn-tunnels",
    modes: ["privileged", "user"],
    usage: "show vpn tunnels",
    matches: exact(["show", "vpn", "tunnels"]),
    execute: ({ context, state }) => ({
      context,
      output: [
        "Tunnel               Type          Local Peer       Remote Peer",
        ...Object.values(state.runningConfig.security.vpn.tunnels).map(
          (tunnel) =>
            `${tunnel.name.padEnd(20)} ${tunnel.type.padEnd(13)} ${tunnel.localPeer.padEnd(16)} ${tunnel.remotePeer}`,
        ),
      ],
    }),
  },
  {
    id: "show-wireless-ssids",
    modes: ["privileged", "user"],
    usage: "show wireless ssids",
    matches: exact(["show", "wireless", "ssids"]),
    execute: ({ context, state }) => ({
      context,
      output: [
        "SSID                 Security             VLAN  State",
        ...Object.values(state.runningConfig.security.wireless.ssids).map(
          (ssid) =>
            `${ssid.name.padEnd(20)} ${ssid.securityMode.padEnd(20)} ${String(ssid.vlanId).padEnd(5)} ${ssid.enabled ? "broadcast" : "disabled"}`,
        ),
      ],
    }),
  },
  {
    id: "show-radius-users",
    modes: ["privileged", "user"],
    usage: "show radius users",
    matches: exact(["show", "radius", "users"]),
    execute: ({ context, state }) => ({
      context,
      output: [
        `RADIUS ${state.runningConfig.security.radius.enabled ? "enabled" : "disabled"} · UDP/${state.runningConfig.security.radius.port}`,
        ...Object.values(state.runningConfig.security.radius.users).map(
          (user) => `${user.username}  VLAN ${user.vlanId ?? "default"}  ${user.enabled ? "enabled" : "disabled"}`,
        ),
      ],
    }),
  },
  {
    id: "show-ip-nat-translations",
    modes: ["privileged", "user"],
    usage: "show ip nat translations",
    matches: exact(["show", "ip", "nat", "translations"]),
    execute: ({ context, state }) => ({
      context,
      output: [
        "Pro  Inside global      Inside local       Outside local      Outside global",
        ...state.runningConfig.services.nat.rules
          .filter((rule) => rule.enabled && rule.translatedAddress)
          .map(
            (rule) =>
              `${(rule.protocol ?? "ip").padEnd(4)} ${rule.translatedAddress!.padEnd(18)} ${`${rule.source}/${rule.sourcePrefixLength}`.padEnd(18)} ${`${rule.destination}/${rule.destinationPrefixLength}`.padEnd(18)} ${rule.destination}`,
          ),
      ],
    }),
  },
  {
    id: "show-ip-nat-statistics",
    modes: ["privileged", "user"],
    usage: "show ip nat statistics",
    matches: exact(["show", "ip", "nat", "statistics"]),
    execute: ({ context, state }) => ({
      context,
      output: [
        `NAT ${state.runningConfig.services.nat.enabled ? "enabled" : "disabled"}`,
        `Configured rules: ${state.runningConfig.services.nat.rules.length}`,
        `Pools: ${Object.keys(state.runningConfig.services.nat.pools).length}`,
        `Translation timeout: ${state.runningConfig.services.nat.translationTimeoutSeconds} seconds`,
      ],
    }),
  },
  {
    id: "show-dns-cache",
    modes: ["privileged", "user"],
    usage: "show dns cache",
    matches: exact(["show", "dns", "cache"]),
    execute: ({ context }) => ({ context, output: ["DNS cache is empty in this CLI session."] }),
  },
  {
    id: "dns-lookup",
    modes: ["privileged", "user"],
    usage: "nslookup <name> | dig <name> [type]",
    matches: (tokens) => tokens[0] === "nslookup" || tokens[0] === "dig",
    execute: ({ tokens, context, device, topology, state }) => {
      if (!topology) return { context, output: ["% Topology state is not available"] };
      const name = tokens[1];
      const type = (tokens[2]?.toUpperCase() ?? "A") as "A" | "AAAA" | "CNAME" | "MX" | "PTR" | "TXT" | "NS";
      if (!name) return { context, output: ["% Domain name is required"] };
      const result = new NetworkServicesEngine(topology).queryDns(device.id, name, type);
      return {
        context,
        output: [
          `Server: ${state.runningConfig.system.dnsServers[0] ?? "not configured"}`,
          `Status: ${result.code} (${result.cache})`,
          ...(result.success ? result.values.map((value) => `${name} ${type} ${value}`) : [result.reason]),
        ],
      };
    },
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
    id: "service-enable",
    modes: ["global-config"],
    usage: "service <dhcp|dns|nat|acl>",
    matches: starts(["service"]),
    execute: ({ tokens, context, state }) => {
      const service = tokens[1] as "dhcp" | "dns" | "nat" | "acl";
      if (!(["dhcp", "dns", "nat", "acl"] as const).includes(service))
        return { context, output: ["% Service must be dhcp, dns, nat or acl"] };
      const nextConfig = cloneRunning(state);
      nextConfig.services[service].enabled = true;
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "zone-security",
    modes: ["global-config"],
    usage: "zone security <name> interface <interface-name>",
    matches: starts(["zone", "security"]),
    execute: ({ tokens, context, state, device }) => {
      const name = tokens[2];
      const interfaceName = tokens[4];
      const networkInterface = device.interfaces.find(
        (item) => item.name.toLowerCase() === interfaceName?.toLowerCase(),
      );
      if (!name || tokens[3]?.toLowerCase() !== "interface" || !networkInterface)
        return { context, output: ["% Usage: zone security <name> interface <interface-name>"] };
      const nextConfig = cloneRunning(state);
      nextConfig.security.firewall.enabled = true;
      nextConfig.security.firewall.zones[name] = { name, interfaceIds: [networkInterface.id] };
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "security-policy",
    modes: ["global-config"],
    usage: "security-policy <order> <name> from <source-zone> to <destination-zone> <allow|deny>",
    matches: starts(["security-policy"]),
    execute: ({ tokens, context, state }) => {
      const order = Number(tokens[1]);
      const name = tokens[2];
      const sourceZone = tokens[4];
      const destinationZone = tokens[6];
      const action = tokens[7] as "allow" | "deny";
      if (
        !Number.isInteger(order) ||
        !name ||
        tokens[3] !== "from" ||
        !sourceZone ||
        tokens[5] !== "to" ||
        !destinationZone ||
        !(["allow", "deny"] as const).includes(action)
      )
        return { context, output: ["% Invalid security-policy syntax"] };
      const nextConfig = cloneRunning(state);
      nextConfig.security.firewall.enabled = true;
      nextConfig.security.firewall.policies.push({
        id: `policy-${order}`,
        order,
        enabled: true,
        name,
        sourceZone,
        destinationZone,
        sourceAddress: "any",
        destinationAddress: "any",
        service: "any",
        action,
        logging: true,
      });
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "wireless-ssid",
    modes: ["global-config"],
    usage: "wireless ssid <name> psk <key> vlan <id>",
    matches: starts(["wireless", "ssid"]),
    execute: ({ tokens, context, state, device }) => {
      const name = tokens[2];
      const key = tokens[4];
      const vlanId = Number(tokens[6]);
      if (!name || tokens[3] !== "psk" || !key || key.length < 8 || tokens[5] !== "vlan" || !Number.isInteger(vlanId))
        return { context, output: ["% Usage: wireless ssid <name> psk <8+ chars> vlan <id>"] };
      const nextConfig = cloneRunning(state);
      const radioIds = Object.keys(nextConfig.security.wireless.radios);
      nextConfig.security.wireless.ssids[name] = {
        id: name,
        name,
        enabled: true,
        bssid: device.interfaces.find((item) => item.type === "wireless")?.macAddress ?? "02:00:00:00:00:01",
        radioIds,
        securityMode: "wpa2-psk",
        preSharedKey: key,
        vlanId,
        guest: false,
        clientIsolation: false,
        captivePortal: false,
        maximumClients: 64,
        roaming: true,
        mesh: false,
      };
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "radius-server-local",
    modes: ["global-config"],
    usage: "radius-server local secret <secret>",
    matches: starts(["radius-server", "local", "secret"]),
    execute: ({ tokens, context, state }) => {
      const secret = tokens[3];
      if (!secret) return { context, output: ["% RADIUS secret is required"] };
      const nextConfig = cloneRunning(state);
      nextConfig.security.radius.enabled = true;
      nextConfig.security.radius.sharedSecret = secret;
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "radius-user",
    modes: ["global-config"],
    usage: "radius-user <username> password <password> [vlan <id>]",
    matches: starts(["radius-user"]),
    execute: ({ tokens, context, state }) => {
      const username = tokens[1];
      const password = tokens[3];
      const vlanId = tokens[4] === "vlan" ? Number(tokens[5]) : undefined;
      if (!username || tokens[2] !== "password" || !password)
        return { context, output: ["% Invalid radius-user syntax"] };
      const nextConfig = cloneRunning(state);
      nextConfig.security.radius.users[username] = {
        username,
        password,
        vlanId: Number.isInteger(vlanId) ? vlanId : undefined,
        enabled: true,
      };
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "service-disable",
    modes: ["global-config"],
    usage: "no service <dhcp|dns|nat|acl>",
    matches: starts(["no", "service"]),
    execute: ({ tokens, context, state }) => {
      const service = tokens[2] as "dhcp" | "dns" | "nat" | "acl";
      if (!(["dhcp", "dns", "nat", "acl"] as const).includes(service))
        return { context, output: ["% Service must be dhcp, dns, nat or acl"] };
      const nextConfig = cloneRunning(state);
      nextConfig.services[service].enabled = false;
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "ip-name-server",
    modes: ["global-config"],
    usage: "ip name-server <address> [address...]",
    matches: starts(["ip", "name-server"]),
    execute: ({ tokens, context, state }) => {
      const addresses = tokens.slice(2);
      if (!addresses.length || addresses.some((address) => ipv4ToInteger(address) === undefined))
        return { context, output: ["% One or more valid IPv4 DNS servers are required"] };
      const nextConfig = cloneRunning(state);
      nextConfig.system.dnsServers = [...new Set(addresses)];
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "ip-dhcp-pool",
    modes: ["global-config"],
    usage: "ip dhcp pool <name> <network> <prefix> <gateway> [dns-server]",
    matches: starts(["ip", "dhcp", "pool"]),
    execute: ({ tokens, context, state }) => {
      const name = tokens[3];
      const network = tokens[4];
      const prefixLength = prefixFrom(tokens[5]);
      const defaultGateway = tokens[6];
      const dnsServer = tokens[7];
      if (!name || !network || prefixLength === undefined || !defaultGateway)
        return { context, output: ["% Usage: ip dhcp pool <name> <network> <prefix> <gateway> [dns-server]"] };
      const nextConfig = cloneRunning(state);
      nextConfig.services.dhcp.enabled = true;
      nextConfig.services.dhcp.pools[name] = {
        name,
        network,
        prefixLength,
        defaultGateway,
        dnsServers: dnsServer ? [dnsServer] : [],
        leaseSeconds: 86_400,
        excludedRanges: [],
        reservations: [],
        relayAddresses: [],
      };
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "no-ip-dhcp-pool",
    modes: ["global-config"],
    usage: "no ip dhcp pool <name>",
    matches: starts(["no", "ip", "dhcp", "pool"]),
    execute: ({ tokens, context, state }) => {
      const name = tokens[4];
      const nextConfig = cloneRunning(state);
      if (!name || !nextConfig.services.dhcp.pools[name]) return { context, output: ["% DHCP pool not found"] };
      delete nextConfig.services.dhcp.pools[name];
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "dns-record",
    modes: ["global-config"],
    usage: "dns record <zone> <A|AAAA|CNAME|MX|PTR|TXT|NS> <name> <value> [ttl]",
    matches: starts(["dns", "record"]),
    execute: ({ tokens, context, state }) => {
      const zoneName = tokens[2];
      const type = tokens[3]?.toUpperCase() as "A" | "AAAA" | "CNAME" | "MX" | "PTR" | "TXT" | "NS";
      const name = tokens[4];
      const value = tokens[5];
      const ttl = tokens[6] ? Number(tokens[6]) : 300;
      if (
        !zoneName ||
        !(["A", "AAAA", "CNAME", "MX", "PTR", "TXT", "NS"] as const).includes(type) ||
        !name ||
        !value ||
        !Number.isInteger(ttl) ||
        ttl < 1
      )
        return { context, output: ["% Invalid DNS record syntax"] };
      const nextConfig = cloneRunning(state);
      nextConfig.services.dns.enabled = true;
      const zone = (nextConfig.services.dns.zones[zoneName] ??= {
        name: zoneName,
        authoritative: true,
        reverse: zoneName.endsWith("in-addr.arpa"),
        records: [],
      });
      zone.records.push({ id: `${type}:${name}:${zone.records.length + 1}`, name, type, value, ttl });
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "ip-nat-static",
    modes: ["global-config"],
    usage: "ip nat inside source static <inside-local> <inside-global>",
    matches: starts(["ip", "nat", "inside", "source", "static"]),
    execute: ({ tokens, context, state }) => {
      const insideLocal = tokens[5];
      const insideGlobal = tokens[6];
      if (
        !insideLocal ||
        !insideGlobal ||
        ipv4ToInteger(insideLocal) === undefined ||
        ipv4ToInteger(insideGlobal) === undefined
      )
        return { context, output: ["% Static NAT requires valid inside-local and inside-global IPv4"] };
      const nextConfig = cloneRunning(state);
      nextConfig.services.nat.enabled = true;
      nextConfig.services.nat.rules.push({
        id: `static-${insideLocal}`,
        order: nextConfig.services.nat.rules.length * 10 + 10,
        enabled: true,
        type: "static",
        source: insideLocal,
        sourcePrefixLength: 32,
        destination: "0.0.0.0",
        destinationPrefixLength: 0,
        translatedAddress: insideGlobal,
        protocol: "ip",
      });
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "access-list-rule",
    modes: ["global-config"],
    usage:
      "access-list <name> <sequence> <permit|deny> <ip|icmp|tcp|udp> <source/prefix> <destination/prefix> [eq port] [log]",
    matches: starts(["access-list"]),
    execute: ({ tokens, context, state }) => {
      const name = tokens[1];
      const sequence = Number(tokens[2]);
      const action = tokens[3] as "permit" | "deny";
      const protocol = tokens[4] as "ip" | "icmp" | "tcp" | "udp";
      const source = parseNetworkToken(tokens[5]);
      const destination = parseNetworkToken(tokens[6]);
      const eqIndex = tokens.findIndex((token) => token.toLowerCase() === "eq");
      const destinationPort = eqIndex >= 0 ? Number(tokens[eqIndex + 1]) : undefined;
      if (
        !name ||
        !Number.isInteger(sequence) ||
        !(["permit", "deny"] as const).includes(action) ||
        !(["ip", "icmp", "tcp", "udp"] as const).includes(protocol) ||
        !source ||
        !destination
      )
        return { context, output: ["% Invalid access-list syntax"] };
      const nextConfig = cloneRunning(state);
      nextConfig.services.acl.enabled = true;
      const acl = (nextConfig.services.acl.accessLists[name] ??= {
        name,
        type: protocol === "ip" && destination.prefixLength === 0 ? "standard" : "extended",
        rules: [],
      });
      acl.rules = acl.rules.filter((rule) => rule.sequence !== sequence);
      acl.rules.push({
        sequence,
        action,
        protocol,
        source: source.network,
        sourcePrefixLength: source.prefixLength,
        destination: destination.network,
        destinationPrefixLength: destination.prefixLength,
        destinationPort: Number.isInteger(destinationPort) ? destinationPort : undefined,
        logging: tokens.includes("log"),
      });
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
    id: "ip-routing",
    modes: ["global-config"],
    usage: "ip routing",
    matches: exact(["ip", "routing"]),
    execute: ({ context, state }) => {
      const nextConfig = cloneRunning(state);
      nextConfig.routing.ipRouting = true;
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "no-ip-routing",
    modes: ["global-config"],
    usage: "no ip routing",
    matches: exact(["no", "ip", "routing"]),
    execute: ({ context, state }) => {
      const nextConfig = cloneRunning(state);
      nextConfig.routing.ipRouting = false;
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "ip-route",
    modes: ["global-config"],
    usage: "ip route <network> <mask|prefix> <next-hop> [distance]",
    matches: starts(["ip", "route"]),
    execute: ({ tokens, context, state }) => {
      const destination = tokens[2];
      const prefixLength = prefixFrom(tokens[3]);
      const nextHop = tokens[4];
      const administrativeDistance = tokens[5] ? Number(tokens[5]) : 1;
      if (
        !destination ||
        ipv4ToInteger(destination) === undefined ||
        prefixLength === undefined ||
        !nextHop ||
        ipv4ToInteger(nextHop) === undefined ||
        !Number.isInteger(administrativeDistance) ||
        administrativeDistance < 1 ||
        administrativeDistance > 255
      )
        return { context, output: ["% Usage: ip route <network> <mask|prefix> <next-hop> [1-255]"] };
      const nextConfig = cloneRunning(state);
      nextConfig.routing.staticRoutes.push({
        destination,
        prefixLength,
        nextHop,
        administrativeDistance,
        metric: 0,
      });
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "no-ip-route",
    modes: ["global-config"],
    usage: "no ip route <network> <mask|prefix> <next-hop>",
    matches: starts(["no", "ip", "route"]),
    execute: ({ tokens, context, state }) => {
      const destination = tokens[3];
      const prefixLength = prefixFrom(tokens[4]);
      const nextHop = tokens[5];
      const nextConfig = cloneRunning(state);
      const index = nextConfig.routing.staticRoutes.findIndex(
        (route) =>
          route.destination === destination && route.prefixLength === prefixLength && route.nextHop === nextHop,
      );
      if (index < 0) return { context, output: ["% Static route not found"] };
      nextConfig.routing.staticRoutes.splice(index, 1);
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "router-ospf",
    modes: ["global-config"],
    usage: "router ospf <process-id>",
    matches: starts(["router", "ospf"]),
    execute: ({ tokens, context, state }) => {
      const processId = Number(tokens[2]);
      if (!Number.isInteger(processId) || processId < 1 || processId > 65_535)
        return { context, output: ["% OSPF process ID must be 1-65535"] };
      const nextConfig = cloneRunning(state);
      nextConfig.routing.ipRouting = true;
      nextConfig.routing.ospf.enabled = true;
      nextConfig.routing.ospf.processId = processId;
      return {
        context,
        output: ["OSPF process enabled. Use ospf router-id and ospf network commands."],
        nextConfig,
        action: "apply",
      };
    },
  },
  {
    id: "no-router-ospf",
    modes: ["global-config"],
    usage: "no router ospf",
    matches: exact(["no", "router", "ospf"]),
    execute: ({ context, state }) => {
      const nextConfig = cloneRunning(state);
      nextConfig.routing.ospf.enabled = false;
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "ospf-router-id",
    modes: ["global-config"],
    usage: "ospf router-id <ipv4>",
    matches: starts(["ospf", "router-id"]),
    execute: ({ tokens, context, state }) => {
      const routerId = tokens[2];
      if (!routerId || ipv4ToInteger(routerId) === undefined)
        return { context, output: ["% Valid router ID is required"] };
      const nextConfig = cloneRunning(state);
      nextConfig.routing.ospf.routerId = routerId;
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "ospf-network",
    modes: ["global-config"],
    usage: "ospf network <network/prefix> area <area-id> [cost <1-65535>]",
    matches: starts(["ospf", "network"]),
    execute: ({ tokens, context, state }) => {
      const parsed = parseNetworkToken(tokens[2]);
      const areaIndex = tokens.findIndex((token) => token.toLowerCase() === "area");
      const costIndex = tokens.findIndex((token) => token.toLowerCase() === "cost");
      const areaId = tokens[areaIndex + 1];
      const cost = costIndex >= 0 ? Number(tokens[costIndex + 1]) : 10;
      if (!parsed || areaIndex < 0 || !areaId || !Number.isInteger(cost) || cost < 1 || cost > 65_535)
        return { context, output: ["% Usage: ospf network <network/prefix> area <area-id> [cost <1-65535>]"] };
      const nextConfig = cloneRunning(state);
      nextConfig.routing.ospf.enabled = true;
      nextConfig.routing.ospf.networks.push({ id: crypto.randomUUID(), ...parsed, areaId, cost });
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "interface",
    modes: ["global-config"],
    usage: "interface <name>",
    matches: starts(["interface"]),
    execute: ({ tokens, context, device, state }) => {
      const name = tokens.slice(1).join(" ");
      const sviMatch = /^vlan\s*(\d+)$/i.exec(name);
      if (sviMatch) {
        const vlanId = Number(sviMatch[1]);
        return state.runningConfig.switching?.vlans[String(vlanId)]
          ? { context: { mode: "interface-config", sviVlanId: vlanId }, output: [] }
          : { context, output: [`% VLAN ${vlanId} does not exist`] };
      }
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
    id: "ip-access-group",
    modes: ["interface-config"],
    usage: "ip access-group <name> <in|out>",
    matches: starts(["ip", "access-group"]),
    execute: ({ tokens, context, state }) => {
      const name = tokens[2];
      const direction = tokens[3] as "in" | "out";
      if (!context.interfaceId || !name || !(["in", "out"] as const).includes(direction))
        return { context, output: ["% Usage: ip access-group <name> <in|out>"] };
      const nextConfig = cloneRunning(state);
      if (!nextConfig.services.acl.accessLists[name]) return { context, output: [`% ACL ${name} not found`] };
      nextConfig.services.acl.enabled = true;
      nextConfig.services.acl.assignments = nextConfig.services.acl.assignments.filter(
        (item) => !(item.interfaceId === context.interfaceId && item.direction === direction),
      );
      nextConfig.services.acl.assignments.push({ interfaceId: context.interfaceId, direction, aclName: name });
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "no-ip-access-group",
    modes: ["interface-config"],
    usage: "no ip access-group <name> <in|out>",
    matches: starts(["no", "ip", "access-group"]),
    execute: ({ tokens, context, state }) => {
      const name = tokens[3];
      const direction = tokens[4] as "in" | "out";
      const nextConfig = cloneRunning(state);
      nextConfig.services.acl.assignments = nextConfig.services.acl.assignments.filter(
        (item) => !(item.interfaceId === context.interfaceId && item.direction === direction && item.aclName === name),
      );
      return { context, output: [], nextConfig, action: "apply" };
    },
  },
  {
    id: "shutdown",
    modes: ["interface-config"],
    usage: "shutdown",
    matches: exact(["shutdown"]),
    execute: ({ context, state }) =>
      context.sviVlanId
        ? updateSvi(context, state, (svi) => ({ ...svi, enabled: false }))
        : updateInterface(context, state, (item) => ({ ...item, enabled: false })),
  },
  {
    id: "no-shutdown",
    modes: ["interface-config"],
    usage: "no shutdown",
    matches: exact(["no", "shutdown"]),
    execute: ({ context, state }) =>
      context.sviVlanId
        ? updateSvi(context, state, (svi) => ({ ...svi, enabled: true }))
        : updateInterface(context, state, (item) => ({ ...item, enabled: true })),
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
      if (context.sviVlanId) {
        const current = state.runningConfig.routing.svis[String(context.sviVlanId)];
        return updateSvi(context, state, (svi) => ({
          ...svi,
          enabled: current?.enabled ?? true,
          ipv4: address,
          prefixLength,
        }));
      }
      return updateInterface(context, state, (item) => ({ ...item, ipv4: address, prefixLength }));
    },
  },
  {
    id: "no-ip-address",
    modes: ["interface-config"],
    usage: "no ip address",
    matches: exact(["no", "ip", "address"]),
    execute: ({ context, state }) => {
      if (context.sviVlanId) {
        const nextConfig = cloneRunning(state);
        delete nextConfig.routing.svis[String(context.sviVlanId)];
        return { context, output: [], nextConfig, action: "apply" };
      }
      return updateInterface(context, state, (item) => ({
        ...item,
        ipv4: undefined,
        prefixLength: undefined,
        defaultGateway: undefined,
      }));
    },
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

function updateSvi(
  context: CliContext,
  state: DeviceConfigurationState,
  update: (svi: DeviceRuntimeConfig["routing"]["svis"][string]) => DeviceRuntimeConfig["routing"]["svis"][string],
): CliCommandResult {
  if (!context.sviVlanId) return { context, output: ["% SVI context is missing"] };
  const current = state.runningConfig.routing.svis[String(context.sviVlanId)] ?? {
    vlanId: context.sviVlanId,
    enabled: true,
    ipv4: "0.0.0.0",
    prefixLength: 0,
  };
  const nextConfig = cloneRunning(state);
  nextConfig.routing.svis[String(context.sviVlanId)] = update(current);
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

function parseNetworkToken(value: string | undefined): { network: string; prefixLength: number } | undefined {
  if (!value || value.toLowerCase() === "any") return value ? { network: "0.0.0.0", prefixLength: 0 } : undefined;
  const [network, prefix] = value.split("/");
  const prefixLength = prefixFrom(prefix ?? "32");
  return network && ipv4ToInteger(network) !== undefined && prefixLength !== undefined
    ? { network, prefixLength }
    : undefined;
}

function renderCliConfig(config: DeviceRuntimeConfig, device: NetworkDevice): string {
  return renderRunningConfig(config, device);
}
