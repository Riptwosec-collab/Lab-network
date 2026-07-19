# Phase 18 — Interactive Packet Simulation

Phase 18 adds a deterministic, worker-backed packet lifecycle on top of the real workspace topology.

## Packet model

Each packet records a deterministic ID and timestamp, source/destination MAC and IPv4 addresses, optional ports and VLAN, protocol, initial/current TTL, size, current device/interface, lifecycle status and a concrete drop reason. Initial protocols are ARP, ICMP, DHCP, DNS, TCP and UDP frameworks.

## Lifecycle engine

The packet engine derives its path from active topology connections and creates ordered events for packet creation, frame encapsulation, ARP request, MAC learning, VLAN tagging, route lookup, forwarding, drop and delivery. It validates:

- source/destination presence and configured IPv4 interfaces;
- active topology path and link status;
- path MTU;
- VLAN isolation when no Layer 3 hop exists;
- TTL decrement and expiry at routed hops.

Identical topology and request inputs produce identical packet IDs, timestamps, paths and events. The authoritative log keeps the newest 1,000 events and 200 packets so the UI remains bounded.

## Worker protocol

`simulation.worker.ts` now handles `INIT`, `LOAD_TOPOLOGY`, `START`, `PAUSE`, `STOP`, `STEP`, `RESET`, `SEND_PACKET`, `SET_SPEED`, `SET_FILTER`, `SET_FOLLOW`, `UPDATE_DEVICE` and `UPDATE_CONNECTION` message contracts. Packet responses use `PACKET_RESULT` and `PACKET_STATE_UPDATED`; route decisions never run in React components.

## UI

Bottom panel → **Packets** includes:

- source/destination/protocol/TTL/size/port composer;
- start, pause, stop, reset and step-forward controls;
- 0.5×–8× speed, protocol filter and follow-packet mode;
- full packet inspector including drop reason;
- color-by-protocol, windowed event timeline with current-step explanation;
- focused active path with unrelated links omitted.

## Verification

Unit tests cover packet lifecycle, pause/resume/step, filters, no-path/MTU/TTL drop reasons, deterministic output and the 1,000-event limit. Playwright verifies an actual browser Web Worker packet send and step flow.
