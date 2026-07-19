import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/data/demo-topology";
import { labs } from "@/data/labs";
import { createBuiltInLabRuleRegistry } from "@/domain/labs/lab-rule-registry";
import { InvalidLabDefinitionError, LabValidationEngine } from "@/domain/labs/lab-validation-engine";
import type { LabAttemptState, LabDefinition, LabRuleType } from "@/types/lab";

const attempt = (updates: Partial<LabAttemptState> = {}): LabAttemptState => ({
  startedAt: "2026-07-19T00:00:00.000Z",
  hintsUsed: 0,
  partialSolutionViewed: false,
  fullSolutionViewed: false,
  resetCount: 0,
  elapsedSeconds: 30,
  ...updates,
});

const project = createDemoProject();
const context = {
  topology: { devices: project.devices, connections: project.connections, groups: project.groups },
  configurationState: project.configurationState,
};

describe("LabValidationEngine", () => {
  it("registers every Phase 20 rule type", () => {
    const registry = createBuiltInLabRuleRegistry();
    const types: readonly LabRuleType[] = [
      "device-exists",
      "interface-state",
      "ip-address",
      "vlan",
      "trunk",
      "route",
      "reachability",
      "dhcp-lease",
      "dns-resolution",
      "firewall-policy",
      "wifi-mapping",
      "nas-permission",
      "cloud-route",
      "packet-drop",
    ];
    expect(types.every((type) => registry.has(type))).toBe(true);
  });

  it("passes rules using real topology and interface state", async () => {
    const lab = labs.find((item) => item.id === "ip-ping")!;
    const report = await new LabValidationEngine().validate(lab, context, attempt());
    expect(report.completed).toBe(true);
    expect(report.passedRules).toBe(2);
    expect(report.score).toBe(100);
    expect(report.results.every((result) => result.evidence)).toBe(true);
  });

  it("reports partial completion and a proportional score", async () => {
    const lab = labs.find((item) => item.id === "ip-ping")!;
    const report = await new LabValidationEngine().validate(
      lab,
      { ...context, topology: { ...context.topology, connections: [] } },
      attempt(),
    );
    expect(report.completed).toBe(false);
    expect(report.passedRules).toBe(1);
    expect(report.score).toBeGreaterThan(0);
    expect(report.score).toBeLessThan(100);
  });

  it("applies hint and solution penalties", async () => {
    const lab = labs.find((item) => item.id === "ip-ping")!;
    const clean = await new LabValidationEngine().validate(lab, context, attempt());
    const penalized = await new LabValidationEngine().validate(
      lab,
      context,
      attempt({ hintsUsed: 1, partialSolutionViewed: true, fullSolutionViewed: true }),
    );
    expect(penalized.score).toBe(
      clean.score -
        lab.scoreRules.hintPenalty -
        lab.scoreRules.partialSolutionPenalty -
        lab.scoreRules.fullSolutionPenalty,
    );
  });

  it("does not accept command history as network-state evidence", async () => {
    const lab = labs.find((item) => item.id === "ip-ping")!;
    const report = await new LabValidationEngine().validate(
      lab,
      {
        topology: { devices: [], connections: [], groups: [] },
        configurationState: {
          devices: {},
          auditLog: [
            {
              id: "fake-command",
              deviceId: "missing-device",
              timestamp: "2026-07-19T00:00:00.000Z",
              source: "cli",
              type: "CONFIG_CHANGED",
              message: "ip address 192.168.1.1 was typed without changing state",
            },
          ],
        },
      },
      attempt(),
    );
    expect(report.passedRules).toBe(0);
  });

  it("rejects invalid lab definitions", () => {
    const lab = labs[0]!;
    const invalid: LabDefinition = {
      ...lab,
      verification: [{ ...lab.verification[0]!, taskId: "missing-task" }],
    };
    expect(() => new LabValidationEngine().validateDefinition(invalid)).toThrow(InvalidLabDefinitionError);
  });
});
