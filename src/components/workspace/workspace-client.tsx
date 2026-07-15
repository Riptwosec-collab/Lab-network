"use client";

import { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";

import { NetworkCanvas } from "@/components/canvas/network-canvas";
import { DeviceLibrary } from "@/components/devices/device-library";
import { DeviceInspector } from "@/components/inspector/device-inspector";
import { BottomPanel } from "@/components/layout/bottom-panel";
import { WorkspaceToolbar } from "@/components/layout/workspace-toolbar";
import { applyRuntimeConfig, createDeviceRuntimeConfig } from "@/domain/configuration/configuration-engine";
import { useAutosave } from "@/hooks/use-autosave";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useProjectStore } from "@/stores/project-store";
import { useConfigurationStore } from "@/stores/configuration-store";
import { useLayer2Store } from "@/stores/layer2-store";
import { useTopologyStore } from "@/stores/topology-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

export function WorkspaceClient() {
  const [ready, setReady] = useState(false);
  const createProject = useProjectStore((state) => state.createProject);
  const loadProject = useProjectStore((state) => state.loadProject);
  const ensureDemoProject = useProjectStore((state) => state.ensureDemoProject);
  const replaceTopology = useTopologyStore((state) => state.replaceTopology);
  const sidebarOpen = useWorkspaceStore((state) => state.sidebarOpen);
  const setSidebarOpen = useWorkspaceStore((state) => state.setSidebarOpen);
  useAutosave();
  useKeyboardShortcuts();

  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) setSidebarOpen(false);
  }, [setSidebarOpen]);

  useEffect(() => {
    const initialize = async () => {
      const params = new URLSearchParams(window.location.search);
      const isNew = params.get("new") === "1";
      const projectId = params.get("project");
      let project = isNew
        ? createProject("My Network Lab")
        : projectId
          ? await loadProject(projectId)
          : await ensureDemoProject();
      if (!project && projectId === "demo-project") project = await ensureDemoProject();
      if (project) {
        useProjectStore.getState().setCurrentProject(project);
        useConfigurationStore.getState().hydrate(project.configurationState, project.devices);
        useLayer2Store.getState().reset();
        replaceTopology({
          devices: project.devices.map((device) =>
            applyRuntimeConfig(
              device,
              project.configurationState.devices[device.id]?.runningConfig ?? createDeviceRuntimeConfig(device),
            ),
          ),
          connections: project.connections,
          groups: project.groups,
        });
      }
      setReady(true);
    };
    void initialize();
  }, [createProject, ensureDemoProject, loadProject, replaceTopology]);

  if (!ready)
    return (
      <div className="bg-background text-muted-foreground grid h-dvh place-items-center text-sm">
        กำลังเตรียม Network Workspace…
      </div>
    );

  return (
    <main className="bg-background flex h-dvh min-h-0 flex-col overflow-hidden">
      <WorkspaceToolbar />
      <div className="relative flex min-h-0 flex-1">
        {sidebarOpen && (
          <div className="hidden lg:block">
            <DeviceLibrary />
          </div>
        )}
        {sidebarOpen && (
          <div className="absolute inset-0 z-40 flex lg:hidden">
            <button
              className="absolute inset-0 bg-black/65"
              aria-label="ปิด Device Library"
              onClick={() => setSidebarOpen(false)}
            />
            <DeviceLibrary className="relative z-10 shadow-2xl" onClose={() => setSidebarOpen(false)} />
          </div>
        )}
        <div className="relative flex min-w-0 flex-1">
          <ReactFlowProvider>
            <NetworkCanvas />
          </ReactFlowProvider>
          <DeviceInspector />
        </div>
      </div>
      <BottomPanel />
    </main>
  );
}
