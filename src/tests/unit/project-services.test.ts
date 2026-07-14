import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/local-database";
import { projectRepository } from "@/db/project-repository";
import { createDemoProject } from "@/data/demo-topology";
import { ProjectImportError } from "@/lib/errors";
import { importProjectFile } from "@/services/project-transfer";

describe("project persistence", () => {
  beforeEach(async () => {
    await db.projects.clear();
    await db.projectVersions.clear();
  });

  it("saves and loads a project", async () => {
    const project = createDemoProject();
    await projectRepository.save(project);
    expect((await projectRepository.get(project.id))?.name).toBe(project.name);
  });

  it("rejects invalid imported JSON without changing stored projects", async () => {
    const current = createDemoProject();
    await projectRepository.save(current);
    const file = new File(["{invalid"], "broken.json", { type: "application/json" });
    await expect(importProjectFile(file)).rejects.toBeInstanceOf(ProjectImportError);
    expect(await projectRepository.get(current.id)).toBeDefined();
  });

  it("duplicates and removes projects", async () => {
    const current = createDemoProject();
    await projectRepository.save(current);
    const duplicate = await projectRepository.duplicate(current.id);
    expect(duplicate.id).not.toBe(current.id);
    expect(duplicate.name).toBe(`${current.name} Copy`);
    await projectRepository.remove(duplicate.id);
    expect(await projectRepository.get(duplicate.id)).toBeUndefined();
  });
});
