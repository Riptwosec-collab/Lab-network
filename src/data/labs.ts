import type { LabDefinition, LabRuleType, LabVerificationRule } from "@/types/lab";

const ruleMatrix: Readonly<Record<string, readonly LabRuleType[]>> = {
  "ip-ping": ["ip-address", "reachability"],
  dhcp: ["dhcp-lease", "dhcp-lease"],
  dns: ["dns-resolution", "dns-resolution"],
  "nat-acl": ["firewall-policy", "firewall-policy"],
  vlan: ["vlan", "vlan"],
  "inter-vlan": ["route", "reachability"],
  "guest-wifi": ["wifi-mapping", "wifi-mapping"],
  "firewall-policy": ["firewall-policy", "firewall-policy"],
  vpn: ["route", "reachability"],
  ospf: ["route", "route"],
  "static-routing": ["route", "reachability"],
  "high-availability": ["device-exists", "interface-state"],
  "network-operations": ["interface-state", "packet-drop"],
  troubleshooting: ["packet-drop", "reachability"],
  "nas-sharing": ["ip-address", "nas-permission"],
  "cloud-networking": ["cloud-route", "cloud-route", "packet-drop"],
  "hybrid-cloud": ["cloud-route", "reachability", "firewall-policy"],
};

function parametersFor(labId: string, index: number): Readonly<Record<string, unknown>> | undefined {
  if (labId === "ip-ping" && index === 0) return { minimumDevices: 2 };
  if (labId === "dhcp") return { mode: index === 0 ? "pool" : "lease" };
  if (labId === "dns") return { mode: index === 0 ? "server" : "query" };
  if (labId === "vlan") return index === 0 ? { vlanIds: [10, 20] } : { accessVlans: [10, 20] };
  if (labId === "inter-vlan" && index === 0) return { mode: "inter-vlan" };
  if (labId === "static-routing" && index === 0) return { source: "static" };
  if (labId === "ospf") return { source: "ospf", mode: index === 0 ? "adjacency" : "route" };
  if (labId === "guest-wifi") return { mode: index === 0 ? "ssid" : "isolation" };
  if (labId === "firewall-policy" || labId === "nat-acl") return { mode: index === 0 ? "policy" : "assignment" };
  if (labId === "cloud-networking") return { mode: index === 0 ? "public" : index === 1 ? "private" : "policy" };
  if (labId === "hybrid-cloud") return { mode: index === 0 ? "private" : index === 1 ? "hybrid" : "policy" };
  return undefined;
}

function verificationFor(labId: string, taskIds: readonly string[]): readonly LabVerificationRule[] {
  const types = ruleMatrix[labId] ?? taskIds.map(() => "device-exists" as const);
  return taskIds.map((taskId, index) => ({
    id: `${labId}-rule-${index + 1}`,
    taskId,
    type: types[index] ?? "device-exists",
    description: `ตรวจ network state สำหรับภารกิจที่ ${index + 1}`,
    parameters: parametersFor(labId, index),
    points: Math.round(100 / taskIds.length),
  }));
}

const makeLab = (
  id: string,
  title: string,
  level: string,
  difficulty: string,
  estimatedMinutes: number,
  scenario: string,
  objectives: readonly string[],
): LabDefinition => {
  const tasks = objectives.map((objective, index) => ({
    id: `${id}-task-${index + 1}`,
    title: `ภารกิจ ${index + 1}`,
    description: objective,
    validatorId: `${id}-rule-${index + 1}`,
  }));
  return {
    id,
    title,
    level,
    difficulty,
    estimatedMinutes,
    objectives,
    scenario,
    ipAddressTable: [
      { device: "Gateway", interfaceName: "LAN", address: "192.168.1.1/24" },
      { device: "Client", interfaceName: "Ethernet", address: "192.168.1.100/24", gateway: "192.168.1.1" },
      { device: "Service", interfaceName: "Ethernet", address: "192.168.1.10/24", gateway: "192.168.1.1" },
    ],
    tasks,
    requirements: objectives.map((objective) => `Network state ต้องยืนยันได้ว่า: ${objective}`),
    verification: verificationFor(
      id,
      tasks.map((task) => task.id),
    ),
    hints: [
      "ตรวจสถานะ interface และ link ก่อนเริ่มวิเคราะห์ Layer 3",
      "เปรียบเทียบ addressing, VLAN, route และ policy กับตารางที่โจทย์กำหนด",
      "ใช้ packet simulation เพื่อหาจุดที่การตัดสินใจไม่ตรง expected behavior",
    ],
    partialSolution: {
      summary: "แนวทางเริ่มต้นโดยยังไม่เปิดคำตอบทั้งหมด",
      steps: [`เริ่มตรวจจากภารกิจแรก: ${objectives[0] ?? "ตรวจ topology"}`, "ยืนยันสถานะจริงทีละ layer"],
    },
    solution: {
      summary: `เฉลยเต็มสำหรับ ${title}`,
      steps: objectives.map((objective) => `ตั้งค่าและยืนยันจาก network state: ${objective}`),
    },
    explanation: `Lab ${title} ให้คะแนนจาก topology และ runtime configuration จริง ไม่ใช้ command history เป็นหลักฐานเพียงอย่างเดียว`,
    commonMistakes: [
      "แก้ configuration แต่ไม่ตรวจว่า runtime state ถูก apply แล้ว",
      "ทดสอบเฉพาะ traffic ที่ควรผ่านและไม่ทดสอบ traffic ที่ควรถูกปฏิเสธ",
      "เปิดเฉลยก่อนเก็บหลักฐานจาก topology และ packet result",
    ],
    scoreRules: {
      fullScore: 100,
      hintPenalty: 5,
      partialSolutionPenalty: 20,
      fullSolutionPenalty: 50,
      timeBonus: 5,
      noResetBonus: 5,
      targetSeconds: estimatedMinutes * 60,
    },
    startingTopologyId: "demo-topology",
  };
};

export const labs: readonly LabDefinition[] = [
  makeLab("ip-ping", "IP Address and Ping", "Beginner", "ง่าย", 20, "เชื่อม PC สองเครื่องและทดสอบการสื่อสาร", [
    "กำหนด IPv4 ให้อุปกรณ์อย่างน้อยสองเครื่อง",
    "Ping ระหว่าง endpoint ให้สำเร็จ",
  ]),
  makeLab("dhcp", "DHCP Network", "Foundation", "ง่าย", 30, "ให้ client รับ IP อัตโนมัติจาก DHCP server", [
    "สร้างและเปิด DHCP pool",
    "ยืนยันว่า client ได้รับ lease ผ่าน DORA",
  ]),
  makeLab("vlan", "VLAN Basics", "Intermediate", "ปานกลาง", 35, "แบ่งแผนกเป็น VLAN บนสวิตช์เดียว", [
    "สร้าง VLAN 10 และ VLAN 20",
    "กำหนด access port ให้ครบทั้งสอง VLAN",
  ]),
  makeLab("inter-vlan", "Inter-VLAN Routing", "Advanced", "ปานกลาง", 45, "ให้ VLAN ต่างกันสื่อสารผ่าน Layer 3 device", [
    "เปิด IP routing และสร้าง SVI อย่างน้อยสอง VLAN",
    "ทดสอบ reachability ข้าม VLAN",
  ]),
  makeLab("guest-wifi", "Guest Wi-Fi", "Professional", "ยาก", 50, "แยก guest wireless ออกจาก LAN ภายใน", [
    "สร้างและเปิด SSID สำหรับ guest",
    "กำหนด VLAN หรือ client isolation สำหรับ guest",
  ]),
  makeLab("nas-sharing", "NAS File Sharing", "Specialist", "ปานกลาง", 40, "ให้ผู้ใช้เข้าถึง NAS อย่างปลอดภัย", [
    "กำหนด IP และ gateway ให้ NAS",
    "เปิด share, identity และยืนยัน permission จาก client",
  ]),
  makeLab(
    "static-routing",
    "Static Routing",
    "Intermediate",
    "ปานกลาง",
    35,
    "เชื่อมเครือข่ายปลายทางด้วย static route",
    ["เพิ่ม active static route พร้อม next hop ที่ถูกต้อง", "ยืนยัน reachability ไปยังเครือข่ายปลายทาง"],
  ),
  makeLab(
    "dns",
    "DNS Resolution",
    "Intermediate",
    "ปานกลาง",
    30,
    "สร้าง authoritative zone และให้ client resolve ชื่อ",
    ["เปิด DNS และสร้าง A record", "ตั้ง DNS server ที่ client และ query ให้สำเร็จ"],
  ),
  makeLab(
    "firewall-policy",
    "Stateful Firewall Policy",
    "Professional",
    "ยาก",
    50,
    "สร้าง security zones และ first-match policy",
    ["ผูก interface กับ trust และ untrust zones", "เพิ่ม ordered security policy และตรวจ implicit deny"],
  ),
  makeLab(
    "hybrid-cloud",
    "Hybrid Cloud Access",
    "Expert",
    "ยาก",
    60,
    "เชื่อม private cloud workload กับเครือข่ายองค์กรอย่างปลอดภัย",
    [
      "สร้าง private cloud route ผ่าน NAT หรือ hybrid gateway",
      "ยืนยัน private reachability ระหว่าง on-premises และ cloud",
      "บังคับใช้ policy ที่อนุญาตเฉพาะ service ที่กำหนด",
    ],
  ),
  makeLab("nat-acl", "Edge NAT and ACL", "Advanced", "ยาก", 45, "ควบคุม routed packet ด้วย NAT/PAT และ ordered ACL", [
    "สร้าง active NAT หรือ PAT rule",
    "สร้าง ACL และผูก inbound หรือ outbound กับ interface",
  ]),
  makeLab("vpn", "Site-to-Site VPN", "Professional", "ยาก", 60, "เชื่อม protected networks ผ่าน IPSec peers", [
    "สร้าง tunnel และ protected networks ทั้งสองฝั่ง",
    "ยืนยัน peer, key, proposal และ tunnel state",
  ]),
  makeLab("ospf", "OSPF Multi-Area", "Professional", "ยาก", 60, "สร้าง link-state routing ที่ converged", [
    "สร้าง FULL OSPF adjacency",
    "ติดตั้ง learned OSPF route จาก LSDB",
  ]),
  makeLab(
    "high-availability",
    "Gateway High Availability",
    "Professional",
    "ยาก",
    55,
    "สร้าง virtual gateway ที่มี active และ standby",
    ["กำหนดสมาชิกอย่างน้อยสองตัวใน HA group เดียวกัน", "เลือก active/master และ standby/backup สำเร็จ"],
  ),
  makeLab(
    "network-operations",
    "NOC Monitoring and Incident",
    "Professional",
    "ยาก",
    50,
    "เฝ้าระวัง topology และสืบสวน incident",
    ["เปิด monitoring และเก็บ interface metrics", "ตรวจ fault และสร้าง alert หรือ incident ที่มีหลักฐาน"],
  ),
  makeLab(
    "troubleshooting",
    "Troubleshooting Sandbox",
    "Professional",
    "ยาก",
    45,
    "ใช้ layered workflow หา hidden network fault",
    ["ตรวจพบอาการตั้งแต่ Layer 1 ถึง security", "สรุปหลักฐานและ next diagnostic action"],
  ),
  makeLab(
    "cloud-networking",
    "Vendor-neutral Cloud Networking",
    "Specialist",
    "ยาก",
    55,
    "สร้าง public/private cloud subnets ด้วย route และ policy จริง",
    [
      "ให้ public VM ออก Internet ผ่าน Internet Gateway",
      "ให้ private VM ออก Internet ผ่าน NAT โดยไม่มี public exposure",
      "ใช้ stateful Security Group และ ordered stateless Network ACL",
    ],
  ),
];
