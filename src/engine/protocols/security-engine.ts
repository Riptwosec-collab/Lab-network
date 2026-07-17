import { isAddressInSubnet } from "@/engine/protocols/ipv4";
import type { RoutingTraceResult } from "@/engine/protocols/routing-engine";
import type { ServicePacket } from "@/engine/protocols/services-engine";
import type { DeviceRuntimeConfig, NetworkDevice, TopologySnapshot, VpnTunnelRuntimeConfig } from "@/types/network";

export interface FirewallDecision {
  readonly permitted: boolean;
  readonly deviceId: string;
  readonly hostname: string;
  readonly sourceZone: string;
  readonly destinationZone: string;
  readonly policyId?: string;
  readonly policyName?: string;
  readonly order?: number;
  readonly sessionMatch: boolean;
  readonly reason: string;
}

export interface FirewallSession {
  readonly id: string;
  readonly deviceId: string;
  readonly protocol: ServicePacket["protocol"];
  readonly sourceIp: string;
  readonly destinationIp: string;
  readonly sourcePort?: number;
  readonly destinationPort?: number;
  readonly policyId: string;
  readonly state: "established" | "expired";
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface FirewallPathResult {
  readonly permitted: boolean;
  readonly decisions: readonly FirewallDecision[];
  readonly sessions: readonly FirewallSession[];
  readonly reason: string;
}

export interface VpnNegotiationResult {
  readonly success: boolean;
  readonly localDeviceId: string;
  readonly remoteDeviceId?: string;
  readonly tunnelId: string;
  readonly state: "up" | "down";
  readonly reason:
    | "ESTABLISHED"
    | "AUTHENTICATION_FAILED"
    | "PROPOSAL_MISMATCH"
    | "PEER_UNREACHABLE"
    | "NO_MATCHING_ROUTE"
    | "TUNNEL_DISABLED";
  readonly detail: string;
}

export interface WirelessAssociation {
  readonly id: string;
  readonly clientDeviceId: string;
  readonly accessPointDeviceId: string;
  readonly ssid: string;
  readonly bssid: string;
  readonly vlanId: number;
  readonly signalDbm: number;
  readonly authenticatedBy: "open" | "psk" | "radius";
  readonly associatedAt: string;
}

export interface WirelessAssociationResult {
  readonly success: boolean;
  readonly code:
    | "ASSOCIATED"
    | "SSID_NOT_FOUND"
    | "RADIO_DOWN"
    | "AUTHENTICATION_FAILED"
    | "RADIUS_UNAVAILABLE"
    | "CAPACITY_EXCEEDED"
    | "SIGNAL_LOST";
  readonly reason: string;
  readonly association?: WirelessAssociation;
}

export class SecuritySimulationEngine {
  private readonly sessions = new Map<string, FirewallSession>();
  private readonly associations = new Map<string, WirelessAssociation>();

  constructor(private readonly topology: TopologySnapshot) {}

  evaluateFirewallPath(trace: RoutingTraceResult, packet: ServicePacket, now = new Date()): FirewallPathResult {
    this.expire(now);
    const decisions: FirewallDecision[] = [];
    for (const [index, hop] of trace.hops.entries()) {
      const device = this.topology.devices.find((item) => item.id === hop.deviceId);
      const firewall = device ? runtimeConfig(device)?.security.firewall : undefined;
      if (!device || !firewall?.enabled) continue;
      const ingress = this.ingressInterfaceId(device, trace.layer2Segments[index]);
      const sourceZone = zoneFor(firewall.zones, ingress);
      const destinationZone = zoneFor(firewall.zones, hop.route.outgoingInterfaceId);
      const existingSession = [...this.sessions.values()].find(
        (item) => item.deviceId === device.id && item.state === "established" && reverseSessionMatches(item, packet),
      );
      if (existingSession) {
        decisions.push({
          permitted: true,
          deviceId: device.id,
          hostname: device.hostname,
          sourceZone,
          destinationZone,
          policyId: existingSession.policyId,
          sessionMatch: true,
          reason: "Return traffic allowed by stateful session",
        });
        continue;
      }
      const policy = [...firewall.policies]
        .filter((item) => item.enabled)
        .sort((a, b) => a.order - b.order)
        .find((item) => {
          const source = firewall.addressObjects[item.sourceAddress];
          const destination = firewall.addressObjects[item.destinationAddress];
          const service = firewall.serviceObjects[item.service];
          return (
            item.sourceZone === sourceZone &&
            item.destinationZone === destinationZone &&
            !!source &&
            !!destination &&
            !!service &&
            isAddressInSubnet(packet.sourceIp, source.network, source.prefixLength) &&
            isAddressInSubnet(packet.destinationIp, destination.network, destination.prefixLength) &&
            (service.protocol === "ip" || service.protocol === packet.protocol) &&
            (!service.ports.length || (!!packet.destinationPort && service.ports.includes(packet.destinationPort)))
          );
        });
      if (!policy || policy.action === "deny") {
        const decision: FirewallDecision = {
          permitted: false,
          deviceId: device.id,
          hostname: device.hostname,
          sourceZone,
          destinationZone,
          policyId: policy?.id,
          policyName: policy?.name,
          order: policy?.order,
          sessionMatch: false,
          reason: policy
            ? `First match policy ${policy.name} denied traffic`
            : "Implicit deny: no security policy matched",
        };
        decisions.push(decision);
        return { permitted: false, decisions, sessions: this.listSessions(now), reason: decision.reason };
      }
      const session = createSession(device, policy.id, packet, firewall.sessionTimeoutSeconds, now);
      this.sessions.set(session.id, session);
      decisions.push({
        permitted: true,
        deviceId: device.id,
        hostname: device.hostname,
        sourceZone,
        destinationZone,
        policyId: policy.id,
        policyName: policy.name,
        order: policy.order,
        sessionMatch: false,
        reason: `First match policy ${policy.name} allowed traffic`,
      });
    }
    return {
      permitted: true,
      decisions,
      sessions: this.listSessions(now),
      reason: decisions.length ? "Firewall policy allowed packet" : "No firewall on routed path",
    };
  }

  listSessions(now = new Date()): readonly FirewallSession[] {
    this.expire(now);
    return [...this.sessions.values()];
  }

  negotiateVpn(localDeviceId: string, tunnelId: string): VpnNegotiationResult {
    const local = this.topology.devices.find((item) => item.id === localDeviceId);
    const tunnel = local ? runtimeConfig(local)?.security.vpn.tunnels[tunnelId] : undefined;
    const fail = (
      reason: VpnNegotiationResult["reason"],
      detail: string,
      remoteDeviceId?: string,
    ): VpnNegotiationResult => ({
      success: false,
      localDeviceId,
      remoteDeviceId,
      tunnelId,
      state: "down",
      reason,
      detail,
    });
    if (!local || !tunnel?.enabled) return fail("TUNNEL_DISABLED", "Tunnel is missing or disabled");
    const remote = this.topology.devices.find((device) =>
      device.interfaces.some((item) => item.ipv4 === tunnel.remotePeer),
    );
    if (!remote) return fail("PEER_UNREACHABLE", `Remote peer ${tunnel.remotePeer} is not present in topology`);
    const counterpart = Object.values(runtimeConfig(remote)?.security.vpn.tunnels ?? {}).find(
      (item) => item.enabled && item.remotePeer === tunnel.localPeer && item.localPeer === tunnel.remotePeer,
    );
    if (!counterpart) return fail("PEER_UNREACHABLE", "Remote peer has no matching tunnel", remote.id);
    if (tunnel.type !== "gre" && tunnel.preSharedKey !== counterpart.preSharedKey)
      return fail("AUTHENTICATION_FAILED", "Pre-shared keys do not match", remote.id);
    if (!proposalMatches(tunnel, counterpart))
      return fail("PROPOSAL_MISMATCH", "IKE/IPSec proposals do not match", remote.id);
    if (
      tunnel.localNetwork !== counterpart.remoteNetwork ||
      tunnel.localPrefixLength !== counterpart.remotePrefixLength ||
      tunnel.remoteNetwork !== counterpart.localNetwork ||
      tunnel.remotePrefixLength !== counterpart.localPrefixLength
    )
      return fail("NO_MATCHING_ROUTE", "Protected networks are not symmetric", remote.id);
    return {
      success: true,
      localDeviceId,
      remoteDeviceId: remote.id,
      tunnelId,
      state: "up",
      reason: "ESTABLISHED",
      detail: `${tunnel.type} tunnel established using ${tunnel.encryption}/${tunnel.hash}`,
    };
  }

  associateWireless(
    clientDeviceId: string,
    accessPointDeviceId: string,
    ssidName: string,
    credentials: { password?: string; username?: string } = {},
    now = new Date(),
  ): WirelessAssociationResult {
    const ap = this.topology.devices.find((item) => item.id === accessPointDeviceId);
    const wireless = ap ? runtimeConfig(ap)?.security.wireless : undefined;
    const ssid = wireless
      ? Object.values(wireless.ssids).find((item) => item.name === ssidName && item.enabled)
      : undefined;
    if (!ap || !wireless || !ssid)
      return { success: false, code: "SSID_NOT_FOUND", reason: `SSID ${ssidName} is not broadcasting` };
    if (!ssid.radioIds.some((id) => wireless.radios[id]?.enabled))
      return { success: false, code: "RADIO_DOWN", reason: "All radios mapped to the SSID are disabled" };
    if (
      [...this.associations.values()].filter((item) => item.accessPointDeviceId === ap.id && item.ssid === ssid.name)
        .length >= ssid.maximumClients
    )
      return { success: false, code: "CAPACITY_EXCEEDED", reason: "SSID client capacity reached" };
    let authenticatedBy: WirelessAssociation["authenticatedBy"] = "open";
    if (ssid.securityMode.endsWith("psk")) {
      if (credentials.password !== ssid.preSharedKey)
        return { success: false, code: "AUTHENTICATION_FAILED", reason: "Wireless pre-shared key is incorrect" };
      authenticatedBy = "psk";
    }
    let vlanId = ssid.vlanId;
    if (ssid.securityMode.endsWith("enterprise")) {
      const radiusDevice = this.topology.devices.find((device) =>
        device.interfaces.some((item) => item.ipv4 === ssid.radiusServer),
      );
      const radius = radiusDevice ? runtimeConfig(radiusDevice)?.security.radius : undefined;
      const client = radius?.clients.find((item) => item.deviceId === ap.id);
      const user = credentials.username ? radius?.users[credentials.username] : undefined;
      if (!radius?.enabled || !client || client.secret !== ssid.radiusSecret)
        return {
          success: false,
          code: "RADIUS_UNAVAILABLE",
          reason: "RADIUS server/client secret is unavailable or mismatched",
        };
      if (!user?.enabled || user.password !== credentials.password)
        return { success: false, code: "AUTHENTICATION_FAILED", reason: "RADIUS Access-Reject" };
      vlanId = user.vlanId ?? vlanId;
      authenticatedBy = "radius";
    }
    const connection = this.topology.connections.find(
      (item) =>
        (item.sourceDeviceId === clientDeviceId && item.targetDeviceId === ap.id) ||
        (item.targetDeviceId === clientDeviceId && item.sourceDeviceId === ap.id),
    );
    if (connection && connection.status !== "up")
      return { success: false, code: "SIGNAL_LOST", reason: "Wireless link is down" };
    const association: WirelessAssociation = {
      id: `${clientDeviceId}:${ap.id}:${ssid.id}`,
      clientDeviceId,
      accessPointDeviceId: ap.id,
      ssid: ssid.name,
      bssid: ssid.bssid,
      vlanId,
      signalDbm: connection ? Math.max(-90, -35 - connection.latencyMs * 2) : -55,
      authenticatedBy,
      associatedAt: now.toISOString(),
    };
    this.associations.set(association.id, association);
    return { success: true, code: "ASSOCIATED", reason: `Associated to ${ssid.name} on VLAN ${vlanId}`, association };
  }

  listAssociations(): readonly WirelessAssociation[] {
    return [...this.associations.values()];
  }

  private ingressInterfaceId(
    device: NetworkDevice,
    segment: RoutingTraceResult["layer2Segments"][number] | undefined,
  ): string | undefined {
    if (!segment) return undefined;
    for (const id of [...segment.connectionIds].reverse()) {
      const connection = this.topology.connections.find((item) => item.id === id);
      if (connection?.sourceDeviceId === device.id) return connection.sourceInterfaceId;
      if (connection?.targetDeviceId === device.id) return connection.targetInterfaceId;
    }
    return undefined;
  }

  private expire(now: Date): void {
    for (const [id, session] of this.sessions)
      if (Date.parse(session.expiresAt) <= now.getTime()) this.sessions.set(id, { ...session, state: "expired" });
  }
}

function runtimeConfig(device: NetworkDevice): DeviceRuntimeConfig | undefined {
  const value = device.configuration.runtimeConfig;
  return value && typeof value === "object" ? (value as DeviceRuntimeConfig) : undefined;
}
function zoneFor(zones: DeviceRuntimeConfig["security"]["firewall"]["zones"], interfaceId?: string): string {
  return (
    Object.values(zones).find((zone) => !!interfaceId && zone.interfaceIds.includes(interfaceId))?.name ?? "unknown"
  );
}
function createSession(
  device: NetworkDevice,
  policyId: string,
  packet: ServicePacket,
  timeout: number,
  now: Date,
): FirewallSession {
  const id = `${device.id}:${packet.protocol}:${packet.sourceIp}:${packet.destinationIp}:${packet.sourcePort ?? 0}:${packet.destinationPort ?? 0}`;
  return {
    id,
    deviceId: device.id,
    protocol: packet.protocol,
    sourceIp: packet.sourceIp,
    destinationIp: packet.destinationIp,
    sourcePort: packet.sourcePort,
    destinationPort: packet.destinationPort,
    policyId,
    state: "established",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + timeout * 1000).toISOString(),
  };
}
function reverseSessionMatches(session: FirewallSession, packet: ServicePacket): boolean {
  return (
    session.protocol === packet.protocol &&
    session.sourceIp === packet.destinationIp &&
    session.destinationIp === packet.sourceIp &&
    session.sourcePort === packet.destinationPort &&
    session.destinationPort === packet.sourcePort
  );
}
function proposalMatches(left: VpnTunnelRuntimeConfig, right: VpnTunnelRuntimeConfig): boolean {
  return (
    left.type === right.type &&
    left.encryption === right.encryption &&
    left.hash === right.hash &&
    left.ikeVersion === right.ikeVersion
  );
}
