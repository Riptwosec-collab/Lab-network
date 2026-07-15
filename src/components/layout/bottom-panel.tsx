"use client";

import { useState } from "react";
import { ChevronDown, CircleDot, FlaskConical, Info, Network, Radio } from "lucide-react";

import { LabValidationPanel } from "@/components/learning/lab-validation-panel";
import { PingTool } from "@/components/simulation/ping-tool";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/stores/project-store";
import { useTopologyStore } from "@/stores/topology-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

type BottomPanelTab = "status" | "ping" | "validator";

export function BottomPanel() {
  const [activeTab, setActiveTab] = useState<BottomPanelTab>("status");
  const open = useWorkspaceStore((state) => state.bottomPanelOpen);
  const setOpen = useWorkspaceStore((state) => state.setBottomPanelOpen);
  const devices = useTopologyStore((state) => state.devices);
  const connections = useTopologyStore((state) => state.connections);
  const selectedDeviceId = useTopologyStore((state) => state.selectedDeviceId);
  const selectedConnectionId = useTopologyStore((state) => state.selectedConnectionId);
  const dirty = useProjectStore((state) => state.dirty);
  const activeLinks = connections.filter((connection) => connection.status === "up").length;

  const selectTab = (tab: BottomPanelTab) => {
    setActiveTab(tab);
    setOpen(true);
  };

  return (
    <section className="border-border bg-panel/98 shrink-0 border-t" aria-label="เครื่องมือและสถานะ workspace">
      <div className="flex h-9 items-center gap-1 px-3">
        <button
          className={cn(
            "flex h-9 items-center gap-2 border-b-2 px-2 text-xs",
            activeTab === "status" ? "border-primary text-primary" : "text-muted-foreground border-transparent",
          )}
          onClick={() => selectTab("status")}
          aria-pressed={activeTab === "status"}
        >
          <CircleDot className="size-3.5" />
          Workspace status
        </button>
        <button
          className={cn(
            "flex h-9 items-center gap-2 border-b-2 px-2 text-xs",
            activeTab === "validator" ? "border-primary text-primary" : "text-muted-foreground border-transparent",
          )}
          onClick={() => selectTab("validator")}
          aria-pressed={activeTab === "validator"}
        >
          <FlaskConical className="size-3.5" />
          Lab Validator
        </button>
        <button
          className={cn(
            "flex h-9 items-center gap-2 border-b-2 px-2 text-xs",
            activeTab === "ping" ? "border-primary text-primary" : "text-muted-foreground border-transparent",
          )}
          onClick={() => selectTab("ping")}
          aria-pressed={activeTab === "ping"}
        >
          <Radio className="size-3.5" />
          Ping Tool{" "}
          <Badge variant="success" className="px-1.5 py-0 text-[8px]">
            LIVE
          </Badge>
        </button>
        <span className="text-muted-foreground ml-2 hidden text-[10px] sm:inline">IPv4 · ARP · ICMP engine</span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-8"
          aria-label={open ? "ย่อ Bottom Panel" : "ขยาย Bottom Panel"}
          onClick={() => setOpen(!open)}
        >
          <ChevronDown className={cn("transition-transform", !open && "rotate-180")} />
        </Button>
      </div>
      {open && activeTab === "ping" && <PingTool />}
      {open && activeTab === "validator" && <LabValidationPanel />}
      {open && activeTab === "status" && (
        <div className="border-border bg-background/55 grid min-h-24 gap-3 border-t p-3 sm:grid-cols-[1fr_1fr_1.4fr]">
          <div className="border-border flex items-center gap-3 rounded-lg border px-3 py-2">
            <Network className="text-primary size-4" />
            <div>
              <p className="font-mono text-sm">
                {devices.length} <span className="text-muted-foreground text-[10px]">NODES</span>
              </p>
              <p className="text-muted-foreground text-[10px]">
                {selectedDeviceId ? "1 node selected" : "No node selected"}
              </p>
            </div>
          </div>
          <div className="border-border flex items-center gap-3 rounded-lg border px-3 py-2">
            <CircleDot className="text-success size-4" />
            <div>
              <p className="font-mono text-sm">
                {activeLinks}/{connections.length} <span className="text-muted-foreground text-[10px]">LINKS UP</span>
              </p>
              <p className="text-muted-foreground text-[10px]">
                {selectedConnectionId ? "1 link selected" : "No link selected"}
              </p>
            </div>
          </div>
          <div className="border-border flex items-center gap-3 rounded-lg border px-3 py-2">
            <Info className="text-primary size-4 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium">IPv4 simulation engine</p>
                <Badge variant={dirty ? "warning" : "success"}>{dirty ? "UNSAVED" : "SYNCED"}</Badge>
              </div>
              <p className="text-muted-foreground mt-1 text-[10px]">
                IPv4, ARP, ICMP และ Layer 2 VLAN forwarding พร้อมใช้งาน · Routing อยู่ใน Phase 4
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
