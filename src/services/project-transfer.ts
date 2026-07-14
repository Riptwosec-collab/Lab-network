import { projectExportSchema, projectSchema } from "@/schemas/network.schema";
import { ProjectImportError } from "@/lib/errors";
import { slugify } from "@/lib/utils";
import type { NetLabProject, ProjectExport } from "@/types/network";

export const MAX_IMPORT_SIZE = 5 * 1024 * 1024;

export function toProjectExport(project: NetLabProject): ProjectExport {
  return {
    schemaVersion: project.schemaVersion,
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      version: project.version,
      schemaVersion: project.schemaVersion,
      canvasSettings: project.canvasSettings,
      simulationSettings: project.simulationSettings,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    devices: project.devices,
    connections: project.connections,
    groups: project.groups,
    settings: { canvas: project.canvasSettings, simulation: project.simulationSettings },
  };
}

export function downloadProject(project: NetLabProject): void {
  const blob = new Blob([JSON.stringify(toProjectExport(project), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `netlab-${slugify(project.name) || "project"}-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importProjectFile(file: File): Promise<NetLabProject> {
  if (file.type && file.type !== "application/json") throw new ProjectImportError("กรุณาเลือกไฟล์ JSON เท่านั้น");
  if (!file.name.toLowerCase().endsWith(".json")) throw new ProjectImportError("นามสกุลไฟล์ต้องเป็น .json");
  if (file.size > MAX_IMPORT_SIZE) throw new ProjectImportError("ไฟล์มีขนาดใหญ่เกิน 5 MB");

  try {
    const parsed: unknown = JSON.parse(await file.text());
    const exported = projectExportSchema.parse(parsed);
    return projectSchema.parse({
      ...exported.project,
      devices: exported.devices,
      connections: exported.connections,
      groups: exported.groups,
      canvasSettings: exported.settings.canvas,
      simulationSettings: exported.settings.simulation,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof ProjectImportError) throw error;
    throw new ProjectImportError("ไม่สามารถอ่านโปรเจกต์ได้ กรุณาตรวจสอบรูปแบบและ schema version");
  }
}
