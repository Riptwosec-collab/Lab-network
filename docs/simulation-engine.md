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

## IPv4 Routing

- Routing table สร้างจาก connected physical interfaces, SVI และ static/default routes
- Static route จะ active เมื่อ next-hop อยู่บน connected network เท่านั้น
- `IPv4RoutingEngine` เลือก route ด้วย longest-prefix match แล้วพิจารณา administrative distance และ metric
- Cross-subnet Ping ตรวจ Default Gateway, forward route และ return route ทุก hop; route ขาด, next-hop ใช้ไม่ได้, routing loop หรือ `ip routing` ปิดจะคืน failure code จริง
- Inter-VLAN routing ใช้ SVI ของ Layer 3 switch และ Layer 2 VLAN path เดิม จึงยังถูก access/trunk/STP rules บังคับ
- Lab Validator ของ Inter-VLAN ตรวจ SVI, `ip routing` และผล Cross-subnet Ping จริง

## Network Services

- `NetworkServicesEngine` เก็บ DHCP leases, DNS cache, NAT translations และ ACL hit counters ของ simulation session
- DHCP ใช้ DORA/renew/release/expiry จริง และ ACK สามารถ materialize IPv4, gateway และ DNS ลง client running config
- DNS query ใช้ DNS server ที่ client ตั้งไว้ ตรวจ topology reachability, authoritative zone, TTL cache, NXDOMAIN และ timeout
- Routed ICMP ตรวจ outbound ACL ตาม sequence พร้อม implicit deny ทั้ง forward/return path แล้วใช้ NAT/PAT rule แรกที่ match
- `PingResult` ส่งคืน policy evaluations และ translation table พร้อม timeline ที่ระบุ device, interface, direction, ACL/rule และ translated address

## Roadmap ถัดไป

1. deterministic simulation clock และ seeded randomness
2. device/protocol registries
3. IPv6 and dynamic routing protocols
4. packet animation, performance stats และ replay

Worker รับ INIT/LOAD/PING/START/PAUSE/STOP/STEP/RESET/UPDATE และตอบ READY/TOPOLOGY_LOADED/PING_RESULT/STATE/EVENT/ERROR/STATS ทุก message ต้อง serializable และ versioned ก่อนเปิด protocol plugins ภายนอก
