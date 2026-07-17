"use client";

import { useMemo, useState } from "react";
import { Database, HardDrive, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createDeviceConfigurationState } from "@/domain/configuration/configuration-engine";
import { StorageSimulationEngine } from "@/engine/storage/storage-engine";
import { applyDeviceConfiguration } from "@/services/configuration-service";
import { useConfigurationStore } from "@/stores/configuration-store";
import { useTopologyStore } from "@/stores/topology-store";
import type { DeviceRuntimeConfig, NetworkDevice, RaidLevel, StorageProtocol } from "@/types/network";

export function StorageConfigurationPanel({ device }: { device: NetworkDevice }) {
  const stored = useConfigurationStore((state) => state.configurationState.devices[device.id]);
  const configuration = stored ?? createDeviceConfigurationState(device);
  const devices = useTopologyStore((state) => state.devices);
  const connections = useTopologyStore((state) => state.connections);
  const groups = useTopologyStore((state) => state.groups);
  const topology = useMemo(() => ({ devices, connections, groups }), [connections, devices, groups]);
  const engine = useMemo(() => new StorageSimulationEngine(topology), [topology]);
  const storage = configuration.runningConfig.storage;
  const [shareName, setShareName] = useState("Team");
  const [shareProtocol, setShareProtocol] = useState<StorageProtocol>("smb");
  const [shareQuota, setShareQuota] = useState("500");
  const [username, setUsername] = useState("operator");
  const [password, setPassword] = useState("netlab123");
  const pools = Object.values(storage.pools);

  const apply = (update: (candidate: DeviceRuntimeConfig) => void) => {
    const candidate = structuredClone(configuration.runningConfig);
    update(candidate);
    const result = applyDeviceConfiguration(device.id, candidate, "form");
    if (!result.applied) toast.error(result.validation.issues[0]?.message ?? "Storage configuration is invalid");
    return result.applied;
  };

  const addShare = () => {
    const pool = pools[0];
    if (!pool) return;
    const id = shareName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-");
    if (
      apply((candidate) => {
        candidate.storage.shares[id] = {
          id,
          name: shareName.trim(),
          protocol: shareProtocol,
          path: `/volume1/${id}`,
          poolId: pool.id,
          quotaGb: Number(shareQuota),
          usedCapacityGb: 0,
          enabled: true,
          permissions: [
            { principalType: "everyone", principal: "*", access: "read" },
            { principalType: "group", principal: "users", access: "write" },
          ],
        };
      })
    )
      toast.success(`Created ${shareProtocol.toUpperCase()} share ${shareName}`);
  };

  const addUser = () => {
    if (
      apply((candidate) => {
        candidate.storage.users[username] = { username, password, groupNames: ["users"], enabled: true };
        const group = candidate.storage.groups.users ?? { name: "users", memberUsernames: [] };
        group.memberUsernames = Array.from(new Set([...group.memberUsernames, username]));
        candidate.storage.groups.users = group;
      })
    )
      toast.success(`Created storage identity ${username}`);
  };

  if (!storage.enabled) {
    return (
      <div className="border-border rounded-lg border border-dashed p-4 text-xs">
        Storage services are disabled for this device.
        <Button
          className="mt-3 w-full"
          size="sm"
          onClick={() =>
            apply((candidate) => {
              candidate.storage.enabled = true;
            })
          }
        >
          Enable storage
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section>
        <div className="mb-2 flex items-center gap-2">
          <HardDrive className="text-primary size-4" />
          <h3 className="text-xs font-semibold">Disk grid</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {Object.values(storage.disks).map((disk) => (
            <div key={disk.id} className="border-border rounded-lg border p-2 text-[10px]">
              <div className="flex items-center justify-between">
                <span className="font-medium">{disk.id}</span>
                <Badge variant={disk.status === "healthy" ? "success" : "warning"}>{disk.status}</Badge>
              </div>
              <p className="text-muted-foreground mt-1 font-mono">
                {disk.capacityGb} GB · {disk.temperatureC}°C · health {disk.healthPercent}%
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 w-full"
                disabled={disk.status === "failed"}
                onClick={() =>
                  apply((candidate) => {
                    candidate.storage = engine.failDisk(candidate.storage, disk.id);
                  })
                }
              >
                Fail disk
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="border-border space-y-2 rounded-lg border p-3">
        <div className="flex items-center gap-2">
          <Database className="text-primary size-4" />
          <h3 className="text-xs font-semibold">Storage pools</h3>
        </div>
        {pools.map((pool) => {
          const analysis = engine.analyzePool(device.id, pool.id);
          const failedDisk = pool.diskIds.find((diskId) => storage.disks[diskId]?.status === "failed");
          return (
            <div key={pool.id} className="bg-muted/30 rounded-lg p-2 text-[10px]">
              <div className="flex items-center justify-between">
                <span className="font-medium">{pool.name}</span>
                <Badge variant={analysis?.state === "healthy" ? "success" : "warning"}>
                  {analysis?.state ?? "unknown"}
                </Badge>
              </div>
              <Select
                value={pool.raidLevel}
                onValueChange={(value) =>
                  apply((candidate) => {
                    candidate.storage.pools[pool.id]!.raidLevel = value as RaidLevel;
                  })
                }
              >
                <SelectTrigger className="mt-2" aria-label={`RAID level ${pool.name}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["raid0", "raid1", "raid5", "raid6", "raid10"].map((level) => (
                    <SelectItem key={level} value={level}>
                      {level.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {analysis && (
                <>
                  <p className="text-muted-foreground mt-2 font-mono">
                    raw {analysis.rawCapacityGb} GB · usable {analysis.usableCapacityGb} GB · used{" "}
                    {analysis.usedCapacityGb} GB
                  </p>
                  <p className="text-muted-foreground mt-1">
                    tolerance {analysis.faultTolerance} disk(s) · {analysis.reason}
                  </p>
                </>
              )}
              {failedDisk && pool.rebuildProgress === 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full"
                  onClick={() =>
                    apply((candidate) => {
                      candidate.storage = engine.startRebuild(candidate.storage, pool.id, failedDisk);
                    })
                  }
                >
                  <RefreshCw /> Start rebuild
                </Button>
              )}
              {pool.rebuildProgress > 0 && (
                <Button
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() =>
                    apply((candidate) => {
                      candidate.storage = engine.advanceRebuild(candidate.storage, pool.id, 25);
                    })
                  }
                >
                  <RefreshCw /> Advance rebuild ({pool.rebuildProgress}%)
                </Button>
              )}
            </div>
          );
        })}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold">Shared folders and targets</h3>
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={shareName}
            onChange={(event) => setShareName(event.target.value)}
            aria-label="Storage share name"
          />
          <Select value={shareProtocol} onValueChange={(value) => setShareProtocol(value as StorageProtocol)}>
            <SelectTrigger aria-label="Storage share protocol">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["smb", "nfs", "iscsi"].map((value) => (
                <SelectItem key={value} value={value}>
                  {value.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={shareQuota}
            onChange={(event) => setShareQuota(event.target.value)}
            aria-label="Storage share quota"
          />
          <Button size="sm" onClick={addShare}>
            <Plus /> Add share
          </Button>
        </div>
        {Object.values(storage.shares).map((share) => (
          <div key={share.id} className="border-border rounded-lg border p-2 text-[10px]">
            <div className="flex justify-between">
              <code>
                {share.name} · {share.protocol.toUpperCase()}
              </code>
              <Badge variant={share.enabled ? "success" : "outline"}>{share.enabled ? "online" : "disabled"}</Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              {share.path} · {share.usedCapacityGb}/{share.quotaGb} GB · {share.permissions.length} permission(s)
            </p>
          </div>
        ))}
      </section>

      <section className="border-border space-y-2 rounded-lg border p-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-primary size-4" />
          <h3 className="text-xs font-semibold">Users and groups</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input value={username} onChange={(event) => setUsername(event.target.value)} aria-label="Storage username" />
          <Input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-label="Storage password"
            type="password"
          />
        </div>
        <Button size="sm" variant="outline" className="w-full" onClick={addUser}>
          <Plus /> Add user to users group
        </Button>
        <div className="flex flex-wrap gap-1.5">
          {Object.values(storage.users).map((user) => (
            <Badge key={user.username} variant={user.enabled ? "success" : "outline"}>
              {user.username} · {user.groupNames.join(",")}
            </Badge>
          ))}
        </div>
      </section>
    </div>
  );
}
