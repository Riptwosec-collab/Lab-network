# Phase 6 — Security, VPN, Wireless and RADIUS

## Stateful firewall

- Interfaces are assigned to named security zones.
- Address/service objects and ordered policies use first-match semantics followed by implicit deny.
- Allowed routed packets create expiring connection-tracking sessions; reverse traffic matches the session without requiring a reverse allow rule.
- Decisions report device, zone direction, policy/order and drop reason. Ping timelines expose the same evidence.
- NAT execution order is explicitly configured as before-policy or after-policy.

## VPN

Site-to-site, remote-access, GRE and IPSec tunnel models contain peers, protected networks, key, encryption/hash, IKE version, lifetime, tunnel interface and route-through-tunnel state. Negotiation verifies peer presence, reciprocal tunnel configuration, key, proposal and symmetric protected networks. Failures distinguish authentication, proposal, peer and route errors.

## Wireless and RADIUS

- Radios model 2.4/5/6 GHz band, channel, width, transmit power and administrative state.
- SSIDs model BSSID, radio mapping, WPA2/WPA3 PSK or enterprise security, VLAN, guest/isolation/portal, capacity, roaming and mesh.
- Association verifies broadcast SSID, radio state, capacity, password, link state and signal.
- Enterprise association sends the configured credentials through the local RADIUS model. Client secret and user credentials must match; an accepted user can return a dynamic VLAN.

The Security tool runs VPN negotiation and wireless association against current topology configuration. Project schema and IndexedDB version 7 persist configuration, while firewall sessions and wireless associations remain runtime state.
