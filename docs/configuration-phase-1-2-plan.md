# NetLab Studio — Configuration Phase 1–2 plan

## Audit: real behavior versus placeholders

### Real today

- The workspace persists projects, topology, project history, and JSON import/export through Dexie and Zod.
- The Inspector updates hostname and IPv4 fields in the topology store. Those changes are persisted by autosave and are used by the worker-based same-subnet ARP/ICMP Ping engine.
- The Ping result is calculated from interfaces, links and IPv4 validation; it is not a hard-coded success value.

### Placeholder or incomplete today

- `NetworkDevice.configuration` is an unstructured payload: it has no candidate/running/startup separation, revisions, validation report, diff or rollback.
- Inspector capability tabs render a configuration JSON preview only; there is no terminal, CLI parser, Monaco raw editor or configuration command engine.
- At the Phase 1–2 audit, Lab validation was `MockLabValidator` and VLAN/routing/services were intentionally unavailable. Phase 3 later replaced the mock with a real topology validator and added VLAN/STP/LACP simulation; routing and services remain deferred to their own phases.
- A link label does not currently derive its state from an interface shutdown action.

## Compatibility constraints

- Keep the Device Registry factory, existing type IDs, demo topology, direct Workspace URL, autosave, Undo/Redo, import/export, and typed Worker Ping contract working.
- Preserve schema-v1 and schema-v2 projects. A project migration must only add configuration data and never remove topology, history, user configuration or groups.
- Keep configuration domain logic free of React, DOM, Dexie and worker imports. Client components only dispatch domain actions and render state.

## Phase 1 — Configuration foundation

### New domain contracts

- `DeviceRuntimeConfig` with `system`, per-interface config, and a deliberately small Phase-1 routing section.
- Per-device `defaultConfig`, `runningConfig`, `startupConfig`, `candidateConfig`, revision list, config status, validation result and source audit information.
- A pure configuration engine for validation, apply, startup save/restore, diff and rollback.
- A centralized Zustand configuration store and an application service that applies a result atomically to topology state, configuration state and project persistence.

### Schema and migration

- Bump project `schemaVersion` from 2 to 3.
- Persist `configurationState` in project JSON and Dexie records.
- Add a Dexie v3 upgrade for projects and version snapshots; migration creates a default configuration from every existing device and interface.
- Project import migrates before Zod validation and export contains configuration state.

### UI for this phase

- Inspector tabs for Configuration status, CLI, Raw Config, Running Config, Startup Config, Diff and History.
- CLI is a command registry/tokenizer/parser for Phase-2 commands, not a fake success console.
- Raw configuration uses the installed Monaco editor, Zod validation and a real apply action.

## Phase 2 — Interface and IPv4

- Form configuration dispatches the same engine action as CLI and raw JSON.
- Implement hostname, interface description, shutdown/no shutdown, IPv4, prefix and default gateway.
- A configuration change recalculates only the updated device and links attached to its configured interfaces. Ping receives the new snapshot through the Worker.
- Derive connected routes from active IPv4 interfaces for the Phase-2 tables; static/dynamic routing controls remain unavailable until Phase 4.

## Files

New: `src/domain/configuration/*`, `src/stores/configuration-store.ts`, `src/services/configuration-service.ts`, Inspector configuration panels, and focused unit/integration tests.

Modify: network types/schemas, project migration/Dexie/repository/transfer, project/topology stores, autosave, Workspace initialization, Inspector, Bottom Panel, and the demo fixture.

## Performance risks

- Store immutable config snapshots only on Apply/Commit, never per keystroke.
- Keep raw-editor loading lazy and do not send editor state to the worker until Apply.
- Recalculate attached links and connected routes only for the changed device; retain the existing debounce for IndexedDB writes.
- Configuration revisions are bounded per device to prevent unbounded local storage growth.

## Deferred explicitly

VLAN/STP/EtherChannel, static/dynamic routing, DHCP/DNS/NAT/ACL, firewall, wireless, VPN/HA, the full rule-based lab catalog and all protocol-specific status tables are later phases. Their controls will not be presented as working in Phase 1–2.
