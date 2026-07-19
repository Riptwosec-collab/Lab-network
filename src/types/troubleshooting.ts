import type { TopologySnapshot } from "@/types/network";

export const faultTypes = [
  "wrong-ip",
  "wrong-mask",
  "wrong-gateway",
  "wrong-dns",
  "duplicate-ip",
  "interface-down",
  "link-down",
  "wrong-vlan",
  "trunk-missing-vlan",
  "native-vlan-mismatch",
  "dhcp-pool-exhausted",
  "missing-dhcp-relay",
  "missing-route",
  "acl-block",
  "firewall-block",
  "weak-wifi-signal",
  "wrong-ssid-password",
  "nas-permission-denied",
  "raid-degraded",
  "cloud-route-missing",
  "security-group-block",
] as const;

export type FaultType = (typeof faultTypes)[number];
export type TroubleshootingLayer = "L1" | "L2" | "L3" | "SERVICE" | "SECURITY" | "STORAGE" | "CLOUD";

export interface TroubleshootingScenario {
  readonly id: string;
  readonly title: string;
  readonly difficulty: "Beginner" | "Intermediate" | "Advanced";
  readonly ticketDescription: string;
  readonly userComplaint: string;
  readonly faultTypes: readonly FaultType[];
  readonly logs: readonly string[];
  readonly deviceStatus: string;
  readonly monitoringData: string;
  readonly packetResult: string;
  readonly hints: readonly string[];
  readonly solution: readonly string[];
  readonly explanation: string;
  readonly timeLimitSeconds: number;
}

export interface InjectedFault {
  readonly type: FaultType;
  readonly targetId: string;
  readonly layer: TroubleshootingLayer;
  readonly changedPath: string;
  readonly isResolved: (topology: TopologySnapshot) => boolean;
}

export interface TroubleshootingSession {
  readonly scenario: TroubleshootingScenario;
  readonly healthyTopology: TopologySnapshot;
  readonly faultedTopology: TopologySnapshot;
  readonly faults: readonly InjectedFault[];
  readonly startedAt: string;
  readonly hintsUsed: number;
  readonly solutionViewed: boolean;
  readonly resetCount: number;
}

export interface TroubleshootingScore {
  readonly correctFix: number;
  readonly correctRootCause: number;
  readonly commandEfficiency: number;
  readonly time: number;
  readonly hintPenalty: number;
  readonly unnecessaryChangePenalty: number;
  readonly serviceImpactPenalty: number;
  readonly total: number;
  readonly fixed: boolean;
  readonly rootCauseCorrect: boolean;
  readonly resolvedFaults: number;
  readonly totalFaults: number;
}
