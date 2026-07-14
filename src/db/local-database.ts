import Dexie, { type EntityTable } from "dexie";

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
  }
}

export const db = new NetLabDatabase();
