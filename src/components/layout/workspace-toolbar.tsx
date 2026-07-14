"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Cable,
  ChevronLeft,
  Download,
  Hand,
  Maximize2,
  Moon,
  MousePointer2,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Redo2,
  Save,
  Shapes,
  Sun,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { useNetLabTheme } from "@/components/theme-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { downloadProject } from "@/services/project-transfer";
import { useHistoryStore } from "@/stores/history-store";
import { useProjectStore } from "@/stores/project-store";
import { useTopologyStore } from "@/stores/topology-store";
import { useWorkspaceStore, type WorkspaceTool } from "@/stores/workspace-store";
import { cn } from "@/lib/utils";

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? "secondary" : "ghost"}
          size="icon"
          className={cn("size-8", active && "text-primary ring-primary/25 ring-1")}
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function WorkspaceToolbar() {
  const project = useProjectStore((state) => state.currentProject);
  const saveStatus = useProjectStore((state) => state.saveStatus);
  const saveProject = useProjectStore((state) => state.saveProject);
  const pastCount = useHistoryStore((state) => state.past.length);
  const futureCount = useHistoryStore((state) => state.future.length);
  const undo = useTopologyStore((state) => state.undo);
  const redo = useTopologyStore((state) => state.redo);
  const activeTool = useWorkspaceStore((state) => state.activeTool);
  const setActiveTool = useWorkspaceStore((state) => state.setActiveTool);
  const sidebarOpen = useWorkspaceStore((state) => state.sidebarOpen);
  const inspectorOpen = useWorkspaceStore((state) => state.inspectorOpen);
  const bottomPanelOpen = useWorkspaceStore((state) => state.bottomPanelOpen);
  const setSidebarOpen = useWorkspaceStore((state) => state.setSidebarOpen);
  const setInspectorOpen = useWorkspaceStore((state) => state.setInspectorOpen);
  const setBottomPanelOpen = useWorkspaceStore((state) => state.setBottomPanelOpen);
  const { theme, setTheme } = useNetLabTheme();

  const chooseTool = (tool: WorkspaceTool) => setActiveTool(tool);

  return (
    <header className="border-border bg-panel/95 flex min-h-14 shrink-0 flex-wrap items-center gap-1 border-b px-2 py-2 md:flex-nowrap md:px-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="ghost" size="icon" className="size-8" aria-label="กลับ Dashboard">
            <Link href="/dashboard">
              <ChevronLeft />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>กลับ Dashboard</TooltipContent>
      </Tooltip>
      <div className="mr-2 max-w-48 min-w-28 flex-1 md:flex-none">
        <p className="truncate text-xs font-semibold md:text-sm">{project?.name ?? "Loading project…"}</p>
        <div className="text-muted-foreground flex items-center gap-1.5 text-[10px]">
          <span
            className={cn(
              "size-1.5 rounded-full",
              saveStatus === "error" ? "bg-destructive" : saveStatus === "saving" ? "bg-warning" : "bg-success",
            )}
          />
          {saveStatus === "saving"
            ? "กำลังบันทึก…"
            : saveStatus === "saved"
              ? "บันทึกแล้ว"
              : saveStatus === "error"
                ? "บันทึกไม่สำเร็จ"
                : "Local project"}
        </div>
      </div>

      <div className="border-border flex items-center gap-0.5 rounded-lg border p-0.5" aria-label="เครื่องมือ canvas">
        <ToolButton label="เลือกและลากอุปกรณ์" active={activeTool === "select"} onClick={() => chooseTool("select")}>
          <MousePointer2 />
        </ToolButton>
        <ToolButton label="เชื่อมต่ออุปกรณ์" active={activeTool === "connect"} onClick={() => chooseTool("connect")}>
          <Cable />
        </ToolButton>
        <ToolButton label="เลื่อน canvas" active={activeTool === "pan"} onClick={() => chooseTool("pan")}>
          <Hand />
        </ToolButton>
      </div>

      <div className="border-border ml-1 flex items-center gap-0.5 border-l pl-1">
        <ToolButton label="Undo (Ctrl+Z)" disabled={!pastCount} onClick={undo}>
          <Undo2 />
        </ToolButton>
        <ToolButton label="Redo (Ctrl+Shift+Z)" disabled={!futureCount} onClick={redo}>
          <Redo2 />
        </ToolButton>
        <ToolButton label="Fit topology ในหน้าจอ" onClick={() => window.dispatchEvent(new Event("netlab:fit-view"))}>
          <Maximize2 />
        </ToolButton>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon" className="size-8" aria-label="เปิด Diagram Symbols & Legend">
              <Link href="/symbols">
                <Shapes />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Diagram Symbols &amp; Legend</TooltipContent>
        </Tooltip>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Badge variant="outline" className="hidden xl:inline-flex">
          SIMULATION · FOUNDATION
        </Badge>
        <ToolButton
          label={sidebarOpen ? "ซ่อน Device Library" : "แสดง Device Library"}
          active={sidebarOpen}
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <PanelLeft />
        </ToolButton>
        <ToolButton
          label={inspectorOpen ? "ซ่อน Inspector" : "แสดง Inspector"}
          active={inspectorOpen}
          onClick={() => setInspectorOpen(!inspectorOpen)}
        >
          <PanelRight />
        </ToolButton>
        <ToolButton
          label={bottomPanelOpen ? "ซ่อน Workspace Status" : "แสดง Workspace Status"}
          active={bottomPanelOpen}
          onClick={() => setBottomPanelOpen(!bottomPanelOpen)}
        >
          <PanelBottom />
        </ToolButton>
        <ToolButton label="สลับธีม" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun /> : <Moon />}
        </ToolButton>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Export JSON"
              disabled={!project}
              onClick={() => project && downloadProject(project)}
            >
              <Download />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export JSON</TooltipContent>
        </Tooltip>
        <Button
          variant="outline"
          size="sm"
          disabled={!project || saveStatus === "saving"}
          onClick={() =>
            void saveProject()
              .then(() => toast.success("บันทึกโปรเจกต์แล้ว"))
              .catch(() => toast.error("บันทึกไม่สำเร็จ"))
          }
        >
          <Save />
          <span className="hidden sm:inline">Save</span>
        </Button>
      </div>
    </header>
  );
}
