/// <reference lib="webworker" />

import { NetLabSimulationEngine } from "@/engine/core/simulation-engine";
import { ArpCache } from "@/engine/protocols/arp-cache";
import { IPv4PingEngine } from "@/engine/protocols/ping-engine";
import type { WorkerRequest, WorkerResponse } from "@/engine/workers/worker-messages";
import type { TopologySnapshot } from "@/types/network";

const workerScope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const engine = new NetLabSimulationEngine();
const arpCache = new ArpCache();
let topology: TopologySnapshot = { devices: [], connections: [], groups: [] };

workerScope.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  try {
    const message = event.data;
    if (message.type === "LOAD_TOPOLOGY") {
      topology = message.payload;
      const response: WorkerResponse = { type: "TOPOLOGY_LOADED" };
      workerScope.postMessage(response);
      return;
    }
    if (message.type === "PING") {
      const response: WorkerResponse = {
        type: "PING_RESULT",
        requestId: message.requestId,
        payload: new IPv4PingEngine(topology, arpCache).ping(message.payload),
      };
      workerScope.postMessage(response);
      return;
    }
    if (message.type === "START") engine.start();
    if (message.type === "PAUSE") engine.pause();
    if (message.type === "STOP") engine.stop();
    if (message.type === "STEP") engine.step();
    if (message.type === "RESET") {
      engine.reset();
      arpCache.clear();
    }
    const response: WorkerResponse =
      message.type === "INIT" ? { type: "READY" } : { type: "STATE_UPDATED", payload: engine.getState() };
    workerScope.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      type: "ERROR",
      requestId: event.data.type === "PING" ? event.data.requestId : undefined,
      payload: { message: error instanceof Error ? error.message : "Unknown worker error" },
    };
    workerScope.postMessage(response);
  }
});

export {};
