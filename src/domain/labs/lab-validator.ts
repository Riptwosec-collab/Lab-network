import { IPv4PingEngine } from "@/engine/protocols/ping-engine";
import { NetworkServicesEngine } from "@/engine/protocols/services-engine";
import { SecuritySimulationEngine } from "@/engine/protocols/security-engine";
import { OspfEngine } from "@/engine/protocols/ospf-engine";
import { IPv4RoutingEngine } from "@/engine/protocols/routing-engine";
import { HighAvailabilityEngine, MonitoringEngine, TroubleshootingEngine } from "@/engine/operations/operations-engine";
import { StorageSimulationEngine } from "@/engine/storage/storage-engine";
import { CloudNetworkEngine } from "@/engine/cloud/cloud-network-engine";
import type { LabDefinition, LabValidationResult, LabValidator } from "@/types/lab";
import type { ProjectConfigurationState, TopologySnapshot } from "@/types/network";

export class TopologyLabValidator implements LabValidator {
  constructor(
    private readonly topology: TopologySnapshot,
    private readonly configurationState: ProjectConfigurationState,
  ) {}

  async validate(lab: LabDefinition): Promise<readonly LabValidationResult[]> {
    if (lab.id === "vlan") return this.validateVlanLab(lab);
    if (lab.id === "ip-ping") return this.validateIpPingLab(lab);
    if (lab.id === "inter-vlan") return this.validateInterVlanLab(lab);
    if (lab.id === "dhcp") return this.validateDhcpLab(lab);
    if (lab.id === "dns") return this.validateDnsLab(lab);
    if (lab.id === "nat-acl") return this.validateNatAclLab(lab);
    if (lab.id === "guest-wifi") return this.validateWirelessLab(lab);
    if (lab.id === "vpn") return this.validateVpnLab(lab);
    if (lab.id === "firewall-policy") return this.validateFirewallLab(lab);
    if (lab.id === "ospf") return this.validateOspfLab(lab);
    if (lab.id === "high-availability") return this.validateHighAvailabilityLab(lab);
    if (lab.id === "network-operations") return this.validateMonitoringLab(lab);
    if (lab.id === "troubleshooting") return this.validateTroubleshootingLab(lab);
    if (lab.id === "nas-sharing") return this.validateNasLab(lab);
    if (lab.id === "cloud-networking") return this.validateCloudNetworkingLab(lab);
    return lab.tasks.map((task) => ({
      taskId: task.id,
      status: "failed",
      message: `Validator สำหรับ ${lab.title} จะเปิดเมื่อ simulation phase ที่เกี่ยวข้องพร้อมใช้งาน`,
    }));
  }

  private validateVlanLab(lab: LabDefinition): readonly LabValidationResult[] {
    const switchStates = this.topology.devices
      .filter((device) => device.category === "switch" || device.capabilities.includes("switching"))
      .flatMap((device) => {
        const state = this.configurationState.devices[device.id];
        return state?.runningConfig.switching ? [{ device, config: state.runningConfig }] : [];
      });
    const hasVlans = switchStates.some(({ config }) => config.switching?.vlans["10"] && config.switching.vlans["20"]);
    const accessVlans = new Set(
      switchStates.flatMap(({ config }) =>
        Object.values(config.interfaces)
          .filter((item) => item.switchport?.mode === "access")
          .map((item) => item.switchport!.accessVlan),
      ),
    );
    const checks = [
      {
        passed: !!hasVlans,
        message: hasVlans
          ? "พบ VLAN 10 และ VLAN 20 ใน running config"
          : "ยังไม่มี switch ที่สร้าง VLAN 10 และ VLAN 20 ครบ",
      },
      {
        passed: accessVlans.has(10) && accessVlans.has(20),
        message:
          accessVlans.has(10) && accessVlans.has(20)
            ? "พบ access ports ใน VLAN 10 และ VLAN 20"
            : "ต้องกำหนด access ports ให้ VLAN 10 และ VLAN 20",
      },
    ];
    return lab.tasks.map((task, index) => ({
      taskId: task.id,
      status: checks[index]?.passed ? "passed" : "failed",
      message: checks[index]?.message ?? "ไม่มี validation rule สำหรับ task นี้",
    }));
  }

  private validateIpPingLab(lab: LabDefinition): readonly LabValidationResult[] {
    const endpoints = this.topology.devices.filter((device) =>
      device.interfaces.some(
        (networkInterface) => networkInterface.ipv4 && networkInterface.prefixLength !== undefined,
      ),
    );
    const source = endpoints[0];
    const destination = endpoints[1]?.interfaces.find((networkInterface) => networkInterface.ipv4);
    const result =
      source && destination
        ? new IPv4PingEngine(this.topology).ping({ sourceDeviceId: source.id, destinationIp: destination.ipv4! })
        : undefined;
    const checks = [
      {
        passed: endpoints.length >= 2,
        message:
          endpoints.length >= 2
            ? "มี endpoints ที่กำหนด IPv4 แล้ว"
            : "ต้องมี endpoints ที่กำหนด IPv4 อย่างน้อย 2 เครื่อง",
      },
      {
        passed: !!result?.success,
        message: result?.success
          ? "Ping สำเร็จตาม simulation state"
          : (result?.reason ?? "ยังไม่มีคู่ endpoint สำหรับ Ping"),
      },
    ];
    return lab.tasks.map((task, index) => ({
      taskId: task.id,
      status: checks[index]?.passed ? "passed" : "failed",
      message: checks[index]?.message ?? "ไม่มี validation rule สำหรับ task นี้",
    }));
  }

  private validateInterVlanLab(lab: LabDefinition): readonly LabValidationResult[] {
    const layer3Devices = this.topology.devices.filter((device) => {
      const routing = this.configurationState.devices[device.id]?.runningConfig.routing;
      return routing?.ipRouting && Object.keys(routing.svis).length >= 2;
    });
    const endpoints = this.topology.devices.filter((device) =>
      device.interfaces.some(
        (networkInterface) =>
          networkInterface.ipv4 && networkInterface.prefixLength !== undefined && networkInterface.defaultGateway,
      ),
    );
    let pingPassed = false;
    outer: for (const source of endpoints) {
      for (const destination of endpoints) {
        if (source.id === destination.id) continue;
        const destinationInterface = destination.interfaces.find((item) => item.ipv4);
        if (
          destinationInterface &&
          new IPv4PingEngine(this.topology).ping({
            sourceDeviceId: source.id,
            destinationIp: destinationInterface.ipv4!,
          }).success
        ) {
          pingPassed = true;
          break outer;
        }
      }
    }
    const checks = [
      {
        passed: layer3Devices.length > 0,
        message: layer3Devices.length
          ? "พบ Layer 3 device ที่เปิด ip routing และมี SVI อย่างน้อย 2 VLAN"
          : "ต้องเปิด ip routing และสร้าง SVI อย่างน้อย 2 VLAN",
      },
      {
        passed: pingPassed,
        message: pingPassed ? "Cross-subnet Ping สำเร็จผ่าน routing engine" : "ยัง Ping ข้าม VLAN ไม่สำเร็จ",
      },
    ];
    return lab.tasks.map((task, index) => ({
      taskId: task.id,
      status: checks[index]?.passed ? "passed" : "failed",
      message: checks[index]?.message ?? "ไม่มี validation rule สำหรับ task นี้",
    }));
  }

  private validateDhcpLab(lab: LabDefinition): readonly LabValidationResult[] {
    const server = this.topology.devices.find((device) => {
      const dhcp = this.configurationState.devices[device.id]?.runningConfig.services.dhcp;
      return dhcp?.enabled && Object.keys(dhcp.pools).length > 0;
    });
    const poolName = server
      ? Object.keys(this.configurationState.devices[server.id]!.runningConfig.services.dhcp.pools)[0]
      : undefined;
    const client = this.topology.devices.find(
      (device) =>
        device.id !== server?.id && (device.category === "end-device" || device.capabilities.includes("client")),
    );
    const lease =
      server && client && poolName
        ? new NetworkServicesEngine(this.topology).requestDhcp(client.id, server.id, poolName)
        : undefined;
    const checks = [
      {
        passed: !!server,
        message: server ? `พบ DHCP pool บน ${server.hostname}` : "ต้องเปิด DHCP และสร้าง pool อย่างน้อยหนึ่ง pool",
      },
      {
        passed: !!lease?.success,
        message: lease?.success
          ? `DORA สำเร็จและได้รับ ${lease.lease?.ipAddress}`
          : (lease?.reason ?? "ไม่พบ client สำหรับทดสอบ lease"),
      },
    ];
    return mapChecks(lab, checks);
  }

  private validateDnsLab(lab: LabDefinition): readonly LabValidationResult[] {
    const server = this.topology.devices.find((device) => {
      const dns = this.configurationState.devices[device.id]?.runningConfig.services.dns;
      return dns?.enabled && Object.values(dns.zones).some((zone) => zone.records.length > 0);
    });
    const record = server
      ? Object.values(this.configurationState.devices[server.id]!.runningConfig.services.dns.zones)
          .flatMap((zone) => zone.records)
          .find((item) => item.type === "A")
      : undefined;
    const client = this.topology.devices.find((device) =>
      Boolean(this.configurationState.devices[device.id]?.runningConfig.system.dnsServers.length),
    );
    const query =
      client && record ? new NetworkServicesEngine(this.topology).queryDns(client.id, record.name, "A") : undefined;
    return mapChecks(lab, [
      {
        passed: !!server,
        message: server ? `พบ authoritative DNS zone บน ${server.hostname}` : "ต้องเปิด DNS และเพิ่ม record",
      },
      {
        passed: !!query?.success,
        message: query?.success
          ? `DNS response: ${query.values.join(", ")}`
          : (query?.reason ?? "Client ต้องตั้ง DNS server"),
      },
    ]);
  }

  private validateNatAclLab(lab: LabDefinition): readonly LabValidationResult[] {
    const natDevice = this.topology.devices.find((device) => {
      const nat = this.configurationState.devices[device.id]?.runningConfig.services.nat;
      return nat?.enabled && nat.rules.some((rule) => rule.enabled);
    });
    const aclDevice = this.topology.devices.find((device) => {
      const acl = this.configurationState.devices[device.id]?.runningConfig.services.acl;
      return acl?.enabled && Object.keys(acl.accessLists).length > 0 && acl.assignments.length > 0;
    });
    return mapChecks(lab, [
      {
        passed: !!natDevice,
        message: natDevice ? `พบ NAT/PAT policy บน ${natDevice.hostname}` : "ต้องเปิด NAT และเพิ่ม active rule",
      },
      {
        passed: !!aclDevice,
        message: aclDevice
          ? `พบ ordered ACL assignment บน ${aclDevice.hostname}`
          : "ต้องสร้าง ACL และผูก in/out กับ interface",
      },
    ]);
  }

  private validateWirelessLab(lab: LabDefinition): readonly LabValidationResult[] {
    const ap = this.topology.devices.find((device) =>
      Object.values(this.configurationState.devices[device.id]?.runningConfig.security.wireless.ssids ?? {}).some(
        (ssid) => ssid.enabled,
      ),
    );
    const ssid = ap
      ? Object.values(this.configurationState.devices[ap.id]!.runningConfig.security.wireless.ssids).find(
          (item) => item.enabled,
        )
      : undefined;
    const client = this.topology.devices.find(
      (device) => device.id !== ap?.id && (device.category === "end-device" || device.capabilities.includes("client")),
    );
    const association =
      ap && client && ssid
        ? new SecuritySimulationEngine(this.topology).associateWireless(client.id, ap.id, ssid.name, {
            password: ssid.preSharedKey,
          })
        : undefined;
    return mapChecks(lab, [
      {
        passed: !!association?.success,
        message: association?.success
          ? `Client associated to ${ssid?.name} on VLAN ${association.association?.vlanId}`
          : (association?.reason ?? "ต้องเปิด radio และสร้าง SSID"),
      },
      {
        passed: !!ssid && (ssid.guest || ssid.clientIsolation || ssid.vlanId !== 1),
        message:
          ssid && (ssid.guest || ssid.clientIsolation || ssid.vlanId !== 1)
            ? "Guest isolation/VLAN mapping is configured"
            : "Guest SSID ต้องแยก VLAN หรือเปิด client isolation",
      },
    ]);
  }

  private validateVpnLab(lab: LabDefinition): readonly LabValidationResult[] {
    const local = this.topology.devices.find(
      (device) =>
        Object.keys(this.configurationState.devices[device.id]?.runningConfig.security.vpn.tunnels ?? {}).length,
    );
    const tunnelId = local
      ? Object.keys(this.configurationState.devices[local.id]!.runningConfig.security.vpn.tunnels)[0]
      : undefined;
    const result =
      local && tunnelId ? new SecuritySimulationEngine(this.topology).negotiateVpn(local.id, tunnelId) : undefined;
    return mapChecks(lab, [
      { passed: !!tunnelId, message: tunnelId ? "พบ enabled VPN tunnel configuration" : "ต้องสร้าง VPN tunnel" },
      {
        passed: !!result?.success,
        message: result?.success ? result.detail : (result?.detail ?? "ต้องมี matching remote peer"),
      },
    ]);
  }

  private validateFirewallLab(lab: LabDefinition): readonly LabValidationResult[] {
    const firewall = this.topology.devices.find((device) => {
      const config = this.configurationState.devices[device.id]?.runningConfig.security.firewall;
      return config?.enabled && Object.keys(config.zones).length >= 2;
    });
    const policies = firewall
      ? this.configurationState.devices[firewall.id]!.runningConfig.security.firewall.policies
      : [];
    return mapChecks(lab, [
      {
        passed: !!firewall,
        message: firewall ? `พบ security zones บน ${firewall.hostname}` : "ต้องสร้าง security zones อย่างน้อยสอง zone",
      },
      {
        passed: policies.length > 0,
        message: policies.length
          ? `พบ ordered policy ${policies[0]!.name} และ implicit deny`
          : "ต้องเพิ่ม security policy อย่างน้อยหนึ่ง rule",
      },
    ]);
  }

  private validateOspfLab(lab: LabDefinition): readonly LabValidationResult[] {
    const engine = new OspfEngine(this.topology);
    const fullNeighbors = this.topology.devices
      .flatMap((device) => engine.neighbors(device))
      .filter((item) => item.state === "FULL");
    const learnedRoutes = this.topology.devices
      .flatMap((device) => new IPv4RoutingEngine(this.topology).buildRoutingTable(device))
      .filter((route) => route.source === "ospf" && route.active);
    return mapChecks(lab, [
      {
        passed: fullNeighbors.length > 0,
        message: fullNeighbors.length
          ? `Found ${fullNeighbors.length} FULL OSPF adjacency record(s)`
          : "No FULL OSPF neighbor; compare link state, subnet, area, authentication and passive-interface settings",
      },
      {
        passed: learnedRoutes.length > 0,
        message: learnedRoutes.length
          ? `Installed ${learnedRoutes.length} active OSPF route(s)`
          : "No OSPF route has been learned from a reachable advertising router",
      },
    ]);
  }

  private validateHighAvailabilityLab(lab: LabDefinition): readonly LabValidationResult[] {
    const members = new HighAvailabilityEngine(this.topology).members();
    const groups = new Map<string, typeof members>();
    for (const member of members) {
      const key = `${member.protocol}:${member.groupId}:${member.virtualIp}`;
      groups.set(key, [...(groups.get(key) ?? []), member]);
    }
    const redundant = [...groups.values()].find((group) => group.length >= 2);
    const active = redundant?.some((member) => member.role === "active" || member.role === "master");
    const standby = redundant?.some((member) => member.role === "standby" || member.role === "backup");
    return mapChecks(lab, [
      {
        passed: !!redundant,
        message: redundant
          ? `Found redundant group with ${redundant.length} members`
          : "At least two devices must share protocol, group ID and virtual IP",
      },
      {
        passed: !!active && !!standby,
        message:
          active && standby
            ? "HA election has one owner and a ready standby"
            : "HA group must elect an active/master and standby/backup member",
      },
    ]);
  }

  private validateMonitoringLab(lab: LabDefinition): readonly LabValidationResult[] {
    const engine = new MonitoringEngine(this.topology);
    const metrics = engine.metrics();
    const alerts = engine.alerts();
    const incidents = engine.incidents();
    return mapChecks(lab, [
      {
        passed: metrics.length > 0,
        message: metrics.length
          ? `Collected ${metrics.length} interface metric record(s)`
          : "Enable monitoring and select at least one interface",
      },
      {
        passed: alerts.length > 0 || incidents.length > 0,
        message:
          alerts.length || incidents.length
            ? `Detected ${alerts.length} alert(s) and ${incidents.length} incident(s)`
            : "Introduce a down/degraded link or threshold breach for the NOC workflow",
      },
    ]);
  }

  private validateTroubleshootingLab(lab: LabDefinition): readonly LabValidationResult[] {
    const findings = new TroubleshootingEngine(this.topology).analyze();
    return mapChecks(lab, [
      {
        passed: findings.length > 0,
        message: findings.length
          ? `Found ${findings.length} layered diagnostic symptom(s)`
          : "No fault is currently observable in live topology state",
      },
      {
        passed: findings.some((item) => !!item.evidence && !!item.recommendation),
        message: findings.length
          ? "Diagnostic evidence and next-action guidance are available"
          : "A detected symptom is required before evidence can be evaluated",
      },
    ]);
  }

  private validateNasLab(lab: LabDefinition): readonly LabValidationResult[] {
    const storageDevice = this.topology.devices.find(
      (device) => this.configurationState.devices[device.id]?.runningConfig.storage.enabled,
    );
    const storage = storageDevice
      ? this.configurationState.devices[storageDevice.id]?.runningConfig.storage
      : undefined;
    const networkInterface = storageDevice?.interfaces.find(
      (item) => item.ipv4 && item.prefixLength !== undefined && item.defaultGateway,
    );
    const share = storage && Object.values(storage.shares).find((item) => item.enabled);
    const user = storage && Object.values(storage.users).find((item) => item.enabled);
    const client = this.topology.devices.find(
      (device) =>
        device.id !== storageDevice?.id && (device.category === "end-device" || device.capabilities.includes("client")),
    );
    const access =
      storageDevice && share && user && client
        ? new StorageSimulationEngine(this.topology).access({
            clientDeviceId: client.id,
            storageDeviceId: storageDevice.id,
            shareId: share.id,
            username: user.username,
            password: user.password,
            protocol: share.protocol,
            operation: "read",
          })
        : undefined;
    return mapChecks(lab, [
      {
        passed: !!networkInterface,
        message: networkInterface
          ? `NAS interface uses ${networkInterface.ipv4}/${networkInterface.prefixLength} via ${networkInterface.defaultGateway}`
          : "Storage device requires IPv4, prefix and default gateway",
      },
      {
        passed: !!access?.success,
        message: access?.success
          ? `${share?.protocol.toUpperCase()} access succeeded after network and permission checks`
          : (access?.reason ?? "Enable a share, identity and reachable client path"),
      },
    ]);
  }

  private validateCloudNetworkingLab(lab: LabDefinition): readonly LabValidationResult[] {
    const cloudState = Object.values(this.configurationState.devices).find(
      (state) => state.runningConfig.cloud.enabled,
    );
    const cloud = cloudState?.runningConfig.cloud;
    const engine = cloud ? new CloudNetworkEngine(cloud) : undefined;
    const publicFlow = engine?.simulate({
      sourceResourceId: "vm-public",
      destination: "internet",
      protocol: "tcp",
      port: 443,
    });
    const privateFlow = engine?.simulate({
      sourceResourceId: "vm-private",
      destination: "internet",
      protocol: "tcp",
      port: 443,
    });
    const policies = cloud
      ? Object.values(cloud.resources).filter((item) => item.type === "security-group" || item.type === "network-acl")
      : [];
    return mapChecks(lab, [
      {
        passed: publicFlow?.success === true && publicFlow.route?.targetType === "internet-gateway",
        message: publicFlow?.reason ?? "Configure a public VM, public IP and Internet Gateway default route",
      },
      {
        passed: privateFlow?.success === true && privateFlow.route?.targetType === "nat-gateway",
        message: privateFlow?.reason ?? "Configure a private subnet default route through a public NAT Gateway",
      },
      {
        passed:
          policies.some((item) => item.type === "security-group" && item.configuration.stateful === true) &&
          policies.some((item) => item.type === "network-acl" && item.configuration.stateful === false),
        message: policies.length
          ? "Stateful Security Group and stateless ordered Network ACL are attached"
          : "Attach Security Group and Network ACL policies to cloud resources and subnets",
      },
    ]);
  }
}

function mapChecks(
  lab: LabDefinition,
  checks: readonly { passed: boolean; message: string }[],
): readonly LabValidationResult[] {
  return lab.tasks.map((task, index) => ({
    taskId: task.id,
    status: checks[index]?.passed ? "passed" : "failed",
    message: checks[index]?.message ?? "ไม่มี validation rule สำหรับ task นี้",
  }));
}
