import type { SimulationEvent } from "@/engine/core/engine-types";
import { analyzeIPv4 } from "@/engine/protocols/ipv4";
import type {
  JsonValue,
  ProtocolContext,
  ProtocolModule,
  ProtocolResult,
  ProtocolRuntimeEvent,
  ProtocolValidationIssue,
} from "@/engine/protocols/protocol-types";
import type { DeviceRuntimeConfig, NetworkDevice, NetworkInterface } from "@/types/network";

type SummaryState = JsonValue & {
  readonly status: "converged" | "degraded";
  readonly participants: readonly string[];
  readonly facts: Readonly<Record<string, JsonValue>>;
};

type SummaryEvent = ProtocolRuntimeEvent<{
  readonly status: "converged" | "degraded";
  readonly participants: readonly string[];
  readonly reason: string;
}>;

const registryVersion = "1.0.0";

export const advancedProtocolModules: readonly ProtocolModule<SummaryState, SummaryEvent>[] = [
  createStpModule(),
  createLacpModule(),
  createOspfMultiAreaModule(),
  createFirstHopRedundancyModule("hsrp"),
  createFirstHopRedundancyModule("vrrp"),
  createNatModule(),
  createSdWanModule(),
];

function createStpModule(): ProtocolModule<SummaryState, SummaryEvent> {
  return summaryModule({
    id: "stp",
    dependencies: [],
    evaluate(context) {
      const switches = context.topology.devices.filter((device) => device.category === "switch");
      const trunks = context.topology.connections.filter(
        (connection) => connection.status === "up" && connection.protocol === "ethernet",
      );
      const participants = switches.map((device) => device.id).sort();
      return {
        status: trunks.length >= Math.max(0, switches.length - 1) ? "converged" : "degraded",
        participants,
        facts: { rootBridgeId: participants[0] ?? null, activeLinks: trunks.length },
        reason: "Spanning tree root and forwarding set recalculated",
      };
    },
    validate(device) {
      if (device.category !== "switch") return [];
      const runtime = runtimeConfig(device);
      const switching = runtime?.switching;
      if (!switching) return [];
      return device.interfaces
        .filter((networkInterface) => networkInterface.portMode === "trunk" && networkInterface.status === "up")
        .flatMap((networkInterface) =>
          networkInterface.allowedVlans?.length
            ? []
            : [
                issue(
                  "stp",
                  device,
                  "warning",
                  "TRUNK_WITHOUT_ALLOWED_VLANS",
                  `${networkInterface.name} trunk has no allowed VLAN list`,
                ),
              ],
        );
    },
  });
}

function createLacpModule(): ProtocolModule<SummaryState, SummaryEvent> {
  return summaryModule({
    id: "lacp",
    dependencies: ["stp"],
    evaluate(context) {
      const bundles = context.topology.devices.flatMap((device) => {
        const etherChannels = Object.values(runtimeConfig(device)?.switching?.etherChannels ?? {});
        return etherChannels.map((channel) => `${device.id}:${channel.id}:${channel.memberInterfaceIds.length}`);
      });
      return {
        status: bundles.every((bundle) => Number(bundle.split(":").at(-1)) > 0) ? "converged" : "degraded",
        participants: bundles.sort(),
        facts: { bundleCount: bundles.length },
        reason: "EtherChannel membership evaluated",
      };
    },
    validate(device) {
      const etherChannels = Object.values(runtimeConfig(device)?.switching?.etherChannels ?? {});
      return etherChannels.flatMap((channel) =>
        channel.protocol === "lacp" && channel.memberInterfaceIds.length < 2
          ? [
              issue(
                "lacp",
                device,
                "warning",
                "LACP_SINGLE_MEMBER",
                `Port-channel ${channel.id} has fewer than two LACP members`,
              ),
            ]
          : [],
      );
    },
  });
}

function createOspfMultiAreaModule(): ProtocolModule<SummaryState, SummaryEvent> {
  return summaryModule({
    id: "ospf.multi-area",
    dependencies: [],
    evaluate(context) {
      const areas = new Set<string>();
      const participants: string[] = [];
      for (const device of context.topology.devices) {
        const ospf = runtimeConfig(device)?.routing.ospf;
        if (!ospf?.enabled) continue;
        participants.push(device.id);
        ospf.networks.forEach((network) => areas.add(network.areaId));
      }
      return {
        status: areas.has("0") || areas.size <= 1 ? "converged" : "degraded",
        participants: participants.sort(),
        facts: { areas: [...areas].sort() },
        reason: "OSPF area backbone reachability evaluated",
      };
    },
    validate(device) {
      const ospf = runtimeConfig(device)?.routing.ospf;
      if (!ospf?.enabled) return [];
      const areas = new Set(ospf.networks.map((network) => network.areaId));
      return areas.size > 1 && !areas.has("0")
        ? [
            issue(
              "ospf.multi-area",
              device,
              "error",
              "MISSING_BACKBONE_AREA",
              "Multi-area OSPF device must participate in area 0",
            ),
          ]
        : [];
    },
  });
}

function createFirstHopRedundancyModule(id: "hsrp" | "vrrp"): ProtocolModule<SummaryState, SummaryEvent> {
  return summaryModule({
    id,
    dependencies: [],
    evaluate(context) {
      const participants = context.topology.devices
        .filter((device) => {
          const ha = runtimeConfig(device)?.operations.highAvailability;
          return ha?.enabled && ha.protocol === id;
        })
        .map((device) => device.id)
        .sort();
      return {
        status: participants.length > 1 ? "converged" : "degraded",
        participants,
        facts: { groupCount: participants.length },
        reason: `${id.toUpperCase()} active and standby roles selected deterministically`,
      };
    },
    validate(device) {
      const group = runtimeConfig(device)?.operations.highAvailability;
      if (!group?.enabled || group.protocol !== id) return [];
      const virtualIp = group.virtualIp;
      const hasLocalSubnet = routedInterfaces(device).some(
        (networkInterface) =>
          networkInterface.ipv4 &&
          networkInterface.prefixLength !== undefined &&
          analyzeIPv4(networkInterface.ipv4, networkInterface.prefixLength)?.networkAddress ===
            analyzeIPv4(virtualIp, networkInterface.prefixLength)?.networkAddress,
      );
      return hasLocalSubnet
        ? []
        : [
            issue(
              id,
              device,
              "error",
              "VIRTUAL_IP_OUTSIDE_LOCAL_SUBNET",
              `Virtual IP ${virtualIp} is outside local routed interfaces`,
            ),
          ];
    },
  });
}

function createNatModule(): ProtocolModule<SummaryState, SummaryEvent> {
  return summaryModule({
    id: "nat",
    dependencies: [],
    evaluate(context) {
      const participants = context.topology.devices
        .filter((device) => (runtimeConfig(device)?.services.nat.rules ?? []).length > 0)
        .map((device) => device.id)
        .sort();
      return {
        status: participants.length > 0 ? "converged" : "degraded",
        participants,
        facts: { patReady: participants.length > 0 },
        reason: "NAT/PAT policy table compiled",
      };
    },
    validate(device) {
      const rules = runtimeConfig(device)?.services.nat.rules ?? [];
      return rules.flatMap((rule, index) =>
        rule.translatedAddress || rule.poolName || (rule.translatedPort !== undefined && rule.outsideInterfaceId)
          ? []
          : [
              issue(
                "nat",
                device,
                "error",
                "NAT_TRANSLATION_MISSING",
                `NAT rule ${index + 1} needs translated address or overload interface`,
              ),
            ],
      );
    },
  });
}

function createSdWanModule(): ProtocolModule<SummaryState, SummaryEvent> {
  return summaryModule({
    id: "sd-wan.sla-path-selection",
    dependencies: [],
    evaluate(context) {
      const wanLinks = context.topology.connections.filter((connection) =>
        ["internet", "cellular", "sd-wan", "vpn", "mpls"].includes(connection.cableType),
      );
      const usable = wanLinks.filter((connection) => connection.status === "up" && connection.packetLossPercent < 5);
      return {
        status: usable.length > 0 || wanLinks.length === 0 ? "converged" : "degraded",
        participants: usable.map((connection) => connection.id).sort(),
        facts: { candidatePaths: wanLinks.length, usablePaths: usable.length },
        reason: "WAN SLA path candidates scored by loss and latency",
      };
    },
    validate() {
      return [];
    },
  });
}

function summaryModule(options: {
  readonly id: string;
  readonly dependencies: readonly string[];
  readonly evaluate: (
    context: ProtocolContext,
  ) => SummaryEvent["payload"] & { readonly facts: Readonly<Record<string, JsonValue>> };
  readonly validate: (device: NetworkDevice, context: ProtocolContext) => readonly ProtocolValidationIssue[];
}): ProtocolModule<SummaryState, SummaryEvent> {
  const compute = (context: ProtocolContext): SummaryState => {
    const evaluation = options.evaluate(context);
    return {
      status: evaluation.status,
      participants: evaluation.participants,
      facts: evaluation.facts,
    };
  };
  return {
    id: options.id,
    version: registryVersion,
    dependencies: options.dependencies,
    initialize: compute,
    handleEvent(
      event: SimulationEvent,
      _state: SummaryState,
      context: ProtocolContext,
    ): ProtocolResult<SummaryState, SummaryEvent> {
      const state = compute(context);
      return {
        state,
        events: [
          {
            protocolId: options.id,
            type: `${options.id}.convergence`,
            timestamp: event.timestamp,
            payload: {
              status: state.status,
              participants: state.participants,
              reason: options.evaluate(context).reason,
            },
          },
        ],
      };
    },
    validateConfiguration: options.validate,
    restoreState(snapshot: JsonValue) {
      return snapshot as SummaryState;
    },
  };
}

function runtimeConfig(device: NetworkDevice): DeviceRuntimeConfig | undefined {
  const value = device.configuration.runtimeConfig;
  return value && typeof value === "object" ? (value as DeviceRuntimeConfig) : undefined;
}

function routedInterfaces(device: NetworkDevice): readonly NetworkInterface[] {
  const runtime = runtimeConfig(device);
  const svis = Object.values(runtime?.routing.svis ?? {}).map((svi): NetworkInterface => ({
    id: `svi:${device.id}:${svi.vlanId}`,
    name: `Vlan${svi.vlanId}`,
    type: "vlan",
    status: svi.enabled ? "up" : "administratively-down",
    medium: "logical",
    ipv4: svi.ipv4,
    prefixLength: svi.prefixLength,
    vlan: svi.vlanId,
    mtu: 1500,
  }));
  return [...device.interfaces, ...svis];
}

function issue(
  protocolId: string,
  device: NetworkDevice,
  severity: "warning" | "error",
  code: string,
  message: string,
): ProtocolValidationIssue {
  return { protocolId, deviceId: device.id, severity, code, message };
}
