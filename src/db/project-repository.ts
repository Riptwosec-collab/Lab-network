import { nanoid } from "nanoid";

import { db } from "@/db/local-database";
import { projectSchema } from "@/schemas/network.schema";
import { migrateProject } from "@/services/project-migrations";
import type { NetLabProject } from "@/types/network";

export interface ProjectRepository {
  list(): Promise<NetLabProject[]>;
  get(id: string): Promise<NetLabProject | undefined>;
  save(project: NetLabProject): Promise<NetLabProject>;
  remove(id: string): Promise<void>;
  duplicate(id: string): Promise<NetLabProject>;
}

export class IndexedDbProjectRepository implements ProjectRepository {
  async list(): Promise<NetLabProject[]> {
    const projects = await db.projects.orderBy("updatedAt").reverse().toArray();
    return projects.map((project) => projectSchema.parse(migrateProject(project)));
  }

  async get(id: string): Promise<NetLabProject | undefined> {
    const project = await db.projects.get(id);
    return project ? projectSchema.parse(migrateProject(project)) : undefined;
  }

  async save(input: NetLabProject): Promise<NetLabProject> {
    const project = projectSchema.parse(migrateProject({ ...input, updatedAt: new Date().toISOString() }));
    await db.transaction("rw", db.projects, db.projectVersions, async () => {
      const previous = await db.projects.get(project.id);
      if (previous) {
        await db.projectVersions.add({
          id: nanoid(),
          projectId: project.id,
          createdAt: new Date().toISOString(),
          data: previous,
        });
      }
      await db.projects.put(project);
    });
    return project;
  }

  async remove(id: string): Promise<void> {
    await db.transaction("rw", db.projects, db.projectVersions, async () => {
      await db.projects.delete(id);
      await db.projectVersions.where("projectId").equals(id).delete();
    });
  }

  async duplicate(id: string): Promise<NetLabProject> {
    const project = await this.get(id);
    if (!project) throw new Error("Project not found");
    const now = new Date().toISOString();
    return this.save({
      ...structuredClone(project),
      id: nanoid(),
      name: `${project.name} Copy`,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export const projectRepository = new IndexedDbProjectRepository();
