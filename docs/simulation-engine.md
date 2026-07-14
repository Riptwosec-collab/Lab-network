# Simulation Engine

Engine มี lifecycle (`start`, `pause`, `stop`, `reset`, `step`, `setSpeed`), immutable state, event bus และ protocol logic ที่ไม่ import React

## IPv4 / ARP / ICMP

- `ipv4.ts` แปลง IPv4 เป็น unsigned integer และคำนวณ mask, network, broadcast, host range
- Validation ตรวจ format, prefix 0–32, reserved address, duplicate IP และ default gateway
- `ArpCache` รองรับ dynamic entry อายุ 60 วินาทีและ static entry สำหรับการขยายในอนาคต
- `IPv4PingEngine` เลือก source interface, ตรวจ link/interface graph, resolve ARP และสร้าง ICMP timeline แบบ deterministic
- Same-subnet Ping ใช้ topology state จริง; cross-subnet ตอบ `ROUTING_NOT_SUPPORTED` จนถึง Phase 14
- UI ส่ง `LOAD_TOPOLOGY` และ `PING` ผ่าน Simulation Worker และรับ `PING_RESULT` ที่ serializable

## Roadmap ถัดไป

1. deterministic simulation clock และ seeded randomness
2. device/protocol registries
3. Ethernet frame และ MAC learning
4. VLAN/STP และ trunk/access port
5. routing, IPv6, DHCP/DNS, ACL/NAT
6. packet animation, performance stats และ replay

Worker รับ INIT/LOAD/PING/START/PAUSE/STOP/STEP/RESET/UPDATE และตอบ READY/TOPOLOGY_LOADED/PING_RESULT/STATE/EVENT/ERROR/STATS ทุก message ต้อง serializable และ versioned ก่อนเปิด protocol plugins ภายนอก
