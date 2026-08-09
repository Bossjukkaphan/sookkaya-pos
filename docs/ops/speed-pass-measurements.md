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
- ตัวเลขกระดิ่ง (notification badge) ห่อ Suspense, streaming ตามมา
- ผลกระทบ: layout ไม่ block หน้า, feedback ยนไปด้านหน้าสัก 10–20ms

**เฟส 3: Cache กึ่งนิ่ม + Promise.all Batch**
- Tag-based cache: `therapists`, `services`, `settings` — ใช้งาน server actions เมื่อบันทึก (no TTL)
- ใช้แล้วใน 5 หน้า: `pos`, `queue`, `today`, `overview`, `history`
- Promise.all consolidation: หน้า `pos` เดิมมี await ที่เรียงต่อกัน → batch ลดลงประมาณ 2–3 รอบ
- query อิสระของ `queue` + `today` สามารถยุบเข้า Promise.all
- ผลกระทบ: ทั่วไป query แบบ batch เสร็จร้วม ~ครึ่งของเวลาเดิม

### สถานะการวัดซ้ำ

**หมายเหตุ:** ส่วนแวดล้อม sandbox นี้ **ไม่สามารถติดต่อ production URL** (https://sookkaya-pos.vercel.app) ได้เนื่องจาก egress policy ของระบบ (ยืนยันว่า `node scripts/measure-ttfb.mjs` ได้ 403 status)

**โค้ดใหม่ยังไม่ deploy ไปยัง production** — การวัด TTFB/ประสิทธิภาพจริงต้องรอหลังการ deploy

**สรุป:** บันทึกผลโค้ด-ที่มา (code-derived) ของทั้ง 3 เฟส ไว้ข้างต้น ซึ่งพร้อม deploy เมื่อใดก็ได้ — การวัด TTFB/เนื้อหา ต้องวัดจากสภาพแวดล้อมที่มีเข้าถึง production URL (หรือแม่นยำยิ่งขึ้นบน 4G บนมือถือจริงของผู้บริหาร)
