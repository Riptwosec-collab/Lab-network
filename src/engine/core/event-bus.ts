import type { SimulationEvent, SimulationEventType } from "@/engine/core/engine-types";

type EventListener = (event: SimulationEvent) => void;

export class EventBus {
  private readonly listeners = new Map<SimulationEventType, Set<EventListener>>();

  on(type: SimulationEventType, listener: EventListener): () => void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    return () => listeners.delete(listener);
  }

  emit(event: SimulationEvent): void {
    this.listeners.get(event.type)?.forEach((listener) => listener(event));
  }
}
