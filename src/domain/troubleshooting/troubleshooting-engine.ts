import { createBuiltInFaultRegistry, type FaultRegistry } from "@/domain/troubleshooting/fault-registry";
import type { TopologySnapshot } from "@/types/network";
import type {
  FaultType,
  TroubleshootingScenario,
  TroubleshootingScore,
  TroubleshootingSession,
} from "@/types/troubleshooting";

export interface TroubleshootingSubmission {
  readonly selectedRootCauses: readonly FaultType[];
  readonly commandCount: number;
  readonly unnecessaryChanges: number;
  readonly serviceImpactEvents: number;
  readonly elapsedSeconds: number;
}

export class TroubleshootingScenarioEngine {
  constructor(private readonly registry: FaultRegistry = createBuiltInFaultRegistry()) {}

  start(scenario: TroubleshootingScenario, topology: TopologySnapshot): TroubleshootingSession {
    const healthyTopology = structuredClone(topology);
    const faultedTopology = structuredClone(topology);
    const faults = scenario.faultTypes.map((type) => this.registry.inject(type, faultedTopology));
    return {
      scenario,
      healthyTopology,
      faultedTopology,
      faults,
      startedAt: new Date().toISOString(),
      hintsUsed: 0,
      solutionViewed: false,
      resetCount: 0,
    };
  }

  resolvedFaults(session: TroubleshootingSession, topology: TopologySnapshot): number {
    return session.faults.filter((fault) => fault.isResolved(topology)).length;
  }

  reset(session: TroubleshootingSession): TopologySnapshot {
    return structuredClone(session.faultedTopology);
  }

  restoreHealthy(session: TroubleshootingSession): TopologySnapshot {
    return structuredClone(session.healthyTopology);
  }

  score(
    session: TroubleshootingSession,
    topology: TopologySnapshot,
    submission: TroubleshootingSubmission,
  ): TroubleshootingScore {
    const resolvedFaults = this.resolvedFaults(session, topology);
    const fixed = resolvedFaults === session.faults.length;
    const expected = [...session.scenario.faultTypes].sort();
    const submitted = [...new Set(submission.selectedRootCauses)].sort();
    const rootCauseCorrect =
      expected.length === submitted.length && expected.every((type, index) => type === submitted[index]);
    const correctFix = Math.round((resolvedFaults / session.faults.length) * 50);
    const correctRootCause = rootCauseCorrect ? 25 : 0;
    const commandEfficiency = Math.max(0, 10 - Math.max(0, submission.commandCount - session.faults.length * 2));
    const time = fixed && submission.elapsedSeconds <= session.scenario.timeLimitSeconds ? 15 : 0;
    const hintPenalty = session.hintsUsed * 5 + (session.solutionViewed ? 20 : 0);
    const unnecessaryChangePenalty = submission.unnecessaryChanges * 3;
    const serviceImpactPenalty = submission.serviceImpactEvents * 5;
    const total = Math.max(
      0,
      Math.min(
        100,
        correctFix +
          correctRootCause +
          commandEfficiency +
          time -
          hintPenalty -
          unnecessaryChangePenalty -
          serviceImpactPenalty,
      ),
    );
    return {
      correctFix,
      correctRootCause,
      commandEfficiency,
      time,
      hintPenalty,
      unnecessaryChangePenalty,
      serviceImpactPenalty,
      total,
      fixed,
      rootCauseCorrect,
      resolvedFaults,
      totalFaults: session.faults.length,
    };
  }
}
