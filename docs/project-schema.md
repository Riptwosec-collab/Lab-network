# Project JSON Schema

Project ใช้ `schemaVersion` สำหรับ migration ของ persisted/imported data และใช้ `version` สำหรับเวอร์ชันเนื้อหาโปรเจกต์

```json
{
  "schemaVersion": 3,
  "project": { "id": "...", "name": "...", "canvasSettings": {}, "simulationSettings": {} },
  "devices": [],
  "connections": [],
  "groups": [],
  "configurationState": { "devices": {}, "auditLog": [] },
  "settings": { "canvas": {}, "simulation": {} }
}
```

Import pipeline ตรวจ MIME/extension, จำกัด 5 MB, parse ใน `try/catch`, validate ผ่าน `projectExportSchema` แล้วค่อยประกอบเป็น `NetLabProject` หากล้มเหลว current project จะไม่ถูกแก้ไข

Network interface รองรับ IPv4 fields แบบ optional เพื่อคง backward compatibility และเพิ่ม metadata ของ port เช่น `medium`, `portMode`, `nativeVlan`, `allowedVlans`, `poeState`, counters และ rates แบบ additive.

```json
{
  "ipv4": "192.168.1.10",
  "prefixLength": 24,
  "subnetMask": "255.255.255.0",
  "defaultGateway": "192.168.1.1"
}
```

`subnetMask` คำนวณจาก prefix ตอนบันทึก ส่วน ARP cache และ Ping result เป็น runtime state จึงไม่ถูก persist ใน project JSON

Schema v2 เพิ่ม metadata ของ cable (`mtu`, `protocol`, `direction`, `pathStyle`) และรองรับ cable/interface types ที่ละเอียดขึ้น

Schema v3 เพิ่ม `configurationState` ซึ่งเก็บ running/startup configuration, ผล validation, revision history และ audit log แยกตามอุปกรณ์ โดย migration จะสร้างค่าเริ่มต้นจาก hostname/interface configuration เดิมเพื่อไม่ให้ข้อมูล v1/v2 สูญหาย `src/services/project-migrations.ts` ทำ migration แบบ pure function ก่อน Zod validation และ Dexie v3 อัปเดตทั้ง projects กับ projectVersions ในที่เดิม

เมื่อเพิ่ม schema version ให้เพิ่ม migration แบบ pure function จาก N ไป N+1 และเก็บ fixture ของเวอร์ชันเดิมไว้ทดสอบ ห้าม mutate raw data ระหว่าง migration
