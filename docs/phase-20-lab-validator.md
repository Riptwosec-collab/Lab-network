# Phase 20 — Lab Validator

Phase 20 turns labs into scored, state-based exercises.

## Architecture

- `LabValidationEngine` validates definitions, orchestrates rules and calculates scores.
- `LabRuleRegistry` exposes 14 extensible rule types covering devices, interfaces, IP, switching, routing, services, security, storage, cloud and packet-drop conditions.
- Validators consume topology and runtime configuration state. Command history is not used as proof of completion.
- Lab content includes an address table, requirements, verification rules, hints, partial/full solutions, explanations, common mistakes and score rules.

## Learner workflow

- Open a lab directly from `/labs` or an Academy lesson.
- Inspect the brief, complete tasks in the Workspace and validate live state.
- Reveal hints or solution tiers with explicit score penalties.
- Reset restores the registered starting topology.
- Scores and completion progress persist to IndexedDB.

The initial catalog includes the ten required labs plus routing, security, operations, troubleshooting and cloud extensions.
