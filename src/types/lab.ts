export type LabValidationStatus = "passed" | "partial" | "failed" | "pending";

export type LabRuleType =
  | "device-exists"
  | "interface-state"
  | "ip-address"
  | "vlan"
  | "trunk"
  | "route"
  | "reachability"
  | "dhcp-lease"
  | "dns-resolution"
  | "firewall-policy"
  | "wifi-mapping"
  | "nas-permission"
  | "cloud-route"
  | "packet-drop";

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

export interface LabAddressEntry {
  readonly device: string;
  readonly interfaceName: string;
  readonly address: string;
  readonly gateway?: string;
}

export interface LabVerificationRule {
  readonly id: string;
  readonly taskId: string;
  readonly type: LabRuleType;
  readonly description: string;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly points: number;
}

export interface LabScoreRules {
  readonly fullScore: number;
  readonly hintPenalty: number;
  readonly partialSolutionPenalty: number;
  readonly fullSolutionPenalty: number;
  readonly timeBonus: number;
  readonly noResetBonus: number;
  readonly targetSeconds: number;
}

export interface LabDefinition {
  readonly id: string;
  readonly title: string;
  readonly level: string;
  readonly difficulty: string;
  readonly estimatedMinutes: number;
  readonly objectives: readonly string[];
  readonly scenario: string;
  readonly ipAddressTable: readonly LabAddressEntry[];
  readonly tasks: readonly LabTask[];
  readonly requirements: readonly string[];
  readonly verification: readonly LabVerificationRule[];
  readonly hints: readonly string[];
  readonly partialSolution: LabSolution;
  readonly solution: LabSolution;
  readonly explanation: string;
  readonly commonMistakes: readonly string[];
  readonly scoreRules: LabScoreRules;
  readonly startingTopologyId: string;
}

export interface LabValidationResult {
  readonly taskId: string;
  readonly status: LabValidationStatus;
  readonly message: string;
  readonly ruleId?: string;
  readonly evidence?: readonly string[];
}

export interface LabAttemptState {
  readonly startedAt: string;
  readonly hintsUsed: number;
  readonly partialSolutionViewed: boolean;
  readonly fullSolutionViewed: boolean;
  readonly resetCount: number;
  readonly elapsedSeconds: number;
}

export interface LabValidationReport {
  readonly labId: string;
  readonly results: readonly LabValidationResult[];
  readonly passedRules: number;
  readonly totalRules: number;
  readonly score: number;
  readonly maxScore: number;
  readonly completed: boolean;
}

export interface LabValidator {
  validate(lab: LabDefinition): Promise<readonly LabValidationResult[]>;
}
