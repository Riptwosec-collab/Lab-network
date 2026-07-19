import { ipInCidr } from "@/domain/configuration/cloud-configuration";
import type {
  CloudResourceRuntimeConfig,
  CloudRouteRuntimeConfig,
  CloudRuleProtocol,
  CloudRuntimeConfig,
} from "@/types/network";

export interface CloudFlowRequest {
  readonly sourceResourceId: string;
  readonly destination: "internet" | string;
  readonly protocol: Exclude<CloudRuleProtocol, "any">;
  readonly port?: number;
}

export interface CloudFlowStep {
  readonly component: string;
  readonly decision: "allow" | "deny" | "route";
  readonly detail: string;
}

export interface CloudFlowResult {
  readonly success: boolean;
  readonly code:
    | "REACHABLE"
    | "RESOURCE_NOT_FOUND"
    | "RESOURCE_UNAVAILABLE"
    | "SUBNET_NOT_FOUND"
    | "MISSING_ROUTE"
    | "INVALID_ROUTE_TARGET"
    | "PUBLIC_IP_REQUIRED"
    | "PRIVATE_SUBNET_DIRECT_INTERNET"
    | "SECURITY_GROUP_BLOCK"
    | "NETWORK_ACL_BLOCK"
    | "PEERING_NOT_ACTIVE"
    | "VPN_NOT_ACTIVE";
  readonly reason: string;
  readonly route?: CloudRouteRuntimeConfig;
  readonly translatedSourceIp?: string;
  readonly statefulReturnAllowed: boolean;
  readonly steps: CloudFlowStep[];
}

export class CloudNetworkEngine {
  constructor(private readonly cloud: CloudRuntimeConfig) {}

  simulate(request: CloudFlowRequest): CloudFlowResult {
    const steps: CloudFlowStep[] = [];
    const fail = (
      code: Exclude<CloudFlowResult["code"], "REACHABLE">,
      reason: string,
      route?: CloudRouteRuntimeConfig,
    ): CloudFlowResult => ({
      success: false,
      code,
      reason,
      route,
      statefulReturnAllowed: false,
      steps,
    });
    const source = this.cloud.resources[request.sourceResourceId];
    if (!source) return fail("RESOURCE_NOT_FOUND", "Source cloud resource was not found");
    if (source.status !== "available") return fail("RESOURCE_UNAVAILABLE", `${source.name} is ${source.status}`);
    const sourceSubnet = source.subnetId ? this.cloud.resources[source.subnetId] : undefined;
    if (!sourceSubnet) return fail("SUBNET_NOT_FOUND", "Source resource is not attached to a subnet");
    const sourceIp = source.configuration.privateIp;
    if (!sourceIp) return fail("RESOURCE_NOT_FOUND", "Source resource has no private IP address");

    const destinationResource =
      request.destination === "internet" ? undefined : this.cloud.resources[request.destination];
    if (request.destination !== "internet" && !destinationResource)
      return fail("RESOURCE_NOT_FOUND", "Destination cloud resource was not found");
    if (destinationResource && destinationResource.status !== "available")
      return fail("RESOURCE_UNAVAILABLE", `${destinationResource.name} is ${destinationResource.status}`);
    const destinationIp = destinationResource?.configuration.privateIp ?? "8.8.8.8";

    const sourceSecurity = this.evaluateSecurityGroups(
      source,
      "outbound",
      destinationIp,
      request.protocol,
      request.port,
    );
    steps.push({
      component: "Security Group (outbound)",
      decision: sourceSecurity.allowed ? "allow" : "deny",
      detail: sourceSecurity.reason,
    });
    if (!sourceSecurity.allowed) return fail("SECURITY_GROUP_BLOCK", sourceSecurity.reason);

    const sourceAcl = this.evaluateNetworkAcl(sourceSubnet, "outbound", destinationIp, request.protocol, request.port);
    steps.push({
      component: "Network ACL (outbound)",
      decision: sourceAcl.allowed ? "allow" : "deny",
      detail: sourceAcl.reason,
    });
    if (!sourceAcl.allowed) return fail("NETWORK_ACL_BLOCK", sourceAcl.reason);

    const routeTable = this.cloud.resources[sourceSubnet.configuration.routeTableId ?? ""];
    const route = this.bestRoute(routeTable, destinationIp);
    if (!route) return fail("MISSING_ROUTE", `No route from ${sourceSubnet.name} to ${destinationIp}`);
    steps.push({
      component: routeTable?.name ?? "Route table",
      decision: "route",
      detail: `${route.destinationCidr} → ${route.targetType} ${route.targetResourceId}`,
    });
    const target = this.cloud.resources[route.targetResourceId];
    if (!target || target.status !== "available")
      return fail("INVALID_ROUTE_TARGET", "The selected route target is missing or unavailable", route);

    let translatedSourceIp: string | undefined;
    if (request.destination === "internet") {
      if (route.targetType === "internet-gateway") {
        if (sourceSubnet.type === "private-subnet")
          return fail(
            "PRIVATE_SUBNET_DIRECT_INTERNET",
            "Private subnets cannot reach the Internet directly through an Internet Gateway",
            route,
          );
        if (!source.configuration.publicIp)
          return fail("PUBLIC_IP_REQUIRED", "A public IP is required for direct Internet Gateway access", route);
        translatedSourceIp = source.configuration.publicIp;
      } else if (route.targetType === "nat-gateway") {
        const natSubnet = target.subnetId ? this.cloud.resources[target.subnetId] : undefined;
        if (target.type !== "nat-gateway" || natSubnet?.type !== "public-subnet" || !target.configuration.publicIp)
          return fail(
            "INVALID_ROUTE_TARGET",
            "NAT Gateway must be available in a public subnet with a public IP",
            route,
          );
        translatedSourceIp = target.configuration.publicIp;
      } else {
        return fail(
          "INVALID_ROUTE_TARGET",
          "Internet traffic requires an Internet Gateway or NAT Gateway route",
          route,
        );
      }
    } else if (destinationResource) {
      if (source.networkId !== destinationResource.networkId) {
        if (route.targetType === "vpc-peering" && target.type === "vpc-peering") {
          if (target.configuration.targetNetworkId !== destinationResource.networkId)
            return fail("PEERING_NOT_ACTIVE", "Peering target does not match the destination network", route);
        } else if (route.targetType === "vpn-gateway" && target.type === "vpn-gateway") {
          if (!target.configuration.targetCidr || !ipInCidr(destinationIp, target.configuration.targetCidr))
            return fail("VPN_NOT_ACTIVE", "VPN target CIDR does not include the destination", route);
        } else if (route.targetType !== "transit-network") {
          return fail("INVALID_ROUTE_TARGET", "Cross-network traffic requires peering, VPN, or transit routing", route);
        }
      }
      const destinationSubnet = destinationResource.subnetId
        ? this.cloud.resources[destinationResource.subnetId]
        : undefined;
      if (!destinationSubnet)
        return fail("SUBNET_NOT_FOUND", "Destination resource is not attached to a subnet", route);
      const destinationAcl = this.evaluateNetworkAcl(
        destinationSubnet,
        "inbound",
        sourceIp,
        request.protocol,
        request.port,
      );
      steps.push({
        component: "Network ACL (inbound)",
        decision: destinationAcl.allowed ? "allow" : "deny",
        detail: destinationAcl.reason,
      });
      if (!destinationAcl.allowed) return fail("NETWORK_ACL_BLOCK", destinationAcl.reason, route);
      const destinationSecurity = this.evaluateSecurityGroups(
        destinationResource,
        "inbound",
        sourceIp,
        request.protocol,
        request.port,
      );
      steps.push({
        component: "Security Group (inbound)",
        decision: destinationSecurity.allowed ? "allow" : "deny",
        detail: destinationSecurity.reason,
      });
      if (!destinationSecurity.allowed) return fail("SECURITY_GROUP_BLOCK", destinationSecurity.reason, route);
    }

    const statefulReturnAllowed = sourceSecurity.stateful;
    steps.push({
      component: "Flow state",
      decision: "allow",
      detail: statefulReturnAllowed
        ? "Security Group permits return traffic statefully"
        : "Return traffic must pass stateless ACL rules",
    });
    return {
      success: true,
      code: "REACHABLE",
      reason:
        request.destination === "internet"
          ? `${source.name} reaches the Internet through ${target.name}`
          : `${source.name} reaches ${destinationResource?.name}`,
      route,
      translatedSourceIp,
      statefulReturnAllowed,
      steps,
    };
  }

  private bestRoute(
    routeTable: CloudResourceRuntimeConfig | undefined,
    destinationIp: string,
  ): CloudRouteRuntimeConfig | undefined {
    if (routeTable?.type !== "route-table") return undefined;
    return (routeTable.configuration.routes ?? [])
      .filter((route) => route.enabled && ipInCidr(destinationIp, route.destinationCidr))
      .sort(
        (left, right) => Number(right.destinationCidr.split("/")[1]) - Number(left.destinationCidr.split("/")[1]),
      )[0];
  }

  private evaluateSecurityGroups(
    resource: CloudResourceRuntimeConfig,
    direction: "inbound" | "outbound",
    peerIp: string,
    protocol: Exclude<CloudRuleProtocol, "any">,
    port?: number,
  ): { allowed: boolean; reason: string; stateful: boolean } {
    const groups = (resource.configuration.securityGroupIds ?? []).flatMap((id) => {
      const group = this.cloud.resources[id];
      return group?.type === "security-group" && group.status === "available" ? [group] : [];
    });
    if (!groups.length)
      return { allowed: false, reason: `${resource.name} has no available Security Group`, stateful: false };
    for (const group of groups) {
      const rule = orderedRule(group, direction, peerIp, protocol, port);
      if (rule?.action === "allow")
        return {
          allowed: true,
          reason: `${group.name} rule ${rule.id} allows the flow`,
          stateful: group.configuration.stateful !== false,
        };
      if (rule?.action === "deny")
        return {
          allowed: false,
          reason: `${group.name} rule ${rule.id} denies the flow`,
          stateful: group.configuration.stateful !== false,
        };
    }
    return { allowed: false, reason: `Security Group default deny for ${direction} ${protocol}`, stateful: true };
  }

  private evaluateNetworkAcl(
    subnet: CloudResourceRuntimeConfig,
    direction: "inbound" | "outbound",
    peerIp: string,
    protocol: Exclude<CloudRuleProtocol, "any">,
    port?: number,
  ): { allowed: boolean; reason: string } {
    const acl = this.cloud.resources[subnet.configuration.networkAclId ?? ""];
    if (acl?.type !== "network-acl" || acl.status !== "available")
      return { allowed: false, reason: `${subnet.name} has no available Network ACL` };
    const rule = orderedRule(acl, direction, peerIp, protocol, port);
    return rule
      ? {
          allowed: rule.action === "allow",
          reason: `${acl.name} ordered rule ${rule.priority} ${rule.action}s the flow`,
        }
      : { allowed: false, reason: `${acl.name} implicit deny` };
  }
}

function orderedRule(
  policy: CloudResourceRuntimeConfig,
  direction: "inbound" | "outbound",
  peerIp: string,
  protocol: Exclude<CloudRuleProtocol, "any">,
  port?: number,
) {
  return (policy.configuration.rules ?? [])
    .filter((rule) => rule.direction === direction)
    .sort((left, right) => left.priority - right.priority)
    .find((rule) => {
      if (rule.protocol !== "any" && rule.protocol !== protocol) return false;
      if (!ipInCidr(peerIp, rule.cidr)) return false;
      if (rule.fromPort === undefined && rule.toPort === undefined) return true;
      if (port === undefined) return false;
      return port >= (rule.fromPort ?? 0) && port <= (rule.toPort ?? 65_535);
    });
}
