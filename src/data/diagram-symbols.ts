import type { DiagramSymbolDefinition } from "@/types/network";

const definition = (
  id: string,
  label: string,
  description: string,
  icon: string,
  category: DiagramSymbolDefinition["category"],
): DiagramSymbolDefinition => ({ id, label, description, icon, category });

export const diagramSymbols: readonly DiagramSymbolDefinition[] = [
  definition("router", "Router", "วงกลมมีลูกศรไขว้สำหรับอุปกรณ์กำหนดเส้นทาง", "Router", "device"),
  definition("switch", "Switch", "สี่เหลี่ยมมีลูกศรหลายทิศสำหรับ switching", "Network", "device"),
  definition("firewall", "Firewall", "โล่สำหรับ security policy boundary", "ShieldCheck", "device"),
  definition("cloud", "Internet / Cloud", "เมฆสำหรับ WAN, Internet หรือ cloud service", "Cloud", "device"),
  definition("access-point", "Access Point", "เสาอากาศสำหรับ Wi-Fi access", "Wifi", "device"),
  definition("server", "Server", "กล่อง server สำหรับ service workload", "Server", "device"),
  definition("desktop", "Desktop PC", "หน้าจอสำหรับ endpoint", "Monitor", "device"),
  definition("laptop", "Laptop", "โน้ตบุ๊กสำหรับ mobile endpoint", "Laptop", "device"),
  definition("phone", "IP Phone", "โทรศัพท์สำหรับ voice endpoint", "Phone", "device"),
  definition("camera", "CCTV", "กล้องสำหรับ surveillance endpoint", "Camera", "device"),
  definition("database", "Database", "ฐานข้อมูลหรือ persistent data service", "Database", "device"),
  definition("physical", "Physical link", "เส้นทึบสำหรับสาย physical", "Cable", "link"),
  definition("logical", "Logical link", "เส้นประสำหรับ logical connection", "Waypoints", "link"),
  definition("wireless", "Wireless link", "เส้นคลื่นสำหรับ wireless connection", "Radio", "link"),
  definition("tunnel", "Encrypted tunnel", "เส้น tunnel สำหรับ VPN, GRE หรือ IPSec", "KeyRound", "link"),
  definition("aggregated", "Aggregated link", "เส้นคู่สำหรับ trunk หรือ link aggregation", "GitFork", "link"),
  definition("lan", "LAN Zone", "ขอบเขต LAN ภายใน", "LayoutPanelTop", "zone"),
  definition("wan", "WAN Zone", "ขอบเขต WAN หรือ provider", "Globe2", "zone"),
  definition("dmz", "DMZ", "ขอบเขต service ที่คั่นด้วย security policy", "Shield", "zone"),
  definition("management", "Management Zone", "ขอบเขต management plane", "Settings", "zone"),
  definition("wireless-zone", "Wireless Zone", "ขอบเขต wireless users", "RadioTower", "zone"),
  definition("datacenter", "Data Center Zone", "ขอบเขต workload และ infrastructure", "Boxes", "zone"),
];
