# รายการชำระหลายวิธีต่อบิล (bill_payments) + สถานะค้างรับ

วันที่: 2026-08-01 · สถานะ: เจ้าของร้านเลือกแนวทาง A จากการคุย (design B ที่เลื่อนไว้จากสเปกแบ่งชำระ 2026-07-31 — ตอนนี้มีเคสจริงแล้ว)

## ปัญหา (เคสจริง)

- ลูกค้าตัดบัตรเครดิตตอนแรก → ต่อเวลา / เพิ่มห้องส่วนตัว → จ่ายส่วนเพิ่มด้วยเงินโอน
  ระบบปัจจุบันบิลหนึ่งใบมีช่องทางเงินจริงได้ช่องเดียว ต้องเปิดสองบิลแก้ขัด
- เครดิตเมมเบอร์ถูกเติมเต็มอัตโนมัติเมื่อเลือกลูกค้าสมาชิก ทั้งที่บางรอบลูกค้าไม่อยากใช้เครดิต
  พนักงานอาจตัดเครดิตโดยไม่รู้ตัว

## ตัดสินใจแล้ว (จากการคุย 3 ข้อ)

1. รองรับ**ทั้ง**แบ่งหลายวิธีตอนคิดเงิน และเพิ่มการชำระทีหลัง (บิลที่บันทึกแล้ว)
2. เครดิตเมมเบอร์**เริ่มที่ 0** + ปุ่มลัด "ใช้เครดิต (เหลือ X)" เติมเต็มให้ — เปลี่ยนจาก
   พฤติกรรม auto-fill ปัจจุบันของฟีเจอร์แบ่งชำระรอบแรก (ทุกฟอร์ม)
3. บิลจ่ายไม่ครบมี**สถานะ "ค้างรับ"** พร้อมป้ายเตือน — ไม่บังคับจ่ายครบตอนบันทึก

## หลักการ

- **ตารางใหม่ `bill_payments`** = ความจริงเรื่องเงินจริงที่รับ ต่อบิลกี่บรรทัดก็ได้
  (วิธี · จำนวน · วันที่รับ) — เพิ่ม/แก้ทีหลังได้
- **เครดิตเมมเบอร์ไม่ย้าย** — `sales.credit_used` + สูตรใน `computeSaleAmounts` คงเดิมทั้งหมด
  (พิสูจน์บน production แล้ว) เครดิตไม่ใช่บรรทัดชำระ
- **บิลเก่าไม่ migrate สักแถว** — view สังเคราะห์บิลเดิมเป็น "1 บรรทัดจ่ายเต็ม" ให้รายงาน
  อ่านแบบเดียวกันหมด · เลขเก่าต้องไม่ขยับ (พิสูจน์ด้วย parity check เหมือนรอบก่อน)
- Gowabi / KOL / เครดิตเต็มบิล คงพฤติกรรมเดิมทุกอย่าง — ช่องทางเดียว ไม่มีบรรทัดชำระ

## 1. ข้อมูล

```sql
create table public.bill_payments (
  id            uuid primary key default gen_random_uuid(),
  -- กุญแจบิล: บิลชุดใช้ sales.bill_id · บิลเดี่ยวใช้ sales.id (= coalesce(bill_id, id))
  bill_key      uuid not null,
  method        text not null check (method in ('เงินสด','QR Code','บัตรเครดิต')),
  amount        numeric not null check (amount > 0),
  received_date date not null,          -- วันเงินเข้า (เวลาไทย) — รายงานเงินเข้าอิงวันนี้
  received_at   timestamptz not null default now(),
  note          text,
  created_by    text,
  created_at    timestamptz not null default now()
);
create index bill_payments_bill_key_idx on public.bill_payments (bill_key);
create index bill_payments_received_date_idx on public.bill_payments (received_date);
-- RLS: authenticated select/insert · delete เฉพาะ admin/manager (แนว turn_aways + สิทธิ์ลบ)
```

- เพิ่มคอลัมน์ `sales.payments_tracked boolean not null default false` —
  บิลที่สร้าง/แก้ผ่านระบบใหม่และรับเงินจริงผ่านบรรทัดชำระ = true
  ใช้แยก "บิลที่บรรทัดคือความจริง" ออกจาก "บิลเก่า/Gowabi/KOL/เครดิตเต็มที่ต้องสังเคราะห์"
  (ไม่ใช้วันที่ตัด — เปราะ)
- `sales.payment_method` คงอยู่และยังถูกเขียนเสมอ = **วิธีหลัก** (บรรทัดที่ยอดมากสุด ·
  เครดิตเต็มบิล = "Member Credit" ตาม invariant เดิม) — โค้ด/รายงานเก่าที่อ่านคอลัมน์นี้ไม่พัง

### View

```sql
-- ทุกบิลกลายเป็นบรรทัดชำระแบบเดียวกัน: บิลใหม่ = บรรทัดจริง · บิลเก่า/Gowabi/KOL = สังเคราะห์
create view public.v_bill_payments with (security_invoker = true) as
  select bill_key, method, amount, received_date from public.bill_payments
  union all
  select coalesce(s.bill_id, s.id), s.payment_method,
         sum(s.net_amount - coalesce(s.credit_used, 0)), s.sale_date
  from public.sales s
  where not s.payments_tracked
  group by coalesce(s.bill_id, s.id), s.payment_method, s.sale_date
  having sum(s.net_amount - coalesce(s.credit_used, 0)) > 0;

-- ยอดค้างรับต่อบิล (เฉพาะบิลที่ track): due = net รวม − เครดิตรวม − รับแล้ว
create view public.v_bill_due with (security_invoker = true) as
with agg as (
  select coalesce(s.bill_id, s.id) as bill_key,
         min(s.sale_date) as sale_date,
         sum(s.net_amount) as net_total,
         sum(coalesce(s.credit_used,0)) as credit_total
  from public.sales s
  where s.payments_tracked
  group by coalesce(s.bill_id, s.id)
)
select a.bill_key, a.sale_date, a.net_total, a.credit_total,
       coalesce(p.paid_total, 0) as paid_total,
       a.net_total - a.credit_total - coalesce(p.paid_total, 0) as due
from agg a
left join (select bill_key, sum(amount) as paid_total
           from public.bill_payments group by bill_key) p
  on p.bill_key = a.bill_key;
```

## 2. Server actions

- **createSale** รับ field ใหม่ `payments` (JSON string: `[{method, amount}]`)
  - validate: method ∈ เงินสด/QR/บัตร · amount > 0 · sum(payments) ≤ net − creditUsed ·
    ยาวไม่เกิน 3 บรรทัด (เท่ากับเพดาน UI)
  - sum < ยอดที่ต้องเก็บ = บิลค้างรับ (บันทึกได้ ป้ายเตือนรับหน้าที่)
  - เขียนบรรทัดลง `bill_payments` (บิลชุด: เขียนครั้งเดียวที่รายการแรกของบิล ใช้ bill_key)
    และ set `payments_tracked = true` ทุกแถวของบิล
  - `payment_method` = วิธีของบรรทัดยอดมากสุด (เท่ากันเอาบรรทัดแรก) ·
    เครดิตเต็มบิล = "Member Credit" (normalize เดิมคงอยู่) · Gowabi/KOL = ห้ามส่ง payments
  - ไม่ส่ง `payments` มา (โค้ดเก่า/ฟอร์มยังไม่อัพ) = พฤติกรรมเดิมทุกอย่าง (`payments_tracked=false`)
- **addBillPayment(billKey, method, amount, note?)** — action ใหม่ ใช้เก็บเงินเพิ่มจาก
  บิลค้างรับ/ต่อเวลา · validate เหมือนกัน + กันจ่ายเกิน due + `received_date` = วันนี้ (ไทย)
- **deleteBillPayment(paymentId)** — เฉพาะ admin/manager (แก้บรรทัดผิด) · บันทึกแล้วคิด due ใหม่
- **updateSale** — แก้บิล (ต่อเวลา ฯลฯ) ไม่แตะบรรทัดชำระ · due คิดใหม่เองผ่าน view ·
  ลดยอดจนต่ำกว่าที่รับแล้ว → บิลขึ้น "เกินรับ" (due < 0) พนักงานแก้บรรทัด/คืนเงิน+จดโน้ต
- **deleteSale** — ถ้าเป็นแถวสุดท้ายของ bill_key นั้น ให้ลบ `bill_payments` ของบิลตามไปด้วย
  (กัน orphan — มีด่านตรวจซ้ำ)
- **แต้ม** — สูตรเดิม `pointsForSale(net − credit_used)` ไม่เปลี่ยน (ถือว่าบิลจะจ่ายครบในที่สุด ·
  แต้มไม่ผูกกับจังหวะรับเงิน)

## 3. หน้าจอ

### ส่วนชำระเงิน (pos-form · group-pos-form · edit-sale-dialog — ครบทั้งสาม)

- **เครดิตเมมเบอร์: เริ่มที่ 0** + ปุ่ม "ใช้เครดิต (เหลือ X ฿)" เติม min(เครดิต, ยอดบิล)
  กดแล้วแก้ตัวเลขต่อได้เหมือนเดิม — แทน auto-fill ปัจจุบัน (แก้ทั้ง pos-form และ group form)
- **บรรทัดชำระ**: เริ่มหนึ่งบรรทัด = ยอดที่ต้องเก็บเต็ม (หลังหักเครดิต) เลือกวิธีตามปุ่มเดิม ·
  ปุ่ม "+ แบ่งจ่าย" เพิ่มบรรทัด (วิธี + จำนวน แก้ได้อิสระ สูงสุด 3 บรรทัด — พอเคสจริงและกัน UI รก) ·
  บรรทัดสรุปสด: รวมรับ X / ต้องเก็บ Y / **ค้างรับ Z** (Z > 0 ขึ้นสีแดง)
- บันทึกทั้งที่ค้างรับ > 0 → dialog ยืนยัน "บันทึกแบบค้างรับ Z ฿?" กันเผลอ
- Gowabi/KOL: ซ่อนตัวแบ่งบรรทัด (ช่องทางเดียวเหมือนเดิม)
- กลุ่มหลายคน (คนละบิล) จ่ายรวมครั้งเดียว: แต่ละบิลได้บรรทัดเดียว = ยอดของบิลตัวเอง
  วิธีตามที่เลือกร่วมกัน (รูดบัตรครั้งเดียว 2,090 = สามบิล บิลละบรรทัด) — ตัวแบ่งบรรทัด
  หลายวิธีใช้ได้เฉพาะบิลชุดลูกค้าคนเดียว/บิลเดี่ยว เหมือนเงื่อนไขเครดิต

### ป้ายค้างรับ

- การ์ดคิว + แถวบิลหน้า /today + /history: ป้ายแดง "ค้างรับ X ฿" (จาก v_bill_due)
- ปุ่ม "เก็บเพิ่ม" บนป้าย/รายละเอียดบิล → กล่องเล็ก เลือกวิธี + จำนวน (default = due) → `addBillPayment`
- หัวหน้า /today: การ์ดเตือนรวม "บิลค้างรับวันนี้ N ใบ รวม X ฿" เมื่อ N > 0

## 4. รายงาน

- **ยอดตามช่องทาง** (/today · /reports): อ่านจาก `v_bill_payments` แทนสูตร
  `net − credit_used` ต่อแถว — บิลเก่าให้เลขเท่าเดิมเป๊ะ (บรรทัดสังเคราะห์ = สูตรเดิม) ·
  ช่อง "Member Credit" ยังมาจาก `credit_used` เหมือนเดิม
- **เงินเข้า (cash_in ใน v_daily_summary)**: จากบรรทัดชำระตาม `received_date` + เงินเติมสมาชิก —
  เงินนับวันที่**รับจริง** (บิลเก่า/สังเคราะห์ = sale_date → เลขเก่าเท่าเดิม) ·
  หมายเหตุ: บิลค้างรับที่มาจ่ายวันหลัง เงินจะเข้ารายงานวันที่จ่าย ไม่ใช่วันบิล — ตรงเงินจริงในลิ้นชัก/บัญชี
- **/finance · export**: export เพิ่มคอลัมน์สรุปบรรทัดชำระ (เช่น "เงินสด 500 + QR 300") ·
  ตัวเลขกำไรไม่กระทบ (revenue_recognize ไม่เปลี่ยน)

## 5. ด่านตรวจใหม่ (reconciliation)

- `bill_payments_orphaned` = 0 — บรรทัดที่ bill_key ไม่ตรงกับบิลไหนเลย
- `bill_overpaid` = 0 — บิล track ที่ paid_total > net_total − credit_total (เกินรับต้องเป็นศูนย์เมื่อพัก)
- `tracked_bill_method_mismatch` = 0 — บิล track ที่ `payment_method` ไม่ตรงกับบรรทัดยอดมากสุด
- ด่านเดิมทั้ง 31 ข้อต้อง PASS ค่าเดิม (โดยเฉพาะ net_revenue/cash_in ทุกเดือน — พิสูจน์บิลเก่าไม่ขยับ)
- บิลค้างรับไม่อยู่ใน reconciliation (เป็นสถานะปฏิบัติการ มีป้าย/การ์ดเตือนใน UI แล้ว)

## การทดสอบ

1. lib ล้วน: ตัวช่วยรวมบรรทัด/คำนวณ due/เลือกวิธีหลัก — TDD
2. บิลเดี่ยว: บัตร 650 + โอน 240 → บรรทัด 2 · payment_method = "บัตรเครดิต" · due 0
3. เครดิต 110 + บัตร 200 + โอน 80 (บิล 390) → เครดิตกลไกเดิม + 2 บรรทัด
4. ต่อเวลา: บิลบัตร 650 → แก้เป็น 890 → due 240 ขึ้นป้าย → addBillPayment โอน 240 → due 0 ·
   เงินเข้า 240 ลงวันที่จ่ายจริง
5. บิลชุด + กลุ่ม: บรรทัดผูกที่ bill_key เดียว ไม่ซ้ำต่อแถว
6. เครดิตเริ่ม 0: เลือกสมาชิกแล้วเครดิตไม่ถูกตัดจนกว่าจะกดปุ่ม
7. parity: sum(cash_in) และ byPayment ก่อน/หลัง migration เท่ากันเป๊ะบน production ·
   reconciliation 34 ข้อ (31+3) PASS

## สิ่งที่ตั้งใจไม่ทำ

- แยกใบเสร็จตามบรรทัดชำระ (ใบเสร็จยังหนึ่งใบต่อบิล โชว์บรรทัดชำระท้ายใบ)
- เตือนอัตโนมัติเมื่อค้างรับข้ามวัน (รอบแรกใช้การ์ดเตือนบน /today พอ — ดูพฤติกรรมจริงก่อน)
- ผ่อน/มัดจำ/จองด้วยเงินล่วงหน้า — คนละเรื่องกับค้างรับ อย่าปนกัน
- แตะสูตรเงิน `computeSaleAmounts` — ห้ามเปลี่ยนแม้บรรทัดเดียว
