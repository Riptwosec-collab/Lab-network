"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clock3, Network, Play, Radio, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ipv4ToInteger } from "@/engine/protocols/ipv4";
import type { PingResult } from "@/engine/protocols/ping-engine";
import { usePingWorker } from "@/hooks/use-ping-worker";
import { cn } from "@/lib/utils";
import { useTopologyStore } from "@/stores/topology-store";

export function PingTool() {
  const devices = useTopologyStore((state) => state.devices);
  const connections = useTopologyStore((state) => state.connections);
  const groups = useTopologyStore((state) => state.groups);
  const configuredDevices = useMemo(
    () => devices.filter((device) => device.interfaces.some((networkInterface) => networkInterface.ipv4)),
    [devices],
  );
  const [sourceDeviceId, setSourceDeviceId] = useState<string>();
  const [destinationIp, setDestinationIp] = useState<string>();
  const [result, setResult] = useState<PingResult>();
  const [error, setError] = useState<string>();
  const [running, setRunning] = useState(false);
  const runWorkerPing = usePingWorker();
  const effectiveSourceDeviceId = configuredDevices.some((device) => device.id === sourceDeviceId)
    ? sourceDeviceId!
    : (configuredDevices[0]?.id ?? "");
  const targets = useMemo(
    () =>
      devices.flatMap((device) =>
        device.interfaces
          .filter((networkInterface) => networkInterface.ipv4 && device.id !== effectiveSourceDeviceId)
          .map((networkInterface) => ({
            deviceId: device.id,
            hostname: device.hostname,
            interfaceName: networkInterface.name,
            ipAddress: networkInterface.ipv4!,
          })),
      ),
    [devices, effectiveSourceDeviceId],
  );
  const effectiveDestinationIp = destinationIp ?? targets[0]?.ipAddress ?? "";

  const runPing = async () => {
    if (!effectiveSourceDeviceId) {
      setError("เลือก Source Device ที่มี IPv4 ก่อน");
      return;
    }
    if (ipv4ToInteger(effectiveDestinationIp) === undefined) {
      setError("Destination IPv4 ไม่ถูกต้อง");
      return;
    }
    setRunning(true);
    setError(undefined);
    try {
      const nextResult = await runWorkerPing(
        { devices, connections, groups },
        { sourceDeviceId: effectiveSourceDeviceId, destinationIp: effectiveDestinationIp },
      );
      setResult(nextResult);
    } catch (workerError) {
      setError(workerError instanceof Error ? workerError.message : "Ping simulation ไม่สำเร็จ");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="grid h-64 min-h-0 gap-3 overflow-y-auto p-3 lg:grid-cols-[270px_1fr_260px]">
      <section className="border-border bg-background/45 rounded-lg border p-3">
        <div className="mb-3 flex items-center gap-2">
          <Radio className="text-primary size-4" />
          <h3 className="text-xs font-semibold">Ping Tool</h3>
        </div>
        {configuredDevices.length ? (
          <div className="space-y-3">
            <div>
              <label className="text-muted-foreground mb-1.5 block text-[10px] font-medium uppercase">Source</label>
              <Select value={effectiveSourceDeviceId} onValueChange={setSourceDeviceId}>
                <SelectTrigger aria-label="Ping source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {configuredDevices.map((device) => {
                    const sourceInterface = device.interfaces.find((item) => item.ipv4);
                    return (
                      <SelectItem key={device.id} value={device.id}>
                        {device.hostname} · {sourceInterface?.ipv4}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <label className="text-muted-foreground block text-[10px] font-medium uppercase">
              Destination
              <Input
                className="mt-1.5 font-mono"
                value={effectiveDestinationIp}
                onChange={(event) => setDestinationIp(event.target.value)}
                placeholder="192.168.1.10"
                aria-label="Ping destination"
              />
            </label>
            <Button size="sm" className="w-full" disabled={running} onClick={() => void runPing()}>
              <Play />
              {running ? "กำลังจำลอง…" : "Run Ping"}
            </Button>
            {error && (
              <p className="text-destructive text-xs" role="alert">
                {error}
              </p>
            )}
          </div>
        ) : (
          <div className="border-border text-muted-foreground rounded-lg border border-dashed p-4 text-center text-xs">
            ยังไม่มีอุปกรณ์ที่ตั้งค่า IPv4
          </div>
        )}
      </section>

      <section className="border-border bg-background/45 min-w-0 rounded-lg border p-3">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold">Packet timeline</h3>
          {result && (
            <Badge variant={result.success ? "success" : "warning"}>
              {result.success ? `${result.latencyMs?.toFixed(1)} MS` : result.failureCode}
            </Badge>
          )}
        </div>
        {result ? (
          <div>
            <div
              className={cn(
                "mb-3 flex items-start gap-2 rounded-lg border p-2.5",
                result.success ? "border-success/25 bg-success/8" : "border-destructive/25 bg-destructive/8",
              )}
            >
              {result.success ? (
                <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" />
              ) : (
                <XCircle className="text-destructive mt-0.5 size-4 shrink-0" />
              )}
              <div>
                <p className="text-xs font-medium">{result.success ? "Ping successful" : "Ping failed"}</p>
                <p className="text-muted-foreground mt-0.5 text-[10px]">{result.reason}</p>
              </div>
            </div>
            <ol className="space-y-2">
              {result.timeline.map((event) => (
                <li key={event.id} className="grid grid-cols-[18px_1fr_auto] items-start gap-2 text-[10px]">
                  <span
                    className={cn(
                      "mt-0.5 grid size-4 place-items-center rounded-full border",
                      event.status === "success"
                        ? "border-success/30 text-success"
                        : event.status === "failure"
                          ? "border-destructive/30 text-destructive"
                          : "border-primary/30 text-primary",
                    )}
                  >
                    <span className="size-1.5 rounded-full bg-current" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">{event.label}</p>
                    <p className="text-muted-foreground truncate font-mono">{event.detail}</p>
                  </div>
                  <span className="text-muted-foreground font-mono">+{event.atMs}ms</span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="border-border text-muted-foreground grid h-40 place-items-center rounded-lg border border-dashed text-center text-xs">
            <div>
              <Network className="mx-auto mb-2 size-6 opacity-40" />
              <p>เลือก source และ destination</p>
              <p className="mt-1 text-[10px]">ผล ARP และ ICMP จะแสดงตามลำดับจริง</p>
            </div>
          </div>
        )}
      </section>

      <section className="border-border bg-background/45 rounded-lg border p-3">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold">ARP cache</h3>
          <Clock3 className="text-muted-foreground size-3.5" />
        </div>
        {result?.arpEntries.length ? (
          <div className="space-y-2">
            {result.arpEntries.map((entry) => (
              <div key={`${entry.deviceId}-${entry.ipAddress}`} className="border-border rounded-md border p-2">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-primary text-[10px]">{entry.ipAddress}</code>
                  <Badge variant="outline">{entry.type}</Badge>
                </div>
                <code className="text-muted-foreground mt-1 block text-[9px]">{entry.macAddress}</code>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-border text-muted-foreground rounded-lg border border-dashed p-4 text-center text-[10px]">
            ARP table ยังว่าง
            <br />
            Dynamic entry มีอายุ 60 วินาที
          </div>
        )}
        {targets.length > 0 && (
          <div className="mt-3">
            <p className="text-muted-foreground mb-1.5 text-[9px] uppercase">Known targets</p>
            <div className="flex flex-wrap gap-1">
              {targets.slice(0, 5).map((target) => (
                <Button
                  key={`${target.deviceId}-${target.interfaceName}`}
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 font-mono text-[9px]"
                  onClick={() => setDestinationIp(target.ipAddress)}
                >
                  {target.ipAddress}
                </Button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
