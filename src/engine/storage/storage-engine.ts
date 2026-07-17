import { IPv4PingEngine, type PingResult } from "@/engine/protocols/ping-engine";
import type {
  DeviceRuntimeConfig,
  NetworkDevice,
  RaidLevel,
  StoragePermissionRuntimeConfig,
  StorageProtocol,
  StorageRuntimeConfig,
  TopologySnapshot,
} from "@/types/network";

export type StoragePoolState = "healthy" | "degraded" | "failed" | "rebuilding";

export interface RaidAnalysis {
  readonly poolId: string;
  readonly raidLevel: RaidLevel;
  readonly minimumDisks: number;
  readonly faultTolerance: number;
  readonly failedDisks: number;
  readonly rawCapacityGb: number;
  readonly usableCapacityGb: number;
  readonly usedCapacityGb: number;
  readonly freeCapacityGb: number;
  readonly utilizationPercent: number;
  readonly state: StoragePoolState;
  readonly rebuildProgress: number;
  readonly reason: string;
}

export interface StorageSession {
  readonly id: string;
  readonly clientDeviceId: string;
  readonly storageDeviceId: string;
  readonly shareId: string;
  readonly username: string;
  readonly protocol: StorageProtocol;
  readonly operation: "read" | "write";
  readonly transferredGb: number;
  readonly state: "connected" | "denied" | "failed";
  readonly reason: string;
  readonly createdAt: string;
}

export interface StorageAccessRequest {
  readonly clientDeviceId: string;
  readonly storageDeviceId: string;
  readonly shareId: string;
  readonly username: string;
  readonly password: string;
  readonly protocol: StorageProtocol;
  readonly operation: "read" | "write";
  readonly sizeGb?: number;
}

export interface StorageAccessResult {
  readonly success: boolean;
  readonly code:
    | "CONNECTED"
    | "DEVICE_NOT_FOUND"
    | "STORAGE_DISABLED"
    | "SHARE_NOT_FOUND"
    | "PROTOCOL_MISMATCH"
    | "AUTHENTICATION_FAILED"
    | "PERMISSION_DENIED"
    | "NETWORK_DOWN"
    | "POOL_FAILED"
    | "STORAGE_FULL"
    | "QUOTA_EXCEEDED";
  readonly reason: string;
  readonly session: StorageSession;
  readonly reachability?: PingResult;
  readonly nextStorage?: StorageRuntimeConfig;
}

const RAID_MINIMUM: Record<RaidLevel, number> = { raid0: 2, raid1: 2, raid5: 3, raid6: 4, raid10: 4 };

export class StorageSimulationEngine {
  constructor(private readonly topology: TopologySnapshot) {}

  analyzePool(deviceId: string, poolId: string): RaidAnalysis | undefined {
    const device = this.topology.devices.find((item) => item.id === deviceId);
    const storage = device && runtimeConfig(device)?.storage;
    const pool = storage?.pools[poolId];
    if (!storage || !pool) return undefined;
    const disks = pool.diskIds.flatMap((diskId) => (storage.disks[diskId] ? [storage.disks[diskId]!] : []));
    const failedDisks = disks.filter((disk) => disk.status === "failed").length;
    const rebuilding = disks.some((disk) => disk.status === "rebuilding") || pool.rebuildProgress > 0;
    const minimumDisks = RAID_MINIMUM[pool.raidLevel];
    const smallestCapacity = disks.length ? Math.min(...disks.map((disk) => disk.capacityGb)) : 0;
    const rawCapacityGb = disks.reduce((total, disk) => total + disk.capacityGb, 0);
    const usableCapacityGb = calculateUsableCapacity(pool.raidLevel, disks.length, smallestCapacity);
    const faultTolerance = calculateFaultTolerance(pool.raidLevel, disks.length);
    const insufficient = disks.length < minimumDisks || (pool.raidLevel === "raid10" && disks.length % 2 !== 0);
    const state: StoragePoolState =
      insufficient || failedDisks > faultTolerance
        ? "failed"
        : rebuilding
          ? "rebuilding"
          : failedDisks > 0
            ? "degraded"
            : "healthy";
    const freeCapacityGb = Math.max(0, usableCapacityGb - pool.usedCapacityGb);
    return {
      poolId,
      raidLevel: pool.raidLevel,
      minimumDisks,
      faultTolerance,
      failedDisks,
      rawCapacityGb,
      usableCapacityGb,
      usedCapacityGb: pool.usedCapacityGb,
      freeCapacityGb,
      utilizationPercent: usableCapacityGb ? Math.round((pool.usedCapacityGb / usableCapacityGb) * 1000) / 10 : 100,
      state,
      rebuildProgress: pool.rebuildProgress,
      reason: insufficient
        ? `${pool.raidLevel.toUpperCase()} requires ${minimumDisks}${pool.raidLevel === "raid10" ? " and an even disk count" : " disks"}`
        : state === "failed"
          ? `${failedDisks} failed disk(s) exceed tolerance ${faultTolerance}`
          : state === "degraded"
            ? `${failedDisks} failed disk(s); data remains available`
            : state === "rebuilding"
              ? `Rebuild ${pool.rebuildProgress}% complete`
              : "All pool members are healthy",
    };
  }

  failDisk(storage: StorageRuntimeConfig, diskId: string): StorageRuntimeConfig {
    const next = structuredClone(storage);
    const disk = next.disks[diskId];
    if (!disk) return next;
    disk.status = "failed";
    disk.healthPercent = 0;
    disk.readWriteState = "read-only";
    return next;
  }

  startRebuild(storage: StorageRuntimeConfig, poolId: string, replacementDiskId: string): StorageRuntimeConfig {
    const next = structuredClone(storage);
    const pool = next.pools[poolId];
    const disk = next.disks[replacementDiskId];
    if (!pool || !disk || !pool.diskIds.includes(replacementDiskId)) return next;
    disk.status = "rebuilding";
    disk.healthPercent = Math.max(disk.healthPercent, 1);
    disk.readWriteState = "read-only";
    pool.replacementDiskId = replacementDiskId;
    pool.rebuildProgress = 1;
    return next;
  }

  advanceRebuild(storage: StorageRuntimeConfig, poolId: string, progressIncrement = 25): StorageRuntimeConfig {
    const next = structuredClone(storage);
    const pool = next.pools[poolId];
    if (!pool?.replacementDiskId) return next;
    pool.rebuildProgress = Math.min(100, pool.rebuildProgress + Math.max(1, progressIncrement));
    const disk = next.disks[pool.replacementDiskId];
    if (disk) disk.healthPercent = pool.rebuildProgress;
    if (pool.rebuildProgress >= 100) {
      if (disk) {
        disk.status = "healthy";
        disk.healthPercent = 100;
        disk.readWriteState = "read-write";
      }
      pool.rebuildProgress = 0;
      pool.replacementDiskId = undefined;
    }
    return next;
  }

  access(request: StorageAccessRequest): StorageAccessResult {
    const createdAt = new Date().toISOString();
    const baseSession: Omit<StorageSession, "state" | "reason"> = {
      id: crypto.randomUUID(),
      clientDeviceId: request.clientDeviceId,
      storageDeviceId: request.storageDeviceId,
      shareId: request.shareId,
      username: request.username,
      protocol: request.protocol,
      operation: request.operation,
      transferredGb: request.operation === "write" ? Math.max(0, request.sizeGb ?? 0) : 0,
      createdAt,
    };
    const fail = (
      code: Exclude<StorageAccessResult["code"], "CONNECTED">,
      reason: string,
      reachability?: PingResult,
    ): StorageAccessResult => ({
      success: false,
      code,
      reason,
      reachability,
      session: {
        ...baseSession,
        state: code === "PERMISSION_DENIED" || code === "AUTHENTICATION_FAILED" ? "denied" : "failed",
        reason,
      },
    });
    const client = this.topology.devices.find((item) => item.id === request.clientDeviceId);
    const storageDevice = this.topology.devices.find((item) => item.id === request.storageDeviceId);
    if (!client || !storageDevice) return fail("DEVICE_NOT_FOUND", "Client or storage device was not found");
    const storage = runtimeConfig(storageDevice)?.storage;
    if (!storage?.enabled) return fail("STORAGE_DISABLED", "Storage service is disabled");
    const share = storage.shares[request.shareId];
    if (!share?.enabled) return fail("SHARE_NOT_FOUND", "Share is missing or disabled");
    if (share.protocol !== request.protocol)
      return fail("PROTOCOL_MISMATCH", `Share requires ${share.protocol.toUpperCase()}`);
    const user = storage.users[request.username];
    if (!user?.enabled || user.password !== request.password)
      return fail("AUTHENTICATION_FAILED", "Storage identity authentication failed");
    const destinationIp = storageDevice.interfaces.find((item) => item.ipv4)?.ipv4;
    const reachability = destinationIp
      ? new IPv4PingEngine(this.topology).ping({ sourceDeviceId: client.id, destinationIp })
      : undefined;
    if (!reachability?.success)
      return fail("NETWORK_DOWN", reachability?.reason ?? "Storage device has no reachable IPv4 address", reachability);
    if (!isPermitted(share.permissions, user.groupNames, request.username, request.operation))
      return fail(
        "PERMISSION_DENIED",
        `${request.username} is not permitted to ${request.operation} ${share.name}`,
        reachability,
      );
    const pool = storage.pools[share.poolId];
    const analysis = pool && this.analyzePool(storageDevice.id, pool.id);
    if (!pool || !analysis || analysis.state === "failed")
      return fail("POOL_FAILED", "Backing storage pool is failed", reachability);
    const sizeGb = request.operation === "write" ? Math.max(0, request.sizeGb ?? 0) : 0;
    if (share.usedCapacityGb + sizeGb > share.quotaGb)
      return fail("QUOTA_EXCEEDED", `Share quota ${share.quotaGb} GB would be exceeded`, reachability);
    if (pool.usedCapacityGb + sizeGb > analysis.usableCapacityGb)
      return fail("STORAGE_FULL", `Pool free capacity ${analysis.freeCapacityGb} GB is insufficient`, reachability);
    const nextStorage = structuredClone(storage);
    nextStorage.shares[share.id]!.usedCapacityGb += sizeGb;
    nextStorage.pools[pool.id]!.usedCapacityGb += sizeGb;
    const reason = `${request.protocol.toUpperCase()} ${request.operation} completed through reachable network path`;
    return {
      success: true,
      code: "CONNECTED",
      reason,
      reachability,
      nextStorage,
      session: { ...baseSession, state: "connected", reason },
    };
  }

  runBackup(request: Omit<StorageAccessRequest, "operation"> & { sizeGb: number }): StorageAccessResult {
    return this.access({ ...request, operation: "write" });
  }
}

function calculateUsableCapacity(level: RaidLevel, diskCount: number, diskCapacityGb: number): number {
  if (diskCount < RAID_MINIMUM[level]) return 0;
  if (level === "raid0") return diskCount * diskCapacityGb;
  if (level === "raid1") return diskCapacityGb;
  if (level === "raid5") return (diskCount - 1) * diskCapacityGb;
  if (level === "raid6") return (diskCount - 2) * diskCapacityGb;
  return Math.floor(diskCount / 2) * diskCapacityGb;
}

function calculateFaultTolerance(level: RaidLevel, diskCount: number): number {
  if (level === "raid0") return 0;
  if (level === "raid1") return Math.max(1, diskCount - 1);
  if (level === "raid5") return 1;
  if (level === "raid6") return 2;
  return Math.max(1, Math.floor(diskCount / 2));
}

function isPermitted(
  permissions: readonly StoragePermissionRuntimeConfig[],
  groups: readonly string[],
  username: string,
  operation: "read" | "write",
): boolean {
  const applies = (permission: StoragePermissionRuntimeConfig) =>
    permission.principalType === "everyone" ||
    (permission.principalType === "user" && permission.principal === username) ||
    (permission.principalType === "group" && groups.includes(permission.principal));
  const relevant = permissions.filter(applies);
  if (relevant.some((permission) => permission.access === "deny")) return false;
  if (operation === "write") return relevant.some((permission) => permission.access === "write");
  return relevant.some((permission) => permission.access === "read" || permission.access === "write");
}

function runtimeConfig(device: NetworkDevice): DeviceRuntimeConfig | undefined {
  const value = device.configuration.runtimeConfig;
  return value && typeof value === "object" ? (value as DeviceRuntimeConfig) : undefined;
}
