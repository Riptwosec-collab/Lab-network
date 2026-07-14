"use client";

import { useEffect } from "react";

import { useProjectStore } from "@/stores/project-store";
import { useTopologyStore } from "@/stores/topology-store";

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      const topology = useTopologyStore.getState();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void useProjectStore.getState().saveProject();
      } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        topology.redo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        topology.undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && topology.selectedDeviceId) {
        event.preventDefault();
        topology.duplicateDevice(topology.selectedDeviceId);
      } else if (event.key === "Delete" && topology.selectedDeviceId) topology.removeDevice(topology.selectedDeviceId);
      else if (event.key.toLowerCase() === "f") window.dispatchEvent(new Event("netlab:fit-view"));
      else if (event.key === "Escape") {
        topology.selectDevice();
        topology.selectConnection();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
