export type SimulationStatus = "idle" | "running" | "paused" | "stopped";

export interface SimulationState {
  readonly status: SimulationStatus;
  readonly speed: number;
  readonly tick: number;
}

export interface SimulationEngine {
  start(): void;
  pause(): void;
  stop(): void;
  reset(): void;
  step(): void;
  setSpeed(speed: number): void;
  getState(): SimulationState;
}

export type SimulationEventType =
  | "DEVICE_ADDED"
  | "DEVICE_REMOVED"
  | "LINK_UP"
  | "LINK_DOWN"
  | "PACKET_CREATED"
  | "PACKET_FORWARDED"
  | "PACKET_DROPPED"
  | "ARP_REQUEST"
  | "ARP_REPLY"
  | "ICMP_ECHO_REQUEST"
  | "ICMP_ECHO_REPLY"
  | "SIMULATION_STARTED"
  | "SIMULATION_PAUSED"
  | "SIMULATION_STOPPED";

export interface SimulationEvent {
  readonly id: string;
  readonly type: SimulationEventType;
  readonly timestamp: string;
  readonly payload: Readonly<Record<string, unknown>>;
}
