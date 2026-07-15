# Phase 3 — Switching

## Delivered scope

- VLAN database persisted inside running/startup/candidate config
- Form controls and CLI commands for access/trunk/native/allowed VLAN
- Layer 2 forwarding that affects Ping and ARP reachability
- Dynamic MAC learning after a successful frame path
- deterministic STP root election and redundant-port blocking
- EtherChannel/LACP configuration and operational state
- real VLAN lab validator backed by topology/configuration state
- schema v4 and IndexedDB migration from v1–v3

## CLI

```text
vlan <id>
name <name>
no vlan <id>
switchport mode access|trunk
switchport access vlan <id>
switchport trunk native vlan <id>
switchport trunk allowed vlan <id,id,...>
spanning-tree mode <mode>
spanning-tree vlan <id> priority <priority>
channel-group <id> mode active|passive|on
show vlan brief
show interfaces switchport
show interfaces trunk
show mac address-table
show spanning-tree
show etherchannel summary
```

## Deferred beyond Phase 3

Private VLAN, port security, DHCP snooping, DAI, IP Source Guard and storm control remain unavailable until the security/services phases. Inter-VLAN routing is Phase 4; devices in different VLANs are intentionally isolated until a real routing path is configured.
