import type { ConfigurationValidationResult, NetworkDevice, RaidLevel, StorageRuntimeConfig } from "@/types/network";

const minimumDisks: Record<RaidLevel, number> = {
  raid0: 2,
  raid1: 2,
  raid5: 3,
  raid6: 4,
  raid10: 4,
};

export function createStorageRuntimeConfig(device: NetworkDevice): StorageRuntimeConfig {
  if (device.category !== "storage") {
    return { enabled: false, disks: {}, pools: {}, shares: {}, users: {}, groups: {} };
  }
  const diskIds = Array.from({ length: 4 }, (_, index) => `disk-${index + 1}`);
  return {
    enabled: true,
    disks: Object.fromEntries(
      diskIds.map((id, index) => [
        id,
        {
          id,
          model: `NetLab Enterprise HDD ${index + 1}`,
          capacityGb: 2_000,
          status: "healthy" as const,
          temperatureC: 34 + index,
          healthPercent: 100,
          readWriteState: "read-write" as const,
        },
      ]),
    ),
    pools: {
      primary: {
        id: "primary",
        name: "Primary Pool",
        raidLevel: "raid5",
        diskIds,
        usedCapacityGb: 0,
        rebuildProgress: 0,
      },
    },
    shares: {
      public: {
        id: "public",
        name: "Public",
        protocol: "smb",
        path: "/volume1/public",
        poolId: "primary",
        quotaGb: 1_000,
        usedCapacityGb: 0,
        enabled: true,
        permissions: [
          { principalType: "everyone", principal: "*", access: "read" },
          { principalType: "group", principal: "users", access: "write" },
        ],
      },
    },
    users: {
      student: { username: "student", password: "netlab123", groupNames: ["users"], enabled: true },
    },
    groups: { users: { name: "users", memberUsernames: ["student"] } },
  };
}

export function normalizeStorageRuntimeConfig(
  device: NetworkDevice,
  current?: Partial<StorageRuntimeConfig>,
): StorageRuntimeConfig {
  const defaults = createStorageRuntimeConfig(device);
  return {
    ...defaults,
    ...current,
    disks: { ...defaults.disks, ...current?.disks },
    pools: { ...defaults.pools, ...current?.pools },
    shares: { ...defaults.shares, ...current?.shares },
    users: { ...defaults.users, ...current?.users },
    groups: { ...defaults.groups, ...current?.groups },
  };
}

export function validateStorageRuntimeConfig(
  device: NetworkDevice,
  storage: StorageRuntimeConfig,
): ConfigurationValidationResult["issues"] {
  const issues: ConfigurationValidationResult["issues"] = [];
  if (storage.enabled && device.category !== "storage" && !device.capabilities.includes("storage"))
    issues.push({ path: "storage", message: "This device does not support storage services" });
  for (const [diskId, disk] of Object.entries(storage.disks)) {
    const path = `storage.disks.${diskId}`;
    if (disk.capacityGb <= 0) issues.push({ path: `${path}.capacityGb`, message: "Disk capacity must be positive" });
    if (disk.temperatureC < -20 || disk.temperatureC > 100)
      issues.push({ path: `${path}.temperatureC`, message: "Disk temperature must be between -20 and 100 C" });
    if (disk.healthPercent < 0 || disk.healthPercent > 100)
      issues.push({ path: `${path}.healthPercent`, message: "Disk health must be between 0 and 100 percent" });
  }
  for (const [poolId, pool] of Object.entries(storage.pools)) {
    const path = `storage.pools.${poolId}`;
    if (pool.diskIds.length < minimumDisks[pool.raidLevel])
      issues.push({
        path: `${path}.diskIds`,
        message: `${pool.raidLevel.toUpperCase()} requires at least ${minimumDisks[pool.raidLevel]} disks`,
      });
    if (pool.raidLevel === "raid10" && pool.diskIds.length % 2 !== 0)
      issues.push({ path: `${path}.diskIds`, message: "RAID 10 requires an even number of disks" });
    for (const diskId of pool.diskIds)
      if (!storage.disks[diskId]) issues.push({ path: `${path}.diskIds`, message: `Unknown disk ${diskId}` });
    if (pool.usedCapacityGb < 0)
      issues.push({ path: `${path}.usedCapacityGb`, message: "Used capacity cannot be negative" });
  }
  for (const [shareId, share] of Object.entries(storage.shares)) {
    const path = `storage.shares.${shareId}`;
    if (!storage.pools[share.poolId]) issues.push({ path: `${path}.poolId`, message: `Unknown pool ${share.poolId}` });
    if (!share.path.startsWith("/")) issues.push({ path: `${path}.path`, message: "Share path must be absolute" });
    if (share.quotaGb <= 0) issues.push({ path: `${path}.quotaGb`, message: "Share quota must be positive" });
    if (share.usedCapacityGb > share.quotaGb)
      issues.push({ path: `${path}.usedCapacityGb`, message: "Share usage exceeds quota" });
  }
  return issues;
}

export function renderStorageRunningConfig(storage: StorageRuntimeConfig): string[] {
  if (!storage.enabled) return [];
  const lines = ["!", "storage enable"];
  for (const disk of Object.values(storage.disks))
    lines.push(` storage disk ${disk.id} capacity ${disk.capacityGb} status ${disk.status}`);
  for (const pool of Object.values(storage.pools))
    lines.push(` storage pool ${pool.name} raid ${pool.raidLevel.replace("raid", "")} disks ${pool.diskIds.join(",")}`);
  for (const share of Object.values(storage.shares)) {
    lines.push(
      ` storage share ${share.name} protocol ${share.protocol} path ${share.path} pool ${share.poolId} quota ${share.quotaGb}`,
    );
    for (const permission of share.permissions)
      lines.push(`  permission ${permission.principalType} ${permission.principal} ${permission.access}`);
  }
  return lines;
}
