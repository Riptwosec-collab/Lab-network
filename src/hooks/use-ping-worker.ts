"use client";

import { useCallback, useEffect, useRef } from "react";
import { nanoid } from "nanoid";

import type { PingRequest, PingResult } from "@/engine/protocols/ping-engine";
import type { WorkerRequest, WorkerResponse } from "@/engine/workers/worker-messages";
import type { TopologySnapshot } from "@/types/network";

interface PendingPing {
  readonly resolve: (result: PingResult) => void;
  readonly reject: (error: Error) => void;
  readonly timeoutId: ReturnType<typeof setTimeout>;
}

export function usePingWorker(): (topology: TopologySnapshot, request: PingRequest) => Promise<PingResult> {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<string, PendingPing>());

  useEffect(() => {
    const pendingPings = pendingRef.current;
    const worker = new Worker(new URL("../engine/workers/simulation.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      if (response.type === "PING_RESULT") {
        const pending = pendingPings.get(response.requestId);
        if (!pending) return;
        clearTimeout(pending.timeoutId);
        pending.resolve(response.payload);
        pendingPings.delete(response.requestId);
      }
      if (response.type === "ERROR") {
        const error = new Error(response.payload.message);
        if (response.requestId) {
          const pending = pendingPings.get(response.requestId);
          if (pending) {
            clearTimeout(pending.timeoutId);
            pending.reject(error);
            pendingPings.delete(response.requestId);
          }
        }
      }
    });
    worker.addEventListener("error", (event) => {
      pendingPings.forEach((pending) => {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error(event.message || "Simulation Worker error"));
      });
      pendingPings.clear();
    });
    return () => {
      worker.terminate();
      workerRef.current = null;
      pendingPings.forEach((pending) => {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error("Simulation Worker stopped"));
      });
      pendingPings.clear();
    };
  }, []);

  return useCallback((topology: TopologySnapshot, request: PingRequest) => {
    const worker = workerRef.current;
    if (!worker) return Promise.reject(new Error("Simulation Worker ยังไม่พร้อม"));
    const requestId = nanoid();
    return new Promise<PingResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pendingRef.current.delete(requestId);
        reject(new Error("Ping simulation timeout"));
      }, 5_000);
      pendingRef.current.set(requestId, { resolve, reject, timeoutId });
      const loadMessage: WorkerRequest = { type: "LOAD_TOPOLOGY", payload: topology };
      const pingMessage: WorkerRequest = { type: "PING", requestId, payload: request };
      worker.postMessage(loadMessage);
      worker.postMessage(pingMessage);
    });
  }, []);
}
