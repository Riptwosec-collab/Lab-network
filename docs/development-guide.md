# Development Guide

ใช้ App Router และเก็บ Server Component เป็นค่าเริ่มต้น เพิ่ม `"use client"` เฉพาะ interactive boundary ใช้ theme tokens แทนสี foundation แบบ hard-code และใช้ shadcn-style primitives ก่อนสร้าง control ใหม่

ก่อนส่งงานให้รัน:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

External/persisted data ต้องผ่าน Zod, async flow ต้องมี loading/success/error state, error ที่แสดงผู้ใช้ต้องอ่านง่าย และ log รายละเอียดเฉพาะ development การเปลี่ยน domain behavior ต้องมี unit test ส่วน user journey สำคัญให้เพิ่ม Playwright test

Commit ใช้ Conventional Commit และ pre-commit hook จะ format/lint staged files พร้อมรัน typecheck และ unit tests
