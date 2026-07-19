import type { DeviceRuntimeConfig, TopologySnapshot } from "@/types/network";
import type { FaultType, InjectedFault, TroubleshootingLayer } from "@/types/troubleshooting";

interface FaultDefinition {
  readonly type: FaultType;
  readonly label: string;
  readonly layer: TroubleshootingLayer;
  inject(topology: TopologySnapshot): InjectedFault;
}

interface ScalarTarget {
  readonly targetId: string;
  readonly path: string;
  get(topology: TopologySnapshot): unknown;
  set(topology: TopologySnapshot, value: unknown): void;
}

const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function scalarFault(
  type: FaultType,
  layer: TroubleshootingLayer,
  topology: TopologySnapshot,
  target: ScalarTarget,
  faultValue: unknown,
): InjectedFault {
  const expected = structuredClone(target.get(topology));
  target.set(topology, structuredClone(faultValue));
  return {
    type,
    layer,
    targetId: target.targetId,
    changedPath: target.path,
    isResolved: (current) => equal(target.get(current), expected),
  };
}

function clientInterfaceTarget(
  topology: TopologySnapshot,
  field: "ipv4" | "prefixLength" | "defaultGateway",
): ScalarTarget {
  const device =
    topology.devices.find(
      (item) => item.type === "pc" && item.interfaces.some((networkInterface) => networkInterface.ipv4),
    ) ?? topology.devices.find((item) => item.interfaces.some((networkInterface) => networkInterface.ipv4));
  const networkInterface = device?.interfaces.find((item) => item.ipv4);
  if (!device || !networkInterface) return fallbackTarget(topology);
  return {
    targetId: device.id,
    path: `devices.${device.id}.interfaces.${networkInterface.id}.${field}`,
    get: (snapshot) =>
      snapshot.devices
        .find((item) => item.id === device.id)
        ?.interfaces.find((item) => item.id === networkInterface.id)?.[field],
    set: (snapshot, value) => {
      const item = snapshot.devices
        .find((candidate) => candidate.id === device.id)
        ?.interfaces.find((candidate) => candidate.id === networkInterface.id);
      if (item) (item as unknown as Record<string, unknown>)[field] = value;
    },
  };
}

function runtimeConfig(topology: TopologySnapshot, deviceId: string): DeviceRuntimeConfig | undefined {
  const value = topology.devices.find((device) => device.id === deviceId)?.configuration.runtimeConfig;
  return value && typeof value === "object" ? (value as DeviceRuntimeConfig) : undefined;
}

function runtimeTarget(
  topology: TopologySnapshot,
  predicate: (config: DeviceRuntimeConfig) => boolean,
  path: string,
  getValue: (config: DeviceRuntimeConfig) => unknown,
  setValue: (config: DeviceRuntimeConfig, value: unknown) => void,
): ScalarTarget {
  const device = topology.devices.find((candidate) => {
    const config = runtimeConfig(topology, candidate.id);
    return config ? predicate(config) : false;
  });
  if (!device) return fallbackTarget(topology);
  return {
    targetId: device.id,
    path: `devices.${device.id}.runtimeConfig.${path}`,
    get: (snapshot) => {
      const config = runtimeConfig(snapshot, device.id);
      return config ? getValue(config) : undefined;
    },
    set: (snapshot, value) => {
      const config = runtimeConfig(snapshot, device.id);
      if (config) setValue(config, value);
    },
  };
}

function connectionTarget(topology: TopologySnapshot, field: "status" | "packetLossPercent"): ScalarTarget {
  const connection = topology.connections.find((item) => item.status === "up") ?? topology.connections[0];
  if (!connection) return fallbackTarget(topology);
  return {
    targetId: connection.id,
    path: `connections.${connection.id}.${field}`,
    get: (snapshot) => snapshot.connections.find((item) => item.id === connection.id)?.[field],
    set: (snapshot, value) => {
      const item = snapshot.connections.find((candidate) => candidate.id === connection.id);
      if (item) (item as Record<string, unknown>)[field] = value;
    },
  };
}

function fallbackTarget(topology: TopologySnapshot): ScalarTarget {
  const device = topology.devices[0];
  if (!device) throw new Error("Fault injection requires at least one device");
  return {
    targetId: device.id,
    path: `devices.${device.id}.status`,
    get: (snapshot) => snapshot.devices.find((item) => item.id === device.id)?.status,
    set: (snapshot, value) => {
      const item = snapshot.devices.find((candidate) => candidate.id === device.id);
      if (item) item.status = value as typeof item.status;
    },
  };
}

function duplicateIpTarget(topology: TopologySnapshot): { target: ScalarTarget; value: unknown } {
  const addressed = topology.devices.flatMap((device) =>
    device.interfaces.filter((item) => item.ipv4).map((networkInterface) => ({ device, networkInterface })),
  );
  if (addressed.length < 2) return { target: fallbackTarget(topology), value: "warning" };
  const sourceIp = addressed[0]!.networkInterface.ipv4;
  const duplicate = addressed[1]!;
  return {
    value: sourceIp,
    target: {
      targetId: duplicate.device.id,
      path: `devices.${duplicate.device.id}.interfaces.${duplicate.networkInterface.id}.ipv4`,
      get: (snapshot) =>
        snapshot.devices
          .find((item) => item.id === duplicate.device.id)
          ?.interfaces.find((item) => item.id === duplicate.networkInterface.id)?.ipv4,
      set: (snapshot, value) => {
        const item = snapshot.devices
          .find((candidate) => candidate.id === duplicate.device.id)
          ?.interfaces.find((candidate) => candidate.id === duplicate.networkInterface.id);
        if (item) item.ipv4 = value as string;
      },
    },
  };
}

export class FaultRegistry {
  private readonly definitions = new Map<FaultType, FaultDefinition>();

  register(definition: FaultDefinition): this {
    this.definitions.set(definition.type, definition);
    return this;
  }

  has(type: FaultType): boolean {
    return this.definitions.has(type);
  }

  label(type: FaultType): string {
    return this.definitions.get(type)?.label ?? type;
  }

  inject(type: FaultType, topology: TopologySnapshot): InjectedFault {
    const definition = this.definitions.get(type);
    if (!definition) throw new Error(`Fault ${type} is not registered`);
    return definition.inject(topology);
  }
}

export function createBuiltInFaultRegistry(): FaultRegistry {
  const registry = new FaultRegistry();
  const add = (
    type: FaultType,
    label: string,
    layer: TroubleshootingLayer,
    inject: (topology: TopologySnapshot) => InjectedFault,
  ) => registry.register({ type, label, layer, inject });

  add("wrong-ip", "Wrong IP", "L3", (topology) =>
    scalarFault("wrong-ip", "L3", topology, clientInterfaceTarget(topology, "ipv4"), "192.168.99.100"),
  );
  add("wrong-mask", "Wrong Mask", "L3", (topology) =>
    scalarFault("wrong-mask", "L3", topology, clientInterfaceTarget(topology, "prefixLength"), 30),
  );
  add("wrong-gateway", "Wrong Gateway", "L3", (topology) =>
    scalarFault("wrong-gateway", "L3", topology, clientInterfaceTarget(topology, "defaultGateway"), "192.168.99.1"),
  );
  add("duplicate-ip", "Duplicate IP", "L3", (topology) => {
    const { target, value } = duplicateIpTarget(topology);
    return scalarFault("duplicate-ip", "L3", topology, target, value);
  });
  add("interface-down", "Interface Down", "L1", (topology) => {
    const device = topology.devices.find((item) =>
      item.interfaces.some((networkInterface) => networkInterface.status === "up"),
    );
    const networkInterface = device?.interfaces.find((item) => item.status === "up");
    const target =
      device && networkInterface
        ? {
            targetId: device.id,
            path: `devices.${device.id}.interfaces.${networkInterface.id}.status`,
            get: (snapshot: TopologySnapshot) =>
              snapshot.devices
                .find((item) => item.id === device.id)
                ?.interfaces.find((item) => item.id === networkInterface.id)?.status,
            set: (snapshot: TopologySnapshot, value: unknown) => {
              const item = snapshot.devices
                .find((candidate) => candidate.id === device.id)
                ?.interfaces.find((candidate) => candidate.id === networkInterface.id);
              if (item) item.status = value as typeof item.status;
            },
          }
        : fallbackTarget(topology);
    return scalarFault("interface-down", "L1", topology, target, "administratively-down");
  });
  add("link-down", "Link Down", "L1", (topology) =>
    scalarFault("link-down", "L1", topology, connectionTarget(topology, "status"), "down"),
  );
  add("weak-wifi-signal", "Weak Wi-Fi Signal", "L1", (topology) =>
    scalarFault("weak-wifi-signal", "L1", topology, connectionTarget(topology, "packetLossPercent"), 45),
  );

  add("wrong-dns", "Wrong DNS", "SERVICE", (topology) => {
    const target = runtimeTarget(
      topology,
      () => true,
      "system.dnsServers",
      (config) => config.system.dnsServers,
      (config, value) => {
        config.system.dnsServers = value as string[];
      },
    );
    return scalarFault("wrong-dns", "SERVICE", topology, target, ["203.0.113.53"]);
  });
  add("wrong-vlan", "Wrong VLAN", "L2", (topology) => {
    const target = runtimeTarget(
      topology,
      (config) => Object.values(config.interfaces).some((item) => item.switchport?.mode === "access"),
      "interfaces.accessVlan",
      (config) =>
        Object.values(config.interfaces).find((item) => item.switchport?.mode === "access")?.switchport?.accessVlan,
      (config, value) => {
        const item = Object.values(config.interfaces).find((candidate) => candidate.switchport?.mode === "access");
        if (item?.switchport) item.switchport.accessVlan = value as number;
      },
    );
    return scalarFault("wrong-vlan", "L2", topology, target, 999);
  });
  add("trunk-missing-vlan", "Trunk Missing VLAN", "L2", (topology) => {
    const target = runtimeTarget(
      topology,
      (config) => Object.values(config.interfaces).some((item) => item.switchport?.mode === "trunk"),
      "interfaces.trunk.allowedVlans",
      (config) =>
        Object.values(config.interfaces).find((item) => item.switchport?.mode === "trunk")?.switchport?.allowedVlans ??
        [],
      (config, value) => {
        const item = Object.values(config.interfaces).find((candidate) => candidate.switchport?.mode === "trunk");
        if (item?.switchport) item.switchport.allowedVlans = value as number[];
      },
    );
    return scalarFault("trunk-missing-vlan", "L2", topology, target, []);
  });
  add("native-vlan-mismatch", "Native VLAN Mismatch", "L2", (topology) => {
    const device = topology.devices.find((item) => item.category === "switch") ?? topology.devices[0];
    const networkInterface = device?.interfaces.find((item) => item.portMode === "trunk") ?? device?.interfaces[0];
    const target: ScalarTarget =
      device && networkInterface
        ? {
            targetId: device.id,
            path: `devices.${device.id}.interfaces.${networkInterface.id}.nativeVlan`,
            get: (snapshot) =>
              snapshot.devices
                .find((item) => item.id === device.id)
                ?.interfaces.find((item) => item.id === networkInterface.id)?.nativeVlan,
            set: (snapshot, value) => {
              const item = snapshot.devices
                .find((candidate) => candidate.id === device.id)
                ?.interfaces.find((candidate) => candidate.id === networkInterface.id);
              if (item) item.nativeVlan = value as number;
            },
          }
        : fallbackTarget(topology);
    const currentNativeVlan = Number(target.get(topology) ?? 1);
    return scalarFault("native-vlan-mismatch", "L2", topology, target, currentNativeVlan + 100);
  });
  add("dhcp-pool-exhausted", "DHCP Pool Exhausted", "SERVICE", (topology) => {
    const target = runtimeTarget(
      topology,
      (config) => config.services.dhcp.enabled && Object.keys(config.services.dhcp.pools).length > 0,
      "services.dhcp.maximumLeases",
      (config) => Object.values(config.services.dhcp.pools)[0]?.maximumLeases,
      (config, value) => {
        const pool = Object.values(config.services.dhcp.pools)[0];
        if (pool) pool.maximumLeases = value as number;
      },
    );
    return scalarFault("dhcp-pool-exhausted", "SERVICE", topology, target, 0);
  });
  add("missing-dhcp-relay", "Missing DHCP Relay", "SERVICE", (topology) => {
    const target = runtimeTarget(
      topology,
      (config) => config.services.dhcp.enabled && Object.keys(config.services.dhcp.pools).length > 0,
      "services.dhcp.relayAddresses",
      (config) => Object.values(config.services.dhcp.pools)[0]?.relayAddresses ?? [],
      (config, value) => {
        const pool = Object.values(config.services.dhcp.pools)[0];
        if (pool) pool.relayAddresses = value as string[];
      },
    );
    return scalarFault("missing-dhcp-relay", "SERVICE", topology, target, []);
  });
  add("missing-route", "Missing Route", "L3", (topology) => {
    return scalarFault("missing-route", "L3", topology, clientInterfaceTarget(topology, "defaultGateway"), undefined);
  });
  add("acl-block", "ACL Block", "SECURITY", (topology) => {
    const target = runtimeTarget(
      topology,
      (config) => Object.keys(config.services.acl.accessLists).length > 0,
      "services.acl.enabled",
      (config) => config.services.acl.enabled,
      (config, value) => {
        config.services.acl.enabled = value as boolean;
      },
    );
    return scalarFault("acl-block", "SECURITY", topology, target, true);
  });
  add("firewall-block", "Firewall Block", "SECURITY", (topology) => {
    const target = runtimeTarget(
      topology,
      (config) => config.security.firewall.enabled,
      "security.firewall.policies",
      (config) => config.security.firewall.policies,
      (config, value) => {
        config.security.firewall.policies = value as typeof config.security.firewall.policies;
      },
    );
    const existing = (target.get(topology) as DeviceRuntimeConfig["security"]["firewall"]["policies"]) ?? [];
    return scalarFault("firewall-block", "SECURITY", topology, target, [
      ...existing,
      {
        id: "injected-deny",
        order: 0,
        enabled: true,
        name: "INJECTED-DENY",
        sourceZone: "any",
        destinationZone: "any",
        sourceAddress: "any",
        destinationAddress: "any",
        service: "any",
        action: "deny",
        logging: true,
      },
    ]);
  });
  add("wrong-ssid-password", "Wrong SSID Password", "SECURITY", (topology) => {
    const target = runtimeTarget(
      topology,
      (config) => Object.keys(config.security.wireless.ssids).length > 0,
      "security.wireless.preSharedKey",
      (config) => Object.values(config.security.wireless.ssids)[0]?.preSharedKey,
      (config, value) => {
        const ssid = Object.values(config.security.wireless.ssids)[0];
        if (ssid) ssid.preSharedKey = value as string;
      },
    );
    return scalarFault("wrong-ssid-password", "SECURITY", topology, target, "fault-injected-password");
  });
  add("nas-permission-denied", "NAS Permission Denied", "STORAGE", (topology) => {
    const target = runtimeTarget(
      topology,
      (config) => config.storage.enabled,
      "storage.share.permissions",
      (config) => Object.values(config.storage.shares)[0]?.permissions ?? [],
      (config, value) => {
        const share = Object.values(config.storage.shares)[0];
        if (share) share.permissions = value as typeof share.permissions;
      },
    );
    return scalarFault("nas-permission-denied", "STORAGE", topology, target, [
      { principalType: "everyone", principal: "everyone", access: "deny" },
    ]);
  });
  add("raid-degraded", "RAID Degraded", "STORAGE", (topology) => {
    const target = runtimeTarget(
      topology,
      (config) => config.storage.enabled,
      "storage.disk.status",
      (config) => Object.values(config.storage.disks)[0]?.status,
      (config, value) => {
        const disk = Object.values(config.storage.disks)[0];
        if (disk) disk.status = value as typeof disk.status;
      },
    );
    return scalarFault("raid-degraded", "STORAGE", topology, target, "failed");
  });
  add("cloud-route-missing", "Cloud Route Missing", "CLOUD", (topology) => {
    const target = runtimeTarget(
      topology,
      (config) => config.cloud.enabled,
      "cloud.routeTable.routes",
      (config) =>
        Object.values(config.cloud.resources).find((item) => item.type === "route-table")?.configuration.routes ?? [],
      (config, value) => {
        const table = Object.values(config.cloud.resources).find(
          (item) =>
            item.type === "route-table" &&
            item.configuration.routes?.some((route) => route.destinationCidr === "0.0.0.0/0"),
        );
        if (table) table.configuration.routes = value as NonNullable<typeof table.configuration.routes>;
      },
    );
    return scalarFault("cloud-route-missing", "CLOUD", topology, target, []);
  });
  add("security-group-block", "Security Group Block", "CLOUD", (topology) => {
    const target = runtimeTarget(
      topology,
      (config) => config.cloud.enabled,
      "cloud.securityGroup.rules",
      (config) =>
        Object.values(config.cloud.resources).find((item) => item.type === "security-group")?.configuration.rules ?? [],
      (config, value) => {
        const group = Object.values(config.cloud.resources).find((item) => item.type === "security-group");
        if (group) group.configuration.rules = value as NonNullable<typeof group.configuration.rules>;
      },
    );
    return scalarFault("security-group-block", "CLOUD", topology, target, []);
  });

  return registry;
}
