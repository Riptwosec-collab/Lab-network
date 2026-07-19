import type { LabDefinition } from "@/types/lab";

const makeLab = (
  id: string,
  title: string,
  level: string,
  difficulty: string,
  estimatedMinutes: number,
  scenario: string,
  objectives: readonly string[],
): LabDefinition => ({
  id,
  title,
  level,
  difficulty,
  estimatedMinutes,
  objectives,
  scenario,
  tasks: objectives.map((objective, index) => ({
    id: `${id}-task-${index + 1}`,
    title: `ภารกิจ ${index + 1}`,
    description: objective,
    validatorId: `${id}-validator-${index + 1}`,
  })),
  hints: ["ตรวจสอบสถานะ interface ก่อน", "ใช้ subnet และ default gateway ให้ตรงกับ topology"],
  solution: {
    summary: `แนวทางตัวอย่างสำหรับ ${title}`,
    steps: objectives.map((objective) => `ตรวจสอบและตั้งค่า: ${objective}`),
  },
  startingTopologyId: "demo-topology",
});

export const labs: readonly LabDefinition[] = [
  makeLab("ip-ping", "IP Address and Ping", "Beginner", "ง่าย", 20, "เชื่อม PC สองเครื่องและทดสอบการสื่อสาร", [
    "กำหนด IPv4 ให้อยู่ subnet เดียวกัน",
    "Ping ระหว่างเครื่องให้สำเร็จ",
  ]),
  makeLab("dhcp", "DHCP Network", "Foundation", "ง่าย", 30, "ติดตั้ง DHCP server ให้ client รับ IP อัตโนมัติ", [
    "สร้าง DHCP pool",
    "ยืนยันว่า client ได้รับ lease",
  ]),
  makeLab(
    "dns",
    "Authoritative DNS",
    "Intermediate",
    "ปานกลาง",
    30,
    "สร้าง authoritative zone และให้ client resolve ชื่อผ่าน DNS server จริง",
    ["เปิด DNS และสร้าง A record ใน authoritative zone", "ตั้ง DNS server ที่ client และ query ให้สำเร็จ"],
  ),
  makeLab("nat-acl", "Edge NAT and ACL", "Advanced", "ยาก", 45, "ควบคุม routed packet ด้วย NAT/PAT และ ordered ACL", [
    "สร้าง active NAT หรือ PAT rule",
    "สร้าง ACL และผูก inbound หรือ outbound กับ interface",
  ]),
  makeLab("vlan", "VLAN Basics", "Intermediate", "ปานกลาง", 35, "แบ่งแผนกออกเป็น VLAN บนสวิตช์เดียว", [
    "สร้าง VLAN 10 และ 20",
    "กำหนด access port ให้ถูกต้อง",
  ]),
  makeLab(
    "inter-vlan",
    "Inter-VLAN Routing",
    "Advanced",
    "ปานกลาง",
    45,
    "ทำให้ VLAN ต่างกันสื่อสารผ่าน Layer 3 device",
    ["สร้าง SVI หรือ subinterface", "ทดสอบ routing ข้าม VLAN"],
  ),
  makeLab("guest-wifi", "Guest Wi-Fi", "Professional", "ยาก", 50, "แยก guest wireless ออกจาก LAN ภายใน", [
    "สร้าง SSID สำหรับ guest",
    "กำหนด policy ห้ามเข้าถึง private LAN",
  ]),
  makeLab(
    "firewall-policy",
    "Stateful Firewall Policy",
    "Professional",
    "ยาก",
    50,
    "สร้าง security zones และ first-match stateful policy",
    ["ผูก interfaces กับ trust และ untrust zones", "เพิ่ม ordered security policy และตรวจ implicit deny"],
  ),
  makeLab("vpn", "Site-to-Site VPN", "Professional", "ยาก", 60, "เชื่อม protected networks ผ่าน IPSec peers", [
    "สร้าง tunnel และ protected networks ทั้งสองฝั่ง",
    "ตรวจ peer, key, proposal และ tunnel state ให้ขึ้น",
  ]),
  makeLab(
    "ospf",
    "OSPF Multi-Area",
    "Professional",
    "Hard",
    60,
    "Build a converged link-state routed topology across one or more OSPF areas.",
    ["Form at least one FULL OSPF adjacency", "Install a learned OSPF route from the synchronized LSDB"],
  ),
  makeLab(
    "high-availability",
    "Gateway High Availability",
    "Professional",
    "Hard",
    55,
    "Provide a resilient virtual gateway with priority, preempt and link tracking.",
    [
      "Configure at least two members in the same HSRP, VRRP or failover group",
      "Elect one active/master and one standby/backup member",
    ],
  ),
  makeLab(
    "network-operations",
    "NOC Monitoring and Incident",
    "Professional",
    "Hard",
    50,
    "Observe real topology metrics and investigate a generated incident.",
    [
      "Enable monitoring and collect interface metrics",
      "Detect a fault and create evidence-backed alert or incident data",
    ],
  ),
  makeLab(
    "troubleshooting",
    "Troubleshooting Sandbox",
    "Professional",
    "Hard",
    45,
    "Use a layered workflow to identify a hidden network fault.",
    [
      "Detect a Layer 1 through security symptom from live state",
      "Produce evidence and a recommended next diagnostic action",
    ],
  ),
  makeLab("nas-sharing", "NAS File Sharing", "Specialist", "ปานกลาง", 40, "ให้ผู้ใช้เข้าถึง NAS อย่างปลอดภัย", [
    "กำหนด IP และ gateway ให้ NAS",
    "เปิด file service และทดสอบ client",
  ]),
  makeLab(
    "cloud-networking",
    "Vendor-neutral Cloud Networking",
    "Specialist",
    "Hard",
    55,
    "Build public and private cloud subnets with real route-table and security-policy decisions.",
    [
      "Give a public VM Internet access through an Internet Gateway",
      "Give a private VM outbound Internet access through NAT without direct public exposure",
      "Enforce stateful Security Group and ordered stateless Network ACL rules",
    ],
  ),
];
