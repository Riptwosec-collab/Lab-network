import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  DEVICE_CATEGORIES,
  type NetLabProject,
  type ProjectExport,
} from "@/types/network";

type UnknownRecord = Record<string, unknown>;

const validCategories = new Set<string>(DEVICE_CATEGORIES);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function migrateInterface(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    ...value,
    status: value.status === "administratively-down" ? "administratively-down" : (value.status ?? "down"),
  };
}

function migrateConnection(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const legacyCable = value.cableType === "fiber" ? "fiber-multi-mode" : value.cableType;
  return {
    ...value,
    cableType: legacyCable ?? "copper",
    status: value.status ?? "down",
    mtu: value.mtu ?? 1500,
    protocol: value.protocol ?? "ethernet",
    direction: value.direction ?? "bidirectional",
    pathStyle:
      value.pathStyle ?? (legacyCable === "wireless" ? "wireless" : legacyCable === "virtual" ? "logical" : "physical"),
  };
}

export function migrateProject(input: unknown): NetLabProject {
  if (!isRecord(input)) throw new Error("Project must be an object");
  const devices = Array.isArray(input.devices) ? input.devices : [];
  const connections = Array.isArray(input.connections) ? input.connections : [];
  const migrated = {
    ...input,
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    devices: devices.map((device) => {
      if (!isRecord(device)) return device;
      return {
        ...device,
        category: validCategories.has(String(device.category)) ? device.category : "end-device",
        interfaces: Array.isArray(device.interfaces) ? device.interfaces.map(migrateInterface) : [],
      };
    }),
    connections: connections.map(migrateConnection),
  };
  return migrated as NetLabProject;
}

export function migrateProjectExport(input: unknown): ProjectExport {
  if (!isRecord(input) || !isRecord(input.project)) throw new Error("Project export must contain a project object");
  const migratedProject = migrateProject({
    ...input.project,
    devices: input.devices,
    connections: input.connections,
    groups: input.groups,
    canvasSettings: isRecord(input.settings) ? input.settings.canvas : input.project.canvasSettings,
    simulationSettings: isRecord(input.settings) ? input.settings.simulation : input.project.simulationSettings,
  });
  return {
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    project: {
      ...migratedProject,
      devices: undefined,
      connections: undefined,
      groups: undefined,
    } as unknown as ProjectExport["project"],
    devices: migratedProject.devices,
    connections: migratedProject.connections,
    groups: migratedProject.groups,
    settings: { canvas: migratedProject.canvasSettings, simulation: migratedProject.simulationSettings },
  };
}
