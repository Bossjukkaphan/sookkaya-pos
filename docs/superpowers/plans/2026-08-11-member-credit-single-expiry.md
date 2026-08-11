# เครดิตสมาชิกกระปุกเดียว หมดอายุพร้อมกัน Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปลี่ยนเครดิตสมาชิกจาก "หลายก้อน หมดอายุคนละวัน" เป็น "กระปุกเดียว หมดอายุวันเดียว" โดยการเติมเงินครั้งใหม่ต่ออายุยอดเก่าให้อัตโนมัติ และเครดิตที่หมดอายุจะถูกแช่แข็ง (ใช้ไม่ได้ แต่ไม่หายไป) จนกว่าจะเติมใหม่

**Architecture:** ยอดคงเหลือคิดจาก `เติมทั้งหมด − ใช้ทั้งหมด` ไม่กรองวันหมดอายุเลย ส่วนวันหมดอายุคือ `MAX(expiry_date)` ของทุกก้อนที่ลูกค้ามี การกัน "ห้ามใช้เมื่อหมดอายุ" ย้ายจากที่เคยซ่อนอยู่ในตัวเลข ออกมาเป็นเงื่อนไขที่เขียนไว้ชัดในโค้ดฝั่ง server

**Tech Stack:** PostgreSQL 17 (Supabase) · Next.js 16 server actions · vitest · SQL migration ผ่าน `supabase/migrations/`

สเปกฉบับเต็ม: `docs/superpowers/specs/2026-08-11-member-credit-single-expiry-design.md`

## Global Constraints

- `member_balances` ต้องคืน **หนึ่งแถวต่อลูกค้าหนึ่งคน ทุกคนใน `customers`** (ปัจจุบัน 1,093 แถว) ไม่ใช่เฉพาะสมาชิก — หน้า POS พึ่งพาพฤติกรรมนี้
- คอลัมน์เดิม 11 ตัวต้องคงชื่อ ลำดับ และชนิดเดิมทุกประการ: `customer_id, name, nickname, phone, credit_balance, credit_granted, bonus_granted, cash_paid, next_expiry, customer_type, created_at` — `credit_expired` ต่อท้ายเป็นตัวที่ 12
- ทุก `create or replace view` ต้องระบุ `with (security_invoker = true)` เสมอ คำสั่งนี้รีเซ็ต reloptions เงียบ ๆ (เคยทำให้ `v_monthly_pl` กลายเป็น SECURITY DEFINER แล้วเปิด P&L ทั้งร้านให้พนักงานผ่าน REST API)
- วันที่ต้องใช้ `(now() at time zone 'Asia/Bangkok')::date` เสมอ ห้าม `current_date` — เซิร์ฟเวอร์รันเป็น UTC
- `credit_used` ต้องรวมทุกแถว **ห้ามใส่เงื่อนไข `> 0`** เพราะค่าติดลบคือการคืนเงินและต้องบวกกลับ (view เดิมก่อนวันที่ 11 ส.ค. ก็รวมทุกแถว)
- วันหมดอายุวันนี้พอดี = **ยังใช้ได้ทั้งวัน** หมดตอนสิ้นวัน (`วันนี้ > วันหมดอายุ` ถึงจะหมด)
- `next_expiry` เป็น NULL (ไม่เคยเติมเงิน) = **ถือว่าใช้ไม่ได้** ไม่ใช่ "ไม่มีวันหมดอายุ"
- การชำระด้วยเงินสด / QR / บัตรเครดิต / Gowabi ต้องไม่ถูกขวางเลยไม่ว่าเครดิตจะหมดอายุหรือไม่ — การกันแตะเฉพาะวิธีชำระ Member Credit
- `supabase/reconciliation.sql` ต้อง PASS ทุกข้อ ยกเว้น `bed_double_booked` ที่ FAIL อยู่ก่อนแล้วจากคิวซ้อนเก้าอี้ 3 วันที่ 9 ส.ค. (ไม่เกี่ยวกับงานนี้ ห้ามแก้ค่าคาดหวังของมัน)
- Node ไม่อยู่บน PATH — ต้อง `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"` ก่อนทุกคำสั่ง npm/npx
- ฐานข้อมูลนี้มีพนักงานบันทึกขายอยู่จริงตลอดเวลา งานนี้แตะได้แค่ view เท่านั้น **ห้าม UPDATE/DELETE แถวใด ๆ**
- รัน SQL ผ่าน Supabase MCP (`apply_migration` / `execute_sql`) project_id `jrioyrmicioqammeevgh` ห้ามใช้ supabase CLI (ยังไม่ได้ยืนยันว่า link ไว้)

## บริบทของปัญหา (อ่านก่อนลงมือ)

`member_balances` เดิมคิด `credit_added ของก้อนที่ยังไม่หมดอายุ − credit_used ทุกบิลทุกยุค`
สองข้างคนละเกณฑ์เวลา พอก้อนหมดอายุ ยอดที่ให้หลุดจากสมการแต่ยอดใช้ยังอยู่ ยอดใช้ของก้อนที่ตายแล้ว
จึงย้ายไปกัดกินก้อนที่ยังไม่หมดอายุ **ลูกค้าถูกริบเครดิตที่ยังใช้ได้จริง**

วันที่ 11 ส.ค. 2026 เคยลองแก้ด้วย FIFO เรียงตามวันหมดอายุ ขึ้น production ไปแล้วและ **ผิด**
เพราะจัดสรรโดยไม่ดูวันขาย บิลจึงไปดูดเครดิตจากก้อนที่ตอนนั้นลูกค้ายังไม่ได้ซื้อ
(คุณตี๋ 0976866666 ใช้ไป 11,460฿ ตอนที่มีแต่ก้อน Gold แต่ FIFO ยกยอดนั้นไปลง Silver)

งานนี้จึง **ทิ้ง FIFO ทั้งหมด** และเปลี่ยนกติกาธุรกิจแทน เพื่อให้คำถาม "บิลนี้ตัดจากก้อนไหน"
หมดความหมายไปเลย

## File Structure

| ไฟล์ | หน้าที่ | งานที่ |
|---|---|---|
| `supabase/migrations/20260811170000_member_balances_single_expiry.sql` (สร้าง) | นิยาม view ใหม่ทั้งหมด | 1 |
| `supabase/reconciliation.sql` (แก้) | เพิ่มการตรวจ `topup_missing_expiry` | 1 |
| `src/types/database.ts` (สร้างใหม่อัตโนมัติ) | เพิ่มคอลัมน์ `credit_expired` | 1 |
| `src/lib/member-credit.ts` (แก้) | ตรรกะกลาง: `checkCreditSpend()` + `creditBucket()` สถานะ `expired` | 2 |
| `src/lib/member-credit.test.ts` (แก้) | เทสต์ตรรกะกลาง | 2 |
| `src/app/(app)/sale-actions.ts` (แก้) | เรียกตรรกะกลางทั้งตอนสร้างและตอนแก้บิล | 3 |
| `src/app/(app)/members/member-actions.ts` (แก้) | เตือนก่อนลบใบเติมเงินที่ทำให้วันหมดอายุถอยหลัง | 3 |
| `src/app/(app)/pos/customer-picker.tsx` · `pos/group-pos-form.tsx` · `customers/[id]/page.tsx` · `customers/customer-table.tsx` · `members/member-row.tsx` · `book/points-actions.ts` (แก้) | แสดงสถานะแช่แข็ง + ข้อความชวนเติม | 4 |
| `src/app/(app)/members/page.tsx` · `overview/page.tsx` · `api/cron/daily-report/route.ts` · `src/lib/daily-report.ts` (แก้) | แยกยอด "ใช้ได้ / แช่แข็ง" | 5 |

---

### Task 1: view ใหม่ + คอลัมน์ credit_expired

**Files:**
- Create: `supabase/migrations/20260811170000_member_balances_single_expiry.sql`
- Modify: `supabase/reconciliation.sql`
- Modify: `src/types/database.ts` (สร้างใหม่ด้วยเครื่องมือ ไม่ต้องพิมพ์เอง)

**Interfaces:**
- Consumes: ตาราง `member_topups` (`customer_id, expiry_date, credit_added, bonus_added, cash_received`), ตาราง `sales` (`customer_id, credit_used`), ตาราง `customers`
- Produces: view `member_balances` คอลัมน์ `customer_id, name, nickname, phone, credit_balance, credit_granted, bonus_granted, cash_paid, next_expiry, customer_type, created_at, credit_expired` — งานที่ 2–5 อ่านจากที่นี่ทั้งหมด

- [ ] **Step 1: เขียนแบบทดสอบก่อน — จับค่าที่ต้องไม่เปลี่ยน และค่าที่ต้องเปลี่ยน**

รันด้วย `execute_sql` แล้วจดผลไว้:

```sql
select
  (select count(*) from public.member_balances) as view_rows,
  (select count(*) from public.customers) as customer_rows,
  (select round(sum(credit_balance)) from public.member_balances) as total_balance,
  (select next_expiry from public.member_balances where phone = '0976866666') as ตี๋_expiry_ก่อนแก้;
```

คาดหวังก่อนแก้: `view_rows = customer_rows` · `ตี๋_expiry_ก่อนแก้ = 2027-02-08` (ค่าผิดจาก FIFO)

- [ ] **Step 2: เขียน migration**

สร้าง `supabase/migrations/20260811170000_member_balances_single_expiry.sql`:

```sql
-- เครดิตสมาชิกเปลี่ยนเป็น "กระปุกเดียว หมดอายุพร้อมกัน" (ตัดสินใจ 2026-08-11)
--
-- เดิม: คงเหลือ = credit_added ของก้อนที่ยังไม่หมดอายุ − credit_used ทุกบิลทุกยุค
--       สองข้างคนละเกณฑ์เวลา พอก้อนหมดอายุ ยอดใช้ของก้อนนั้นย้ายไปกินก้อนใหม่
-- แล้วลองแก้ด้วย FIFO ตามวันหมดอายุ (migration 20260811150000/20260811160000) ซึ่งผิดอีกแบบ
--       เพราะจัดสรรโดยไม่ดูวันขาย บิลไปดูดก้อนที่ตอนนั้นลูกค้ายังไม่ได้ซื้อ
--
-- กติกาใหม่: เครดิตของลูกค้าคนหนึ่งคือกระปุกเดียว ไม่แยกก้อน
--   วันหมดอายุ = MAX(expiry_date) → การเติมเงินต่ออายุยอดเก่าให้อัตโนมัติ และไม่มีวันทำให้สั้นลง
--   หมดอายุแล้ว = ใช้ไม่ได้ แต่ยอดไม่หายไป · เติมใหม่เมื่อไหร่ฟื้นทั้งหมดทันที
--   คำถาม "บิลนี้ตัดจากก้อนไหน" จึงหมดความหมาย ไม่ต้องจัดสรรอีกต่อไป
create or replace view public.member_balances
with (security_invoker = true) as
with shop_today as (
  -- เซิร์ฟเวอร์รันเป็น UTC — วันหมดอายุต้องเทียบด้วยวันไทยเสมอ
  select (now() at time zone 'Asia/Bangkok')::date as d
),
topup_agg as (
  select
    mt.customer_id,
    sum(mt.credit_added)  as credit_added,
    sum(mt.bonus_added)   as bonus_added,
    sum(mt.cash_received) as cash_received,
    max(mt.expiry_date)   as last_expiry
  from public.member_topups mt
  group by mt.customer_id
),
used_agg as (
  -- ไม่กรอง credit_used > 0 โดยตั้งใจ — ค่าติดลบคือการคืนเงิน ต้องบวกกลับเข้ายอด
  select sa.customer_id, sum(sa.credit_used) as credit_used
  from public.sales sa
  where sa.customer_id is not null
  group by sa.customer_id
)
-- ต้องคืนทุกคนในตาราง customers ไม่ใช่เฉพาะสมาชิก — หน้า POS พึ่งพาพฤติกรรมนี้
select
  c.id as customer_id,
  c.name,
  c.nickname,
  c.phone,
  -- ปัดสองตำแหน่งกันเศษทศนิยมทำให้ "จ่ายเต็มยอด" ถูกปฏิเสธเพราะขาดไปเศษเสี้ยวสตางค์
  round(coalesce(t.credit_added, 0::numeric) - coalesce(u.credit_used, 0::numeric), 2) as credit_balance,
  coalesce(t.credit_added, 0::numeric)  as credit_granted,
  coalesce(t.bonus_added, 0::numeric)   as bonus_granted,
  coalesce(t.cash_received, 0::numeric) as cash_paid,
  t.last_expiry as next_expiry,
  c.customer_type,
  c.created_at,
  -- ไม่เคยเติมเงิน (NULL) = ใช้ไม่ได้ ไม่ใช่ "ไม่มีวันหมดอายุ"
  -- วันหมดอายุวันนี้พอดี = ยังใช้ได้ทั้งวัน จึงเป็น > ไม่ใช่ >=
  (t.last_expiry is null or s.d > t.last_expiry) as credit_expired
from public.customers c
cross join shop_today s
left join topup_agg t on t.customer_id = c.id
left join used_agg  u on u.customer_id = c.id;
```

- [ ] **Step 3: ลง migration**

เรียก MCP `apply_migration` project_id `jrioyrmicioqammeevgh` name `member_balances_single_expiry` ด้วย SQL ข้างบน

- [ ] **Step 4: ตรวจว่าถูกทั้งของที่ต้องไม่เปลี่ยน และของที่ต้องเปลี่ยน**

```sql
select
  (select count(*) from public.member_balances) as view_rows,
  (select count(*) from public.customers) as customer_rows,
  (select next_expiry from public.member_balances where phone = '0976866666') as ตี๋_expiry,
  (select credit_expired from public.member_balances where phone = '0976866666') as ตี๋_หมดอายุ,
  (select count(*) from public.member_balances where credit_expired is null) as expired_เป็นnull,
  (select reloptions::text from pg_class where relname = 'member_balances') as reloptions;
```

คาดหวัง: `view_rows = customer_rows` · `ตี๋_expiry = 2027-04-17` (**ไม่ใช่ 2027-02-08** — นี่คือหลักฐานว่าการเติมเงินไม่ทำให้อายุสั้นลง) · `ตี๋_หมดอายุ = false` · `expired_เป็นnull = 0` · `reloptions` มี `security_invoker=true`

ถ้า `reloptions` เป็น null ให้รัน `alter view public.member_balances set (security_invoker = true);`

- [ ] **Step 5: ตรวจพฤติกรรมหลังหมดอายุ ด้วยการจำลองวันที่**

view ผูกกับ `now()` จึงจำลองตรง ๆ ไม่ได้ ให้รันสูตรเดียวกันโดยแทนวันที่:

```sql
with topup_agg as (
  select mt.customer_id, sum(mt.credit_added) added, max(mt.expiry_date) last_expiry
  from public.member_topups mt group by 1
),
used_agg as (
  select sa.customer_id, sum(sa.credit_used) used from public.sales sa
  where sa.customer_id is not null group by 1
)
select
  count(*) filter (where date '2026-10-13' > t.last_expiry) as แช่แข็งแล้วกี่คน,
  round(sum(t.added - coalesce(u.used,0)) filter (where date '2026-10-13' > t.last_expiry)) as ยอดที่ยังอยู่ครบ,
  round(min(t.added - coalesce(u.used,0)) filter (where date '2026-10-13' > t.last_expiry)) as ยอดต่ำสุด
from topup_agg t left join used_agg u on u.customer_id = t.customer_id;
```

คาดหวัง: `แช่แข็งแล้วกี่คน` > 0 · `ยอดที่ยังอยู่ครบ` เป็นบวก · `ยอดต่ำสุด` ไม่ติดลบ
— พิสูจน์ว่าเมื่อหมดอายุแล้วยอดยังอยู่ครบ ไม่ถูกหักหายเหมือนสูตรเดิม

- [ ] **Step 6: เพิ่มการตรวจ topup_missing_expiry ใน reconciliation**

ใน `supabase/reconciliation.sql` หาบรรทัด `('orphan_credit_used', 0),` แล้วเพิ่มถัดจากนั้น:

```sql
  -- ใบเติมเงินที่ไม่มีวันหมดอายุ = ข้อมูลผิด เพราะ createTopup ใส่ค่าเสมอ
  -- สำคัญขึ้นมากตั้งแต่ 2026-08-11 เพราะวันหมดอายุของทั้งกระปุกคือ MAX ของทุกใบ
  -- ใบที่ค่าว่างจะถูก MAX ข้ามไปเงียบ ๆ ทำให้ลูกค้าอาจหมดอายุเร็วกว่าที่ควร
  ('topup_missing_expiry', 0),
```

แล้วหาบล็อก `select 'orphan_credit_used', ...` ใน CTE `actual` เพิ่มถัดจากนั้น:

```sql
  union all
  select 'topup_missing_expiry', count(*)::bigint
  from public.member_topups where expiry_date is null
```

- [ ] **Step 7: รัน reconciliation ทั้งไฟล์**

อ่านเนื้อไฟล์ `supabase/reconciliation.sql` แล้วส่งทั้งก้อนเข้า `execute_sql`

คาดหวัง: `result` เป็น `PASS` ทุกแถว รวมแถวใหม่ `topup_missing_expiry` — ยกเว้น `bed_double_booked` ที่ FAIL อยู่ก่อนแล้ว **ห้ามแก้ค่าคาดหวังของมันเพื่อให้ผ่าน**

- [ ] **Step 8: สร้าง types ใหม่**

เรียก MCP `generate_typescript_types` project_id `jrioyrmicioqammeevgh` แล้วเขียนผลลัพธ์ทับ `src/types/database.ts`
จากนั้นยืนยันว่ามี `credit_expired` โผล่มาจริง:

```bash
grep -c "credit_expired" src/types/database.ts
```

คาดหวัง: มากกว่า 0

- [ ] **Step 9: typecheck + เทสต์**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx tsc --noEmit && npm test
```

คาดหวัง: typecheck ไม่มี error · เทสต์ผ่านทั้งหมด (ฐานปัจจุบัน 592 ตัว / 42 ไฟล์)

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/20260811170000_member_balances_single_expiry.sql supabase/reconciliation.sql src/types/database.ts
git commit -m "feat(credit): เครดิตสมาชิกเป็นกระปุกเดียว หมดอายุพร้อมกัน เติมเงินต่ออายุให้อัตโนมัติ"
```

---

### Task 2: ตรรกะกลางตัดสินว่าใช้เครดิตได้ไหม

**Files:**
- Modify: `src/lib/member-credit.ts`
- Modify: `src/lib/member-credit.test.ts`

**Interfaces:**
- Consumes: ไม่มี — เป็นฟังก์ชันบริสุทธิ์ ไม่แตะฐานข้อมูล
- Produces: `checkCreditSpend(input: CreditSpendInput): CreditSpendResult` และ `creditBucket(balance: number, expired?: boolean): CreditBucket` — งานที่ 3 เรียก `checkCreditSpend`, งานที่ 4 เรียก `creditBucket`

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

ไฟล์ `src/lib/member-credit.test.ts` มีบรรทัด import อยู่แล้วคือ
`import { CREDIT_LOW_MAX, creditBucket } from "./member-credit"`
**ให้แก้บรรทัดนั้นเป็น** `import { CREDIT_LOW_MAX, checkCreditSpend, creditBucket } from "./member-credit"`
อย่าเพิ่ม import ก้อนใหม่กลางไฟล์

แล้วเพิ่มท้ายไฟล์:

```typescript
describe("checkCreditSpend", () => {
  const ใช้ได้ = { expiry: "2026-12-31", onDate: "2026-08-11", balance: 2300 }

  it("ตัดเครดิตได้เมื่อยังไม่หมดอายุและยอดพอ", () => {
    expect(checkCreditSpend({ ...ใช้ได้, wanted: 650 })).toEqual({ ok: true })
  })

  it("ยอดไม่พอ ปฏิเสธพร้อมบอกตัวเลขทั้งสองฝั่ง", () => {
    const r = checkCreditSpend({ ...ใช้ได้, wanted: 5000 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe("insufficient")
    expect(r.message).toContain("2300")
    expect(r.message).toContain("5000")
  })

  it("วันหมดอายุวันนี้พอดี ยังใช้ได้ทั้งวัน", () => {
    expect(
      checkCreditSpend({ expiry: "2026-08-11", onDate: "2026-08-11", balance: 2300, wanted: 650 })
    ).toEqual({ ok: true })
  })

  it("เลยวันหมดอายุมาหนึ่งวัน ใช้ไม่ได้ และข้อความต้องบอกยอดที่ยังค้างอยู่", () => {
    const r = checkCreditSpend({
      expiry: "2026-08-10", onDate: "2026-08-11", balance: 2300, wanted: 650,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe("expired")
    expect(r.message).toContain("2300")
    expect(r.message).toContain("เติม")
  })

  it("ไม่เคยเติมเงินเลย ถือว่าใช้ไม่ได้", () => {
    const r = checkCreditSpend({ expiry: null, onDate: "2026-08-11", balance: 0, wanted: 650 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe("expired")
  })

  it("บิลย้อนหลังที่ให้บริการตอนเครดิตยังไม่หมดอายุ ยังบันทึกได้", () => {
    expect(
      checkCreditSpend({ expiry: "2026-08-05", onDate: "2026-08-03", balance: 2300, wanted: 650 })
    ).toEqual({ ok: true })
  })

  it("หมดอายุแล้ว แก้บิลเก่าให้ยอดเท่าเดิมได้", () => {
    expect(
      checkCreditSpend({
        expiry: "2026-08-10", onDate: "2026-08-11", balance: 2300,
        wanted: 650, alreadyUsedOnThisBill: 650,
      })
    ).toEqual({ ok: true })
  })

  it("หมดอายุแล้ว แก้บิลเก่าให้ยอดน้อยลงได้", () => {
    expect(
      checkCreditSpend({
        expiry: "2026-08-10", onDate: "2026-08-11", balance: 2300,
        wanted: 400, alreadyUsedOnThisBill: 650,
      })
    ).toEqual({ ok: true })
  })

  it("หมดอายุแล้ว แก้บิลเก่าให้ยอดเพิ่มขึ้นไม่ได้ = ใช้เครดิตใหม่", () => {
    const r = checkCreditSpend({
      expiry: "2026-08-10", onDate: "2026-08-11", balance: 2300,
      wanted: 900, alreadyUsedOnThisBill: 650,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe("expired")
  })
})

describe("creditBucket กับสถานะหมดอายุ", () => {
  it("มีเครดิตแต่หมดอายุ = expired ไม่ใช่ empty", () => {
    expect(creditBucket(2300, true)).toBe("expired")
  })

  it("ไม่มีเครดิตและหมดอายุ = empty เพราะไม่มีอะไรให้ปลดล็อก", () => {
    expect(creditBucket(0, true)).toBe("empty")
  })

  it("เรียกแบบเดิมที่ไม่ส่งพารามิเตอร์ที่สอง ต้องได้ผลเหมือนเดิม", () => {
    expect(creditBucket(2300)).toBe("mid")
  })
})
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าไม่ผ่าน**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx vitest run src/lib/member-credit.test.ts
```

คาดหวัง: FAIL เพราะยังไม่มี `checkCreditSpend` และ `creditBucket` ยังไม่รับพารามิเตอร์ที่สอง

- [ ] **Step 3: เขียนโค้ด**

แก้ `src/lib/member-credit.ts` — เพิ่ม `"expired"` เข้า type, แก้ `creditBucket`, และเพิ่มฟังก์ชันใหม่:

```typescript
export type CreditBucket = "empty" | "expired" | "low" | "mid" | "ok"

/**
 * ยอดติดลบเกิดได้เมื่อมีบิลตัดเครดิตของลูกค้าที่ไม่เคยเติมเงิน (คีย์ผิดใบ)
 * ตีเป็น "หมดแล้ว" เหมือนยอดศูนย์ ไม่ใช่ปล่อยให้หายไปจากทุกช่อง
 * — reconciliation ข้อ orphan_credit_used เป็นตัวจับเคสนั้นโดยตรง
 *
 * expired = หมดอายุแล้ว ยอดยังอยู่แต่ใช้ไม่ได้จนกว่าจะเติมใหม่ ต้องแยกจาก empty
 * เพราะ "มีเงินแต่ใช้ไม่ได้" คือโอกาสขาย ส่วน "ไม่มีเงิน" คือคนละเรื่อง
 */
export function creditBucket(balance: number, expired = false): CreditBucket {
  if (balance <= 0) return "empty"
  if (expired) return "expired"
  if (balance <= CREDIT_LOW_MAX) return "low"
  if (balance <= 3000) return "mid"
  return "ok"
}

export type CreditSpendInput = {
  /** วันหมดอายุของทั้งกระปุก (member_balances.next_expiry) — null = ไม่เคยเติมเงิน */
  expiry: string | null
  /** วันที่ของบิล ไม่ใช่วันนี้ — ร้านบันทึกย้อนหลังได้ บิลที่ให้บริการตอนเครดิตยังไม่หมดอายุต้องคีย์ได้ */
  onDate: string
  /** ยอดคงเหลือ รวมส่วนที่แช่แข็งด้วย */
  balance: number
  /** ยอดที่จะตัดครั้งนี้ */
  wanted: number
  /** ยอดที่บิลนี้เคยตัดไว้ (เฉพาะตอนแก้บิล) — ตัดเท่าเดิมหรือน้อยลงไม่ถือว่าใช้เครดิตใหม่ */
  alreadyUsedOnThisBill?: number
}

export type CreditSpendResult =
  | { ok: true }
  | { ok: false; reason: "expired" | "insufficient"; message: string }

/**
 * ตัวกันเดียวที่ตัดสินว่าตัดเครดิตได้ไหม — ทั้ง createSale และ updateSale ต้องเรียกตัวนี้
 *
 * ก่อนหน้านี้การกัน "หมดอายุแล้วห้ามใช้" ซ่อนอยู่ในตัวเลข (view คัดก้อนที่หมดอายุออกให้เอง)
 * ไม่ได้อยู่ในโค้ดเลยสักบรรทัด พอเปลี่ยนมาเป็นกระปุกเดียวที่ยอดรวมเครดิตแช่แข็งด้วย
 * ตัวกันต้องย้ายออกมาอยู่ตรงนี้ ไม่งั้นเครดิตที่หมดอายุจะใช้ได้ฟรีทั้งก้อน
 */
export function checkCreditSpend(input: CreditSpendInput): CreditSpendResult {
  const { expiry, onDate, balance, wanted } = input
  const previously = input.alreadyUsedOnThisBill ?? 0

  // วันหมดอายุวันนี้พอดียังใช้ได้ทั้งวัน จึงเทียบด้วย > ไม่ใช่ >=
  // เทียบสตริง YYYY-MM-DD ตรง ๆ ได้เพราะเรียงตามพจนานุกรมตรงกับเรียงตามเวลา
  const หมดอายุ = expiry === null || onDate > expiry

  // ตัดเท่าเดิมหรือน้อยลงบนบิลที่เคยตัดไว้แล้ว ไม่ใช่การใช้เครดิตใหม่ — แก้บิลเก่าได้เสมอ
  if (หมดอายุ && wanted > previously) {
    const วันที่ = expiry ?? "ยังไม่เคยเติมแพ็กเกจ"
    return {
      ok: false,
      reason: "expired",
      message:
        expiry === null
          ? "ลูกค้ายังไม่เคยซื้อแพ็กเกจสมาชิก จึงยังไม่มีเครดิตให้ตัด"
          : `เครดิตหมดอายุเมื่อ ${วันที่} — ยอด ${balance} ฿ ยังอยู่ครบ เติมแพ็กเกจใหม่แล้วใช้ได้ทันที`,
    }
  }

  if (balance < wanted) {
    return {
      ok: false,
      reason: "insufficient",
      message: `เครดิตคงเหลือไม่พอ (มี ${balance} บาท ต้องใช้ ${wanted} บาท)`,
    }
  }

  return { ok: true }
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx vitest run src/lib/member-credit.test.ts && npm test
```

คาดหวัง: ผ่านทั้งไฟล์ และทั้งชุดยังผ่านครบ

- [ ] **Step 5: Commit**

```bash
git add src/lib/member-credit.ts src/lib/member-credit.test.ts
git commit -m "feat(credit): ตรรกะกลาง checkCreditSpend + สถานะ expired ใน creditBucket"
```

---

### Task 3: กันฝั่ง server ทั้งตอนสร้างและตอนแก้บิล

**Files:**
- Modify: `src/app/(app)/sale-actions.ts` (บล็อกเครดิตใน `createSale` ราวบรรทัด 163–185 และใน `updateSale` ราวบรรทัด 645–682)
- Modify: `src/app/(app)/members/member-actions.ts` (`deleteTopup` ราวบรรทัด 76–110)

**Interfaces:**
- Consumes: `checkCreditSpend(input: CreditSpendInput): CreditSpendResult` จากงานที่ 2 · คอลัมน์ `next_expiry` จาก view ในงานที่ 1
- Produces: ไม่มีอะไรที่งานอื่นเรียกต่อ

- [ ] **Step 1: แก้ createSale**

ใน `src/app/(app)/sale-actions.ts` เปลี่ยนบล็อกที่ดึงยอดและตรวจ (ราวบรรทัด 163–185) เป็น:

```typescript
    const { data: balance } = await supabase
      .from("member_balances")
      .select("credit_balance, credit_granted, cash_paid, next_expiry")
      .eq("customer_id", customerId)
      .single()

    const granted = balance?.credit_granted ?? 0
    memberRatio = granted > 0 ? (balance?.cash_paid ?? 0) / granted : 1

    const credit = balance?.credit_balance ?? 0
    // เครดิตเต็มบิลต้องพอทั้งบิล (เดิม) · แบ่งจ่ายต้องพอเท่าที่ขอตัด
    const wanted =
      paymentMethod === MEMBER_CREDIT_METHOD
        ? priceNormal - discountInput + roomFee
        : creditRequested
    // เทียบกับวันที่ของบิล ไม่ใช่วันนี้ — บิลที่ให้บริการตอนเครดิตยังไม่หมดอายุต้องคีย์ย้อนหลังได้
    const spend = checkCreditSpend({
      expiry: balance?.next_expiry ?? null,
      onDate: saleDate,
      balance: credit,
      wanted,
    })
    if (!spend.ok) {
      return { ok: false, error: spend.message }
    }
    creditAfter = credit - wanted
```

เพิ่ม import ที่หัวไฟล์: `import { checkCreditSpend } from "@/lib/member-credit"`

- [ ] **Step 2: แก้ updateSale**

ในไฟล์เดียวกัน เปลี่ยนบล็อกของ `updateSale` (ราวบรรทัด 650–682) เป็น:

```typescript
    const { data: balance } = await supabase
      .from("member_balances")
      .select("credit_balance, credit_granted, cash_paid, next_expiry")
      .eq("customer_id", customerId)
      .single()

    const granted = balance?.credit_granted ?? 0
    memberRatio = granted > 0 ? (balance?.cash_paid ?? 0) / granted : 1

    // ยอดคงเหลือปัจจุบันหักรายการนี้ไปแล้ว การแก้จะคืนของเดิมก่อนตัดใหม่
    // เพดานจึงเป็นคงเหลือ + ที่รายการนี้เคยตัด — แต่คืนได้เฉพาะเมื่อยังเป็นลูกค้าคนเดิม
    const sameCustomer = existing.customer_id === customerId
    const previouslyUsed = sameCustomer ? Number(existing.credit_used ?? 0) : 0
    const headroom = Number(balance?.credit_balance ?? 0) + previouslyUsed

    const wanted =
      paymentMethod === MEMBER_CREDIT_METHOD
        ? service.price -
          discountInput +
          (formData.get("private_room") === "on" ? PRIVATE_ROOM_FEE : 0)
        : creditRequested
    // ใช้ sale_date ของบิลเดิม และส่ง previouslyUsed เพื่อให้แก้บิลเก่าของลูกค้าที่หมดอายุได้
    // ตราบใดที่ไม่เพิ่มยอดตัด — ถ้าบล็อกทุกกรณี พนักงานจะแก้บิลที่คีย์ผิดไม่ได้เลย
    const spend = checkCreditSpend({
      expiry: balance?.next_expiry ?? null,
      onDate: existing.sale_date,
      balance: headroom,
      wanted,
      alreadyUsedOnThisBill: previouslyUsed,
    })
    if (!spend.ok) {
      return {
        ok: false,
        error:
          spend.reason === "insufficient"
            ? `เครดิตคงเหลือไม่พอ (แก้เป็นได้สูงสุด ${headroom} บาท ต้องใช้ ${wanted} บาท)`
            : spend.message,
      }
    }
    creditAfter = headroom - wanted
```

- [ ] **Step 3: เตือนก่อนลบใบเติมเงินที่ทำให้วันหมดอายุถอยหลัง**

ใน `src/app/(app)/members/member-actions.ts` **แก้ลายเซ็นของ `deleteTopup` ก่อน** จาก
`export async function deleteTopup(id: string): Promise<TopupResult>` เป็น:

```typescript
export async function deleteTopup(
  id: string,
  confirmShorten = false
): Promise<TopupResult> {
```

แล้วเพิ่มบล็อกนี้ต่อจากการตรวจยอดคงเหลือ (หลังบล็อก `if (remaining < Number(topup.credit_added))`):

```typescript
  // ลบใบที่ถือวันหมดอายุไกลสุดอยู่ = วันหมดอายุของทั้งกระปุกจะถอยหลัง
  // ลูกค้าอาจกลายเป็นหมดอายุทันที ต้องบอกให้รู้ตัวก่อน ไม่ใช่ให้ไปเจอเอาตอนลูกค้ามาถึงร้าน
  const { data: expiries } = await supabase
    .from("member_topups")
    .select("id, expiry_date")
    .eq("customer_id", topup.customer_id)
  const rows = expiries ?? []
  const furthestOf = (list: typeof rows) =>
    list.reduce<string | null>(
      (max, r) => (max === null || String(r.expiry_date) > max ? String(r.expiry_date) : max),
      null
    )
  const expiryNow = furthestOf(rows)
  const expiryAfter = furthestOf(rows.filter((r) => r.id !== id))
  if (expiryNow !== null && expiryAfter !== expiryNow && !confirmShorten) {
    return {
      ok: false,
      error: `ลบใบนี้จะทำให้วันหมดอายุเครดิตถอยจาก ${expiryNow} เป็น ${expiryAfter ?? "ไม่มีเครดิตเหลือเลย"} — ถ้าแน่ใจให้กดยืนยันอีกครั้ง`,
    }
  }
```

ผู้เรียกเดิมที่ส่งอาร์กิวเมนต์เดียวยังคอมไพล์ผ่าน เพราะ `confirmShorten` มีค่าเริ่มต้น
ผลคือครั้งแรกจะถูกปฏิเสธพร้อมข้อความ พนักงานกดยืนยันอีกครั้งแล้วผู้เรียกส่ง `true` เข้ามาจึงลบได้
ให้แก้ผู้เรียกในหน้าสมาชิกให้ส่ง `true` เมื่อพนักงานกดยืนยันซ้ำ

- [ ] **Step 4: typecheck + เทสต์**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx tsc --noEmit && npm test
```

คาดหวัง: ไม่มี error และเทสต์ผ่านครบ

- [ ] **Step 5: ตรวจด้วยมือว่าเครดิตหมดอายุใช้ไม่ได้จริง**

รัน `execute_sql` เพื่อหาลูกค้าที่จะใช้ทดสอบ (อย่าเขียนข้อมูล — แค่ยืนยันว่า view ให้ค่าที่โค้ดจะใช้):

```sql
select name, phone, credit_balance, next_expiry, credit_expired
from public.member_balances
where credit_balance > 0
order by next_expiry
limit 3;
```

จดค่าไว้ แล้วยืนยันว่า `checkCreditSpend` จะให้ผลอะไรกับค่าเหล่านั้นเมื่อ `onDate` เป็นวันหลัง `next_expiry`

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/sale-actions.ts" "src/app/(app)/members/member-actions.ts"
git commit -m "feat(credit): กันการใช้เครดิตที่หมดอายุฝั่ง server + เตือนก่อนลบใบเติมเงินที่ทำให้อายุถอย"
```

---

### Task 4: หน้าจอบอกสถานะแช่แข็งพร้อมชวนเติม

**Files:**
- Modify: `src/app/(app)/pos/customer-picker.tsx` (ป้ายข้างชื่อลูกค้า ราวบรรทัด 80–115)
- Modify: `src/app/(app)/pos/group-pos-form.tsx` (`canUseCredit` ราวบรรทัด 158–170)
- Modify: `src/app/(app)/customers/[id]/page.tsx` (ราวบรรทัด 33 และ 68)
- Modify: `src/app/(app)/customers/customer-table.tsx` (`CreditAmount` ราวบรรทัด 71)
- Modify: `src/app/(app)/members/member-row.tsx` (ราวบรรทัด 32)
- Modify: `src/app/book/points-actions.ts` (ราวบรรทัด 352 และ 413)

**Interfaces:**
- Consumes: `creditBucket(balance, expired)` จากงานที่ 2 · คอลัมน์ `credit_expired` จากงานที่ 1
- Produces: ไม่มีอะไรที่งานอื่นเรียกต่อ

- [ ] **Step 1: ป้ายที่หน้าเลือกลูกค้าใน POS**

ใน `src/app/(app)/pos/customer-picker.tsx` เปลี่ยน select ให้ดึงสถานะมาด้วย:

```typescript
      const { data } = await supabase
        .from("member_balances")
        .select("credit_balance, next_expiry, credit_expired")
        .eq("customer_id", customerId)
        .single()
```

ไฟล์นี้มี state `balance` อยู่แล้ว ให้เพิ่มอีกสองตัวข้าง ๆ กัน:

```typescript
  const [creditExpired, setCreditExpired] = useState(false)
  const [expiryDate, setExpiryDate] = useState<string | null>(null)
```

แล้วเซ็ตค่าในที่เดียวกับที่เรียก `setBalance(b)`:

```typescript
        setBalance(b)
        setCreditExpired(Boolean(data?.credit_expired))
        setExpiryDate(data?.next_expiry ?? null)
        onBalanceChange?.(b)
```

จากนั้นเปลี่ยนป้าย (ต้อง `import { formatThaiDate } from "@/lib/datetime"` เพิ่มที่หัวไฟล์):

```tsx
        {shownBalance !== null &&
          (creditExpired && shownBalance > 0 && expiryDate !== null ? (
            <Badge className="bg-amber-500 text-white hover:bg-amber-500">
              เครดิต {formatBaht(shownBalance)} ฿ · หมดอายุ {formatThaiDate(expiryDate)} —
              เติมใหม่ใช้ได้ทันที
            </Badge>
          ) : (
            <Badge variant={shownBalance > 0 ? "default" : "secondary"}>
              เครดิตคงเหลือ {formatBaht(shownBalance)} ฿
            </Badge>
          ))}
```

- [ ] **Step 2: ปิดปุ่มจ่ายด้วยเครดิตในบิลชุด**

ใน `src/app/(app)/pos/group-pos-form.tsx` ดึง `credit_expired` มาด้วยแล้วแก้เงื่อนไข:

```typescript
      const { data } = await supabase
        .from("member_balances")
        .select("credit_balance, credit_expired")
        .eq("customer_id", billCustomerId)
        .single()
```

```typescript
  // ตัวกันจริงอยู่ฝั่ง server (ทุกรายการวิ่งผ่าน createSale) ตรงนี้กันไม่ให้พนักงานเสียเวลากรอก
  const canUseCredit = Boolean(billCustomerId) && creditBalance > 0 && !creditExpired
```

และแสดงข้อความใต้ช่องกรอกเมื่อ `creditExpired && creditBalance > 0`:

```tsx
        {creditExpired && creditBalance > 0 && (
          <p className="text-sm text-amber-700">
            เครดิตหมดอายุแล้ว — ยอด {formatBaht(creditBalance)} ฿ ยังอยู่ครบ
            เติมแพ็กเกจใหม่แล้วใช้ได้ทันที
          </p>
        )}
```

- [ ] **Step 3: ป้ายในหน้าประวัติลูกค้า**

ใน `src/app/(app)/customers/[id]/page.tsx` เพิ่ม `credit_expired` เข้า select บรรทัด 33 แล้วแสดงป้ายใต้ยอดเครดิตเมื่อหมดอายุและยังมียอด:

```tsx
        {balance?.credit_expired && credit > 0 && (
          <p className="text-sm font-medium text-amber-700">
            หมดอายุแล้ว — เติมเพิ่มเพื่อปลดล็อก {formatBaht(credit)} ฿
          </p>
        )}
```

- [ ] **Step 4: ตารางลูกค้าและแถวสมาชิก**

ใน `src/app/(app)/customers/customer-table.tsx` เพิ่ม `credit_expired` เข้าชนิดข้อมูลของแถว แล้วให้ `CreditAmount` แสดงสีเหลืองพร้อมคำว่า "(หมดอายุ)" ต่อท้ายเมื่อ `credit_expired` เป็นจริงและยอดมากกว่า 0

ใน `src/app/(app)/members/member-row.tsx` เพิ่ม `expired?: boolean` เข้า props ของคอมโพเนนต์
(ค่าเริ่มต้น `false` เพื่อให้ผู้เรียกเดิมยังคอมไพล์ผ่าน) แล้วเปลี่ยนบรรทัด 32 เป็น:

```typescript
  const bucket = creditBucket(balance, expired)
  const low = bucket === "low"
  const isExpired = bucket === "expired"
```

แล้วแสดงป้าย `หมดอายุแล้ว` เมื่อ `isExpired`

**หน้าที่เรียกคือ `src/app/(app)/members/page.tsx`** ซึ่งงานที่ 5 จะแก้ต่อในไฟล์เดียวกัน
งานนี้ให้เพิ่มแค่ `credit_expired` เข้า select บรรทัด 25 และส่งต่อเป็น prop
`expired={m.credit_expired ?? false}` ที่จุดที่ render `MemberRow` — อย่าเพิ่งแตะการรวมยอด

- [ ] **Step 5: หน้าไลน์ของลูกค้า**

ใน `src/app/book/points-actions.ts` เพิ่ม `credit_expired` เข้า select บรรทัด 352 แล้วส่งออกไปด้วยในบรรทัด 413:

```typescript
    member: {
      tier: lastTopup?.tier ?? null,
      creditBalance: balance?.credit_balance ?? 0,
      nextExpiry: balance?.next_expiry ?? null,
      creditExpired: balance?.credit_expired ?? false,
    },
```

หน้าที่แสดงผลต้องบอกชัดว่าหมดอายุแล้ว ห้ามโชว์ยอดลอย ๆ ให้ลูกค้าเข้าใจว่าใช้ได้

- [ ] **Step 6: typecheck + เทสต์ + build**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx tsc --noEmit && npm test && npx next build
```

คาดหวัง: ผ่านทั้งสามอย่าง

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/pos" "src/app/(app)/customers" "src/app/(app)/members/member-row.tsx" src/app/book/points-actions.ts
git commit -m "feat(credit): หน้าจอบอกสถานะเครดิตแช่แข็งพร้อมข้อความชวนเติมแพ็กเกจ"
```

---

### Task 5: แดชบอร์ดแยกยอดใช้ได้กับยอดแช่แข็ง

**Files:**
- Modify: `src/app/(app)/members/page.tsx` (ราวบรรทัด 25–40)
- Modify: `src/app/(app)/overview/page.tsx` (ราวบรรทัด 206–210)
- Modify: `src/lib/daily-report.ts` และ `src/app/api/cron/daily-report/route.ts` (ราวบรรทัด 82–88)

**Interfaces:**
- Consumes: คอลัมน์ `credit_expired` จากงานที่ 1
- Produces: ไม่มีอะไรที่งานอื่นเรียกต่อ

- [ ] **Step 1: หน้าสมาชิกแยกยอด**

ใน `src/app/(app)/members/page.tsx` เพิ่ม `credit_expired` เข้า select บรรทัด 25 แล้วแยกผลรวมเป็นสองตัว:

```typescript
  const ใช้ได้ = members
    .filter((m) => !m.credit_expired)
    .reduce((sum, m) => sum + (m.credit_balance ?? 0), 0)
  const แช่แข็ง = members
    .filter((m) => m.credit_expired)
    .reduce((sum, m) => sum + (m.credit_balance ?? 0), 0)
```

แสดงเป็น `ใช้ได้ X ฿ · แช่แข็ง Y ฿` แทนยอดรวมก้อนเดียว และ **ห้ามกรองสมาชิกที่หมดอายุออกจากรายการ**
เพราะเป็นกลุ่มที่ควรตามกลับมาเติม

- [ ] **Step 2: หน้าภาพรวม**

ใน `src/app/(app)/overview/page.tsx` การ์ด "เครดิตใกล้หมด" (บรรทัด 206–210) กรองด้วย
`.gt("credit_balance", 0).lte("credit_balance", CREDIT_LOW_MAX)` ให้เพิ่ม `.eq("credit_expired", false)`
เพราะสมาชิกที่แช่แข็งต้องใช้คำชวนคนละแบบ ไม่ใช่ "เครดิตใกล้หมด"

- [ ] **Step 3: Daily Report เพิ่มบรรทัดเครดิตหมดอายุ**

ใน `src/app/api/cron/daily-report/route.ts` การนับกลุ่ม "เครดิตใกล้หมด" (บรรทัด 86–87) ให้เพิ่ม
`.eq("credit_expired", false)` และเพิ่มการนับกลุ่มใหม่:

```typescript
      supabase
        .from("member_balances")
        .select("customer_id", { count: "exact", head: true })
        .gt("credit_balance", 0)
        .eq("credit_expired", true),
```

แล้วส่งจำนวนนี้เข้าการ์ดรายงานเป็นบรรทัด `เครดิตหมดอายุ N คน` แยกจาก `เครดิตใกล้หมด`

- [ ] **Step 4: typecheck + เทสต์ + build**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx tsc --noEmit && npm test && npx next build
```

คาดหวัง: ผ่านทั้งสามอย่าง — ถ้า `daily-report.test.ts` fail เพราะรูปแบบการ์ดเปลี่ยน ให้แก้เทสต์ให้ตรงกับการ์ดใหม่ **ห้ามลบเคสเทสต์ทิ้ง**

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/members/page.tsx" "src/app/(app)/overview/page.tsx" src/lib/daily-report.ts src/app/api/cron/daily-report/route.ts
git commit -m "feat(credit): แดชบอร์ดและ Daily Report แยกยอดเครดิตใช้ได้ออกจากยอดแช่แข็ง"
```

---

### Task 6: ขึ้นระบบและยืนยันบนของจริง

**Files:** ไม่มีการแก้ไฟล์

**Interfaces:**
- Consumes: ทุกอย่างจากงานที่ 1–5

- [ ] **Step 1: ดึงโค้ดล่าสุดก่อนเสมอ**

repo นี้มีหลาย session ทำงานพร้อมกัน และ Vercel auto-deploy จาก GitHub ด้วย ถ้า deploy จากเครื่อง
โดยไม่ push ก่อน งานจะถูก auto-deploy ของอีก session ทับหายไป (เกิดขึ้นจริงมาแล้ววันที่ 10 ส.ค.)

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
git fetch origin && git rebase origin/main && git push origin main
```

- [ ] **Step 2: Deploy**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx vercel deploy --prod
```

- [ ] **Step 3: ยืนยันว่า alias ชี้ตัวใหม่จริง**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx vercel inspect sookkaya-pos.vercel.app
```

คาดหวัง: `created` เป็นเวลาไม่กี่นาทีที่ผ่านมา และ `status` เป็น `● Ready`

- [ ] **Step 4: ยืนยันฐานข้อมูลหลังขึ้นระบบ**

```sql
select
  (select count(*) from public.member_balances) = (select count(*) from public.customers) as แถวครบ,
  (select next_expiry from public.member_balances where phone = '0976866666') as ตี๋_expiry,
  (select count(*) from public.member_balances where credit_expired) as แช่แข็งกี่คน,
  (select reloptions::text from pg_class where relname = 'member_balances') as reloptions;
```

คาดหวัง: `แถวครบ = true` · `ตี๋_expiry = 2027-04-17` · `reloptions` มี `security_invoker=true`

## Self-Review

- **Spec coverage:** นิยาม view ใหม่ → งาน 1 · การบังคับฝั่ง server → งาน 3 (ตรรกะอยู่ในงาน 2) · ข้อความแจ้งเตือนทุกจุด → งาน 4 · แดชบอร์ดและ Daily Report แยกยอด → งาน 5 · การตรวจ `topup_missing_expiry` → งาน 1 Step 6 · เตือนตอนลบใบเติมเงิน → งาน 3 Step 3 · regenerate types → งาน 1 Step 8 · ขึ้นระบบ → งาน 6 ครบทุกข้อในสเปก
- **Placeholder scan:** ไม่มี TBD/TODO — SQL และ TypeScript ทุกก้อนเขียนเต็ม คัดลอกไปวางได้
- **Type consistency:** `checkCreditSpend` / `CreditSpendInput` / `CreditSpendResult` / `creditBucket(balance, expired)` นิยามในงาน 2 และถูกเรียกด้วยชื่อและพารามิเตอร์เดียวกันเป๊ะในงาน 3 และ 4 · คอลัมน์ `credit_expired` และ `next_expiry` สร้างในงาน 1 และถูกอ้างด้วยชื่อเดิมทุกงานถัดไป
