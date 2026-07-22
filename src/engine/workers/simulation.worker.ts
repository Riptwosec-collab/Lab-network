/// <reference lib="webworker" />

import { NetLabSimulationEngine } from "@/engine/core/simulation-engine";
import { ArpCache } from "@/engine/protocols/arp-cache";
import { advancedProtocolModules } from "@/engine/protocols/advanced-protocol-modules";
import { IPv4PingEngine } from "@/engine/protocols/ping-engine";
import { ProtocolRegistry } from "@/engine/protocols/protocol-registry";
import { PacketSimulationEngine } from "@/engine/packets/packet-simulation-engine";
import type { WorkerRequest, WorkerResponse } from "@/engine/workers/worker-messages";
import type { TopologySnapshot } from "@/types/network";

const workerScope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const engine = new NetLabSimulationEngine();
const arpCache = new ArpCache();
const packetEngine = new PacketSimulationEngine();
const protocolRegistry = new ProtocolRegistry(advancedProtocolModules);
let topology: TopologySnapshot = { devices: [], connections: [], groups: [] };

workerScope.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  try {
    const message = event.data;
    if (message.type === "LOAD_TOPOLOGY") {
      topology = message.payload;
      packetEngine.loadTopology(topology);
      const protocolSnapshot = protocolRegistry.initialize(topology);
      const response: WorkerResponse = { type: "TOPOLOGY_LOADED" };
      workerScope.postMessage(response);
      workerScope.postMessage({ type: "PROTOCOL_STATE_UPDATED", payload: protocolSnapshot } satisfies WorkerResponse);
      return;
    }
    if (message.type === "UPDATE_DEVICE") {
      const exists = topology.devices.some((device) => device.id === message.payload.id);
      topology = {
        ...topology,
        devices: exists
          ? topology.devices.map((device) => (device.id === message.payload.id ? message.payload : device))
          : [...topology.devices, message.payload],
      };
      packetEngine.loadTopology(topology);
      const protocolSnapshot = protocolRegistry.initialize(topology);
      workerScope.postMessage({ type: "TOPOLOGY_LOADED" } satisfies WorkerResponse);
      workerScope.postMessage({ type: "PROTOCOL_STATE_UPDATED", payload: protocolSnapshot } satisfies WorkerResponse);
      return;
    }
    if (message.type === "UPDATE_CONNECTION") {
      const exists = topology.connections.some((connection) => connection.id === message.payload.id);
      topology = {
        ...topology,
        connections: exists
          ? topology.connections.map((connection) =>
              connection.id === message.payload.id ? message.payload : connection,
            )
          : [...topology.connections, message.payload],
      };
      packetEngine.loadTopology(topology);
      const protocolSnapshot = protocolRegistry.initialize(topology);
      workerScope.postMessage({ type: "TOPOLOGY_LOADED" } satisfies WorkerResponse);
      workerScope.postMessage({ type: "PROTOCOL_STATE_UPDATED", payload: protocolSnapshot } satisfies WorkerResponse);
      return;
    }
    if (message.type === "PROTOCOL_EVENT") {
      workerScope.postMessage({
        type: "PROTOCOL_EVENT_RESULT",
        requestId: message.requestId,
        payload: protocolRegistry.handleEvent(topology, message.payload),
      } satisfies WorkerResponse);
      return;
    }
    if (message.type === "PROTOCOL_RESTORE") {
      workerScope.postMessage({
        type: "PROTOCOL_STATE_UPDATED",
        payload: protocolRegistry.restore(message.payload, topology),
      } satisfies WorkerResponse);
      return;
    }
    if (message.type === "PROTOCOL_VALIDATE") {
      workerScope.postMessage({
        type: "PROTOCOL_VALIDATION_RESULT",
        requestId: message.requestId,
        payload: protocolRegistry.validate(topology),
      } satisfies WorkerResponse);
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
    if (message.type === "SEND_PACKET") {
      const response: WorkerResponse = {
        type: "PACKET_RESULT",
        requestId: message.requestId,
        payload: packetEngine.sendPacket(message.payload),
      };
      workerScope.postMessage(response);
      workerScope.postMessage({
        type: "PACKET_STATE_UPDATED",
        payload: packetEngine.getState(),
      } satisfies WorkerResponse);
      return;
    }
    if (message.type === "SET_SPEED") {
      workerScope.postMessage({
        type: "PACKET_STATE_UPDATED",
        payload: packetEngine.setSpeed(message.payload),
      } satisfies WorkerResponse);
      return;
    }
    if (message.type === "SET_FILTER") {
      workerScope.postMessage({
        type: "PACKET_STATE_UPDATED",
        payload: packetEngine.setFilter(message.payload),
      } satisfies WorkerResponse);
      return;
    }
    if (message.type === "SET_FOLLOW") {
      workerScope.postMessage({
        type: "PACKET_STATE_UPDATED",
        payload: packetEngine.setFollow(message.payload),
      } satisfies WorkerResponse);
      return;
    }
    if (message.type === "START") {
      engine.start();
      packetEngine.start();
    }
    if (message.type === "PAUSE") {
      engine.pause();
      packetEngine.pause();
    }
    if (message.type === "STOP") {
      engine.stop();
      packetEngine.stop();
    }
    if (message.type === "STEP") {
      engine.step();
      packetEngine.step();
    }
    if (message.type === "RESET") {
      engine.reset();
      arpCache.clear();
      packetEngine.reset();
    }
    const response: WorkerResponse =
      message.type === "INIT" ? { type: "READY" } : { type: "STATE_UPDATED", payload: engine.getState() };
    workerScope.postMessage(response);
    if (["START", "PAUSE", "STOP", "STEP", "RESET"].includes(message.type))
      workerScope.postMessage({
        type: "PACKET_STATE_UPDATED",
        payload: packetEngine.getState(),
      } satisfies WorkerResponse);
  } catch (error) {
    const response: WorkerResponse = {
      type: "ERROR",
      requestId: event.data.type === "PING" || event.data.type === "SEND_PACKET" ? event.data.requestId : undefined,
      payload: { message: error instanceof Error ? error.message : "Unknown worker error" },
    };
    workerScope.postMessage(response);
  }
});

export {};
