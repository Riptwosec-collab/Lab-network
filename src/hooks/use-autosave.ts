"use client";

import { useEffect } from "react";

import { useProjectStore } from "@/stores/project-store";
import { useConfigurationStore } from "@/stores/configuration-store";
import { useTopologyStore } from "@/stores/topology-store";

export function useAutosave(delay = 1500): void {
  const devices = useTopologyStore((state) => state.devices);
  const connections = useTopologyStore((state) => state.connections);
  const groups = useTopologyStore((state) => state.groups);
  const currentProjectId = useProjectStore((state) => state.currentProject?.id);
  const updateFromTopology = useProjectStore((state) => state.updateFromTopology);
  const updateConfigurationState = useProjectStore((state) => state.updateConfigurationState);
  const saveProject = useProjectStore((state) => state.saveProject);
  const configurationState = useConfigurationStore((state) => state.configurationState);

  useEffect(() => {
    if (!currentProjectId) return;
    updateFromTopology({ devices, connections, groups });
    updateConfigurationState(configurationState);
    const timer = window.setTimeout(() => {
      void saveProject();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    configurationState,
    connections,
    currentProjectId,
    delay,
    devices,
    groups,
    saveProject,
    updateConfigurationState,
    updateFromTopology,
  ]);
}
