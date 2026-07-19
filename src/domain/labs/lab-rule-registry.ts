import { CloudNetworkEngine } from "@/engine/cloud/cloud-network-engine";
import { OspfEngine } from "@/engine/protocols/ospf-engine";
import { IPv4PingEngine } from "@/engine/protocols/ping-engine";
import { IPv4RoutingEngine } from "@/engine/protocols/routing-engine";
import { NetworkServicesEngine } from "@/engine/protocols/services-engine";
import { StorageSimulationEngine } from "@/engine/storage/storage-engine";
import type { LabRuleType, LabVerificationRule } from "@/types/lab";
import type { ProjectConfigurationState, TopologySnapshot } from "@/types/network";

export interface LabRuleContext {
  readonly topology: TopologySnapshot;
  readonly configurationState: ProjectConfigurationState;
}

export interface LabRuleEvaluation {
  readonly passed: boolean;
  readonly message: string;
  readonly evidence: readonly string[];
}

export type LabRuleEvaluator = (
  context: LabRuleContext,
  rule: LabVerificationRule,
) => LabRuleEvaluation | Promise<LabRuleEvaluation>;

export class LabRuleRegistry {
  private readonly rules = new Map<LabRuleType, LabRuleEvaluator>();

  register(type: LabRuleType, evaluator: LabRuleEvaluator): this {
    this.rules.set(type, evaluator);
    return this;
  }

  has(type: LabRuleType): boolean {
    return this.rules.has(type);
  }

  async evaluate(context: LabRuleContext, rule: LabVerificationRule): Promise<LabRuleEvaluation> {
    const evaluator = this.rules.get(rule.type);
    if (!evaluator) throw new Error(`No lab rule is registered for ${rule.type}`);
    return evaluator(context, rule);
  }
}

const passed = (message: string, evidence: readonly string[] = []): LabRuleEvaluation => ({
  passed: true,
  message,
  evidence,
});
const failed = (message: string, evidence: readonly string[] = []): LabRuleEvaluation => ({
  passed: false,
  message,
  evidence,
});

function configuredDevices(context: LabRuleContext) {
  return context.topology.devices.flatMap((device) => {
    const state = context.configurationState.devices[device.id];
    return state ? [{ device, config: state.runningConfig }] : [];
  });
}

export function createBuiltInLabRuleRegistry(): LabRuleRegistry {
  const registry = new LabRuleRegistry();

  registry.register("device-exists", ({ topology }, rule) => {
    const category = rule.parameters?.category;
    const capability = rule.parameters?.capability;
    const devices = topology.devices.filter(
      (device) =>
        (typeof category !== "string" || device.category === category) &&
        (typeof capability !== "string" || device.capabilities.includes(capability)),
    );
    return devices.length
      ? passed(
          `พบอุปกรณ์ที่ตรงเงื่อนไข ${devices.length} ตัว`,
          devices.map((device) => device.hostname),
        )
      : failed("ไม่พบอุปกรณ์ที่ตรงเงื่อนไขใน topology");
  });

  registry.register("interface-state", ({ topology }, rule) => {
    const expected = typeof rule.parameters?.status === "string" ? rule.parameters.status : "up";
    const interfaces = topology.devices.flatMap((device) =>
      device.interfaces.filter((item) => item.status === expected).map((item) => `${device.hostname}:${item.name}`),
    );
    return interfaces.length
      ? passed(`พบ interface สถานะ ${expected} จำนวน ${interfaces.length} interface`, interfaces)
      : failed(`ไม่พบ interface สถานะ ${expected}`);
  });

  registry.register("ip-address", ({ topology }, rule) => {
    const minimum = typeof rule.parameters?.minimumDevices === "number" ? rule.parameters.minimumDevices : 1;
    const devices = topology.devices.filter((device) =>
      device.interfaces.some((item) => item.ipv4 && item.prefixLength !== undefined),
    );
    const evidence = devices.flatMap((device) =>
      device.interfaces
        .filter((item) => item.ipv4)
        .map((item) => `${device.hostname} ${item.ipv4}/${item.prefixLength}`),
    );
    return devices.length >= minimum
      ? passed(`พบอุปกรณ์ที่มี IPv4 ครบ ${devices.length} ตัว`, evidence)
      : failed(`ต้องมีอุปกรณ์ที่กำหนด IPv4 อย่างน้อย ${minimum} ตัว`, evidence);
  });

  registry.register("vlan", (context, rule) => {
    const states = configuredDevices(context);
    const expectedVlans = Array.isArray(rule.parameters?.vlanIds) ? (rule.parameters.vlanIds as number[]) : [];
    const expectedAccess = Array.isArray(rule.parameters?.accessVlans) ? (rule.parameters.accessVlans as number[]) : [];
    if (expectedVlans.length) {
      const found = new Set(states.flatMap(({ config }) => Object.keys(config.switching?.vlans ?? {}).map(Number)));
      const complete = expectedVlans.every((id) => found.has(id));
      return complete
        ? passed(
            `พบ ${expectedVlans.map((id) => `VLAN ${id}`).join(" และ ")} ใน running config`,
            [...found].map(String),
          )
        : failed(`ยังสร้าง VLAN ${expectedVlans.filter((id) => !found.has(id)).join(", ")} ไม่ครบ`);
    }
    const accessVlans = new Set(
      states.flatMap(({ config }) =>
        Object.values(config.interfaces)
          .filter((item) => item.switchport?.mode === "access")
          .map((item) => item.switchport!.accessVlan),
      ),
    );
    const complete = expectedAccess.length > 0 && expectedAccess.every((id) => accessVlans.has(id));
    return complete
      ? passed(
          `พบ access ports ใน ${expectedAccess.map((id) => `VLAN ${id}`).join(" และ ")}`,
          [...accessVlans].map(String),
        )
      : failed(`access port ยังไม่ครอบคลุม VLAN ${expectedAccess.join(", ")}`);
  });

  registry.register("trunk", (context, rule) => {
    const expected = Array.isArray(rule.parameters?.allowedVlans) ? (rule.parameters.allowedVlans as number[]) : [];
    const trunks = configuredDevices(context).flatMap(({ device, config }) =>
      Object.values(config.interfaces)
        .filter(
          (item) =>
            item.switchport?.mode === "trunk" && expected.every((vlan) => item.switchport?.allowedVlans.includes(vlan)),
        )
        .map((item) => `${device.hostname}:${item.interfaceId}`),
    );
    return trunks.length ? passed("พบ trunk ที่อนุญาต VLAN ตามโจทย์", trunks) : failed("ไม่พบ trunk ที่ตรงเงื่อนไข");
  });

  registry.register("route", (context, rule) => {
    const mode = rule.parameters?.mode;
    if (mode === "inter-vlan") {
      const devices = configuredDevices(context).filter(
        ({ config }) =>
          config.routing.ipRouting && Object.values(config.routing.svis).filter((svi) => svi.enabled).length >= 2,
      );
      return devices.length
        ? passed(
            "พบ Layer 3 device ที่เปิด routing และมี SVI อย่างน้อยสองเครือข่าย",
            devices.map(({ device }) => device.hostname),
          )
        : failed("ต้องเปิด IP routing และสร้าง SVI ที่ใช้งานอย่างน้อยสองรายการ");
    }
    if (rule.parameters?.source === "ospf") {
      const engine = new OspfEngine(context.topology);
      if (mode === "adjacency") {
        const neighbors = context.topology.devices
          .flatMap((device) => engine.neighbors(device))
          .filter((item) => item.state === "FULL");
        return neighbors.length
          ? passed(`พบ FULL OSPF adjacency ${neighbors.length} รายการ`)
          : failed("ยังไม่มี FULL OSPF adjacency");
      }
      const routes = context.topology.devices
        .flatMap((device) => new IPv4RoutingEngine(context.topology).buildRoutingTable(device))
        .filter((route) => route.source === "ospf" && route.active);
      return routes.length
        ? passed(`พบ active OSPF route ${routes.length} รายการ`)
        : failed("ยังไม่มี active OSPF route");
    }
    const staticRoutes = configuredDevices(context).flatMap(({ device, config }) =>
      config.routing.staticRoutes.map(
        (route) => `${device.hostname} ${route.destination}/${route.prefixLength} via ${route.nextHop}`,
      ),
    );
    const tunnels = configuredDevices(context).flatMap(({ device, config }) =>
      Object.values(config.security.vpn.tunnels)
        .filter((tunnel) => tunnel.enabled)
        .map((tunnel) => `${device.hostname}:${tunnel.name}`),
    );
    const evidence = [...staticRoutes, ...tunnels];
    return evidence.length
      ? passed("พบ route หรือ tunnel ที่ใช้งานใน runtime state", evidence)
      : failed("ยังไม่มี active route หรือ tunnel ตามโจทย์");
  });

  registry.register("reachability", ({ topology }) => {
    const endpoints = topology.devices.filter((device) => device.interfaces.some((item) => item.ipv4));
    for (const source of endpoints) {
      for (const destination of endpoints) {
        if (source.id === destination.id) continue;
        const destinationIp = destination.interfaces.find((item) => item.ipv4)?.ipv4;
        if (!destinationIp) continue;
        const result = new IPv4PingEngine(topology).ping({ sourceDeviceId: source.id, destinationIp });
        if (result.success)
          return passed("Reachability สำเร็จจาก simulation engine", [`${source.hostname} → ${destination.hostname}`]);
      }
    }
    return failed("ยังไม่พบคู่ endpoint ที่สื่อสารสำเร็จจาก network state ปัจจุบัน");
  });

  registry.register("dhcp-lease", (context, rule) => {
    const server = configuredDevices(context).find(
      ({ config }) => config.services.dhcp.enabled && Object.keys(config.services.dhcp.pools).length,
    );
    if (!server) return failed("ยังไม่มี DHCP server ที่เปิดและมี pool");
    if (rule.parameters?.mode === "pool") return passed(`พบ DHCP pool บน ${server.device.hostname}`);
    const poolName = Object.keys(server.config.services.dhcp.pools)[0]!;
    const client = context.topology.devices.find(
      (device) => device.id !== server.device.id && device.category === "end-device",
    );
    if (!client) return failed("ไม่พบ DHCP client");
    const lease = new NetworkServicesEngine(context.topology).requestDhcp(client.id, server.device.id, poolName);
    return lease.success
      ? passed(`DORA สำเร็จและได้รับ ${lease.lease?.ipAddress}`)
      : failed(lease.reason ?? "DHCP lease ล้มเหลว");
  });

  registry.register("dns-resolution", (context, rule) => {
    const server = configuredDevices(context).find(
      ({ config }) =>
        config.services.dns.enabled && Object.values(config.services.dns.zones).some((zone) => zone.records.length),
    );
    if (!server) return failed("ยังไม่มี authoritative DNS server และ record");
    if (rule.parameters?.mode === "server") return passed(`พบ DNS zone บน ${server.device.hostname}`);
    const record = Object.values(server.config.services.dns.zones)
      .flatMap((zone) => zone.records)
      .find((item) => item.type === "A");
    const client = configuredDevices(context).find(({ config }) => config.system.dnsServers.length > 0);
    if (!record || !client) return failed("ต้องกำหนด DNS server ที่ client และมี A record");
    const result = new NetworkServicesEngine(context.topology).queryDns(client.device.id, record.name, "A");
    return result.success
      ? passed(`DNS resolved ${record.name} → ${result.values.join(", ")}`)
      : failed(result.reason ?? "DNS query ล้มเหลว");
  });

  registry.register("firewall-policy", (context, rule) => {
    const states = configuredDevices(context);
    if (rule.parameters?.mode === "assignment") {
      const assigned = states.find(
        ({ config }) => config.services.acl.enabled && config.services.acl.assignments.length > 0,
      );
      return assigned
        ? passed(`พบ ACL assignment บน ${assigned.device.hostname}`)
        : failed("ยังไม่มี ACL assignment บน interface");
    }
    const firewall = states.find(
      ({ config }) =>
        config.security.firewall.enabled &&
        Object.keys(config.security.firewall.zones).length >= 2 &&
        config.security.firewall.policies.length > 0,
    );
    const nat = states.find(
      ({ config }) => config.services.nat.enabled && config.services.nat.rules.some((item) => item.enabled),
    );
    const matched = firewall ?? nat;
    return matched
      ? passed(`พบ active security policy บน ${matched.device.hostname}`)
      : failed("ยังไม่มี active firewall/NAT policy ที่ตรงเงื่อนไข");
  });

  registry.register("wifi-mapping", (context, rule) => {
    const ssids = configuredDevices(context).flatMap(({ device, config }) =>
      Object.values(config.security.wireless.ssids)
        .filter((ssid) => ssid.enabled)
        .map((ssid) => ({ device, ssid })),
    );
    if (rule.parameters?.mode === "isolation") {
      const isolated = ssids.find(({ ssid }) => ssid.guest || ssid.clientIsolation || ssid.vlanId !== 1);
      return isolated
        ? passed(`SSID ${isolated.ssid.name} แยก VLAN/เปิด isolation แล้ว`)
        : failed("Guest SSID ต้องแยก VLAN หรือเปิด client isolation");
    }
    return ssids.length ? passed(`พบ active SSID ${ssids[0]!.ssid.name}`) : failed("ยังไม่มี active SSID");
  });

  registry.register("nas-permission", (context) => {
    const storage = configuredDevices(context).find(({ config }) => config.storage.enabled);
    if (!storage) return failed("ยังไม่มี storage service ที่เปิดใช้งาน");
    const share = Object.values(storage.config.storage.shares).find((item) => item.enabled);
    const user = Object.values(storage.config.storage.users).find((item) => item.enabled);
    const client = context.topology.devices.find(
      (device) => device.id !== storage.device.id && device.category === "end-device",
    );
    if (!share || !user || !client) return failed("ต้องมี share, user และ client สำหรับทดสอบ permission");
    const result = new StorageSimulationEngine(context.topology).access({
      clientDeviceId: client.id,
      storageDeviceId: storage.device.id,
      shareId: share.id,
      username: user.username,
      password: user.password,
      protocol: share.protocol,
      operation: "read",
    });
    return result.success
      ? passed(`${share.protocol.toUpperCase()} permission ผ่าน state-based check`)
      : failed(result.reason ?? "NAS permission ถูกปฏิเสธ");
  });

  registry.register("cloud-route", (context, rule) => {
    const state = configuredDevices(context).find(({ config }) => config.cloud.enabled);
    if (!state) return failed("ยังไม่มี cloud network ที่เปิดใช้งาน");
    const sourceResourceId = rule.parameters?.mode === "public" ? "vm-public" : "vm-private";
    const result = new CloudNetworkEngine(state.config.cloud).simulate({
      sourceResourceId,
      destination: "internet",
      protocol: "tcp",
      port: 443,
    });
    const expected = rule.parameters?.mode === "public" ? "internet-gateway" : "nat-gateway";
    return result.success && result.route?.targetType === expected
      ? passed(
          `Cloud route ผ่าน ${expected}`,
          result.steps.map((step) => step.detail),
        )
      : failed(
          result.reason ?? `Cloud route ต้องผ่าน ${expected}`,
          result.steps.map((step) => step.detail),
        );
  });

  registry.register("packet-drop", (context, rule) => {
    const downLinks = context.topology.connections.filter((connection) => connection.status !== "up");
    const denies = configuredDevices(context).flatMap(({ device, config }) => [
      ...config.security.firewall.policies
        .filter((item) => item.enabled && item.action === "deny")
        .map((item) => `${device.hostname}:${item.name}`),
      ...Object.values(config.services.acl.accessLists).flatMap((acl) =>
        acl.rules
          .filter((item) => item.action === "deny")
          .map((item) => `${device.hostname}:${acl.name}:${item.sequence}`),
      ),
    ]);
    const cloudPolicies = configuredDevices(context).flatMap(({ config }) =>
      Object.values(config.cloud.resources).filter(
        (item) => item.type === "security-group" || item.type === "network-acl",
      ),
    );
    const evidence = [...downLinks.map((link) => `link:${link.id}:${link.status}`), ...denies];
    if (rule.parameters?.mode === "policy" && cloudPolicies.length)
      return passed(
        "พบ cloud packet policy สำหรับ allow/drop decision",
        cloudPolicies.map((item) => item.name),
      );
    return evidence.length
      ? passed("พบ state ที่อธิบาย packet drop ได้", evidence)
      : failed("ยังไม่มี packet drop condition ที่ตรวจสอบได้จาก network state");
  });

  return registry;
}
