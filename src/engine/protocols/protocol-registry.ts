import type { SimulationEvent } from "@/engine/core/engine-types";
import type {
  JsonValue,
  ProtocolContext,
  ProtocolDiagnostic,
  ProtocolModule,
  ProtocolResult,
  ProtocolRuntimeEvent,
  ProtocolSnapshot,
  ProtocolValidationIssue,
} from "@/engine/protocols/protocol-types";
import type { TopologySnapshot } from "@/types/network";

export class ProtocolRegistry {
  private readonly modules = new Map<string, ProtocolModule>();
  private states: Record<string, JsonValue> = {};
  private tick = 0;

  constructor(modules: readonly ProtocolModule[] = []) {
    modules.forEach((protocolModule) => {
      if (this.modules.has(protocolModule.id)) throw new Error(`Protocol ${protocolModule.id} is already registered`);
      this.modules.set(protocolModule.id, protocolModule);
    });
    this.assertAcyclic();
  }

  register(module: ProtocolModule): void {
    if (this.modules.has(module.id)) throw new Error(`Protocol ${module.id} is already registered`);
    this.modules.set(module.id, module);
    this.assertAcyclic();
  }

  list(): readonly ProtocolModule[] {
    return this.sortedModules();
  }

  initialize(
    topology: TopologySnapshot,
    options: { tick?: number; now?: string; seed?: string } = {},
  ): ProtocolSnapshot {
    this.tick = options.tick ?? 0;
    const context = this.context(topology, options.now, options.seed);
    const nextStates: Record<string, JsonValue> = {};
    for (const protocolModule of this.sortedModules()) {
      nextStates[protocolModule.id] = protocolModule.initialize({ ...context, snapshots: nextStates });
    }
    this.states = nextStates;
    return this.snapshot();
  }

  handleEvent(topology: TopologySnapshot, event: SimulationEvent): ProtocolRegistryResult {
    this.tick += 1;
    const context = this.context(topology, event.timestamp, event.id);
    const events: ProtocolRuntimeEvent[] = [];
    const diagnostics: ProtocolDiagnostic[] = [];
    const nextStates = { ...this.states };
    for (const protocolModule of this.sortedModules()) {
      const previous =
        nextStates[protocolModule.id] ?? protocolModule.initialize({ ...context, snapshots: nextStates });
      const result = protocolModule.handleEvent(event, previous, {
        ...context,
        snapshots: nextStates,
      }) as ProtocolResult<JsonValue, ProtocolRuntimeEvent>;
      nextStates[protocolModule.id] = result.state;
      events.push(...result.events);
      diagnostics.push(...(result.diagnostics ?? []));
    }
    this.states = nextStates;
    return { snapshot: this.snapshot(), events, diagnostics };
  }

  validate(topology: TopologySnapshot): readonly ProtocolValidationIssue[] {
    const context = this.context(topology);
    return topology.devices.flatMap((device) =>
      this.sortedModules().flatMap((protocolModule) => protocolModule.validateConfiguration(device, context)),
    );
  }

  snapshot(): ProtocolSnapshot {
    return {
      schemaVersion: 1,
      tick: this.tick,
      states: structuredClone(this.states),
    };
  }

  restore(snapshot: ProtocolSnapshot, topology: TopologySnapshot): ProtocolSnapshot {
    this.tick = snapshot.tick;
    const context = this.context(topology);
    const nextStates: Record<string, JsonValue> = {};
    for (const protocolModule of this.sortedModules()) {
      const serialized = snapshot.states[protocolModule.id];
      nextStates[protocolModule.id] =
        serialized === undefined
          ? protocolModule.initialize({ ...context, snapshots: nextStates })
          : (protocolModule.restoreState?.(serialized, { ...context, snapshots: nextStates }) ?? serialized);
    }
    this.states = nextStates;
    return this.snapshot();
  }

  private sortedModules(): ProtocolModule[] {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const ordered: ProtocolModule[] = [];
    const visit = (protocolModule: ProtocolModule) => {
      if (visited.has(protocolModule.id)) return;
      if (visiting.has(protocolModule.id))
        throw new Error(`Circular protocol dependency detected at ${protocolModule.id}`);
      visiting.add(protocolModule.id);
      for (const dependency of protocolModule.dependencies) {
        const dependencyModule = this.modules.get(dependency);
        if (!dependencyModule)
          throw new Error(`Protocol ${protocolModule.id} depends on missing protocol ${dependency}`);
        visit(dependencyModule);
      }
      visiting.delete(protocolModule.id);
      visited.add(protocolModule.id);
      ordered.push(protocolModule);
    };
    [...this.modules.values()].sort((a, b) => a.id.localeCompare(b.id)).forEach(visit);
    return ordered;
  }

  private assertAcyclic(): void {
    this.sortedModules();
  }

  private context(topology: TopologySnapshot, now = new Date(0).toISOString(), seed = "netlab"): ProtocolContext {
    return { topology, tick: this.tick, now, seed, snapshots: this.states };
  }
}

export interface ProtocolRegistryResult {
  readonly snapshot: ProtocolSnapshot;
  readonly events: readonly ProtocolRuntimeEvent[];
  readonly diagnostics: readonly ProtocolDiagnostic[];
}
