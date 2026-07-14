"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  Cable,
  Cloud,
  Cpu,
  GripVertical,
  HardDrive,
  Monitor,
  Network,
  Router,
  Search,
  Server,
  ShieldCheck,
  Wifi,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deviceCatalog, deviceRegistry } from "@/data/device-catalog";
import { cn } from "@/lib/utils";
import type { DeviceCategory } from "@/types/network";

const categoryMeta: Record<DeviceCategory, { label: string; icon: typeof Router }> = {
  router: { label: "Routers", icon: Router },
  switch: { label: "Switches", icon: Network },
  security: { label: "Security", icon: ShieldCheck },
  wireless: { label: "Wireless", icon: Wifi },
  server: { label: "Servers", icon: Server },
  storage: { label: "Storage", icon: HardDrive },
  "end-device": { label: "End devices", icon: Monitor },
  iot: { label: "IoT & OT", icon: Cpu },
  cloud: { label: "Cloud", icon: Cloud },
  infrastructure: { label: "Infrastructure", icon: Cable },
};

export function DeviceLibrary({ className, onClose }: { className?: string; onClose?: () => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<DeviceCategory | undefined>();
  const [vendor, setVendor] = useState<string | undefined>();
  const vendors = useMemo(() => Array.from(new Set(deviceCatalog.map((device) => device.vendor))).sort(), []);
  const [collapsed, setCollapsed] = useState<Set<DeviceCategory>>(new Set());
  const devices = useMemo(() => deviceRegistry.search(query, { category, vendor }), [category, query, vendor]);

  const toggleCategory = (category: DeviceCategory) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <aside
      className={cn("border-border bg-panel/95 flex h-full min-h-0 w-[276px] shrink-0 flex-col border-r", className)}
      aria-label="คลังอุปกรณ์"
    >
      <div className="border-border border-b p-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] uppercase">Device Library</p>
            <p className="text-muted-foreground text-[10px]">
              {devices.length}/{deviceCatalog.length} registry definitions
            </p>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" className="size-8" aria-label="ปิด Device Library" onClick={onClose}>
              <X />
            </Button>
          )}
        </div>
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาชื่อหรือ capability"
            className="pl-9"
          />
        </div>
        <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5" aria-label="กรองหมวดอุปกรณ์">
          <Button
            variant={!category ? "secondary" : "ghost"}
            size="sm"
            className="h-7 shrink-0 text-[10px]"
            onClick={() => setCategory(undefined)}
          >
            All
          </Button>
          {Object.entries(categoryMeta).map(([key, meta]) => (
            <Button
              key={key}
              variant={category === key ? "secondary" : "ghost"}
              size="sm"
              className="h-7 shrink-0 text-[10px]"
              onClick={() => setCategory(key as DeviceCategory)}
            >
              {meta.label}
            </Button>
          ))}
        </div>
        <Select value={vendor ?? "all"} onValueChange={(value) => setVendor(value === "all" ? undefined : value)}>
          <SelectTrigger className="mt-2 h-8 text-[11px]" aria-label="กรองผู้ผลิต">
            <SelectValue placeholder="All vendors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vendors</SelectItem>
            {vendors.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {Array.from(new Set(devices.map((device) => device.category))).map((category) => {
          const meta = categoryMeta[category];
          const Icon = meta.icon;
          const categoryDevices = devices.filter((device) => device.category === category);
          const isCollapsed = collapsed.has(category);
          return (
            <section key={category} className="mb-2">
              <button
                className="text-muted-foreground hover:bg-accent hover:text-foreground flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-xs font-medium"
                onClick={() => toggleCategory(category)}
                aria-expanded={!isCollapsed}
              >
                <Icon className="size-3.5" />
                {meta.label}
                <span className="bg-muted ml-auto rounded px-1.5 font-mono text-[9px]">{categoryDevices.length}</span>
                <ChevronDown className={cn("size-3.5 transition-transform", isCollapsed && "-rotate-90")} />
              </button>
              {!isCollapsed && (
                <div className="mt-1 space-y-1">
                  {categoryDevices.map((device) => (
                    <button
                      key={device.type}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("application/netlab-device", device.type);
                        event.dataTransfer.effectAllowed = "copy";
                      }}
                      className="border-border bg-background/45 hover:border-primary/45 hover:bg-primary/6 focus-visible:ring-ring group flex w-full cursor-grab items-center gap-2.5 rounded-lg border p-2.5 text-left transition outline-none focus-visible:ring-2 active:cursor-grabbing"
                      title={device.description}
                    >
                      <span className="bg-primary/10 text-primary grid size-8 shrink-0 place-items-center rounded-md">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{device.displayName}</span>
                        <span className="text-muted-foreground block truncate text-[10px]">
                          {device.defaultInterfaces.length} interfaces · {device.capabilities.slice(0, 2).join(" / ")}
                        </span>
                      </span>
                      <GripVertical className="text-muted-foreground/50 size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
        {!devices.length && (
          <div className="text-muted-foreground m-2 rounded-lg border border-dashed p-5 text-center text-xs">
            ไม่พบอุปกรณ์ที่ตรงกับคำค้น
          </div>
        )}
      </div>
      <p className="text-muted-foreground border-border border-t px-3 py-2 text-[10px]">ลากการ์ดไปวางบน canvas</p>
    </aside>
  );
}
