"use client";

import { useMemo, useState } from "react";
import { Database, HardDrive, LockKeyhole, Network } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StorageSimulationEngine, type StorageSession } from "@/engine/storage/storage-engine";
import { applyDeviceConfiguration } from "@/services/configuration-service";
import { useConfigurationStore } from "@/stores/configuration-store";
import { useTopologyStore } from "@/stores/topology-store";

export function StorageTool() {
  const devices = useTopologyStore((state) => state.devices);
  const connections = useTopologyStore((state) => state.connections);
  const groups = useTopologyStore((state) => state.groups);
  const configurations = useConfigurationStore((state) => state.configurationState.devices);
  const topology = useMemo(() => ({ devices, connections, groups }), [connections, devices, groups]);
  const engine = useMemo(() => new StorageSimulationEngine(topology), [topology]);
  const storageDevices = devices.filter((device) => configurations[device.id]?.runningConfig.storage.enabled);
  const clients = devices.filter(
    (device) => device.category === "end-device" || device.capabilities.includes("client"),
  );
  const [storageDeviceId, setStorageDeviceId] = useState(storageDevices[0]?.id ?? "");
  const [clientDeviceId, setClientDeviceId] = useState(clients[0]?.id ?? "");
  const effectiveStorageDeviceId = storageDevices.some((device) => device.id === storageDeviceId)
    ? storageDeviceId
    : (storageDevices[0]?.id ?? "");
  const effectiveClientDeviceId = clients.some((device) => device.id === clientDeviceId)
    ? clientDeviceId
    : (clients[0]?.id ?? "");
  const storage = configurations[effectiveStorageDeviceId]?.runningConfig.storage;
  const shares = Object.values(storage?.shares ?? {});
  const users = Object.values(storage?.users ?? {});
  const [shareId, setShareId] = useState(shares[0]?.id ?? "");
  const [username, setUsername] = useState(users[0]?.username ?? "student");
  const [password, setPassword] = useState("netlab123");
  const [operation, setOperation] = useState<"read" | "write">("read");
  const [sizeGb, setSizeGb] = useState("1");
  const selectedShare = storage?.shares[shareId] ?? shares[0];
  const [sessions, setSessions] = useState<readonly StorageSession[]>([]);
  const [lastResult, setLastResult] = useState<{ success: boolean; code: string; reason: string }>();

  const runAccess = () => {
    if (!effectiveClientDeviceId || !effectiveStorageDeviceId || !selectedShare) return;
    const result = engine.access({
      clientDeviceId: effectiveClientDeviceId,
      storageDeviceId: effectiveStorageDeviceId,
      shareId: selectedShare.id,
      username,
      password,
      protocol: selectedShare.protocol,
      operation,
      sizeGb: Number(sizeGb),
    });
    setLastResult({ success: result.success, code: result.code, reason: result.reason });
    setSessions((current) => [result.session, ...current].slice(0, 30));
    if (result.success && result.nextStorage) {
      const state = configurations[effectiveStorageDeviceId];
      if (!state) return;
      const candidate = structuredClone(state.runningConfig);
      candidate.storage = result.nextStorage;
      applyDeviceConfiguration(effectiveStorageDeviceId, candidate, "system");
    }
  };

  const poolAnalyses = storageDevices.flatMap((device) =>
    Object.keys(configurations[device.id]?.runningConfig.storage.pools ?? {}).flatMap((poolId) => {
      const analysis = engine.analyzePool(device.id, poolId);
      return analysis ? [{ device, analysis }] : [];
    }),
  );

  return (
    <div
      className="border-border bg-background/55 grid max-h-96 gap-3 overflow-y-auto border-t p-3 lg:grid-cols-[1fr_1fr_1.4fr]"
      data-testid="storage-tool"
    >
      <section className="border-border rounded-lg border p-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold">
          <Network className="text-primary size-4" />
          NAS access simulation
        </h3>
        <div className="mt-3 space-y-2">
          <StorageSelect
            label="Storage client"
            value={effectiveClientDeviceId}
            onChange={setClientDeviceId}
            items={clients.map((device) => ({ value: device.id, label: device.hostname }))}
          />
          <StorageSelect
            label="Storage device"
            value={effectiveStorageDeviceId}
            onChange={(value) => {
              setStorageDeviceId(value);
              setShareId("");
            }}
            items={storageDevices.map((device) => ({ value: device.id, label: device.hostname }))}
          />
          <StorageSelect
            label="Storage share"
            value={selectedShare?.id ?? ""}
            onChange={setShareId}
            items={shares.map((share) => ({
              value: share.id,
              label: `${share.name} · ${share.protocol.toUpperCase()}`,
            }))}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input value={username} onChange={(event) => setUsername(event.target.value)} aria-label="NAS username" />
            <Input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-label="NAS password"
              type="password"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={operation} onValueChange={(value) => setOperation(value as "read" | "write")}>
              <SelectTrigger aria-label="Storage operation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="write">Write</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={sizeGb}
              onChange={(event) => setSizeGb(event.target.value)}
              aria-label="Transfer size GB"
              disabled={operation === "read"}
            />
          </div>
          <Button
            className="w-full"
            size="sm"
            onClick={runAccess}
            disabled={!selectedShare || !effectiveClientDeviceId}
          >
            <Database />
            Connect and transfer
          </Button>
          {lastResult && (
            <div className="border-border rounded-lg border p-2 text-[10px]">
              <div className="flex justify-between">
                <span className="font-medium">{lastResult.code}</span>
                <Badge variant={lastResult.success ? "success" : "warning"}>
                  {lastResult.success ? "success" : "failed"}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1">{lastResult.reason}</p>
            </div>
          )}
        </div>
      </section>

      <section className="border-border rounded-lg border p-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold">
          <HardDrive className="text-primary size-4" />
          Pool capacity and health
        </h3>
        <div className="mt-3 space-y-2">
          {poolAnalyses.map(({ device, analysis }) => (
            <div key={`${device.id}:${analysis.poolId}`} className="bg-muted/30 rounded-lg p-2 text-[10px]">
              <div className="flex justify-between">
                <span className="font-medium">
                  {device.hostname} · {analysis.poolId}
                </span>
                <Badge variant={analysis.state === "healthy" ? "success" : "warning"}>{analysis.state}</Badge>
              </div>
              <p className="text-muted-foreground mt-1 font-mono">
                {analysis.raidLevel.toUpperCase()} · {analysis.usedCapacityGb}/{analysis.usableCapacityGb} GB ·{" "}
                {analysis.utilizationPercent}%
              </p>
              <p className="text-muted-foreground mt-1">{analysis.reason}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-border rounded-lg border p-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold">
          <LockKeyhole className="text-primary size-4" />
          Storage session table
        </h3>
        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {sessions.map((session) => (
            <div key={session.id} className="border-border rounded-lg border p-2 text-[10px]">
              <div className="flex justify-between">
                <code>
                  {session.protocol.toUpperCase()} · {session.username} · {session.operation}
                </code>
                <Badge variant={session.state === "connected" ? "success" : "warning"}>{session.state}</Badge>
              </div>
              <p className="text-muted-foreground mt-1">
                {session.transferredGb} GB · {session.reason}
              </p>
            </div>
          ))}
          {!sessions.length && (
            <p className="text-muted-foreground text-[10px]">
              No sessions yet. Access results preserve authentication, permission and network failure reasons.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function StorageSelect({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: Array<{ value: string; label: string }>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
