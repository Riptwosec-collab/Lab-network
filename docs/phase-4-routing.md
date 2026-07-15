# Phase 4 — Routing

## Delivered scope

- connected, static and default route configuration
- active/unresolved routing table derived from current interfaces and next-hop reachability
- longest-prefix match with administrative distance and metric ordering
- SVI configuration and inter-VLAN routing on Layer 3 switches
- forward and return-path validation for cross-subnet Ping
- Form, CLI, Raw, running/startup config and revision synchronization
- real Inter-VLAN Lab Validator
- schema v5 and IndexedDB migration from v1–v4

## CLI

```text
ip routing
no ip routing
ip route <network> <mask|prefix> <next-hop> [distance]
no ip route <network> <mask|prefix> <next-hop>
interface vlan <id>
ip address <address> <mask|prefix>
show ip route
```

## Simulation failures

- `GATEWAY_NOT_FOUND`
- `IP_ROUTING_DISABLED`
- `ROUTE_NOT_FOUND`
- `NEXT_HOP_UNREACHABLE`
- `ROUTING_LOOP`
- `ROUTED_LAYER2_FAILURE`

Dynamic protocols such as OSPF remain in Phase 7. DHCP, DNS, NAT and ACL are implemented in Phase 5 and are not represented as working controls in this phase.
