import type { SimulationEvent, SimulationState } from "@/engine/core/engine-types";
import type { PingRequest, PingResult } from "@/engine/protocols/ping-engine";
import type { NetworkConnection, NetworkDevice, TopologySnapshot } from "@/types/network";

export type WorkerRequest =
  | { type: "INIT" }
  | { type: "LOAD_TOPOLOGY"; payload: TopologySnapshot }
  | { type: "PING"; requestId: string; payload: PingRequest }
  | { type: "START" | "PAUSE" | "STOP" | "STEP" | "RESET" }
  | { type: "UPDATE_DEVICE"; payload: NetworkDevice }
  | { type: "UPDATE_CONNECTION"; payload: NetworkConnection };

export type WorkerResponse =
  | { type: "READY" }
  | { type: "TOPOLOGY_LOADED" }
  | { type: "PING_RESULT"; requestId: string; payload: PingResult }
  | { type: "STATE_UPDATED"; payload: SimulationState }
  | { type: "EVENT_CREATED"; payload: SimulationEvent }
  | { type: "ERROR"; requestId?: string; payload: { message: string } }
  | { type: "PERFORMANCE_STATS"; payload: { tickDurationMs: number; queueLength: number } };
