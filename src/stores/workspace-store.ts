import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export type WorkspaceTool = "select" | "connect" | "pan";

interface WorkspaceState {
  readonly sidebarOpen: boolean;
  readonly inspectorOpen: boolean;
  readonly bottomPanelOpen: boolean;
  readonly activeTool: WorkspaceTool;
  readonly canvasMode: "realtime" | "simulation";
  setSidebarOpen(open: boolean): void;
  setInspectorOpen(open: boolean): void;
  setBottomPanelOpen(open: boolean): void;
  setActiveTool(tool: WorkspaceTool): void;
  setCanvasMode(mode: "realtime" | "simulation"): void;
}

const memoryValues = new Map<string, string>();
const memoryStorage: StateStorage = {
  getItem: (name) => memoryValues.get(name) ?? null,
  setItem: (name, value) => void memoryValues.set(name, value),
  removeItem: (name) => void memoryValues.delete(name),
};

const getWorkspaceStorage = (): StateStorage => {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : memoryStorage;
  } catch {
    return memoryStorage;
  }
};

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      inspectorOpen: true,
      bottomPanelOpen: true,
      activeTool: "select",
      canvasMode: "realtime",
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
      setBottomPanelOpen: (bottomPanelOpen) => set({ bottomPanelOpen }),
      setActiveTool: (activeTool) => set({ activeTool }),
      setCanvasMode: (canvasMode) => set({ canvasMode }),
    }),
    {
      name: "netlab-workspace-ui",
      storage: createJSONStorage(getWorkspaceStorage),
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        inspectorOpen: state.inspectorOpen,
        bottomPanelOpen: state.bottomPanelOpen,
        activeTool: state.activeTool,
      }),
    },
  ),
);
