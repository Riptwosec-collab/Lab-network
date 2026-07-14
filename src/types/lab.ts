export type LabValidationStatus = "passed" | "failed" | "pending";

export interface LabTask {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly validatorId: string;
}

export interface LabSolution {
  readonly summary: string;
  readonly steps: readonly string[];
}

export interface LabDefinition {
  readonly id: string;
  readonly title: string;
  readonly level: string;
  readonly difficulty: string;
  readonly estimatedMinutes: number;
  readonly objectives: readonly string[];
  readonly scenario: string;
  readonly tasks: readonly LabTask[];
  readonly hints: readonly string[];
  readonly solution: LabSolution;
  readonly startingTopologyId: string;
}

export interface LabValidationResult {
  readonly taskId: string;
  readonly status: LabValidationStatus;
  readonly message: string;
}

export interface LabValidator {
  validate(lab: LabDefinition): Promise<readonly LabValidationResult[]>;
}
