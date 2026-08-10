# Speed Pass — ตัวเลขวัดจริง

เป้า: skeleton ภายใน ~100ms หลังกด · เนื้อหาจริง ~1s บนมือถือ 4G

## Baseline (ก่อนแก้ — วันที่วัด: 2026-08-09)

**หมายเหตุสำคัญ:** URL เว็บไซต์จริง (https://sookkaya-pos.vercel.app) ยิงไม่ถึงจากสภาพแวดล้อม sandbox นี้ — นโยบาย egress ของระบบบล็อกโฮสต์นั้น · ตัวเลข TTFB ที่วัดได้ (4ms) มาจากโปรกซี่ท้องถิ่น ไม่ใช่จากเว็บจริง ดังนั้น **ไม่สามารถใช้เป็น baseline เครือข่ายได้** · จะต้องวัดจากสภาพแวดล้อมที่มีสิทธิ์เข้าถึง (หรือโดยเจ้าของร้าน) ก่อน-หลังการ deploy เพื่อเปรียบเทียบผล

| หน้า | TTFB มัธยฐาน | หมายเหตุ |
|---|---|---|
| — | — | ไม่สามารถวัดได้จากสภาพแวดล้อมนี้ |

**Baseline โค้ด (นับจากการวิเคราะห์ source):**
- layout: auth.getUser → profiles → Promise.all(queue/birthday/expense) = 3 จังหวะ (~5 query)
- ไม่มี loading.tsx ในทุก route · Suspense มีแค่ commission/summary และ login/page.tsx:117 LoginForm

## หลังเฟส 1 / 2 / 3 (หลัง implementation ครบ 3 เฟส)

**วันที่วัดผลสถานะโค้ด:** 2026-08-09

### ผลจากการวิเคราะห์โค้ด (Code-Derived Outcomes)

**เฟส 1: Skeleton ทุกหน้า**
- `loading.tsx` กลาง (1 ไฟล์): สำหรับหน้าที่เหลือ `history`, `crm`, `customers`, `expenses`, `finance`, `insights`, `reports`, `members`, `shifts`, `team`, `commission`, `settings`, `more`
- `loading.tsx` เฉพาะทาง (4 ไฟล์): `today` (ตารางอายัด), `pos` (ฟอร์ม), `queue` (บอร์ด), `overview` (การ์ดตัวเลข)
- ผลกระทบ: ผู้ใช้เห็น skeleton ทันที (feedback ภายใน ~100ms หลังกดเมนู)

**เฟส 2: ยกเครื่อง Layout**
- RPC `layout_bootstrap()` รวมข้อมูลทั้งหมดใน 1 round trip: user profile, queue pending count, birthday reminders, expense reminders
- layout ลดจาก ~5 round trip เหลือ **1 round trip** (RPC `layout_bootstrap` แทน auth.getUser → profiles → Promise.all 3 query เดิม)
- **ไม่ได้ห่อกระดิ่งด้วย Suspense** ตามที่สเปกฉบับแรกวาดไว้ — implement จริงพบว่า layout เหลือ
  round trip เดียวอยู่แล้ว ความซับซ้อนของการ stream เข้า context provider ไม่คุ้ม
  ดูเหตุผลเต็มใน "หมายเหตุการตัดสินใจที่ต่างจากสเปก" ท้าย `docs/superpowers/plans/2026-08-09-speed-pass.md`
- feedback ทันทีตอนกดเมนูมาจาก `loading.tsx` (เฟส 1) ไม่ใช่จาก Suspense streaming
- ผลกระทบ: layout ไม่ block หน้าด้วยจำนวน round trip ที่ลดลง — ตัวเลข ms จริงรอวัดหลัง deploy

**เฟส 3: Cache กึ่งนิ่ง + Promise.all Batch**
- Tag-based cache: `therapists`, `services`, `settings` — ใช้งาน server actions เมื่อบันทึก (no TTL)
- ใช้แล้วใน 5 หน้า: `pos`, `queue`, `today`, `overview`, `history`
- Promise.all consolidation: หน้า `pos` เดิมมี await ที่เรียงต่อกัน → batch ลดลงประมาณ 2–3 รอบ
- query อิสระของ `queue` + `today` สามารถยุบเข้า Promise.all
- ผลกระทบ: ทั่วไป query แบบ batch เสร็จรวมกันเป็นรอบเดียว — ตัวเลข ms จริงรอวัดหลัง deploy

## ผลตรวจเทียบ RPC กับกติกา TS (รันกับฐานข้อมูลจริง)

**วันที่รัน:** 2026-08-09 · **ฐานข้อมูล:** project จริง `jrioyrmicioqammeevgh` ผ่าน Supabase MCP (`execute_sql`, อ่านอย่างเดียว — ไม่มี DDL/DML)

**วิธี:** เรียก `select public.layout_bootstrap(p_today)` ตรงๆ ทีละวันที่ แล้วเทียบกับผลจาก SQL
ที่เขียนกติกา TS ขึ้นใหม่แบบ**อิสระ** (คนละสำนวนจาก SQL ของ RPC เอง) —
วันเกิด: ใช้ความเท่ากันของเดือน/วันตรงๆ (`extract(month/day from ...)`) บวก `CASE` แยกกรณี
29 ก.พ. ในปีที่ไม่ใช่อธิกสุรทินให้เลื่อนไป 1 มี.ค. อย่างชัดเจน (ไม่ได้ใช้สูตร `make_date` แบบ RPC) ·
เตือนรายจ่าย: คำนวณวันครบกำหนดด้วย `date_trunc('month', ...) + interval` แทนการบวกแบบ `make_date`
ของ RPC แล้วเช็ค `exists` ต่อรายการแยกกันเอง · pending_count เทียบกับ `count(*) from queue_entries
where status='pending'` ตรงๆ ครั้งเดียว (ค่านี้ไม่ขึ้นกับ p_today อยู่แล้วตามกติกา)

| p_today | pending ตรง/ไม่ตรง | birthdays ตรง (n รายการ) | expense_reminders ตรง (duty+due ที่ได้) |
|---|---|---|---|
| 2026-08-09 (current_date) | ตรง (0 = 0) | ตรง (0 รายการ) | ตรง (ไม่มีรายการค้าง) |
| 2026-03-01 | ตรง (0 = 0) | ตรง (0 รายการ) | ตรง (ไม่มีรายการค้าง) |
| 2028-02-29 | ตรง (0 = 0) | ตรง (0 รายการ) | ตรง (therapist_fee due 2028-02-20, salary due 2028-01-31) |
| 2026-08-01 | ตรง (0 = 0) | ตรง (0 รายการ) | ตรง (ไม่มีรายการค้าง) |
| 2026-08-10 | ตรง (0 = 0) | ตรง (0 รายการ) | ตรง (ไม่มีรายการค้าง) |
| 2026-08-11 | ตรง (0 = 0) | ตรง (0 รายการ) | ตรง (therapist_fee due 2026-08-10) |
| 2026-08-20 | ตรง (0 = 0) | ตรง (1 รายการ — ตั๊ก ปัทมา) | ตรง (therapist_fee due 2026-08-10) |
| 2026-08-21 | ตรง (0 = 0) | ตรง (0 รายการ) | ตรง (therapist_fee due 2026-08-20) |
| 2026-08-31 | ตรง (0 = 0) | ตรง (1 รายการ — เอย) | ตรง (therapist_fee due 2026-08-20) |

**สรุป:** ตรวจครบ 9 ค่า p_today (รวม leap-year edge case 29 ก.พ. 2028) — **ไม่พบความไม่ตรงกันแม้แต่จุดเดียว**
ทั้ง pending_count, birthdays, และ expense_reminders (duty+due) ของ RPC ตรงกับกติกา TS ที่เขียนสอบทานแบบอิสระทุกกรณี

### สถานะการวัดซ้ำ

**หมายเหตุ:** ส่วนแวดล้อม sandbox นี้ **ไม่สามารถติดต่อ production URL** (https://sookkaya-pos.vercel.app) ได้เนื่องจาก egress policy ของระบบ (ยืนยันว่า `node scripts/measure-ttfb.mjs` ได้ 403 status)

**โค้ดใหม่ยังไม่ deploy ไปยัง production** — การวัด TTFB/ประสิทธิภาพจริงต้องรอหลังการ deploy

**สรุป:** บันทึกผลโค้ด-ที่มา (code-derived) ของทั้ง 3 เฟส ไว้ข้างต้น ซึ่งพร้อม deploy เมื่อใดก็ได้ — การวัด TTFB/เนื้อหา ต้องวัดจากสภาพแวดล้อมที่มีเข้าถึง production URL (หรือแม่นยำยิ่งขึ้นบน 4G บนมือถือจริงของผู้บริหาร)
