# NetLab Studio

NetLab Studio คือแพลตฟอร์ม local-first สำหรับออกแบบ topology ทดลองแนวคิด และเรียนรู้ระบบเครือข่ายแบบ interactive บนเว็บ โปรเจกต์รอบแรกเน้น foundation ที่ขยายต่อเป็น simulation engine เต็มรูปแบบได้โดยไม่ต้องรื้อ UI, state หรือ persistence ใหม่

## Features

- Dashboard สำหรับสร้าง เปิด นำเข้า และกลับไปทำโปรเจกต์ล่าสุด
- XYFlow workspace พร้อม drag-and-drop device, connect, select, move, delete, duplicate, lock, zoom, pan, fit view และ mini map
- Device registry/factory สำหรับเพิ่มชนิดอุปกรณ์โดยไม่สร้าง `if/else` ขนาดใหญ่
- Device inspector, keyboard shortcuts, undo/redo และ autosave แบบ debounce
- IndexedDB ผ่าน Dexie พร้อม project versions และ demo project
- JSON import/export ที่จำกัดขนาดและตรวจ schema ด้วย Zod
- Academy progress from IndexedDB and live Lab Center validators backed by simulation state
- Dark/light theme, responsive layout, reduced motion และ accessible focus state
- IPv4 subnet calculator, validation, Dynamic ARP และ same-subnet ICMP Ping ผ่าน Web Worker
- Stateful OSPF single/multi-area routing with neighbor state, LSDB, route installation and CLI inspection
- HSRP/VRRP, active-standby and dual-ISP failover with virtual IP ownership, priority, preempt and link tracking
- Live Operations console for topology-derived monitoring, alerts, incidents and layered troubleshooting
- NAS/storage simulation with RAID capacity and failure state, rebuilds, SMB/NFS/iSCSI shares, identities, permissions, quotas and sessions
- Vendor-neutral cloud networking with nested VPC/subnets, route tables, IGW/NAT/VPN/peering/transit targets, stateful Security Groups, stateless Network ACLs and live flow decisions
- Worker-backed interactive packet simulation with ARP/ICMP/DHCP/DNS/TCP/UDP models, hop-by-hop events, pause/step controls, protocol filtering, TTL/MTU drops and a 1,000-event bounded timeline
- Thai-first Learning Academy with seven levels, 46 lessons, prerequisite locks, quizzes, bookmarks, related labs and IndexedDB resume progress
- Registry-driven Lab Validator with 14 state-based rule types, evidence, partial scoring, hint/solution penalties and deterministic topology reset
- Ticket-driven Troubleshooting Mode with 21 real-state fault injectors, multi-fault isolation, Inspector/CLI fixes, hidden root causes and evidence-based scoring
- Stateful Monitoring Engine and NOC Dashboard with topology-derived metrics, duration-aware alert rules, deduplication, lifecycle actions, SLA health and a bounded incident timeline
- Protocol Registry for advanced protocol modules with dependency ordering, circular dependency checks, deterministic snapshots, worker-safe events, and starter modules for STP, LACP, OSPF multi-area, HSRP, VRRP, NAT/PAT and SD-WAN SLA path selection
- Configuration Insights tab with searchable running config, dependency graph edges, and status rows derived from real device configuration

## Technology Stack

Next.js 16 (App Router), React 19, strict TypeScript, Tailwind CSS 4, shadcn/ui-style primitives, XYFlow, Zustand, Zod, Dexie, React Hook Form, xterm, Monaco Editor, Motion, Lucide, Vitest, Testing Library และ Playwright ใช้ `pnpm` เป็น package manager

## Prerequisites

- Node.js 20.9 หรือใหม่กว่า
- pnpm 11 หรือใหม่กว่า

## Quick Start

```bash
git clone https://github.com/Riptwosec-collab/Lab-network.git
cd Lab-network
pnpm install
cp .env.example .env.local
pnpm dev
```

เปิด [http://localhost:3000](http://localhost:3000) ในเบราว์เซอร์

## Commands

```bash
pnpm dev          # development server (Turbopack)
pnpm build        # production build
pnpm start        # production server
pnpm lint         # ESLint
pnpm typecheck    # strict TypeScript check
pnpm test         # Vitest unit/integration tests
pnpm test:e2e     # Playwright end-to-end tests
pnpm format       # Prettier
```

## Important Structure

```text
src/
├── app/                 # App Router pages and error boundaries
├── components/          # layout, canvas, devices, inspector, connection and UI
├── data/                # device catalog, labs and demo topology
├── db/                  # Dexie database and repositories
├── engine/              # simulation/event/worker extension points
├── hooks/               # autosave and keyboard shortcuts
├── schemas/             # Zod schemas for external/persisted data
├── services/            # project import/export services
├── stores/              # domain-specific Zustand stores
├── tests/               # Vitest setup and tests
└── types/               # network and lab contracts
```

อ่านรายละเอียดได้ใน [Architecture](docs/architecture.md), [Project Schema](docs/project-schema.md), [Device Plugin](docs/device-plugin.md), [Simulation Engine](docs/simulation-engine.md) และ [Development Guide](docs/development-guide.md)

## Architecture Overview

UI อ่าน state ผ่าน selector ของ Zustand; domain stores ส่งข้อมูลที่ validate แล้วไปยัง service/repository; repository เป็น boundary ระหว่างแอปกับ IndexedDB ส่วน simulation ใช้ typed message แยกจาก UI เพื่อย้ายงานหนักเข้า Web Worker ในอนาคตได้

## Testing

Vitest ครอบคลุม schema, store actions, history, persistence, IPv4/ARP/Ping failure cases และ workspace components ส่วน Playwright ครอบคลุม dashboard, project creation, demo load, save, export และ Ping ผ่าน Simulation Worker

## Environment Variables

คัดลอก `.env.example` เป็น `.env.local` ค่า Supabase เป็น interface สำหรับ backend ในอนาคตและไม่ควรใส่ secret จริงลง repository

## Contribution Guide

1. สร้าง branch ใหม่จาก `main`
2. แก้ไขพร้อมเพิ่ม test ที่เกี่ยวข้อง
3. รัน `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
4. ใช้ Conventional Commit: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `style:`, `perf:`

## Coding Standards

- ใช้ named export เป็นหลักและเปิด TypeScript strict
- validate ข้อมูลจาก IndexedDB, file และ external boundary ด้วย Zod
- แยก business logic ออกจาก React UI และหลีกเลี่ยง circular dependency
- ใช้ immutable update, Zustand selector และ memoized custom nodes
- อย่าเก็บ secret หรือแสดง stack trace ต่อผู้ใช้

## Roadmap

- protocol simulation ระยะถัดไป (Ethernet frame, IPv6, VLAN, routing, DHCP, DNS)
- terminal/config editor แบบ lazy-loaded ด้วย xterm และ Monaco
- real lab validator, packet animation และ virtualized event log
- cloud sync/auth ผ่าน Supabase หรือ PostgreSQL adapter

## License Notice

ยังไม่มีการประกาศ license สำหรับ repository นี้ โปรดติดต่อเจ้าของ repository ก่อนนำไปใช้หรือแจกจ่ายภายนอก
