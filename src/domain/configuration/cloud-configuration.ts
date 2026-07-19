import { analyzeIPv4, ipv4ToInteger, isAddressInSubnet } from "@/engine/protocols/ipv4";
import type {
  CloudResourceRuntimeConfig,
  CloudRuntimeConfig,
  ConfigurationValidationResult,
  NetworkDevice,
} from "@/types/network";

const resource = (
  value: Omit<CloudResourceRuntimeConfig, "region" | "tags" | "status"> &
    Partial<Pick<CloudResourceRuntimeConfig, "region" | "tags" | "status">>,
): CloudResourceRuntimeConfig => ({
  region: "generic-1",
  tags: { environment: "lab" },
  status: "available",
  ...value,
});

export function createCloudRuntimeConfig(device: NetworkDevice): CloudRuntimeConfig {
  if (device.category !== "cloud" && !device.capabilities.includes("cloud")) return { enabled: false, resources: {} };
  const networkId = "network-main";
  const publicSubnetId = "subnet-public";
  const privateSubnetId = "subnet-private";
  return {
    enabled: true,
    resources: {
      [networkId]: resource({
        id: networkId,
        name: "NetLab Cloud Network",
        type: "cloud-network",
        configuration: { cidr: "10.20.0.0/16" },
      }),
      [publicSubnetId]: resource({
        id: publicSubnetId,
        name: "Public Subnet",
        type: "public-subnet",
        networkId,
        configuration: {
          cidr: "10.20.1.0/24",
          subnetClass: "public",
          routeTableId: "rt-public",
          networkAclId: "acl-main",
          availabilityZone: "generic-1a",
        },
      }),
      [privateSubnetId]: resource({
        id: privateSubnetId,
        name: "Private Subnet",
        type: "private-subnet",
        networkId,
        configuration: {
          cidr: "10.20.2.0/24",
          subnetClass: "private",
          routeTableId: "rt-private",
          networkAclId: "acl-main",
          availabilityZone: "generic-1a",
        },
      }),
      "rt-public": resource({
        id: "rt-public",
        name: "Public Routes",
        type: "route-table",
        networkId,
        configuration: {
          routes: [
            {
              id: "local-public",
              destinationCidr: "10.20.0.0/16",
              targetType: "local",
              targetResourceId: networkId,
              enabled: true,
            },
            {
              id: "internet-public",
              destinationCidr: "0.0.0.0/0",
              targetType: "internet-gateway",
              targetResourceId: "igw-main",
              enabled: true,
            },
          ],
        },
      }),
      "rt-private": resource({
        id: "rt-private",
        name: "Private Routes",
        type: "route-table",
        networkId,
        configuration: {
          routes: [
            {
              id: "local-private",
              destinationCidr: "10.20.0.0/16",
              targetType: "local",
              targetResourceId: networkId,
              enabled: true,
            },
            {
              id: "internet-private",
              destinationCidr: "0.0.0.0/0",
              targetType: "nat-gateway",
              targetResourceId: "nat-main",
              enabled: true,
            },
          ],
        },
      }),
      "igw-main": resource({
        id: "igw-main",
        name: "Internet Gateway",
        type: "internet-gateway",
        networkId,
        configuration: {},
      }),
      "nat-main": resource({
        id: "nat-main",
        name: "NAT Gateway",
        type: "nat-gateway",
        networkId,
        subnetId: publicSubnetId,
        configuration: { publicIp: "198.51.100.20" },
      }),
      "sg-web": resource({
        id: "sg-web",
        name: "Web Security Group",
        type: "security-group",
        networkId,
        configuration: {
          stateful: true,
          rules: [
            {
              id: "sg-in-icmp",
              priority: 100,
              direction: "inbound",
              action: "allow",
              protocol: "icmp",
              cidr: "0.0.0.0/0",
            },
            {
              id: "sg-in-http",
              priority: 110,
              direction: "inbound",
              action: "allow",
              protocol: "tcp",
              cidr: "0.0.0.0/0",
              fromPort: 80,
              toPort: 443,
            },
            {
              id: "sg-out-all",
              priority: 100,
              direction: "outbound",
              action: "allow",
              protocol: "any",
              cidr: "0.0.0.0/0",
            },
          ],
        },
      }),
      "acl-main": resource({
        id: "acl-main",
        name: "Subnet Network ACL",
        type: "network-acl",
        networkId,
        configuration: {
          stateful: false,
          rules: [
            { id: "acl-in", priority: 100, direction: "inbound", action: "allow", protocol: "any", cidr: "0.0.0.0/0" },
            {
              id: "acl-out",
              priority: 100,
              direction: "outbound",
              action: "allow",
              protocol: "any",
              cidr: "0.0.0.0/0",
            },
          ],
        },
      }),
      "vm-public": resource({
        id: "vm-public",
        name: "Public Web VM",
        type: "virtual-machine",
        networkId,
        subnetId: publicSubnetId,
        configuration: { privateIp: "10.20.1.10", publicIp: "203.0.113.10", securityGroupIds: ["sg-web"] },
      }),
      "vm-private": resource({
        id: "vm-private",
        name: "Private App VM",
        type: "virtual-machine",
        networkId,
        subnetId: privateSubnetId,
        configuration: { privateIp: "10.20.2.10", securityGroupIds: ["sg-web"] },
      }),
      "vpn-main": resource({
        id: "vpn-main",
        name: "Site-to-Site VPN Gateway",
        type: "vpn-gateway",
        networkId,
        configuration: { targetCidr: "172.16.0.0/16" },
      }),
      "lb-public": resource({
        id: "lb-public",
        name: "Public Load Balancer",
        type: "load-balancer",
        networkId,
        subnetId: publicSubnetId,
        configuration: { publicIp: "203.0.113.20", securityGroupIds: ["sg-web"] },
      }),
      "db-private": resource({
        id: "db-private",
        name: "Private Database",
        type: "cloud-database",
        networkId,
        subnetId: privateSubnetId,
        configuration: { privateIp: "10.20.2.20", securityGroupIds: ["sg-web"] },
      }),
      "storage-private": resource({
        id: "storage-private",
        name: "Cloud Storage",
        type: "cloud-storage",
        networkId,
        configuration: {},
      }),
      "endpoint-storage": resource({
        id: "endpoint-storage",
        name: "Storage Private Endpoint",
        type: "private-endpoint",
        networkId,
        subnetId: privateSubnetId,
        configuration: { privateIp: "10.20.2.30" },
      }),
      "transit-main": resource({
        id: "transit-main",
        name: "Transit Network",
        type: "transit-network",
        networkId,
        configuration: {},
      }),
    },
  };
}

export function normalizeCloudRuntimeConfig(
  device: NetworkDevice,
  current?: Partial<CloudRuntimeConfig>,
): CloudRuntimeConfig {
  const defaults = createCloudRuntimeConfig(device);
  return { ...defaults, ...current, resources: { ...defaults.resources, ...current?.resources } };
}

export function validateCloudRuntimeConfig(
  device: NetworkDevice,
  cloud: CloudRuntimeConfig,
): ConfigurationValidationResult["issues"] {
  const issues: ConfigurationValidationResult["issues"] = [];
  if (cloud.enabled && device.category !== "cloud" && !device.capabilities.includes("cloud"))
    issues.push({ path: "cloud", message: "This device does not support cloud networking" });
  const resources = cloud.resources;
  const networkCidrs = Object.values(resources)
    .filter((item) => item.type === "cloud-network" && item.configuration.cidr)
    .map((item) => ({ id: item.id, cidr: item.configuration.cidr! }));
  const subnets = Object.values(resources).filter(
    (item) => item.type === "public-subnet" || item.type === "private-subnet",
  );
  for (const [resourceId, item] of Object.entries(resources)) {
    const path = `cloud.resources.${resourceId}`;
    if (item.id !== resourceId) issues.push({ path: `${path}.id`, message: "Cloud resource key and ID must match" });
    if (!item.region.trim()) issues.push({ path: `${path}.region`, message: "Cloud region is required" });
    if (item.networkId && !resources[item.networkId])
      issues.push({ path: `${path}.networkId`, message: `Unknown network ${item.networkId}` });
    if (item.subnetId && !resources[item.subnetId])
      issues.push({ path: `${path}.subnetId`, message: `Unknown subnet ${item.subnetId}` });
    if (item.configuration.cidr && !parseCidr(item.configuration.cidr))
      issues.push({ path: `${path}.configuration.cidr`, message: "CIDR must use a valid network address and prefix" });
    if (item.configuration.privateIp && ipv4ToInteger(item.configuration.privateIp) === undefined)
      issues.push({ path: `${path}.configuration.privateIp`, message: "Private IP must be a valid IPv4 address" });
    if (item.configuration.publicIp && ipv4ToInteger(item.configuration.publicIp) === undefined)
      issues.push({ path: `${path}.configuration.publicIp`, message: "Public IP must be a valid IPv4 address" });
    for (const route of item.configuration.routes ?? []) {
      if (!parseCidr(route.destinationCidr))
        issues.push({ path: `${path}.configuration.routes.${route.id}`, message: "Route destination CIDR is invalid" });
      if (!resources[route.targetResourceId])
        issues.push({
          path: `${path}.configuration.routes.${route.id}.targetResourceId`,
          message: `Unknown route target ${route.targetResourceId}`,
        });
    }
    for (const rule of item.configuration.rules ?? []) {
      if (!parseCidr(rule.cidr))
        issues.push({ path: `${path}.configuration.rules.${rule.id}.cidr`, message: "Security rule CIDR is invalid" });
      if (!Number.isInteger(rule.priority) || rule.priority < 1 || rule.priority > 32_766)
        issues.push({
          path: `${path}.configuration.rules.${rule.id}.priority`,
          message: "Security rule priority must be 1-32766",
        });
      if (
        (rule.fromPort !== undefined || rule.toPort !== undefined) &&
        (rule.protocol === "any" || rule.protocol === "icmp")
      )
        issues.push({
          path: `${path}.configuration.rules.${rule.id}`,
          message: "Only TCP and UDP rules may specify ports",
        });
    }
    if (item.configuration.targetCidr && !parseCidr(item.configuration.targetCidr))
      issues.push({ path: `${path}.configuration.targetCidr`, message: "Target CIDR is invalid" });
  }
  for (const subnet of subnets) {
    const cidr = subnet.configuration.cidr;
    const network = subnet.networkId ? resources[subnet.networkId] : undefined;
    const networkCidr = network?.configuration.cidr;
    if (cidr && networkCidr && !cidrContains(networkCidr, cidr))
      issues.push({
        path: `cloud.resources.${subnet.id}.configuration.cidr`,
        message: `${cidr} is outside network ${networkCidr}`,
      });
    if (!resources[subnet.configuration.routeTableId ?? ""])
      issues.push({
        path: `cloud.resources.${subnet.id}.configuration.routeTableId`,
        message: "Subnet route table is missing",
      });
    if (!resources[subnet.configuration.networkAclId ?? ""])
      issues.push({
        path: `cloud.resources.${subnet.id}.configuration.networkAclId`,
        message: "Subnet network ACL is missing",
      });
  }
  for (let left = 0; left < subnets.length; left += 1)
    for (let right = left + 1; right < subnets.length; right += 1) {
      const a = subnets[left]!;
      const b = subnets[right]!;
      if (
        a.networkId === b.networkId &&
        a.configuration.cidr &&
        b.configuration.cidr &&
        cidrsOverlap(a.configuration.cidr, b.configuration.cidr)
      )
        issues.push({ path: `cloud.resources.${b.id}.configuration.cidr`, message: `Subnet CIDR overlaps ${a.name}` });
    }
  for (const network of networkCidrs) {
    const peerings = Object.values(resources).filter(
      (item) => item.type === "vpc-peering" && item.networkId === network.id,
    );
    for (const peering of peerings)
      if (peering.configuration.targetCidr && cidrsOverlap(network.cidr, peering.configuration.targetCidr))
        issues.push({
          path: `cloud.resources.${peering.id}.configuration.targetCidr`,
          message: "Peering CIDR overlaps the local cloud network",
        });
  }
  for (const instance of Object.values(resources).filter((item) =>
    ["virtual-machine", "cloud-database", "private-endpoint"].includes(item.type),
  )) {
    const subnet = instance.subnetId ? resources[instance.subnetId] : undefined;
    if (
      subnet?.configuration.cidr &&
      instance.configuration.privateIp &&
      !ipInCidr(instance.configuration.privateIp, subnet.configuration.cidr)
    )
      issues.push({
        path: `cloud.resources.${instance.id}.configuration.privateIp`,
        message: "Private IP is outside the selected subnet",
      });
  }
  return issues;
}

export function renderCloudRunningConfig(cloud: CloudRuntimeConfig): string[] {
  if (!cloud.enabled) return [];
  const lines = ["!", "cloud networking enable"];
  for (const item of Object.values(cloud.resources)) {
    lines.push(` cloud resource ${item.id} type ${item.type} region ${item.region} status ${item.status}`);
    if (item.configuration.cidr) lines.push(`  cidr ${item.configuration.cidr}`);
    for (const route of item.configuration.routes ?? [])
      lines.push(
        `  route ${route.destinationCidr} via ${route.targetType} ${route.targetResourceId}${route.enabled ? "" : " disabled"}`,
      );
    for (const rule of item.configuration.rules ?? [])
      lines.push(`  rule ${rule.priority} ${rule.direction} ${rule.action} ${rule.protocol} ${rule.cidr}`);
  }
  return lines;
}

export function parseCidr(cidr: string): { network: string; prefixLength: number } | undefined {
  const [address, prefixValue] = cidr.split("/");
  const prefixLength = Number(prefixValue);
  if (!address || !Number.isInteger(prefixLength)) return undefined;
  const analysis = analyzeIPv4(address, prefixLength);
  return analysis?.networkAddress === address ? { network: address, prefixLength } : undefined;
}

export function ipInCidr(ip: string, cidr: string): boolean {
  const parsed = parseCidr(cidr);
  return Boolean(parsed && isAddressInSubnet(ip, parsed.network, parsed.prefixLength));
}

export function cidrsOverlap(left: string, right: string): boolean {
  const a = parseCidr(left);
  const b = parseCidr(right);
  return Boolean(
    a &&
    b &&
    (isAddressInSubnet(a.network, b.network, b.prefixLength) ||
      isAddressInSubnet(b.network, a.network, a.prefixLength)),
  );
}

function cidrContains(parent: string, child: string): boolean {
  const parentCidr = parseCidr(parent);
  const childCidr = parseCidr(child);
  return Boolean(
    parentCidr &&
    childCidr &&
    childCidr.prefixLength >= parentCidr.prefixLength &&
    isAddressInSubnet(childCidr.network, parentCidr.network, parentCidr.prefixLength),
  );
}
