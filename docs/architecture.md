# Architecture

## Layers

- **UI Layer** — App Router pages ประกอบ client islands เฉพาะส่วนที่ต้องใช้ event handler, browser API หรือ XYFlow
- **State Layer** — `topology-store`, `history-store`, `project-store` และ `workspace-store` แยก ownership ชัดเจนและอ่านผ่าน selector
- **Persistence Layer** — `ProjectRepository` เป็น interface; `IndexedDbProjectRepository` เป็น implementation ปัจจุบัน ทำให้เพิ่ม Supabase/PostgreSQL adapter ภายหลังได้
- **Validation Layer** — Zod schemas ตรวจทุก record ที่นำเข้า อ่านจาก IndexedDB หรือผ่าน registry/service boundary
- **Simulation Layer** — Engine, event bus และ worker messages ไม่ import React จึงทดสอบและย้ายไป Web Worker ได้อิสระ

## Data flow

`UI → domain action → validated store state → project snapshot → repository → IndexedDB`

การโหลดทำย้อนกลับและ validate ก่อนอัปเดต store ทุกครั้ง Autosave debounce 1.5 วินาทีหลัง topology เปลี่ยนเพื่อลด IndexedDB writes ขณะลาก node

## Extensibility

Device Registry เป็น factory ของ model และ default configuration ส่วน Protocol Registry/Lab Validator จะใช้แนวเดียวกัน Simulation Worker รับเฉพาะ typed serializable messages จึงไม่ผูกกับ DOM

## Performance

Custom node ใช้ `memo`, store ใช้ selectors, Monaco/xterm จะโหลดแบบ dynamic เมื่อเปิด panel, canvas ไม่สร้าง snapshot ทุก pixel ระหว่างลาก และ engine แยกพร้อมย้ายไป worker รองรับเป้าหมาย 100 nodes/200 edges
