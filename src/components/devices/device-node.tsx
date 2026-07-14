"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Cloud,
  CloudCog,
  Cable,
  Cpu,
  HardDrive,
  Laptop,
  Monitor,
  Network,
  Printer,
  Router,
  Server,
  ServerCog,
  ShieldCheck,
  Smartphone,
  Wifi,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTopologyStore } from "@/stores/topology-store";
import type { NetworkFlowNode } from "@/types/network";

const icons = {
  Router,
  Network,
  ShieldCheck,
  Wifi,
  Server,
  ServerCog,
  HardDrive,
  Monitor,
  Laptop,
  Smartphone,
  Printer,
  Cloud,
  CloudCog,
  Cable,
  Cpu,
};

function DeviceNodeComponent({ data, selected }: NodeProps<NetworkFlowNode>) {
  const device = useTopologyStore((state) => state.devices.find((item) => item.id === data.deviceId));
  if (!device) return null;
  const iconName =
    device.category === "router"
      ? "Router"
      : device.category === "switch"
        ? "Network"
        : device.category === "security"
          ? "ShieldCheck"
          : device.category === "wireless"
            ? "Wifi"
            : device.category === "storage"
              ? "HardDrive"
              : device.category === "cloud"
                ? "Cloud"
                : device.category === "iot"
                  ? "Cpu"
                  : device.category === "infrastructure"
                    ? "Cable"
                    : device.category === "server"
                      ? "Server"
                      : device.type === "laptop"
                        ? "Laptop"
                        : device.type === "smartphone"
                          ? "Smartphone"
                          : device.type === "printer"
                            ? "Printer"
                            : "Monitor";
  const Icon = icons[iconName];
  const managementIp = device.interfaces.find((networkInterface) => networkInterface.ipv4)?.ipv4;
  const upPorts = device.interfaces.filter((networkInterface) => networkInterface.status === "up").length;

  return (
    <article
      className={cn(
        "border-border bg-card/95 w-48 rounded-xl border p-3 shadow-[0_16px_40px_-28px_rgba(0,0,0,0.9)] backdrop-blur transition-[border-color,box-shadow,transform]",
        selected && "border-primary ring-primary/25 -translate-y-0.5 shadow-[0_0_30px_-12px_var(--primary)] ring-2",
        device.locked && "opacity-80",
      )}
    >
      <Handle type="target" position={Position.Top} className="!border-background !bg-primary !size-3 !border-2" />
      <div className="flex items-start gap-3">
        <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{device.hostname}</p>
          <p className="text-muted-foreground truncate text-[11px]">{device.model}</p>
        </div>
        <span
          className={cn(
            "mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase",
            device.status === "online"
              ? "bg-success/12 text-success"
              : device.status === "warning"
                ? "bg-warning/12 text-warning"
                : "bg-muted text-muted-foreground",
          )}
        >
          <span className="size-1.5 rounded-full bg-current" />
          {device.status}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <code className="text-muted-foreground text-[10px]">{managementIp ?? "No management IP"}</code>
        <Badge variant="outline">
          {upPorts}/{device.interfaces.length}
        </Badge>
      </div>
      <Handle type="source" position={Position.Bottom} className="!border-background !bg-primary !size-3 !border-2" />
    </article>
  );
}

export const DeviceNode = memo(DeviceNodeComponent);
