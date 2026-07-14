# Project JSON Schema

Project ใช้ `schemaVersion` สำหรับ migration ของ persisted/imported data และใช้ `version` สำหรับเวอร์ชันเนื้อหาโปรเจกต์

```json
{
  "schemaVersion": 1,
  "project": { "id": "...", "name": "...", "canvasSettings": {}, "simulationSettings": {} },
  "devices": [],
  "connections": [],
  "groups": [],
  "settings": { "canvas": {}, "simulation": {} }
}
```

Import pipeline ตรวจ MIME/extension, จำกัด 5 MB, parse ใน `try/catch`, validate ผ่าน `projectExportSchema` แล้วค่อยประกอบเป็น `NetLabProject` หากล้มเหลว current project จะไม่ถูกแก้ไข

Network interface รองรับ IPv4 fields แบบ optional เพื่อคง backward compatibility ของ schema version 1:

```json
{
  "ipv4": "192.168.1.10",
  "prefixLength": 24,
  "subnetMask": "255.255.255.0",
  "defaultGateway": "192.168.1.1"
}
```

`subnetMask` คำนวณจาก prefix ตอนบันทึก ส่วน ARP cache และ Ping result เป็น runtime state จึงไม่ถูก persist ใน project JSON

เมื่อเพิ่ม schema version ให้เพิ่ม migration แบบ pure function จาก N ไป N+1 และเก็บ fixture ของเวอร์ชันเดิมไว้ทดสอบ ห้าม mutate raw data ระหว่าง migration
