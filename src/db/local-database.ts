import Dexie, { type EntityTable } from "dexie";

import { migrateProject } from "@/services/project-migrations";
import type { NetLabProject } from "@/types/network";

export interface ProjectVersion {
  readonly id: string;
  readonly projectId: string;
  readonly createdAt: string;
  readonly data: NetLabProject;
}

export interface KeyValueRecord {
  readonly key: string;
  value: unknown;
  updatedAt: string;
}

export interface ProgressRecord {
  readonly id: string;
  progress: number;
  completedAt?: string;
  updatedAt: string;
}

export class NetLabDatabase extends Dexie {
  projects!: EntityTable<NetLabProject, "id">;
  projectVersions!: EntityTable<ProjectVersion, "id">;
  settings!: EntityTable<KeyValueRecord, "key">;
  learningProgress!: EntityTable<ProgressRecord, "id">;
  labProgress!: EntityTable<ProgressRecord, "id">;

  constructor() {
    super("netlab-studio");
    this.version(1).stores({
      projects: "id, updatedAt, name",
      projectVersions: "id, projectId, createdAt",
      settings: "key, updatedAt",
      learningProgress: "id, updatedAt",
      labProgress: "id, updatedAt",
    });
    this.version(2)
      .stores({
        projects: "id, updatedAt, name",
        projectVersions: "id, projectId, createdAt",
        settings: "key, updatedAt",
        learningProgress: "id, updatedAt",
        labProgress: "id, updatedAt",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table("projects")
          .toCollection()
          .modify((project) => Object.assign(project, migrateProject(project)));
        await transaction
          .table("projectVersions")
          .toCollection()
          .modify((version) => Object.assign(version, { data: migrateProject(version.data) }));
      });
    this.version(3)
      .stores({
        projects: "id, updatedAt, name",
        projectVersions: "id, projectId, createdAt",
        settings: "key, updatedAt",
        learningProgress: "id, updatedAt",
        labProgress: "id, updatedAt",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table("projects")
          .toCollection()
          .modify((project) => Object.assign(project, migrateProject(project)));
        await transaction
          .table("projectVersions")
          .toCollection()
          .modify((version) => Object.assign(version, { data: migrateProject(version.data) }));
      });
    this.version(4)
      .stores({
        projects: "id, updatedAt, name",
        projectVersions: "id, projectId, createdAt",
        settings: "key, updatedAt",
        learningProgress: "id, updatedAt",
        labProgress: "id, updatedAt",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table("projects")
          .toCollection()
          .modify((project) => Object.assign(project, migrateProject(project)));
        await transaction
          .table("projectVersions")
          .toCollection()
          .modify((version) => Object.assign(version, { data: migrateProject(version.data) }));
      });
    this.version(5)
      .stores({
        projects: "id, updatedAt, name",
        projectVersions: "id, projectId, createdAt",
        settings: "key, updatedAt",
        learningProgress: "id, updatedAt",
        labProgress: "id, updatedAt",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table("projects")
          .toCollection()
          .modify((project) => Object.assign(project, migrateProject(project)));
        await transaction
          .table("projectVersions")
          .toCollection()
          .modify((version) => Object.assign(version, { data: migrateProject(version.data) }));
      });
    this.version(6)
      .stores({
        projects: "id, updatedAt, name",
        projectVersions: "id, projectId, createdAt",
        settings: "key, updatedAt",
        learningProgress: "id, updatedAt",
        labProgress: "id, updatedAt",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table("projects")
          .toCollection()
          .modify((project) => Object.assign(project, migrateProject(project)));
        await transaction
          .table("projectVersions")
          .toCollection()
          .modify((version) => Object.assign(version, { data: migrateProject(version.data) }));
      });
  }
}

export const db = new NetLabDatabase();
