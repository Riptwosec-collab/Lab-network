import type { SimulationEvent } from "@/engine/core/engine-types";
import type { NetworkDevice, TopologySnapshot } from "@/types/network";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | { readonly [key: string]: JsonValue } | readonly JsonValue[];

export type ProtocolSeverity = "info" | "warning" | "error";

export interface ProtocolContext {
  readonly topology: TopologySnapshot;
  readonly tick: number;
  readonly now: string;
  readonly seed: string;
  readonly snapshots?: Readonly<Record<string, JsonValue>>;
}

export interface ProtocolValidationIssue {
  readonly protocolId: string;
  readonly deviceId: string;
  readonly severity: ProtocolSeverity;
  readonly code: string;
  readonly message: string;
}

export interface ProtocolDiagnostic {
  readonly protocolId: string;
  readonly severity: ProtocolSeverity;
  readonly code: string;
  readonly message: string;
  readonly deviceId?: string;
}

export interface ProtocolRuntimeEvent<TPayload extends JsonValue = JsonValue> {
  readonly protocolId: string;
  readonly type: string;
  readonly timestamp: string;
  readonly payload: TPayload;
}

export interface ProtocolResult<TState extends JsonValue, TEvent extends ProtocolRuntimeEvent = ProtocolRuntimeEvent> {
  readonly state: TState;
  readonly events: readonly TEvent[];
  readonly diagnostics?: readonly ProtocolDiagnostic[];
}

export interface ProtocolModule<
  TState extends JsonValue = JsonValue,
  TEvent extends ProtocolRuntimeEvent = ProtocolRuntimeEvent,
> {
  readonly id: string;
  readonly version: string;
  readonly dependencies: readonly string[];
  initialize(context: ProtocolContext): TState;
  handleEvent(event: SimulationEvent, state: TState, context: ProtocolContext): ProtocolResult<TState, TEvent>;
  validateConfiguration(device: NetworkDevice, context: ProtocolContext): readonly ProtocolValidationIssue[];
  serializeState?(state: TState): JsonValue;
  restoreState?(snapshot: JsonValue, context: ProtocolContext): TState;
}

export interface ProtocolSnapshot {
  readonly schemaVersion: 1;
  readonly tick: number;
  readonly states: Readonly<Record<string, JsonValue>>;
}
