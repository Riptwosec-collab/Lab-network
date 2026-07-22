# Phase 22 — Monitoring Engine and NOC Dashboard

Phase 22 replaces display-only monitoring with a deterministic, stateful engine driven by the active topology and runtime device configuration.

## Metric architecture

- ICMP, SNMP, Syslog-ready, NetFlow, health-check, storage and wireless source types are modeled independently from React.
- Device availability, interfaces, bandwidth, CPU, memory, temperature, latency, jitter, loss, Wi-Fi clients/RSSI, NAS/RAID, VPN and cloud resource health are derived from real simulation state.
- Polling the same state produces the same values; the dashboard does not depend on permanent random data.

## Alert workflow

Rules include metric, operator, threshold, duration, severity, optional scope, message and enabled state. The engine deduplicates repeated breaches and supports Active, Acknowledged, Resolved, Suppressed and Maintenance transitions. Its incident timeline is capped at 1,000 events and the UI renders only the latest window.

## NOC workflow

The Operations console presents overall health, SLA, active alerts, device/link utilization, service health, top talkers and the incident timeline. A controlled link incident mutates the actual topology, proving that alerts trigger and resolve from state changes. Operators can acknowledge or suppress alerts and enable global maintenance.
