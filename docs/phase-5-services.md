# Phase 5 — Network Services

Phase 5 connects DHCP, DNS, NAT/PAT and ACL configuration to the same running/startup/candidate configuration engine used by interfaces, switching and routing.

## DHCP

- Multiple named pools with network/prefix, gateway, DNS, domain and lease duration
- Excluded ranges, reservations, maximum leases, relay/helper addresses
- DORA state machine (`DISCOVER → OFFER → REQUEST → ACK`), renew, release, expiry and scope exhaustion
- Live lease table in the Services tool
- CLI: `ip dhcp pool`, `show ip dhcp pool`, `show ip dhcp binding`, `show ip dhcp conflict`

An acknowledged lease is materialized into the client interface and DNS client configuration, so subsequent routing and DNS queries use the leased values.

## DNS

- Authoritative forward/reverse zones
- A, AAAA, CNAME, MX, PTR, TXT and NS records with TTL
- Recursive/forwarder configuration and expiring cache
- Query results distinguish answer, cache hit/miss, NXDOMAIN, timeout, wrong DNS and missing client DNS
- CLI: `dns record`, `ip name-server`, `nslookup`, `dig`, `show dns cache`

## NAT/PAT

- Ordered static, dynamic, PAT, source, destination, port-forward and exemption rules
- Address pools, inside/outside interfaces, protocol/port matching and translation timeout
- Packet simulation returns a live translation record and adds translation steps to the packet timeline
- Validation detects invalid networks, missing pools/interfaces and port conflicts
- CLI: `ip nat inside source static`, `show ip nat translations`, `show ip nat statistics`

## ACL

- Standard/extended, named/numbered model
- Ordered permit/deny rules for IP, ICMP, TCP and UDP with address, prefix, ports and logging
- Inbound/outbound interface assignments and implicit deny
- Routed Ping evaluates assigned ACLs in sequence for both forward and return paths
- A drop reports device, interface, direction, ACL, rule sequence and reason
- CLI: `access-list`, `ip access-group`, `show access-lists`

## Persistence and migration

Project schema version 6 adds typed service configuration. IndexedDB version 6 migrates projects and saved versions through the normal project migration pipeline. Dynamic leases, DNS cache entries and NAT translations remain simulation runtime state rather than startup configuration.
