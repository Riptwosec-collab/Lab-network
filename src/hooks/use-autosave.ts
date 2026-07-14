"use client";

import { useEffect } from "react";

import { useProjectStore } from "@/stores/project-store";
import { useTopologyStore } from "@/stores/topology-store";

export function useAutosave(delay = 1500): void {
  const devices = useTopologyStore((state) => state.devices);
  const connections = useTopologyStore((state) => state.connections);
  const groups = useTopologyStore((state) => state.groups);
  const currentProjectId = useProjectStore((state) => state.currentProject?.id);
  const updateFromTopology = useProjectStore((state) => state.updateFromTopology);
  const saveProject = useProjectStore((state) => state.saveProject);

  useEffect(() => {
    if (!currentProjectId) return;
    updateFromTopology({ devices, connections, groups });
    const timer = window.setTimeout(() => {
      void saveProject();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [connections, currentProjectId, delay, devices, groups, saveProject, updateFromTopology]);
}
