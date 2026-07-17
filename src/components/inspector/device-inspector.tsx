"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Lock, Network, Save, Trash2, Unlock, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deviceRegistry } from "@/data/device-catalog";
import { IpConfigurationPanel } from "@/components/inspector/ip-configuration-panel";
import { RoutingConfigurationPanel } from "@/components/inspector/routing-configuration-panel";
import { OperationsConfigurationPanel } from "@/components/inspector/operations-configuration-panel";
import { ServicesConfigurationPanel } from "@/components/inspector/services-configuration-panel";
import { SecurityConfigurationPanel } from "@/components/inspector/security-configuration-panel";
import { SwitchingConfigurationPanel } from "@/components/inspector/switching-configuration-panel";
import {
  CliConfigurationPanel,
  ConfigurationHistoryPanel,
  ConfigurationStatusPanel,
  ConnectedRoutesPanel,
  RawConfigurationPanel,
  RenderedConfigurationPanel,
} from "@/components/inspector/configuration-panels";
import { createDeviceRuntimeConfig } from "@/domain/configuration/configuration-engine";
import { cn } from "@/lib/utils";
import { applyDeviceConfiguration } from "@/services/configuration-service";
import { useConfigurationStore } from "@/stores/configuration-store";
import { useTopologyStore } from "@/stores/topology-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

const overviewSchema = z.object({
  hostname: z
    .string()
    .trim()
    .min(1, "กรุณาระบุ hostname")
    .max(63, "hostname ต้องไม่เกิน 63 ตัวอักษร")
    .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/, "ใช้ตัวอักษร ตัวเลข และขีดกลางเท่านั้น"),
});
type OverviewForm = z.infer<typeof overviewSchema>;

export function DeviceInspector() {
  const inspectorOpen = useWorkspaceStore((state) => state.inspectorOpen);
  const setInspectorOpen = useWorkspaceStore((state) => state.setInspectorOpen);
  const selectedDeviceId = useTopologyStore((state) => state.selectedDeviceId);
  const device = useTopologyStore((state) => state.devices.find((item) => item.id === selectedDeviceId));
  const updateDevice = useTopologyStore((state) => state.updateDevice);
  const removeDevice = useTopologyStore((state) => state.removeDevice);
  const duplicateDevice = useTopologyStore((state) => state.duplicateDevice);
  const deviceConfiguration = useConfigurationStore((state) =>
    device ? state.configurationState.devices[device.id] : undefined,
  );
  const definition = device ? deviceRegistry.get(device.type) : undefined;
  const form = useForm<OverviewForm>({
    resolver: zodResolver(overviewSchema),
    defaultValues: { hostname: device?.hostname ?? "" },
  });

  useEffect(() => {
    form.reset({ hostname: device?.hostname ?? "" });
  }, [device?.hostname, form]);

  if (!inspectorOpen) return null;

  if (!device) {
    return (
      <aside className="border-border bg-panel/95 text-muted-foreground hidden h-full w-80 shrink-0 place-items-center border-l text-center text-sm xl:grid">
        <div className="px-6">
          <Network className="mx-auto mb-3 size-8 opacity-35" />
          <p className="text-foreground font-medium">ยังไม่ได้เลือกอุปกรณ์</p>
          <p className="mt-1 text-xs leading-5">เลือก node บน canvas เพื่อดูข้อมูลจริงจาก topology store</p>
        </div>
      </aside>
    );
  }

  const inspectorTabs = Array.from(
    new Set([
      ...(definition?.inspectorTabs ?? ["overview", "interfaces"]),
      ...(device.category === "router" ||
      device.category === "security" ||
      device.category === "server" ||
      device.capabilities.some((capability) => ["dhcp", "dns", "nat", "acl", "services"].includes(capability))
        ? ["services"]
        : []),
      "configuration",
      "monitoring",
      "cli",
      "raw-config",
      "running-config",
      "startup-config",
      "history",
      "tables",
    ]),
  );
  const submitOverview = ({ hostname }: OverviewForm) => {
    const candidate = structuredClone(deviceConfiguration?.runningConfig ?? createDeviceRuntimeConfig(device));
    candidate.system.hostname = hostname;
    const result = applyDeviceConfiguration(device.id, candidate, "form");
    if (result.applied) toast.success("บันทึก hostname แล้ว");
    else toast.error(result.validation.issues[0]?.message ?? "Hostname ไม่ถูกต้อง");
  };

  return (
    <aside className="border-border bg-panel/98 absolute inset-y-0 right-0 z-30 flex w-[min(360px,calc(100%-24px))] flex-col border-l shadow-2xl xl:static xl:w-80 xl:shrink-0 xl:shadow-none">
      <div className="border-border flex items-start gap-3 border-b p-3">
        <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-lg">
          <Network />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{device.hostname}</p>
          <p className="text-muted-foreground text-[10px]">
            {device.model} · {device.type}
          </p>
        </div>
        <Badge variant={device.status === "online" ? "success" : device.status === "warning" ? "warning" : "outline"}>
          <span className="mr-1 size-1.5 rounded-full bg-current" />
          {device.status}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="ปิด Inspector"
          onClick={() => setInspectorOpen(false)}
        >
          <X />
        </Button>
      </div>
      <div className="border-border flex gap-1 border-b p-2">
        <Button variant="ghost" size="sm" onClick={() => duplicateDevice(device.id)}>
          <Copy />
          Duplicate
        </Button>
        <Button variant="ghost" size="sm" onClick={() => updateDevice(device.id, { locked: !device.locked })}>
          {device.locked ? <Unlock /> : <Lock />}
          {device.locked ? "Unlock" : "Lock"}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="text-destructive ml-auto size-8" aria-label="ลบอุปกรณ์">
              <Trash2 />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>ลบ {device.hostname}?</AlertDialogTitle>
              <AlertDialogDescription>
                อุปกรณ์และลิงก์ทั้งหมดที่เชื่อมกับอุปกรณ์นี้จะถูกลบ คุณสามารถใช้ Undo หลังจากลบได้
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction onClick={() => removeDevice(device.id)}>ลบอุปกรณ์</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
        <div className="border-border overflow-x-auto border-b p-2">
          <TabsList className="h-9 w-max min-w-full justify-start bg-transparent p-0">
            {inspectorTabs.map((tab) => (
              <TabsTrigger key={tab} value={tab} className="capitalize">
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <TabsContent value="overview" className="mt-0 space-y-4">
            <form onSubmit={form.handleSubmit(submitOverview)} className="space-y-2">
              <label className="text-muted-foreground block text-xs font-medium">
                Hostname
                <Input
                  className="mt-1.5"
                  {...form.register("hostname")}
                  aria-invalid={Boolean(form.formState.errors.hostname)}
                />
              </label>
              {form.formState.errors.hostname && (
                <p className="text-destructive text-xs" role="alert">
                  {form.formState.errors.hostname.message}
                </p>
              )}
              <Button type="submit" variant="outline" size="sm">
                <Save />
                บันทึก
              </Button>
            </form>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-muted/45 rounded-lg p-3">
                <dt className="text-muted-foreground">Category</dt>
                <dd className="mt-1 capitalize">{device.category}</dd>
              </div>
              <div className="bg-muted/45 rounded-lg p-3">
                <dt className="text-muted-foreground">Capabilities</dt>
                <dd className="mt-1">{device.capabilities.length}</dd>
              </div>
            </dl>
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-medium">Capabilities</p>
              <div className="flex flex-wrap gap-1.5">
                {device.capabilities.map((capability) => (
                  <Badge key={capability} variant="outline">
                    {capability}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-medium">Management IP</p>
              <code className="border-border bg-background block rounded-lg border p-3 text-xs">
                {device.interfaces.find((item) => item.ipv4)?.ipv4 ?? "Not configured"}
              </code>
            </div>
          </TabsContent>

          <TabsContent value="interfaces" className="mt-0 space-y-2">
            {device.interfaces.map((networkInterface) => (
              <div key={networkInterface.id} className="border-border flex items-center gap-3 rounded-lg border p-3">
                <span
                  className={cn(
                    "grid size-5 place-items-center rounded-full text-[8px] font-bold",
                    networkInterface.status === "up" ? "bg-success/12 text-success" : "bg-muted text-muted-foreground",
                  )}
                >
                  {networkInterface.status === "up" ? "UP" : "DN"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{networkInterface.name}</p>
                  <p className="text-muted-foreground truncate font-mono text-[10px]">
                    {networkInterface.ipv4 ?? networkInterface.type}
                  </p>
                </div>
                <Badge variant="outline">
                  {networkInterface.speedMbps ? `${networkInterface.speedMbps}M` : networkInterface.status}
                </Badge>
              </div>
            ))}
          </TabsContent>

          {inspectorTabs.includes("ip") && (
            <TabsContent value="ip" className="mt-0">
              <IpConfigurationPanel key={device.id} device={device} />
            </TabsContent>
          )}

          {inspectorTabs.includes("vlan") && (
            <TabsContent value="vlan" className="mt-0">
              <SwitchingConfigurationPanel key={device.id} device={device} />
            </TabsContent>
          )}

          {inspectorTabs.includes("routing") && (
            <TabsContent value="routing" className="mt-0">
              <RoutingConfigurationPanel key={device.id} device={device} />
            </TabsContent>
          )}

          {inspectorTabs.includes("services") && (
            <TabsContent value="services" className="mt-0">
              <ServicesConfigurationPanel key={device.id} device={device} />
            </TabsContent>
          )}
          {inspectorTabs.includes("security") && (
            <TabsContent value="security" className="mt-0">
              <SecurityConfigurationPanel key={`security-${device.id}`} device={device} />
            </TabsContent>
          )}
          {inspectorTabs.includes("wireless") && (
            <TabsContent value="wireless" className="mt-0">
              <SecurityConfigurationPanel key={`wireless-${device.id}`} device={device} />
            </TabsContent>
          )}
          <TabsContent value="monitoring" className="mt-0">
            <OperationsConfigurationPanel key={`operations-${device.id}`} device={device} />
          </TabsContent>

          <TabsContent value="configuration" className="mt-0">
            <ConfigurationStatusPanel device={device} />
          </TabsContent>
          <TabsContent value="cli" className="mt-0">
            <CliConfigurationPanel device={device} />
          </TabsContent>
          <TabsContent value="raw-config" className="mt-0">
            <RawConfigurationPanel device={device} />
          </TabsContent>
          <TabsContent value="running-config" className="mt-0">
            <RenderedConfigurationPanel device={device} kind="running" />
          </TabsContent>
          <TabsContent value="startup-config" className="mt-0">
            <RenderedConfigurationPanel device={device} kind="startup" />
          </TabsContent>
          <TabsContent value="history" className="mt-0">
            <ConfigurationHistoryPanel device={device} />
          </TabsContent>
          <TabsContent value="tables" className="mt-0">
            <ConnectedRoutesPanel device={device} />
          </TabsContent>

          {inspectorTabs
            .filter(
              (tab) =>
                ![
                  "overview",
                  "interfaces",
                  "ip",
                  "vlan",
                  "routing",
                  "services",
                  "security",
                  "wireless",
                  "configuration",
                  "monitoring",
                  "cli",
                  "raw-config",
                  "running-config",
                  "startup-config",
                  "history",
                  "tables",
                ].includes(tab),
            )
            .map((tab) => (
              <TabsContent key={tab} value={tab} className="mt-0">
                <div className="border-border bg-muted/25 rounded-lg border border-dashed p-4">
                  <p className="text-sm font-medium capitalize">{tab} capability</p>
                  <p className="text-muted-foreground mt-2 text-xs leading-5">
                    อุปกรณ์รองรับ capability นี้ แต่ editor เฉพาะทางยังไม่อยู่ใน phase ปัจจุบัน ข้อมูล configuration
                    ที่มีอยู่แสดงด้านล่าง
                  </p>
                  <pre className="bg-background text-muted-foreground mt-3 max-h-64 overflow-auto rounded-md p-3 font-mono text-[10px] leading-5">
                    {JSON.stringify(device.configuration, null, 2)}
                  </pre>
                </div>
              </TabsContent>
            ))}
        </div>
      </Tabs>
    </aside>
  );
}
