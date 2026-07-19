import type { AcademyCourse, AcademyLevel, AcademyLesson } from "@/types/academy";

const courseTopics: readonly {
  level: AcademyLevel;
  titleTh: string;
  summary: string;
  topics: readonly string[];
}[] = [
  {
    level: "Beginner",
    titleTh: "เริ่มต้นระบบเครือข่าย",
    summary: "เข้าใจอุปกรณ์ โปรโตคอล และการสื่อสารพื้นฐานก่อนลงมือสร้าง topology",
    topics: ["Network Basics", "Devices", "OSI", "TCP/IP", "IPv4", "Gateway", "DNS", "DHCP", "ARP", "Ping"],
  },
  {
    level: "Foundation",
    titleTh: "ออกแบบเครือข่ายขนาดเล็ก",
    summary: "นำพื้นฐานมาประกอบเป็นเครือข่ายสำนักงานที่ใช้งานได้และปลอดภัย",
    topics: ["Small Office Design", "IP Planning", "Wi-Fi Basics", "NAS Basics", "Internet Gateway", "Firewall Basics"],
  },
  {
    level: "Intermediate",
    titleTh: "แบ่งส่วนและควบคุมทราฟฟิก",
    summary: "ออกแบบ VLAN, trunk, routing และ policy สำหรับเครือข่ายหลายกลุ่มผู้ใช้",
    topics: ["VLAN", "Trunk", "Inter-VLAN Routing", "ACL", "DHCP Relay", "Guest Network"],
  },
  {
    level: "Advanced",
    titleTh: "ระบบเครือข่ายองค์กรขั้นสูง",
    summary: "สร้างระบบสวิตชิ่ง เราท์ติ้ง ไร้สาย และความมั่นคงปลอดภัยที่ทนทาน",
    topics: ["STP", "EtherChannel", "Redundancy", "OSPF", "Enterprise Wireless", "Network Security"],
  },
  {
    level: "Professional",
    titleTh: "เครือข่ายหลายสาขาและการปฏิบัติการ",
    summary: "เชื่อมหลายไซต์ผ่าน WAN/VPN และดูแลระบบด้วย monitoring ที่ตรวจสอบได้",
    topics: ["Multi-site", "WAN", "Dual ISP", "VPN", "SD-WAN Concepts", "Monitoring"],
  },
  {
    level: "Specialist",
    titleTh: "โครงสร้างพื้นฐานเฉพาะทาง",
    summary: "เจาะลึก data center, storage, enterprise Wi-Fi และ cloud แบบ hybrid",
    topics: ["Data Center", "NAS", "Storage", "Enterprise Wi-Fi", "Cloud", "Hybrid Cloud"],
  },
  {
    level: "Expert",
    titleTh: "สถาปัตยกรรมระดับผู้เชี่ยวชาญ",
    summary: "ตัดสินใจเชิงสถาปัตยกรรมสำหรับระบบที่ปลอดภัย ทนทาน และสังเกตการณ์ได้",
    topics: [
      "Enterprise Architecture",
      "Zero Trust",
      "High Availability",
      "Disaster Recovery",
      "Automation",
      "Observability",
    ],
  },
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function relatedLabs(topic: string): readonly string[] {
  const value = topic.toLowerCase();
  if (value.includes("vlan") || value === "trunk") return ["vlan", "inter-vlan"];
  if (value.includes("dhcp")) return ["dhcp"];
  if (value.includes("dns")) return ["dns"];
  if (value.includes("firewall") || value.includes("security") || value.includes("zero trust"))
    return ["firewall-policy", "nat-acl"];
  if (value.includes("wi-fi") || value.includes("wireless") || value.includes("guest")) return ["guest-wifi"];
  if (value.includes("nas") || value.includes("storage")) return ["nas-sharing"];
  if (value.includes("cloud")) return ["cloud-networking"];
  if (value.includes("ospf")) return ["ospf"];
  if (value.includes("availability") || value.includes("redundancy")) return ["high-availability"];
  if (value.includes("monitor") || value.includes("observability")) return ["network-operations"];
  if (value.includes("vpn") || value.includes("wan") || value.includes("site")) return ["vpn"];
  return ["ip-ping"];
}

function makeLesson(topic: string, level: AcademyLevel, prerequisiteId?: string): AcademyLesson {
  const id = `${level.toLowerCase()}-${slugify(topic)}`;
  return {
    id,
    title: topic,
    titleTh: `บทเรียน ${topic}`,
    level,
    objectives: [
      `อธิบายหลักการและบทบาทของ ${topic} ได้อย่างถูกต้อง`,
      `วิเคราะห์ตำแหน่งของ ${topic} ใน packet flow และ topology จริงได้`,
      `เลือกแนวทางตั้งค่าและตรวจสอบ ${topic} ที่เหมาะกับสถานการณ์ได้`,
    ],
    prerequisites: prerequisiteId ? [prerequisiteId] : [],
    sections: [
      {
        id: `${id}-concept`,
        title: "แนวคิดหลัก",
        body: `${topic} เป็นองค์ประกอบสำคัญของระบบเครือข่าย บทนี้อธิบายหน้าที่ ขอบเขต และข้อมูลที่อุปกรณ์ใช้ตัดสินใจ โดยเชื่อมจากแนวคิดไปยังสถานะจริงใน topology`,
      },
      {
        id: `${id}-flow`,
        title: "ลำดับการทำงาน",
        body: `ติดตามการทำงานของ ${topic} ตั้งแต่ต้นทาง การประมวลผลแต่ละ hop จนถึงผลลัพธ์ปลายทาง พร้อมสังเกตตาราง โปรโตคอล และเงื่อนไขที่ทำให้ packet ถูกส่งต่อหรือถูกปฏิเสธ`,
      },
      {
        id: `${id}-verify`,
        title: "การออกแบบและตรวจสอบ",
        body: `เริ่มจากข้อกำหนด วางแผน addressing และ policy จากนั้นตรวจสถานะ interface ตารางควบคุม และผล simulation หลีกเลี่ยงการสรุปจากคำสั่งเพียงรายการเดียว`,
      },
    ],
    diagram: {
      title: `${topic} packet path`,
      nodes: ["Client", "Network", "Service"],
      flow: `Client → ${topic} decision → Service`,
    },
    example: `สำนักงานต้องเพิ่ม ${topic} โดยไม่กระทบผู้ใช้เดิม วิศวกรจึงบันทึก baseline ตั้งค่าในขอบเขตเล็ก ทดสอบ packet flow และเตรียม rollback ก่อนขยายผล`,
    interactiveDemo: `เปิด Demo Project แล้วใช้ Packets LIVE หรือเครื่องมือตรวจสอบที่เกี่ยวข้องเพื่อสังเกต ${topic} จาก engine state จริง`,
    glossary: [
      { term: topic, meaning: `แนวคิดหรือบริการ ${topic} ในบริบทของระบบเครือข่าย` },
      { term: "Control plane", meaning: "ตรรกะและข้อมูลที่ใช้ตัดสินใจว่าจะส่ง traffic อย่างไร" },
      { term: "Data plane", meaning: "การส่ง frame หรือ packet ตามผลการตัดสินใจ" },
    ],
    commonMistakes: [
      `ตั้งค่า ${topic} โดยไม่ตรวจ prerequisite และ addressing plan`,
      "ทดสอบเพียงกรณีที่ควรผ่าน แต่ไม่ทดสอบกรณีที่ควรถูกปฏิเสธ",
      "แก้หลายจุดพร้อมกันโดยไม่มี baseline หรือหลักฐานก่อนเปลี่ยนแปลง",
    ],
    quiz: [
      {
        id: `${id}-quiz-1`,
        prompt: `แนวทางใดเหมาะสมที่สุดเมื่อต้องนำ ${topic} ไปใช้ใน topology จริง?`,
        options: [
          "วางแผน ตรวจ prerequisite ตั้งค่าเป็นขั้น และยืนยันด้วยสถานะจริง",
          "คัดลอกคำสั่งจากระบบอื่นทั้งหมดโดยไม่ตรวจ topology",
          "ตรวจเฉพาะว่าอุปกรณ์เปิดอยู่ แล้วถือว่างานสำเร็จ",
          "ปิด monitoring เพื่อลดจำนวน alert ระหว่างทดสอบ",
        ],
        correctOption: 0,
        explanation: "การเปลี่ยนแปลงที่ตรวจสอบได้ต้องเริ่มจากข้อกำหนดและยืนยันผลจาก network state จริง",
      },
      {
        id: `${id}-quiz-2`,
        prompt: `หลักฐานใดมีน้ำหนักมากที่สุดในการยืนยันว่า ${topic} ทำงานถูกต้อง?`,
        options: [
          "ชื่อไฟล์ configuration",
          "ผล packet flow และตารางสถานะที่สอดคล้องกับ expected behavior",
          "จำนวนคำสั่งที่พิมพ์",
          "สีของไอคอนอุปกรณ์เพียงอย่างเดียว",
        ],
        correctOption: 1,
        explanation: "ผลการส่ง packet และสถานะจาก engine แสดงพฤติกรรมจริง ไม่ใช่เพียงเจตนาจาก configuration",
      },
    ],
    relatedLabIds: relatedLabs(topic),
    estimatedMinutes: level === "Beginner" ? 15 : level === "Expert" ? 35 : 25,
  };
}

let previousLessonId: string | undefined;
export const academyCourses: readonly AcademyCourse[] = courseTopics.map((course) => {
  const lessons = course.topics.map((topic) => {
    const lesson = makeLesson(topic, course.level, previousLessonId);
    previousLessonId = lesson.id;
    return lesson;
  });
  return {
    id: `course-${course.level.toLowerCase()}`,
    title: `${course.level} Network Course`,
    titleTh: course.titleTh,
    level: course.level,
    summary: course.summary,
    lessons,
  };
});

export const academyLessons: readonly AcademyLesson[] = academyCourses.flatMap((course) => course.lessons);
