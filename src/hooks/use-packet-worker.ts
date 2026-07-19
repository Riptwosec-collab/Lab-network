"use client";

import { nanoid } from "nanoid";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  PacketProtocol,
  PacketSimulationState,
  PacketTrace,
  SendPacketRequest,
} from "@/engine/packets/packet-simulation-engine";
import type { WorkerRequest, WorkerResponse } from "@/engine/workers/worker-messages";
import type { TopologySnapshot } from "@/types/network";

const initialState: PacketSimulationState = {
  status: "idle",
  speed: 1,
  cursor: -1,
  followPacket: true,
  protocolFilter: "all",
  packets: [],
  events: [],
};

interface PendingRequest {
  readonly resolve: (trace: PacketTrace) => void;
  readonly reject: (error: Error) => void;
  readonly timeoutId: ReturnType<typeof setTimeout>;
}

export function usePacketWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<string, PendingRequest>());
  const [state, setState] = useState<PacketSimulationState>(initialState);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const pending = pendingRef.current;
    const worker = new Worker(new URL("../engine/workers/simulation.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      if (response.type === "PACKET_STATE_UPDATED") setState(response.payload);
      if (response.type === "PACKET_RESULT") {
        const request = pending.get(response.requestId);
        if (!request) return;
        clearTimeout(request.timeoutId);
        request.resolve(response.payload);
        pending.delete(response.requestId);
      }
      if (response.type === "ERROR") {
        setError(response.payload.message);
        if (response.requestId) {
          const request = pending.get(response.requestId);
          if (request) {
            clearTimeout(request.timeoutId);
            request.reject(new Error(response.payload.message));
            pending.delete(response.requestId);
          }
        }
      }
    });
    worker.addEventListener("error", (event) => setError(event.message || "Packet simulation worker failed"));
    worker.postMessage({ type: "INIT" } satisfies WorkerRequest);
    return () => {
      worker.terminate();
      workerRef.current = null;
      pending.forEach((request) => {
        clearTimeout(request.timeoutId);
        request.reject(new Error("Packet simulation worker stopped"));
      });
      pending.clear();
    };
  }, []);

  useEffect(() => {
    if (state.status !== "running") return;
    const intervalId = setInterval(
      () => {
        workerRef.current?.postMessage({ type: "STEP" } satisfies WorkerRequest);
      },
      Math.max(40, 600 / state.speed),
    );
    return () => clearInterval(intervalId);
  }, [state.speed, state.status]);

  const sendPacket = useCallback((topology: TopologySnapshot, request: SendPacketRequest) => {
    const worker = workerRef.current;
    if (!worker) return Promise.reject(new Error("Packet simulation worker is not ready"));
    setError(undefined);
    const requestId = nanoid();
    return new Promise<PacketTrace>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pendingRef.current.delete(requestId);
        reject(new Error("Packet simulation timed out"));
      }, 15_000);
      pendingRef.current.set(requestId, { resolve, reject, timeoutId });
      worker.postMessage({ type: "LOAD_TOPOLOGY", payload: topology } satisfies WorkerRequest);
      worker.postMessage({ type: "SEND_PACKET", requestId, payload: request } satisfies WorkerRequest);
    });
  }, []);

  const command = useCallback((type: "START" | "PAUSE" | "STOP" | "STEP" | "RESET") => {
    workerRef.current?.postMessage({ type } satisfies WorkerRequest);
  }, []);
  const setSpeed = useCallback((speed: number) => {
    workerRef.current?.postMessage({ type: "SET_SPEED", payload: speed } satisfies WorkerRequest);
  }, []);
  const setFilter = useCallback((filter: PacketProtocol | "all") => {
    workerRef.current?.postMessage({ type: "SET_FILTER", payload: filter } satisfies WorkerRequest);
  }, []);
  const setFollow = useCallback((follow: boolean) => {
    workerRef.current?.postMessage({ type: "SET_FOLLOW", payload: follow } satisfies WorkerRequest);
  }, []);

  return { state, error, sendPacket, command, setSpeed, setFilter, setFollow };
}
