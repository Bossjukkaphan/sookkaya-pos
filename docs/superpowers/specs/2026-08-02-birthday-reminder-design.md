# เตือนวันเกิดลูกค้า 2 ทาง — กลุ่มไลน์ทีมร้าน + กระดิ่งในแอป

**เป้าหมาย:** เช้าวันไหนมีลูกค้าวันเกิด ทีมร้านต้องเห็นโดยไม่ต้องเปิด /crm เอง — เด้งเข้ากลุ่มไลน์ทีมร้าน (กลุ่มเดียวกับแจ้งคิวจอง) และขึ้นตัวเลข/แถบบนกระดิ่งแจ้งเตือนของแอป

**อนุมัติ:** 2026-08-02 · ต่อยอด [2026-08-01-crm-line-send-design.md](2026-08-01-crm-line-send-design.md)

## กติกานับ "วันเกิดวันนี้" (ต้องตรงกับ /crm เป๊ะ)

ลูกค้าที่ (1) วันเกิดเดือน-วันตรงกับวันนี้เวลาไทย (`todayInShopTz`) (2) มีเบอร์ (3) ยังไม่ถูกบันทึกผลติดต่อ `list_type=birthday` ภายใน 30 วัน — บันทึกผล/ส่งไลน์แล้วหายจากทุกที่พร้อมกัน

helper กลาง `birthdayTodayCustomers(supabase, todayIso)` ใน `src/lib/crm-birthday.ts` (รับ client เป็นพารามิเตอร์ ใช้ได้ทั้ง layout สิทธิ์พนักงาน และ cron สิทธิ์ service) · ส่วน pure (เทียบเดือน-วัน) ใช้ `daysUntilBirthday === 0` ของเดิม

## ทาง 1 — กลุ่มไลน์ทีมร้าน (Vercel Cron)

- `vercel.json` เพิ่ม `crons`: `0 1 * * *` UTC = 08:00 ไทย (แผน Hobby อาจเลื่อนได้ภายใน 1 ชม.)
- route ใหม่ `src/app/api/cron/birthday-reminder/route.ts` (GET):
  - ตรวจ `Authorization: Bearer ${CRON_SECRET}` — ไม่ตรง → 401 (Vercel ใส่ header นี้ให้อัตโนมัติเมื่อมี env `CRON_SECRET`)
  - ใช้ `createServiceClient()` + `birthdayTodayCustomers` → ไม่มีใคร → 200 จบเงียบ ไม่ส่งอะไร
  - มี → `pushAssistantMessage(LINE_ASSISTANT_QUEUE_GROUP_ID, msgBirthdayReminder(names))` (ท่อเดิมของแจ้งคิวจอง — env ตั้งครบแล้ว, group id จับแล้ว)
- ข้อความ `msgBirthdayReminder(names: string[])` ใน `src/lib/crm.ts` (pure, TDD):
  `🎂 วันนี้วันเกิดลูกค้า N คน: คุณก · คุณข\nเปิดเมนู "ดูแลลูกค้า" เพื่อส่งคำอวยพรได้เลย → https://sookkaya-pos.vercel.app/crm`
- env ใหม่ `CRON_SECRET` (random string)

## ทาง 2 — กระดิ่งในแอป

- `(app)/layout.tsx` เรียก `birthdayTodayCustomers` เพิ่ม → ส่ง `initialBirthdayCount` เข้า `QueueNotificationsProvider`
- context เพิ่ม `birthdayCount` · ป้ายตัวเลขกระดิ่ง = pending + birthdayCount
- กล่องกระดิ่ง: มีวันเกิด → แถบบนสุด "🎂 วันเกิดวันนี้ N คน — แตะเพื่ออวยพร" ลิงก์ /crm
- ไม่มีเสียง/toast/realtime สำหรับวันเกิด — ตัวเลขสดตอนโหลด/เปลี่ยนหน้า/router.refresh พอ (บันทึกผลใน /crm มี refresh อยู่แล้ว)

## ทดสอบ

- unit: `msgBirthdayReminder` (1 คน / หลายคน) · กติกาเดือน-วันผ่าน `daysUntilBirthday` มีเทสต์เดิมแล้ว
- E2E: ตั้งวันเกิดลูกค้าทดสอบเป็นวันนี้ → เห็นบนกระดิ่ง + ยิง cron route ด้วย secret จริง → ข้อความเข้ากลุ่มทีมร้าน → คืนค่า

## ไม่ทำ

ส่งคำอวยพรหาลูกค้าอัตโนมัติ (ยังเป็น manual ผ่านปุ่มใน /crm) · เตือนซ้ำระหว่างวัน · เตือนวันเกิดล่วงหน้า
