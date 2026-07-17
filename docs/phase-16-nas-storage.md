# Phase 16 — NAS and Storage

Phase 16 adds a stateful, vendor-neutral NAS and storage simulation. Storage configuration uses the same validated running/startup configuration workflow as network and security features.

## Data model

- Disk: model, capacity, health, temperature, read/write state and operational status
- Pool: RAID level, member disks, used capacity, replacement disk and rebuild progress
- Share: SMB, NFS or iSCSI, absolute path, backing pool, quota, usage and ordered permissions
- Identity: local users, groups and group membership

Project and Dexie schema version are now 9. Older projects receive safe disabled storage defaults, while NAS devices receive a four-disk demonstration pool and share.

## RAID engine

The engine supports RAID 0, 1, 5, 6 and 10. It derives:

- minimum disk count;
- raw and usable capacity from the smallest member disk;
- fault tolerance;
- healthy, degraded, failed or rebuilding state;
- used/free capacity and utilization;
- deterministic rebuild progress.

Disk failure changes the pool state used by access checks. A failed pool blocks access; a degraded pool remains accessible within its fault tolerance. Rebuild completion restores the replacement disk and pool state.

## Access workflow

NAS access is evaluated in this order:

1. storage service and share availability;
2. protocol match;
3. local identity authentication;
4. IPv4 network reachability through the existing ping/routing/security engines;
5. explicit user, group and everyone permissions with deny precedence;
6. backing pool health;
7. share quota;
8. usable pool capacity.

Successful access creates an SMB/NFS/iSCSI session record. Write operations update both share and pool usage through a committed runtime configuration.

## UI and CLI

The Storage inspector includes a disk grid, pool manager, capacity summary, share configuration, users/groups and rebuild controls. The bottom Storage tool runs real client access and displays pool health plus the session table.

CLI inspection commands:

```text
show storage disks
show storage pools
show storage shares
```

Configuration commands:

```text
storage pool <pool-id> raid <0|1|5|6|10>
storage disk <disk-id> fail
```

## Verification

Tests cover capacity, minimum disk rules, disk failure, degraded/failed state, rebuild completion, network failure, authentication, permission, quota and session creation. The NAS lab validator now verifies both IPv4/gateway configuration and an actual reachable share access.
