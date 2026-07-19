# Phase 21 — Troubleshooting Mode

Phase 21 adds ticket-driven troubleshooting sessions to the live Operations console.

## Fault and scenario architecture

- An extensible registry provides all 21 initial fault types across Layer 1, Layer 2, Layer 3, services, security, storage and cloud.
- Fault injection mutates real topology or embedded runtime configuration state and captures a healthy baseline.
- Each injected marker verifies its own state path, so submitting the right text without repairing state cannot earn fix points.
- Multi-fault scenarios require every marker to be resolved.

## Workflow

Learners read a ticket, inspect logs/monitoring/packet evidence, work through network layers, apply fixes through the existing Inspector or CLI, verify, submit root causes and review the explanation. Root causes remain hidden until a fix, hint, solution or timeout.

Scoring covers repair state, root-cause selection, command efficiency, time, hints, unnecessary changes and service impact. Reset reproduces the faulted start; Exit restores the healthy baseline.
