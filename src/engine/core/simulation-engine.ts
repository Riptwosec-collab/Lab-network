import { nanoid } from "nanoid";

import { EventBus } from "@/engine/core/event-bus";
import type { SimulationEngine, SimulationState } from "@/engine/core/engine-types";

export class NetLabSimulationEngine implements SimulationEngine {
  private state: SimulationState = { status: "idle", speed: 1, tick: 0 };

  constructor(private readonly eventBus = new EventBus()) {}

  start(): void {
    this.state = { ...this.state, status: "running" };
    this.emit("SIMULATION_STARTED");
  }

  pause(): void {
    this.state = { ...this.state, status: "paused" };
    this.emit("SIMULATION_PAUSED");
  }

  stop(): void {
    this.state = { ...this.state, status: "stopped" };
    this.emit("SIMULATION_STOPPED");
  }

  reset(): void {
    this.state = { status: "idle", speed: this.state.speed, tick: 0 };
  }

  step(): void {
    this.state = { ...this.state, tick: this.state.tick + 1 };
  }

  setSpeed(speed: number): void {
    this.state = { ...this.state, speed: Math.max(0.25, Math.min(10, speed)) };
  }

  getState(): SimulationState {
    return { ...this.state };
  }

  private emit(type: "SIMULATION_STARTED" | "SIMULATION_PAUSED" | "SIMULATION_STOPPED"): void {
    this.eventBus.emit({
      id: nanoid(),
      type,
      timestamp: new Date().toISOString(),
      payload: { state: this.getState() },
    });
  }
}
