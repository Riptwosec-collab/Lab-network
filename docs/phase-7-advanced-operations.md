# Phase 7 — Advanced Routing and Operations

Phase 7 completes the advanced lab track with live OSPF, high availability, monitoring, incident and troubleshooting engines. Every visible control writes to the same typed `DeviceRuntimeConfig`, is validated before commit and changes the simulation state used by the UI and CLI.

## OSPF

- Single-area and multi-area network statements
- Process ID, router ID, reference bandwidth, cost, passive interfaces and optional authentication keys
- Neighbor state derived from operational links, IPv4 subnet, area, authentication and passive-interface state
- Reachable link-state database with router, external and default LSAs
- Shortest-path route calculation with administrative distance 110 and next-hop resolution
- Learned routes participate in longest-prefix match and routed packet traces
- CLI: `show ip protocols`, `show ip ospf neighbor`, `show ip ospf database`, `show ip route`

## High availability

- HSRP, VRRP, active/standby firewall and dual-ISP concepts
- Group ID, virtual IP, priority, preempt, tracked interfaces, decrement and health-check target
- Deterministic active/master election and standby/backup state
- Automatic priority decrement and failover when a tracked link is down
- The routing engine resolves the virtual IP to the current active/master device

## Monitoring and incident workflow

The monitoring engine uses device, interface and connection state. It does not generate permanent random dashboard data. Metrics include availability, bandwidth utilization, latency, jitter, packet loss and interface errors. Threshold violations become active alerts and, when enabled, evidence-backed incidents.

Incident UI states are `open`, `acknowledged`, `investigating` and `resolved`. The Operations console exposes the active metric, threshold, evidence and suggested runbook action.

## Troubleshooting

The troubleshooting engine follows a layered workflow:

1. Layer 1 link and interface state
2. Layer 2 duplex, loss and link quality
3. Layer 3 inactive routes and OSPF neighbor state
4. Service checks such as DHCP configuration
5. Security checks such as implicit firewall deny

Findings expose symptoms and observable evidence before a recommended next diagnostic action. They are derived outside React and are shared by the Operations console, CLI and lab validators.

## Persistence

Project schema and Dexie database version are now 8. Older saved projects are normalized with safe OSPF, HA and monitoring defaults during migration.

## Verification

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```
