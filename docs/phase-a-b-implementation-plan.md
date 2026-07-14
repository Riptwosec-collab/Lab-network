# NetLab Studio — Phase A/B implementation plan

## Repository audit

The current App Router exposes `/`, `/dashboard`, `/workspace`, `/academy`, `/labs`, `/projects`, `/settings`, and the built-in not-found route. The interactive workspace already uses XYFlow, focused Zustand selectors, drag-stop persistence, debounced autosave, undo/redo, Dexie-backed project versions, JSON import/export, and a typed worker boundary for ARP/IPv4/ICMP Ping.

Existing behavior that must remain intact:

- the `DeviceRegistry.create()` factory and existing device type IDs;
- demo topology, Workspace drag/drop, selected device inspector, undo/redo and autosave;
- IndexedDB project/version records, JSON import/export, and all schema-v1 projects;
- same-subnet Ping through the worker and existing App Router routes.

Known placeholders, intentionally outside these two phases: the six-item lab list, `MockLabValidator`, Academy lesson engine, routing/VLAN/DHCP simulation, terminal/Monaco editors, packet animation, IPAM and report generation.

## Phase A — Foundation

### Add

- A versioned device, interface, cable and diagram-symbol schema in `src/types/network.ts` and `src/schemas/network.schema.ts`.
- `src/domain/interfaces/port-compatibility.ts` for data-driven medium/cable compatibility and occupied-port checks.
- `src/data/diagram-symbols.ts` plus `/symbols` as a vendor-neutral visual legend.
- `src/services/project-migrations.ts` with a pure v1 → v2 migration, used for IndexedDB reads and JSON imports.

### Modify

- `src/db/local-database.ts`: Dexie schema v2 upgrade migrates project and history records in-place.
- `src/db/project-repository.ts`, `src/services/project-transfer.ts`, and project creation: always use the current schema version without losing v1 data.
- `src/stores/topology-store.ts`: reject duplicate/invalid physical port assignments only when both interface IDs are supplied.

### Tests

- schema defaults and v1 migration;
- interface/cable compatibility;
- registry factory output and multilingual search;
- topology store's duplicate-port protection.

## Phase B — Device Expansion

### Add

- A data-driven catalog with profiles for router, switch, security, wireless, server, endpoint/IoT, cloud and infrastructure devices.
- Distinct port/capability profiles and vendor-neutral simulation metadata for each model; no vendor firmware or artwork.
- Search across display name, model, vendor, category, capabilities, interface names, protocol, tags, and Thai/English keywords.
- Category and vendor filters in the Device Library. The list remains rendered only for its filtered result set; virtualisation is deferred until catalog size and scrolling measurements require it.

### Schema/migration compatibility

`schemaVersion` moves from 1 to 2. The v1-to-v2 migration supplies safe connection defaults and preserves unknown configuration payloads. It does not delete projects, connections, groups, or historical snapshots. All new fields are additive.

### Performance and compatibility risks

- Do not mutate persisted state on pointer moves; Node positions still commit on drag stop and autosave remains debounced.
- Avoid importing browser APIs into the worker or server components.
- Keep catalog definitions immutable and share interface templates by cloning them in the factory.
- Existing v1 records are migrated at read/upgrade time, then validated with Zod before entering stores.

## Deferred phases

Phase C covers 300-node workspace performance, guides, grouping and auto-layout. Phases D–G will add Academy, the 100-lab registry/rule validator, phased protocol simulation, troubleshooting, IPAM and reports after the domain contracts in this plan are stable.
