import type { SimulationEvent, SimulationState } from "@/engine/core/engine-types";
import type {
  ProtocolDiagnostic,
  ProtocolRuntimeEvent,
  ProtocolSnapshot,
  ProtocolValidationIssue,
} from "@/engine/protocols/protocol-types";
import type { PingRequest, PingResult } from "@/engine/protocols/ping-engine";
import type {
  PacketProtocol,
  PacketSimulationState,
  PacketTrace,
  SendPacketRequest,
} from "@/engine/packets/packet-simulation-engine";
import type { NetworkConnection, NetworkDevice, TopologySnapshot } from "@/types/network";

export type WorkerRequest =
  | { type: "INIT" }
  | { type: "LOAD_TOPOLOGY"; payload: TopologySnapshot }
  | { type: "PING"; requestId: string; payload: PingRequest }
  | { type: "SEND_PACKET"; requestId: string; payload: SendPacketRequest }
  | { type: "PROTOCOL_EVENT"; requestId: string; payload: SimulationEvent }
  | { type: "PROTOCOL_RESTORE"; payload: ProtocolSnapshot }
  | { type: "PROTOCOL_VALIDATE"; requestId: string }
  | { type: "START" | "PAUSE" | "STOP" | "STEP" | "RESET" }
  | { type: "SET_SPEED"; payload: number }
  | { type: "SET_FILTER"; payload: PacketProtocol | "all" }
  | { type: "SET_FOLLOW"; payload: boolean }
  | { type: "UPDATE_DEVICE"; payload: NetworkDevice }
  | { type: "UPDATE_CONNECTION"; payload: NetworkConnection };

export type WorkerResponse =
  | { type: "READY" }
  | { type: "TOPOLOGY_LOADED" }
  | { type: "PING_RESULT"; requestId: string; payload: PingResult }
  | { type: "PACKET_RESULT"; requestId: string; payload: PacketTrace }
  | { type: "PACKET_STATE_UPDATED"; payload: PacketSimulationState }
  | { type: "PROTOCOL_STATE_UPDATED"; requestId?: string; payload: ProtocolSnapshot }
  | {
      type: "PROTOCOL_EVENT_RESULT";
      requestId: string;
      payload: {
        snapshot: ProtocolSnapshot;
        events: readonly ProtocolRuntimeEvent[];
        diagnostics: readonly ProtocolDiagnostic[];
      };
    }
  | { type: "PROTOCOL_VALIDATION_RESULT"; requestId: string; payload: readonly ProtocolValidationIssue[] }
  | { type: "STATE_UPDATED"; payload: SimulationState }
  | { type: "EVENT_CREATED"; payload: SimulationEvent }
  | { type: "ERROR"; requestId?: string; payload: { message: string } }
  | { type: "PERFORMANCE_STATS"; payload: { tickDurationMs: number; queueLength: number } };
