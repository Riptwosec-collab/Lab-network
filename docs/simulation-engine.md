# Simulation Engine

Engine มี lifecycle (`start`, `pause`, `stop`, `reset`, `step`, `setSpeed`), immutable state, event bus และ protocol logic ที่ไม่ import React

## IPv4 / ARP / ICMP

- `ipv4.ts` แปลง IPv4 เป็น unsigned integer และคำนวณ mask, network, broadcast, host range
- Validation ตรวจ format, prefix 0–32, reserved address, duplicate IP และ default gateway
- `ArpCache` รองรับ dynamic entry อายุ 60 วินาทีและ static entry สำหรับการขยายในอนาคต
- `IPv4PingEngine` เลือก source interface, ตรวจ link/interface graph, resolve ARP และสร้าง ICMP timeline แบบ deterministic
- Same-subnet Ping ใช้ topology stateจริง; cross-subnet ตอบ `ROUTING_NOT_SUPPORTED` จนถึง Phase 4
- UI ส่ง `LOAD_TOPOLOGY` และ `PING` ผ่าน Simulation Worker และรับ `PING_RESULT` ที่ serializable

## Ethernet / VLAN / STP

- `Layer2Engine` หา forwarding path ตาม access VLAN และ trunk allowed VLAN จาก running config จริง
- Endpoint ต่าง access VLAN ตอบ `VLAN_MISMATCH`; trunk ไม่อนุญาต VLAN ตอบ `TRUNK_VLAN_NOT_ALLOWED`
- Ping ที่สำเร็จสร้าง dynamic MAC entries แยกตาม switch และ VLAN ลง runtime table
- STP เลือก root bridge จาก configured priority และ block redundant switch-to-switch path แบบ deterministic
- EtherChannel แสดง state จาก member link และ LACP active/passive negotiation; passive/passive เป็น suspended
- Lab Validator ตรวจ VLAN 10/20 และ access ports จาก project configuration โดยไม่ใช้ mock result

## Roadmap ถัดไป

1. deterministic simulation clock และ seeded randomness
2. device/protocol registries
3. routing, IPv6, DHCP/DNS, ACL/NAT
4. packet animation, performance stats และ replay

Worker รับ INIT/LOAD/PING/START/PAUSE/STOP/STEP/RESET/UPDATE และตอบ READY/TOPOLOGY_LOADED/PING_RESULT/STATE/EVENT/ERROR/STATS ทุก message ต้อง serializable และ versioned ก่อนเปิด protocol plugins ภายนอก
