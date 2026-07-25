# แจ้งเตือนไลน์ฝั่งร้านผ่าน OA ผู้ช่วย (Sookkaya Assistant)

**เป้าหมาย:** เมื่อมีคำขอจองใหม่จากไลน์ หรือลูกค้ากดยกเลิกการจอง → ส่งข้อความแจ้งเข้า**กลุ่มไลน์ทีมร้าน (กลุ่ม B)** ผ่าน OA ผู้ช่วย — แยกขาดจาก OA ลูกค้า (@948kjjjb) และไม่แตะระบบสรุปยอดเดิมที่ส่งเข้ากลุ่ม A

## สถาปัตยกรรม

1. **util ส่งข้อความ OA ผู้ช่วย** — `src/lib/line-assistant.ts` (server-only): `pushAssistantMessage(to, text)` แบบเดียวกับ `pushLineMessage` แต่ใช้ env `LINE_ASSISTANT_CHANNEL_TOKEN` · คืน boolean ไม่ throw · ถ้า env ไม่ครบ → คืน false เงียบๆ (ฟีเจอร์ dormant ได้)
2. **webhook จับ ID กลุ่ม** — `src/app/api/line-assistant/webhook/route.ts` (POST): ตรวจลายเซ็น `x-line-signature` (HMAC-SHA256 ด้วย env `LINE_ASSISTANT_CHANNEL_SECRET`) · เมื่อได้ event ประเภท join/message จาก group → upsert ตาราง `line_groups` (group_id PK, last_seen_at, note null) · ตอบ 200 เสมอ · ลายเซ็นไม่ผ่าน → 401 ไม่บันทึกอะไร · **ไม่ตอบข้อความกลับ** (OA ผู้ช่วยเป็นฝ่ายส่งอย่างเดียว)
3. **ตาราง `line_groups`** — RLS เปิด ไม่มี policy + revoke anon/authenticated (แบบ line_accounts) · เขียนผ่าน service client ใน webhook เท่านั้น
4. **จุดส่งแจ้งเตือน** — ต่อท้าย 2 actions ใน `src/app/book/actions.ts`:
   - `createBookingRequest` สำเร็จ → `🔔 คิวจองใหม่ · <ชื่อ> · <วัน> <เวลา> · <เมนู(รวม N ท่าน)> · โทร <เบอร์>`
   - `cancelBooking` สำเร็จ → `❌ ลูกค้ายกเลิกคิว · <ชื่อ> · <วัน> <เวลา> · <เมนู>`
   - ส่งไปที่ env `LINE_ASSISTANT_QUEUE_GROUP_ID` · ล้มเหลว/env ว่าง → ข้ามเงียบๆ ไม่กระทบการจอง
5. **env ใหม่ 3 ตัว:** `LINE_ASSISTANT_CHANNEL_TOKEN` (ลับ — เจ้าของร้านใส่เอง), `LINE_ASSISTANT_CHANNEL_SECRET` (ลับ — ใส่เอง), `LINE_ASSISTANT_QUEUE_GROUP_ID` (ไม่ลับ — จับจาก webhook แล้วใส่)

## ขั้นตอนติดตั้ง (นอกโค้ด)

1. คอนโซล LINE: หา Messaging API channel ของ OA ผู้ช่วย → **เช็คก่อนว่ามี webhook URL เดิมผูกอยู่ไหม — ถ้ามี หยุดถามเจ้าของร้าน ห้ามทับ** → ถ้าว่าง ตั้งเป็น `https://sookkaya-pos.vercel.app/api/line-assistant/webhook` + เปิด Use webhook
2. เจ้าของร้านคัดลอก Channel access token + Channel secret → `vercel env add` เอง (ผมไม่แตะค่าลับ)
3. เจ้าของร้านเชิญ OA ผู้ช่วยเข้ากลุ่ม B → พิมพ์ 1 ข้อความ → อ่าน group_id จากตาราง `line_groups` → ใส่ env → redeploy → ทดสอบจองจริง

## ขอบเขต/ไม่ทำ

- ไม่แตะกลุ่ม A และระบบสรุปยอดเดิม · ไม่ตอบแชทอัตโนมัติ · ไม่แจ้งเหตุการณ์ที่ร้านทำเอง (รับ/ปฏิเสธ) · แจ้งเตือนใน POS ของเดิมคงอยู่ทั้งหมด

## ทดสอบ

- unit: ฟังก์ชันประกอบข้อความ 2 แบบ (vitest) · ตรวจลายเซ็น webhook (valid/invalid)
- E2E มือ: เชิญเข้ากลุ่มทดสอบ → จับ id → จองจริง → ข้อความเด้งในกลุ่ม → ยกเลิก → เด้ง
