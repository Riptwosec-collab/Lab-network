import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/data/demo-topology";
import { troubleshootingScenarios } from "@/data/troubleshooting-scenarios";
import { createBuiltInFaultRegistry } from "@/domain/troubleshooting/fault-registry";
import { TroubleshootingScenarioEngine } from "@/domain/troubleshooting/troubleshooting-engine";
import { faultTypes } from "@/types/troubleshooting";

const project = createDemoProject();
const topology = { devices: project.devices, connections: project.connections, groups: project.groups };

describe("TroubleshootingScenarioEngine", () => {
  it("registers every initial fault type", () => {
    const registry = createBuiltInFaultRegistry();
    expect(faultTypes).toHaveLength(21);
    expect(faultTypes.every((type) => registry.has(type))).toBe(true);
  });

  it("makes every registered fault active in real topology state", () => {
    const registry = createBuiltInFaultRegistry();
    for (const type of faultTypes) {
      const current = structuredClone(topology);
      const fault = registry.inject(type, current);
      expect(fault.isResolved(current), `${type} must change ${fault.changedPath}`).toBe(false);
      expect(fault.isResolved(topology), `${type} must resolve against healthy state`).toBe(true);
    }
  });

  it("injects a fault into real interface state and detects the fix", () => {
    const engine = new TroubleshootingScenarioEngine();
    const session = engine.start(troubleshootingScenarios[0]!, topology);
    const healthyPc = session.healthyTopology.devices.find((device) => device.type === "pc")!;
    const faultedPc = session.faultedTopology.devices.find((device) => device.id === healthyPc.id)!;
    expect(faultedPc.interfaces[0]?.defaultGateway).toBe("192.168.99.1");
    expect(engine.resolvedFaults(session, session.faultedTopology)).toBe(0);

    const repaired = structuredClone(session.faultedTopology);
    repaired.devices.find((device) => device.id === healthyPc.id)!.interfaces[0]!.defaultGateway =
      healthyPc.interfaces[0]!.defaultGateway;
    expect(engine.resolvedFaults(session, repaired)).toBe(1);
  });

  it("requires every injected fault in a multi-fault scenario to be resolved", () => {
    const engine = new TroubleshootingScenarioEngine();
    const scenario = troubleshootingScenarios.find((item) => item.id === "segmentation-and-route")!;
    const session = engine.start(scenario, topology);
    expect(session.faults).toHaveLength(2);
    expect(engine.resolvedFaults(session, session.faultedTopology)).toBe(0);
    expect(engine.resolvedFaults(session, session.healthyTopology)).toBe(2);
  });

  it("resets to the reproducible faulted state and can restore healthy state", () => {
    const engine = new TroubleshootingScenarioEngine();
    const session = engine.start(troubleshootingScenarios[0]!, topology);
    expect(engine.reset(session)).toEqual(session.faultedTopology);
    expect(engine.restoreHealthy(session)).toEqual(session.healthyTopology);
  });

  it("does not award fix points for a correct text selection without a state fix", () => {
    const engine = new TroubleshootingScenarioEngine();
    const session = engine.start(troubleshootingScenarios[0]!, topology);
    const score = engine.score(session, session.faultedTopology, {
      selectedRootCauses: ["wrong-gateway"],
      commandCount: 0,
      unnecessaryChanges: 0,
      serviceImpactEvents: 0,
      elapsedSeconds: 30,
    });
    expect(score.rootCauseCorrect).toBe(true);
    expect(score.fixed).toBe(false);
    expect(score.correctFix).toBe(0);
  });

  it("awards a full score only after state repair and correct root cause", () => {
    const engine = new TroubleshootingScenarioEngine();
    const session = engine.start(troubleshootingScenarios[0]!, topology);
    const score = engine.score(session, session.healthyTopology, {
      selectedRootCauses: ["wrong-gateway"],
      commandCount: 1,
      unnecessaryChanges: 0,
      serviceImpactEvents: 0,
      elapsedSeconds: 60,
    });
    expect(score.fixed).toBe(true);
    expect(score.rootCauseCorrect).toBe(true);
    expect(score.total).toBe(100);
  });
});
