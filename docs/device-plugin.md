# Device Plugin Guide

อุปกรณ์ใหม่ถูกเพิ่มผ่าน `DeviceDefinition` และ `DeviceRegistry` ใน `src/data/device-catalog.ts`

1. กำหนด `id`/`type` ที่ไม่ซ้ำ, category, vendor-neutral family/model, display name และ generic Lucide icon
2. ระบุ `diagramSymbol`, layers, supported protocols, Thai/English searchable keywords, default interfaces/configuration/services/capabilities/inspector tabs
3. เรียก `deviceRegistry.register(definition)` จาก bootstrap ของ catalog
4. เพิ่ม custom inspector tab เฉพาะเมื่อ configuration ต้องมี UI ใหม่
5. เพิ่ม schema/test fixture และยืนยันว่า factory สร้าง model ที่ผ่าน `deviceSchema`

ห้ามเพิ่ม vendor artwork หรือ switch ขนาดใหญ่ตามชนิดอุปกรณ์; presentation ควรอ่าน metadata จาก registry. Interface และ capability differences ต้องเลือกจาก profile ใน registry แทนการใช้ if/else ตาม model.
