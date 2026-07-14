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
