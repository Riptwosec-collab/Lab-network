import { z } from "zod";

import { CABLE_TYPES, DEVICE_CATEGORIES, INTERFACE_TYPES } from "@/types/network";

const timestampSchema = z.iso.datetime();

export const networkInterfaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(INTERFACE_TYPES),
  status: z.enum([
    "administratively-down",
    "down",
    "negotiating",
    "up",
    "blocked",
    "err-disabled",
    "suspended",
    "monitoring",
    "disabled",
  ]),
  medium: z.enum(["copper", "fiber", "serial", "wireless", "logical", "management", "service"]).optional(),
  macAddress: z.string().optional(),
  ipv4: z.string().optional(),
  ipv6: z.string().optional(),
  subnetMask: z.string().optional(),
  prefixLength: z.number().int().min(0).max(32).optional(),
  defaultGateway: z.string().optional(),
  vlan: z.number().int().min(1).max(4094).optional(),
  nativeVlan: z.number().int().min(1).max(4094).optional(),
  allowedVlans: z.array(z.number().int().min(1).max(4094)).optional(),
  portMode: z.enum(["access", "trunk", "routed", "dynamic", "disabled"]).optional(),
  poeState: z.enum(["off", "delivering", "fault"]).optional(),
  speedMbps: z.number().positive().optional(),
  duplex: z.enum(["half", "full", "auto"]).optional(),
  mtu: z.number().int().min(576).max(9216),
  description: z.string().optional(),
  connectedEdgeId: z.string().optional(),
  errorCount: z.number().int().nonnegative().optional(),
  inputRateMbps: z.number().nonnegative().optional(),
  outputRateMbps: z.number().nonnegative().optional(),
  packetLossPercent: z.number().min(0).max(100).optional(),
});

export const deviceSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  name: z.string().min(1).max(80),
  hostname: z.string().min(1).max(63),
  category: z.enum(DEVICE_CATEGORIES),
  model: z.string().min(1),
  status: z.enum(["online", "offline", "warning", "critical", "configuring", "validation-failed", "unknown"]),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
  interfaces: z.array(networkInterfaceSchema),
  configuration: z.record(z.string(), z.unknown()),
  capabilities: z.array(z.string()),
  locked: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const connectionSchema = z
  .object({
    id: z.string().min(1),
    sourceDeviceId: z.string().min(1),
    sourceInterfaceId: z.string().optional(),
    targetDeviceId: z.string().min(1),
    targetInterfaceId: z.string().optional(),
    cableType: z.enum(CABLE_TYPES),
    status: z.enum(["up", "down", "degraded", "administratively-down"]),
    bandwidthMbps: z.number().nonnegative(),
    latencyMs: z.number().nonnegative(),
    jitterMs: z.number().nonnegative(),
    packetLossPercent: z.number().min(0).max(100),
    duplex: z.enum(["half", "full", "auto"]),
    mtu: z.number().int().min(576).max(9216).default(1500),
    protocol: z.string().min(1).default("ethernet"),
    label: z.string().max(120).optional(),
    direction: z.enum(["bidirectional", "source-to-target", "target-to-source"]).default("bidirectional"),
    pathStyle: z.enum(["physical", "logical", "wireless", "tunnel", "aggregated"]).default("physical"),
    createdAt: timestampSchema,
  })
  .refine((connection) => connection.sourceDeviceId !== connection.targetDeviceId, {
    message: "A connection must join two different devices",
    path: ["targetDeviceId"],
  });

const switchportRuntimeConfigSchema = z.object({
  mode: z.enum(["access", "trunk", "routed", "dynamic", "disabled"]),
  accessVlan: z.number().int().min(1).max(4094),
  nativeVlan: z.number().int().min(1).max(4094),
  allowedVlans: z.array(z.number().int().min(1).max(4094)),
  voiceVlan: z.number().int().min(1).max(4094).optional(),
  stpCost: z.number().int().positive().optional(),
  stpPriority: z.number().int().min(0).max(240).multipleOf(16),
  portFast: z.boolean(),
  bpduGuard: z.boolean(),
  rootGuard: z.boolean(),
  loopGuard: z.boolean(),
  channelGroup: z.number().int().min(1).max(255).optional(),
  lacpMode: z.enum(["active", "passive", "on"]).optional(),
});

export const interfaceRuntimeConfigSchema = z.object({
  interfaceId: z.string().min(1),
  enabled: z.boolean(),
  description: z.string().max(240).optional(),
  macAddress: z.string().optional(),
  ipv4: z.string().optional(),
  prefixLength: z.number().int().min(0).max(32).optional(),
  defaultGateway: z.string().optional(),
  mtu: z.number().int().min(576).max(9216).optional(),
  speedMbps: z.number().positive().optional(),
  duplex: z.enum(["half", "full", "auto"]).optional(),
  switchport: switchportRuntimeConfigSchema.optional(),
});

const switchingRuntimeConfigSchema = z.object({
  vlans: z.record(
    z.string(),
    z.object({
      id: z.number().int().min(1).max(4094),
      name: z.string().min(1).max(32),
      status: z.enum(["active", "suspended"]),
    }),
  ),
  macAgingSeconds: z.number().int().min(10).max(1_000_000),
  staticMacEntries: z.array(
    z.object({
      macAddress: z.string().min(1),
      vlanId: z.number().int().min(1).max(4094),
      interfaceId: z.string().min(1),
    }),
  ),
  spanningTree: z.object({
    mode: z.enum(["rstp", "rapid-pvst", "pvst"]),
    priority: z.number().int().min(0).max(61_440).multipleOf(4096),
    enabledVlans: z.array(z.number().int().min(1).max(4094)),
  }),
  etherChannels: z.record(
    z.string(),
    z.object({
      id: z.number().int().min(1).max(255),
      protocol: z.enum(["lacp", "static"]),
      mode: z.enum(["active", "passive", "on"]),
      memberInterfaceIds: z.array(z.string().min(1)).min(1),
    }),
  ),
});

const securityRuntimeConfigSchema = z.object({
  firewall: z.object({
    enabled: z.boolean(),
    zones: z.record(z.string(), z.object({ name: z.string().min(1), interfaceIds: z.array(z.string()) })),
    addressObjects: z.record(
      z.string(),
      z.object({ name: z.string().min(1), network: z.string(), prefixLength: z.number().int().min(0).max(32) }),
    ),
    serviceObjects: z.record(
      z.string(),
      z.object({
        name: z.string().min(1),
        protocol: z.enum(["ip", "icmp", "tcp", "udp"]),
        ports: z.array(z.number().int().min(1).max(65535)),
      }),
    ),
    policies: z.array(
      z.object({
        id: z.string().min(1),
        order: z.number().int().nonnegative(),
        enabled: z.boolean(),
        name: z.string().min(1),
        sourceZone: z.string(),
        destinationZone: z.string(),
        sourceAddress: z.string(),
        destinationAddress: z.string(),
        service: z.string(),
        application: z.string().optional(),
        action: z.enum(["allow", "deny"]),
        logging: z.boolean(),
        schedule: z.string().optional(),
      }),
    ),
    sessionTimeoutSeconds: z.number().int().positive(),
    natOrder: z.enum(["before-policy", "after-policy"]),
  }),
  vpn: z.object({
    tunnels: z.record(
      z.string(),
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        type: z.enum(["site-to-site", "remote-access", "gre", "ipsec"]),
        enabled: z.boolean(),
        localPeer: z.string(),
        remotePeer: z.string(),
        localNetwork: z.string(),
        localPrefixLength: z.number().int().min(0).max(32),
        remoteNetwork: z.string(),
        remotePrefixLength: z.number().int().min(0).max(32),
        preSharedKey: z.string().optional(),
        encryption: z.enum(["aes128", "aes256", "3des", "none"]),
        hash: z.enum(["sha1", "sha256", "sha384", "none"]),
        ikeVersion: z.enum(["ikev1", "ikev2", "none"]),
        lifetimeSeconds: z.number().int().positive(),
        tunnelInterfaceId: z.string().optional(),
        routeThroughTunnel: z.boolean(),
      }),
    ),
  }),
  wireless: z.object({
    radios: z.record(
      z.string(),
      z.object({
        id: z.string(),
        enabled: z.boolean(),
        band: z.enum(["2.4GHz", "5GHz", "6GHz"]),
        channel: z.number().int().positive(),
        channelWidthMhz: z.union([z.literal(20), z.literal(40), z.literal(80), z.literal(160), z.literal(320)]),
        txPowerDbm: z.number(),
      }),
    ),
    ssids: z.record(
      z.string(),
      z.object({
        id: z.string(),
        name: z.string(),
        enabled: z.boolean(),
        bssid: z.string(),
        radioIds: z.array(z.string()),
        securityMode: z.enum(["open", "wpa2-psk", "wpa3-psk", "wpa2-enterprise", "wpa3-enterprise"]),
        preSharedKey: z.string().optional(),
        radiusServer: z.string().optional(),
        radiusSecret: z.string().optional(),
        vlanId: z.number().int().min(1).max(4094),
        guest: z.boolean(),
        clientIsolation: z.boolean(),
        captivePortal: z.boolean(),
        maximumClients: z.number().int().positive(),
        roaming: z.boolean(),
        mesh: z.boolean(),
      }),
    ),
  }),
  radius: z.object({
    enabled: z.boolean(),
    port: z.number().int().min(1).max(65535),
    sharedSecret: z.string(),
    users: z.record(
      z.string(),
      z.object({
        username: z.string(),
        password: z.string(),
        vlanId: z.number().int().min(1).max(4094).optional(),
        enabled: z.boolean(),
      }),
    ),
    clients: z.array(z.object({ deviceId: z.string(), secret: z.string() })),
  }),
});

export const deviceRuntimeConfigSchema = z.object({
  system: z.object({
    hostname: z.string().min(1).max(63),
    domainName: z.string().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    dnsServers: z.array(z.string()),
  }),
  interfaces: z.record(z.string(), interfaceRuntimeConfigSchema),
  switching: switchingRuntimeConfigSchema.optional(),
  routing: z.object({
    ipRouting: z.boolean().default(false),
    staticRoutes: z.array(
      z.object({
        destination: z.string(),
        prefixLength: z.number().int().min(0).max(32),
        nextHop: z.string(),
        administrativeDistance: z.number().int().min(1).max(255).default(1),
        metric: z.number().int().nonnegative().default(0),
        name: z.string().max(64).optional(),
      }),
    ),
    svis: z
      .record(
        z.string(),
        z.object({
          vlanId: z.number().int().min(1).max(4094),
          enabled: z.boolean(),
          ipv4: z.string(),
          prefixLength: z.number().int().min(0).max(32),
          description: z.string().max(240).optional(),
        }),
      )
      .default({}),
  }),
  services: z.object({
    dhcp: z.object({
      enabled: z.boolean(),
      pools: z.record(
        z.string(),
        z.object({
          name: z.string().min(1).max(64),
          network: z.string(),
          prefixLength: z.number().int().min(0).max(32),
          defaultGateway: z.string(),
          dnsServers: z.array(z.string()),
          domainName: z.string().max(253).optional(),
          leaseSeconds: z.number().int().positive(),
          maximumLeases: z.number().int().positive().optional(),
          excludedRanges: z.array(z.object({ start: z.string(), end: z.string() })),
          reservations: z.array(
            z.object({
              ipAddress: z.string(),
              clientIdentifier: z.string().min(1),
              description: z.string().max(240).optional(),
            }),
          ),
          relayAddresses: z.array(z.string()),
        }),
      ),
    }),
    dns: z.object({
      enabled: z.boolean(),
      recursive: z.boolean(),
      forwarders: z.array(z.string()),
      cacheTtlSeconds: z.number().int().positive(),
      zones: z.record(
        z.string(),
        z.object({
          name: z.string().min(1).max(253),
          authoritative: z.boolean(),
          reverse: z.boolean(),
          records: z.array(
            z.object({
              id: z.string().min(1),
              name: z.string().min(1).max(253),
              type: z.enum(["A", "AAAA", "CNAME", "MX", "PTR", "TXT", "NS"]),
              value: z.string().min(1),
              ttl: z.number().int().positive(),
              priority: z.number().int().nonnegative().optional(),
            }),
          ),
        }),
      ),
    }),
    nat: z.object({
      enabled: z.boolean(),
      translationTimeoutSeconds: z.number().int().positive(),
      pools: z.record(
        z.string(),
        z.object({
          name: z.string().min(1).max(64),
          startAddress: z.string(),
          endAddress: z.string(),
          prefixLength: z.number().int().min(0).max(32),
        }),
      ),
      rules: z.array(
        z.object({
          id: z.string().min(1),
          order: z.number().int().nonnegative(),
          enabled: z.boolean(),
          type: z.enum(["static", "dynamic", "pat", "source", "destination", "port-forward", "exemption"]),
          source: z.string(),
          sourcePrefixLength: z.number().int().min(0).max(32),
          destination: z.string(),
          destinationPrefixLength: z.number().int().min(0).max(32),
          translatedAddress: z.string().optional(),
          poolName: z.string().optional(),
          insideInterfaceId: z.string().optional(),
          outsideInterfaceId: z.string().optional(),
          protocol: z.enum(["ip", "tcp", "udp", "icmp"]).optional(),
          originalPort: z.number().int().min(1).max(65535).optional(),
          translatedPort: z.number().int().min(1).max(65535).optional(),
        }),
      ),
    }),
    acl: z.object({
      enabled: z.boolean(),
      accessLists: z.record(
        z.string(),
        z.object({
          name: z.string().min(1).max(64),
          type: z.enum(["standard", "extended"]),
          number: z.number().int().min(1).max(2699).optional(),
          rules: z.array(
            z.object({
              sequence: z.number().int().nonnegative(),
              action: z.enum(["permit", "deny"]),
              protocol: z.enum(["ip", "icmp", "tcp", "udp"]),
              source: z.string(),
              sourcePrefixLength: z.number().int().min(0).max(32),
              destination: z.string(),
              destinationPrefixLength: z.number().int().min(0).max(32),
              sourcePort: z.number().int().min(1).max(65535).optional(),
              destinationPort: z.number().int().min(1).max(65535).optional(),
              logging: z.boolean(),
              remark: z.string().max(240).optional(),
            }),
          ),
        }),
      ),
      assignments: z.array(
        z.object({
          interfaceId: z.string().min(1),
          direction: z.enum(["in", "out"]),
          aclName: z.string().min(1),
        }),
      ),
    }),
  }),
  security: securityRuntimeConfigSchema,
});

const configurationValidationResultSchema = z.object({
  valid: z.boolean(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })),
});

const configurationRevisionSchema = z.object({
  revisionId: z.string().min(1),
  deviceId: z.string().min(1),
  timestamp: timestampSchema,
  source: z.enum(["form", "cli", "raw", "import", "template", "lab-solution", "system"]),
  changedBy: z.string().min(1),
  changes: z.array(z.string()),
  previousRevision: z.string().optional(),
  validationResult: configurationValidationResultSchema,
  commitStatus: z.enum(["applied", "saved", "rolled-back"]),
  before: deviceRuntimeConfigSchema,
  after: deviceRuntimeConfigSchema,
});

export const deviceConfigurationStateSchema = z.object({
  deviceId: z.string().min(1),
  defaultConfig: deviceRuntimeConfigSchema,
  runningConfig: deviceRuntimeConfigSchema,
  startupConfig: deviceRuntimeConfigSchema,
  candidateConfig: deviceRuntimeConfigSchema,
  revisions: z.array(configurationRevisionSchema).max(40),
  status: z.enum(["clean", "modified", "validating", "invalid", "committed", "saved", "rollback-available"]),
  validationResult: configurationValidationResultSchema,
});

export const projectConfigurationStateSchema = z.object({
  devices: z.record(z.string(), deviceConfigurationStateSchema),
  auditLog: z.array(
    z.object({
      id: z.string().min(1),
      timestamp: timestampSchema,
      deviceId: z.string().min(1),
      type: z.enum([
        "CONFIG_CHANGED",
        "CONFIG_COMMITTED",
        "CONFIG_SAVED",
        "CONFIG_ROLLBACK",
        "INTERFACE_UP",
        "INTERFACE_DOWN",
        "VLAN_CHANGED",
        "STP_CHANGED",
        "ETHERCHANNEL_CHANGED",
        "ROUTE_ADDED",
        "ROUTE_REMOVED",
        "SERVICE_CHANGED",
        "ACL_CHANGED",
        "NAT_CHANGED",
        "FIREWALL_CHANGED",
        "VPN_CHANGED",
        "WIRELESS_CHANGED",
        "RADIUS_CHANGED",
      ]),
      source: z.enum(["form", "cli", "raw", "import", "template", "lab-solution", "system"]),
      message: z.string(),
      revisionId: z.string().optional(),
    }),
  ),
});

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  version: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  devices: z.array(deviceSchema).max(500),
  connections: z.array(connectionSchema).max(1000),
  groups: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      deviceIds: z.array(z.string()),
      color: z.string().min(1),
    }),
  ),
  canvasSettings: z.object({
    snapToGrid: z.boolean(),
    showGrid: z.boolean(),
    zoom: z.number().min(0.1).max(4),
  }),
  simulationSettings: z.object({ speed: z.number().positive().max(10), autoStart: z.boolean() }),
  configurationState: projectConfigurationStateSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const projectExportSchema = z.object({
  schemaVersion: z.number().int().positive(),
  project: projectSchema.omit({ devices: true, connections: true, groups: true }),
  devices: z.array(deviceSchema).max(500),
  connections: z.array(connectionSchema).max(1000),
  groups: projectSchema.shape.groups,
  settings: z.object({
    canvas: projectSchema.shape.canvasSettings,
    simulation: projectSchema.shape.simulationSettings,
  }),
});
