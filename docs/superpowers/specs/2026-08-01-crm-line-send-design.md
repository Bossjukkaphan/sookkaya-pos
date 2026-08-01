# ปุ่ม "ส่งไลน์" ในศูนย์ดูแลลูกค้า /crm

**เป้าหมาย:** แถวในลิสต์ /crm ของลูกค้าที่เคยผูกไลน์ (`line_accounts`) ส่งข้อความผ่าน OA ลูกค้า (@948kjjjb) ได้จากในระบบเลย — แทนการคัดลอกไปวางมือ · คนยังเป็นคนกด เห็น/แก้ข้อความก่อนส่งทุกครั้ง

**ที่มา:** ต่อยอด [2026-07-26-crm-care-hub-design.md](2026-07-26-crm-care-hub-design.md) ซึ่งจงใจเว้น "ส่งอัตโนมัติ" ไว้ · ตัดสินใจ 2026-08-01: ทำปุ่มส่งแบบ manual ก่อน (ไม่ทำ cron อวยพรวันเกิดรอบนี้)

## พฤติกรรม

1. ทั้ง 3 ลิสต์ (วันเกิด / หายไปนาน / ลูกค้าใหม่): แถวของลูกค้าที่มีแถวใน `line_accounts` มีปุ่ม **💬 ส่งไลน์** เพิ่มข้างปุ่มโทร/คัดลอกเดิม · ลูกค้าไม่ผูกไลน์ = หน้าตาเดิมทุกอย่าง
2. กดปุ่ม → dialog: textarea ใส่ข้อความเทมเพลตตามประเภทลิสต์ (จาก `msgBirthday`/`msgWinback`/`msgNewFollow` ใน `src/lib/crm.ts` — ตัวเดียวกับปุ่มคัดลอก ไม่เขียนใหม่) ใส่ชื่อลูกค้าให้แล้ว **แก้ได้** → ปุ่ม "ยืนยันส่ง"
3. ส่งสำเร็จ → บันทึก `crm_contacts` result `contacted` (note ระบุว่าส่งไลน์) อัตโนมัติ → แถวหายจากลิสต์ทันที กติกา cooldown 30 วันเดิมทำงานต่อ
4. ส่งไม่สำเร็จ → toast แจ้ง · แถวอยู่ที่เดิม · ไม่บันทึกอะไร

## เทคนิค

- **หน้า /crm (server):** ดึง `line_accounts` เพิ่ม 1 query (`line_user_id, customer_id, created_at`) → map เข้า `CrmRow` เป็น `lineUserId?: string` · ลูกค้าผูกหลายไลน์ → ใช้แถว `created_at` ล่าสุด
- **server action ใหม่** `sendCrmLineMessage(customerId, listType, lineUserId, text)` ใน `crm-actions.ts`:
  - ตรวจ login (`getMyProfile`) — แบบเดียวกับ `saveCrmContact`
  - ตรวจว่า `lineUserId` ผูกกับ `customerId` จริงใน `line_accounts` (กันยิงหาคนอื่น)
  - ตรวจข้อความ: trim แล้วไม่ว่าง และ ≤ 500 ตัวอักษร
  - ส่งผ่าน `pushLineMessage` เดิม (`src/lib/line.ts`, OA ลูกค้า — token เดิม ไม่แตะ Slip2go)
  - สำเร็จ → insert `crm_contacts` (result `contacted`, note `"ส่งไลน์"`) + revalidate เหมือน `saveCrmContact` · pushไม่สำเร็จ → `{ ok: false }` ไม่ insert
- **client (`crm-list.tsx`):** ปุ่ม + Dialog (shadcn) + textarea · ระหว่างส่ง disable ปุ่มกันกดซ้ำ
- **ไม่มี migration** — ใช้ตารางเดิมทั้งหมด
- **โควตา:** กิน 1 ข้อความ/ครั้งจาก 15,000/เดือน · เพดานลิสต์ 30 คน/ประเภท ไม่มีทางชนโควตา

## ทดสอบ

- unit (vitest, mock supabase/fetch): ปฏิเสธเมื่อ lineUserId ไม่ผูกกับ customer · ข้อความว่าง · ยาวเกิน 500 · push ล้มเหลว → ไม่ insert `crm_contacts`
- E2E มือ: ผูกไลน์ Boss กับลูกค้าทดสอบ → ส่งจาก /crm → ข้อความเด้งในไลน์ → แถวหาย → ประวัติขึ้นในโปรไฟล์ลูกค้า

## ไม่ทำรอบนี้

ส่งอัตโนมัติเช้าวันเกิด (รอปุ่มพิสูจน์ตัวเองก่อน) · รูป/Flex message · ส่งหาคนไม่ผูกไลน์ · เลือกหลายคนส่งทีเดียว
