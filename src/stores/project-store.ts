import { nanoid } from "nanoid";
import { create } from "zustand";

import { projectRepository } from "@/db/project-repository";
import { createDemoProject } from "@/data/demo-topology";
import { ProjectSaveError } from "@/lib/errors";
import { projectSchema } from "@/schemas/network.schema";
import { CURRENT_PROJECT_SCHEMA_VERSION, type NetLabProject, type TopologySnapshot } from "@/types/network";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface ProjectState {
  readonly currentProject?: NetLabProject;
  readonly recentProjects: NetLabProject[];
  readonly dirty: boolean;
  readonly saveStatus: SaveStatus;
  readonly lastSavedAt?: string;
  readonly errorMessage?: string;
  createProject(name?: string): NetLabProject;
  setCurrentProject(project: NetLabProject): void;
  updateFromTopology(snapshot: TopologySnapshot): void;
  markDirty(): void;
  loadProject(id: string): Promise<NetLabProject | undefined>;
  loadRecentProjects(): Promise<NetLabProject[]>;
  saveProject(project?: NetLabProject): Promise<NetLabProject>;
  ensureDemoProject(): Promise<NetLabProject>;
  renameProject(id: string, name: string): Promise<NetLabProject>;
  duplicateProject(id: string): Promise<NetLabProject>;
  deleteProject(id: string): Promise<void>;
}

const blankProject = (name = "Untitled Network"): NetLabProject => {
  const now = new Date().toISOString();
  return {
    id: nanoid(),
    name,
    description: "โปรเจกต์เครือข่ายใหม่",
    version: "0.1.0",
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    devices: [],
    connections: [],
    groups: [],
    canvasSettings: { snapToGrid: true, showGrid: true, zoom: 1 },
    simulationSettings: { speed: 1, autoStart: false },
    createdAt: now,
    updatedAt: now,
  };
};

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentProject: undefined,
  recentProjects: [],
  dirty: false,
  saveStatus: "idle",
  createProject: (name) => {
    const project = blankProject(name);
    set({ currentProject: project, dirty: true, saveStatus: "idle", errorMessage: undefined });
    return project;
  },
  setCurrentProject: (project) =>
    set({ currentProject: projectSchema.parse(project), dirty: false, saveStatus: "idle" }),
  updateFromTopology: (snapshot) => {
    const project = get().currentProject;
    if (!project) return;
    set({
      currentProject: { ...project, ...structuredClone(snapshot), updatedAt: new Date().toISOString() },
      dirty: true,
    });
  },
  markDirty: () => set({ dirty: true, saveStatus: "idle" }),
  loadProject: async (id) => {
    const project = await projectRepository.get(id);
    if (project) set({ currentProject: project, dirty: false, saveStatus: "saved", lastSavedAt: project.updatedAt });
    return project;
  },
  loadRecentProjects: async () => {
    const projects = await projectRepository.list();
    set({ recentProjects: projects });
    return projects;
  },
  saveProject: async (input) => {
    const project = input ?? get().currentProject;
    if (!project) throw new ProjectSaveError("ยังไม่มีโปรเจกต์สำหรับบันทึก");
    set({ saveStatus: "saving", errorMessage: undefined });
    try {
      const saved = await projectRepository.save(project);
      set((state) => ({
        currentProject: saved,
        recentProjects: [saved, ...state.recentProjects.filter((item) => item.id !== saved.id)],
        dirty: false,
        saveStatus: "saved",
        lastSavedAt: saved.updatedAt,
      }));
      return saved;
    } catch (error) {
      console.error("Failed to save project", error);
      set({ saveStatus: "error", errorMessage: "บันทึกโปรเจกต์ไม่สำเร็จ กรุณาลองใหม่" });
      throw new ProjectSaveError("บันทึกโปรเจกต์ไม่สำเร็จ");
    }
  },
  ensureDemoProject: async () => {
    const existing = await projectRepository.get("demo-project");
    if (existing) return existing;
    return projectRepository.save(createDemoProject());
  },
  renameProject: async (id, name) => {
    const trimmedName = name.trim();
    if (!trimmedName) throw new ProjectSaveError("ชื่อโปรเจกต์ต้องไม่ว่าง");
    const project = await projectRepository.get(id);
    if (!project) throw new ProjectSaveError("ไม่พบโปรเจกต์ที่ต้องการเปลี่ยนชื่อ");
    const saved = await projectRepository.save({ ...project, name: trimmedName });
    set((state) => ({
      recentProjects: state.recentProjects.map((item) => (item.id === id ? saved : item)),
      currentProject: state.currentProject?.id === id ? saved : state.currentProject,
    }));
    return saved;
  },
  duplicateProject: async (id) => {
    const duplicate = await projectRepository.duplicate(id);
    set((state) => ({ recentProjects: [duplicate, ...state.recentProjects] }));
    return duplicate;
  },
  deleteProject: async (id) => {
    await projectRepository.remove(id);
    set((state) => ({
      recentProjects: state.recentProjects.filter((item) => item.id !== id),
      currentProject: state.currentProject?.id === id ? undefined : state.currentProject,
    }));
  },
}));
