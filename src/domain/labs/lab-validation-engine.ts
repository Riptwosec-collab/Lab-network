import {
  createBuiltInLabRuleRegistry,
  type LabRuleContext,
  type LabRuleRegistry,
} from "@/domain/labs/lab-rule-registry";
import type { LabAttemptState, LabDefinition, LabValidationReport } from "@/types/lab";

export class InvalidLabDefinitionError extends Error {}

export class LabValidationEngine {
  constructor(private readonly registry: LabRuleRegistry = createBuiltInLabRuleRegistry()) {}

  validateDefinition(lab: LabDefinition): void {
    if (!lab.id.trim() || !lab.title.trim() || !lab.tasks.length || !lab.verification.length)
      throw new InvalidLabDefinitionError("Lab ต้องมี id, title, tasks และ verification rules");
    const taskIds = new Set(lab.tasks.map((task) => task.id));
    if (taskIds.size !== lab.tasks.length) throw new InvalidLabDefinitionError("Lab task IDs ต้องไม่ซ้ำกัน");
    for (const rule of lab.verification) {
      if (!taskIds.has(rule.taskId)) throw new InvalidLabDefinitionError(`Rule ${rule.id} อ้างถึง task ที่ไม่มีอยู่`);
      if (!this.registry.has(rule.type))
        throw new InvalidLabDefinitionError(`Rule type ${rule.type} ยังไม่ถูก register`);
      if (rule.points <= 0) throw new InvalidLabDefinitionError(`Rule ${rule.id} ต้องมีคะแนนมากกว่า 0`);
    }
  }

  async validate(lab: LabDefinition, context: LabRuleContext, attempt: LabAttemptState): Promise<LabValidationReport> {
    this.validateDefinition(lab);
    const results = await Promise.all(
      lab.verification.map(async (rule) => {
        const evaluation = await this.registry.evaluate(context, rule);
        return {
          taskId: rule.taskId,
          ruleId: rule.id,
          status: evaluation.passed ? ("passed" as const) : ("failed" as const),
          message: evaluation.message,
          evidence: evaluation.evidence,
        };
      }),
    );
    const passedRules = results.filter((result) => result.status === "passed").length;
    const totalPoints = lab.verification.reduce((total, rule) => total + rule.points, 0);
    const earnedPoints = lab.verification.reduce(
      (total, rule, index) => total + (results[index]?.status === "passed" ? rule.points : 0),
      0,
    );
    const completed = passedRules === results.length;
    const bonusBudget = lab.scoreRules.timeBonus + lab.scoreRules.noResetBonus;
    const basePool = Math.max(0, lab.scoreRules.fullScore - bonusBudget);
    let score = Math.round((earnedPoints / totalPoints) * basePool);
    score -= attempt.hintsUsed * lab.scoreRules.hintPenalty;
    if (attempt.partialSolutionViewed) score -= lab.scoreRules.partialSolutionPenalty;
    if (attempt.fullSolutionViewed) score -= lab.scoreRules.fullSolutionPenalty;
    if (completed && attempt.elapsedSeconds <= lab.scoreRules.targetSeconds) score += lab.scoreRules.timeBonus;
    if (completed && attempt.resetCount === 0) score += lab.scoreRules.noResetBonus;
    score = Math.max(0, Math.min(lab.scoreRules.fullScore, score));
    return {
      labId: lab.id,
      results,
      passedRules,
      totalRules: results.length,
      score,
      maxScore: lab.scoreRules.fullScore,
      completed,
    };
  }
}
