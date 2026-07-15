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
  makeLab("nas-sharing", "NAS File Sharing", "Specialist", "ปานกลาง", 40, "ให้ผู้ใช้เข้าถึง NAS อย่างปลอดภัย", [
    "กำหนด IP และ gateway ให้ NAS",
    "เปิด file service และทดสอบ client",
  ]),
];
