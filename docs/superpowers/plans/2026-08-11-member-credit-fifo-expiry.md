# แก้เครดิตสมาชิกให้หมดอายุถูกก้อน (FIFO) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้ยอดเครดิตคงเหลือของสมาชิกหักการใช้งานออกจาก "ก้อนเติมเงินที่ใช้ไปจริง" แบบ FIFO เพื่อที่เมื่อก้อนใดหมดอายุ ทั้งยอดที่ให้และยอดที่ใช้ของก้อนนั้นจะหายไปพร้อมกัน แทนที่จะเหลือแต่ยอดใช้ค้างไว้กัดกินก้อนที่ยังไม่หมดอายุ

**Architecture:** แก้ที่ view `member_balances` ที่เดียว ด้วย window function จัดสรรยอด `credit_used` รวมของลูกค้าลงในก้อน `member_topups` เรียงตามวันหมดอายุ ไม่เพิ่มตาราง ไม่ backfill ไม่แตะโค้ดแอปที่คำนวณตอนขาย เพราะทุกหน้าอ่านยอดจาก view นี้อยู่แล้ว

**Tech Stack:** PostgreSQL 17 (Supabase) · SQL migration ผ่าน `supabase/migrations/` · ตรวจด้วย `supabase/reconciliation.sql`

## Global Constraints

- ชื่อคอลัมน์ ลำดับคอลัมน์ และชนิดข้อมูลของ `member_balances` ต้องเหมือนเดิมทุกประการ — มี 13 ไฟล์ในแอปอ่าน view นี้อยู่
- view ต้องคืน **หนึ่งแถวต่อลูกค้าหนึ่งคน ทุกคนในตาราง `customers`** (ปัจจุบัน 1,091 แถว) ไม่ใช่เฉพาะสมาชิก — หน้า POS พึ่งพาพฤติกรรมนี้
- ทุก `create or replace view` ต้องระบุ `with (security_invoker = true)` เสมอ เพราะคำสั่งนี้รีเซ็ต reloptions เงียบๆ (เคยทำให้ `v_monthly_pl` กลายเป็น SECURITY DEFINER แล้วเปิด P&L ทั้งร้านให้พนักงานผ่าน REST API)
- "วันนี้" ต้องใช้ `(now() at time zone 'Asia/Bangkok')::date` เท่านั้น ห้าม `current_date`
- `supabase/reconciliation.sql` ต้อง PASS ทุกข้อก่อนปิดงาน

## บริบทของปัญหา (อ่านก่อนลงมือ)

สูตรปัจจุบันใน `member_balances`:

```
credit_balance = SUM(credit_added ของก้อนที่ยังไม่หมดอายุ) − SUM(credit_used ทุกบิลทุกยุค)
```

สองข้างใช้เกณฑ์เวลาคนละแบบ พอก้อนเติมเงินหมดอายุ ยอดที่ให้จะหลุดออกจากสมการ แต่ยอดที่ลูกค้าใช้ไปแล้วยังอยู่ครบ **ยอดใช้ของก้อนเก่าจึงย้ายไปกัดกินก้อนใหม่ที่ยังไม่หมดอายุ**

**ยังไม่มีก้อนไหนหมดอายุเลย** (73 ก้อน ก้อนแรกหมด **2026-10-12**) ปัญหาจึงยังไม่โผล่ ต้องแก้ให้เสร็จก่อนวันนั้น

ตัวอย่างจริงที่วัดได้ ณ 2026-08-11 — **คุณพิมพ์ (0889469666)** มี 2 ก้อน ยอดคงเหลือวันนี้ 5,420฿:

| | วันนี้ | 13 ต.ค. 2026 |
|---|---|---|
| สูตรปัจจุบัน | 5,420฿ | **−580฿** |
| สูตร FIFO (ที่ถูก) | 5,420฿ | 5,420฿ |

ลูกค้าจะถูกริบเครดิตที่ยังใช้ได้ 5,420฿ และ UI จะจัดเธอเข้าช่อง "หมดแล้ว" (`creditBucket()` ตียอด ≤ 0 เป็น `empty`) รวมทั้งระบบวันนั้นต่างกัน **6,000฿**

## คุณสมบัติความปลอดภัยที่ใช้ตรวจรับ

วัดจริงแล้ว ณ 2026-08-11: สูตรใหม่ให้ผล **เท่าเดิมเป๊ะทุกคน** (รวม 160,070฿ เท่ากัน ลูกค้าที่ยอดขยับ = 0 คน) เพราะยังไม่มีก้อนไหนหมดอายุ ถ้ารันแล้วตัวเลขวันนี้ขยับแม้บาทเดียว = สูตรใหม่ผิด ให้ rollback ทันที

## หมายเหตุการออกแบบที่ตัดสินไปแล้ว

- **FIFO เรียงตามวันหมดอายุ** (`order by expiry_date, id`) ไม่ใช่วันเติมเงิน — ก้อนที่จะหมดอายุก่อนต้องถูกใช้ก่อน ตรงกับสามัญสำนึกของลูกค้าและทำให้เครดิตหมดอายุน้อยที่สุด
- **ไม่เก็บความสัมพันธ์ sale↔topup ลงตาราง** เพราะร้านยังไม่ต้องการ audit trail รายก้อน และการ backfill 369 บิลย้อนหลังมีความเสี่ยงมากกว่าประโยชน์ (YAGNI) ถ้าวันหน้าต้องการค่อยเพิ่มตารางจัดสรรทีหลังได้โดยไม่ต้องรื้อ view
- **ยอดคงเหลือจะไม่ติดลบอีกต่อไป** ผลข้างเคียงคือเคสแบบ "เดียร์" (ใช้เครดิตโดยไม่เคยเติม) จะกลายเป็น 0 แทนที่จะเป็นเลขติดลบให้สังเกตเห็น จึงต้องเพิ่มการตรวจใน reconciliation มาแทน (Task 2) — ห้ามข้าม ไม่งั้นเรากำลังปิดตาตัวเองต่อการคีย์ผิดใบ

---

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `supabase/migrations/20260811150000_member_balances_fifo_expiry.sql` (สร้างใหม่) | นิยาม `member_balances` ใหม่ด้วยการจัดสรร FIFO |
| `supabase/reconciliation.sql` (แก้) | เพิ่มการตรวจ `orphan_credit_used` |
| `src/lib/member-credit.ts` (แก้ บรรทัด 19-22) | คอมเมนต์เดิมบอกว่ายอดติดลบเป็นเรื่องปกติ ซึ่งจะไม่จริงอีกต่อไป |

---

### Task 1: เปลี่ยน member_balances เป็นการจัดสรรแบบ FIFO

**Files:**
- Create: `supabase/migrations/20260811150000_member_balances_fifo_expiry.sql`
- Modify: `src/lib/member-credit.ts:19-22`

**Interfaces:**
- Consumes: ตาราง `member_topups` (`customer_id, expiry_date, credit_added, bonus_added, cash_received, id`), ตาราง `sales` (`customer_id, credit_used`), ตาราง `customers`
- Produces: view `member_balances` คอลัมน์เดิมทุกตัว — `customer_id, name, nickname, phone, credit_balance, credit_granted, bonus_granted, cash_paid, next_expiry, customer_type, created_at`

- [ ] **Step 1: เขียนแบบทดสอบก่อน — บันทึกค่าฐานของวันนี้**

รันคำสั่งนี้แล้วจดค่าที่ได้ไว้ (ควรได้ `160070` และ `1091` ถ้าไม่มีการเติมเงิน/ขายด้วยเครดิตเพิ่มระหว่างนั้น):

```sql
select round(sum(credit_balance)) as total_balance, count(*) as row_count
from public.member_balances;
```

- [ ] **Step 2: เขียน migration**

สร้าง `supabase/migrations/20260811150000_member_balances_fifo_expiry.sql`:

```sql
-- ยอดเครดิตคงเหลือเคยคิดจาก "ก้อนที่ยังไม่หมดอายุ ลบ ยอดใช้ทุกยุค" สองข้างคนละเกณฑ์เวลา
-- พอก้อนหมดอายุ ยอดที่ให้หลุดจากสมการแต่ยอดใช้ยังอยู่ ยอดใช้ของก้อนเก่าจึงย้ายไปกิน
-- ก้อนใหม่ที่ยังไม่หมดอายุ (คุณพิมพ์ 0889469666 จะเหลือ -580 ทั้งที่มีสิทธิ์จริง 5,420 ในวันที่ 13 ต.ค. 2026)
--
-- แก้ด้วยการจัดสรรยอดใช้ลงก้อนแบบ FIFO เรียงตามวันหมดอายุ ก้อนที่จะหมดก่อนถูกใช้ก่อน
-- ทั้งยอดที่ให้และยอดที่ใช้ของก้อนเดียวกันจึงหายไปพร้อมกันตอนหมดอายุ
--
-- ณ วันที่เขียน ยังไม่มีก้อนใดหมดอายุ (ก้อนแรก 2026-10-12) ผลลัพธ์วันนี้จึงต้องเท่าเดิมเป๊ะ
create or replace view public.member_balances
with (security_invoker = true) as
with shop_today as (
  -- เซิร์ฟเวอร์รันเป็น UTC — ต้องเทียบวันหมดอายุด้วยวันไทยเสมอ
  select (now() at time zone 'Asia/Bangkok')::date as d
),
used as (
  select sa.customer_id, sum(sa.credit_used) as used
  from public.sales sa
  where sa.credit_used > 0 and sa.customer_id is not null
  group by sa.customer_id
),
alloc as (
  -- absorbed = ส่วนของยอดใช้รวมที่ตกลงมาถึงก้อนนี้ หลังก้อนก่อนหน้าดูดไปเต็มที่แล้ว
  select
    mt.customer_id,
    mt.expiry_date,
    mt.credit_added,
    mt.bonus_added,
    mt.cash_received,
    least(
      mt.credit_added,
      greatest(
        coalesce(u.used, 0) - coalesce(sum(mt.credit_added) over (
          partition by mt.customer_id
          order by mt.expiry_date, mt.id
          rows between unbounded preceding and 1 preceding
        ), 0),
        0
      )
    ) as absorbed
  from public.member_topups mt
  left join used u on u.customer_id = mt.customer_id
),
agg as (
  select
    a.customer_id,
    sum(a.credit_added - a.absorbed) filter (where a.expiry_date >= t.d) as credit_balance,
    sum(a.credit_added)   filter (where a.expiry_date >= t.d) as credit_granted,
    sum(a.bonus_added)    filter (where a.expiry_date >= t.d) as bonus_granted,
    sum(a.cash_received)  filter (where a.expiry_date >= t.d) as cash_paid,
    min(a.expiry_date)    filter (where a.expiry_date >= t.d) as next_expiry
  from alloc a
  cross join shop_today t
  group by a.customer_id
)
-- ต้องคืนทุกคนในตาราง customers ไม่ใช่เฉพาะสมาชิก — หน้า POS พึ่งพาพฤติกรรมนี้
select
  c.id as customer_id,
  c.name,
  c.nickname,
  c.phone,
  coalesce(g.credit_balance, 0::numeric) as credit_balance,
  coalesce(g.credit_granted, 0::numeric) as credit_granted,
  coalesce(g.bonus_granted, 0::numeric) as bonus_granted,
  coalesce(g.cash_paid, 0::numeric) as cash_paid,
  g.next_expiry,
  c.customer_type,
  c.created_at
from public.customers c
left join agg g on g.customer_id = c.id;
```

- [ ] **Step 3: รัน migration**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx supabase db push
```

หรือถ้าใช้ MCP: `apply_migration` ด้วยชื่อ `member_balances_fifo_expiry` และเนื้อ SQL ข้างบน

- [ ] **Step 4: ตรวจว่าวันนี้ตัวเลขไม่ขยับแม้บาทเดียว**

```sql
select round(sum(credit_balance)) as total_balance, count(*) as row_count
from public.member_balances;
```

คาดหวัง: ได้ค่าเท่ากับที่จดไว้ใน Step 1 เป๊ะ (`160070` / `1091`)
ถ้าไม่เท่า = สูตรผิด ให้ย้อน view กลับเป็นของเดิมทันทีแล้วหาสาเหตุก่อนไปต่อ

- [ ] **Step 5: ตรวจว่าปัญหาวันที่ 13 ต.ค. หายไปแล้วจริง**

```sql
-- จำลองว่าถ้าวันนี้คือ 2026-10-13 คุณพิมพ์จะเหลือเท่าไหร่
with used as (
  select customer_id, sum(credit_used) u from public.sales
  where credit_used > 0 and customer_id is not null group by 1
),
alloc as (
  select mt.customer_id, mt.expiry_date, mt.credit_added,
    least(mt.credit_added, greatest(coalesce(u.u,0) - coalesce(sum(mt.credit_added) over (
      partition by mt.customer_id order by mt.expiry_date, mt.id
      rows between unbounded preceding and 1 preceding),0),0)) absorbed
  from public.member_topups mt left join used u on u.customer_id = mt.customer_id
)
select c.name, c.phone,
  round(sum(a.credit_added - a.absorbed) filter (where a.expiry_date >= date '2026-10-13')) as balance_after_expiry
from alloc a join public.customers c on c.id = a.customer_id
where c.phone = '0889469666'
group by c.name, c.phone;
```

คาดหวัง: `balance_after_expiry = 5420` (เดิมสูตรเก่าจะได้ `-580`)

- [ ] **Step 6: ตรวจว่า security_invoker ยังติดอยู่**

```sql
select relname, reloptions from pg_class
where relname = 'member_balances';
```

คาดหวัง: `reloptions` มี `security_invoker=true`
ถ้าเป็น `null` = โดนรีเซ็ต ต้องรัน `alter view public.member_balances set (security_invoker = true);`

- [ ] **Step 7: แก้คอมเมนต์ที่ไม่จริงแล้วใน member-credit.ts**

แทนที่บรรทัด 19-22 ของ `src/lib/member-credit.ts`:

```typescript
/**
 * ยอดติดลบไม่ควรเกิดจากการหมดอายุอีกต่อไปแล้ว (member_balances จัดสรรยอดใช้ลงก้อนแบบ FIFO
 * ตั้งแต่ 2026-08-11) ถ้ายังเห็นติดลบ แปลว่ามีบิลตัดเครดิตของลูกค้าที่ไม่เคยเติมเงิน
 * ซึ่งคือการคีย์ผิดใบ — reconciliation ข้อ orphan_credit_used จะจับให้
 * ยังตีเป็น "หมดแล้ว" เหมือนยอดศูนย์ ไม่ใช่ปล่อยให้หายไปจากทุกช่อง
 */
```

- [ ] **Step 8: รันเทสต์ทั้งชุด**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npm test
```

คาดหวัง: PASS ทั้งหมด (ฐานปัจจุบัน 592 ตัว / 42 ไฟล์)

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260811150000_member_balances_fifo_expiry.sql src/lib/member-credit.ts
git commit -m "fix(credit): จัดสรรเครดิตที่ใช้ลงก้อนแบบ FIFO ไม่ให้ยอดใช้ของก้อนที่หมดอายุไปกินก้อนใหม่"
```

---

### Task 2: เพิ่มการตรวจ orphan_credit_used ใน reconciliation

**Files:**
- Modify: `supabase/reconciliation.sql` (เพิ่มใน CTE `expected` และ CTE `actual`)

**Interfaces:**
- Consumes: view `member_balances` จาก Task 1, ตาราง `sales`, ตาราง `member_topups`
- Produces: การตรวจชื่อ `orphan_credit_used` ค่าที่ถูกต้องคือ `0`

- [ ] **Step 1: เขียนแบบทดสอบก่อน — ยืนยันว่าตอนนี้ค่าเป็น 0**

```sql
select coalesce(sum(x.orphan), 0)::bigint as orphan_credit_used
from (
  select greatest(
    coalesce((select sum(sa.credit_used) from public.sales sa
              where sa.customer_id = c.id and sa.credit_used > 0), 0)
    - coalesce((select sum(mt.credit_added) from public.member_topups mt
                where mt.customer_id = c.id), 0), 0) as orphan
  from public.customers c
) x;
```

คาดหวัง: `0` (หลังแก้เคสเดียร์เมื่อ 2026-08-11 แล้ว)
ถ้าไม่ใช่ 0 แปลว่ามีการคีย์ผิดใบเพิ่มอีก ต้องตามแก้ก่อนค่อยเพิ่มการตรวจ ไม่งั้นจะ FAIL ตั้งแต่วันแรก

- [ ] **Step 2: เพิ่มค่าที่คาดหวังใน CTE `expected`**

ใน `supabase/reconciliation.sql` หาบรรทัด `('member_credit_used',  209410),` แล้วเพิ่มบรรทัดถัดจากนั้น:

```sql
  -- ยอดตัดเครดิตที่ไม่มีก้อนเติมเงินรองรับ = คีย์ผิดใบลูกค้า (เคยเจอ 1,300 บาทของ "เดียร์"
  -- ที่ควรเป็นของ "เดียร์22" แก้แล้ว 2026-08-11) ต้องเป็นศูนย์เสมอ
  --
  -- ตรวจข้อนี้แทนการดูยอดติดลบใน member_balances เพราะตั้งแต่เปลี่ยนเป็น FIFO
  -- ยอดคงเหลือจะไม่ติดลบอีกแล้ว การคีย์ผิดใบจึงมองไม่เห็นจากยอดคงเหลืออีกต่อไป
  ('orphan_credit_used', 0),
```

- [ ] **Step 3: เพิ่มการคำนวณจริงใน CTE `actual`**

หาบล็อก `select 'bill_overpaid', count(*)` แล้วเพิ่มก่อนหน้าหรือถัดจากนั้น (ภายใน CTE `actual` เดียวกัน):

```sql
  union all
  select 'orphan_credit_used', coalesce(sum(x.orphan), 0)::bigint
  from (
    select greatest(
      coalesce((select sum(sa.credit_used) from public.sales sa
                where sa.customer_id = c.id and sa.credit_used > 0), 0)
      - coalesce((select sum(mt.credit_added) from public.member_topups mt
                  where mt.customer_id = c.id), 0), 0) as orphan
    from public.customers c
  ) x
```

- [ ] **Step 4: รัน reconciliation ทั้งไฟล์**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx supabase db execute --file supabase/reconciliation.sql
```

หรือคัดลอกเนื้อไฟล์ไปรันผ่าน MCP `execute_sql`

คาดหวัง: คอลัมน์ `result` เป็น `PASS` ทุกแถว รวมถึงแถวใหม่ `orphan_credit_used`

- [ ] **Step 5: Commit**

```bash
git add supabase/reconciliation.sql
git commit -m "test(recon): ตรวจยอดตัดเครดิตที่ไม่มีก้อนเติมเงินรองรับ (จับการคีย์ผิดใบลูกค้า)"
```

---

### Task 3: Deploy และยืนยันบนของจริง

**Files:** ไม่มีการแก้ไฟล์ — เป็นขั้นตอน deploy อย่างเดียว

**Interfaces:**
- Consumes: migration จาก Task 1 และการตรวจจาก Task 2

- [ ] **Step 1: ดึงโค้ดล่าสุดก่อนเสมอ**

repo นี้มีหลาย session ทำงานพร้อมกัน และ Vercel auto-deploy จาก GitHub ด้วย ถ้า deploy จากเครื่องโดยไม่ push ก่อน งานจะถูก auto-deploy ของอีก session ทับหายไป

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

- [ ] **Step 4: เปิดหน้าสมาชิกดูด้วยตา**

เปิด https://sookkaya-pos.vercel.app/members แล้วเทียบยอดรวมเครดิตกับค่าที่จดไว้ใน Task 1 Step 1 — ต้องเท่ากัน

## Self-Review

- **Spec coverage:** ปัญหาสูตรเครดิต → Task 1 · การมองไม่เห็นการคีย์ผิดใบหลังยอดไม่ติดลบแล้ว → Task 2 · การขึ้นใช้งานจริง → Task 3 ครบทุกข้อที่ยกมาในบริบท
- **Placeholder scan:** ไม่มี TBD/TODO — SQL ทุกก้อนเขียนเต็ม คัดลอกไปรันได้ทันที
- **Type consistency:** ชื่อคอลัมน์ใน view ใหม่ตรงกับของเดิมทั้ง 11 ตัว · ชื่อการตรวจ `orphan_credit_used` ใช้ตรงกันทั้ง CTE `expected` และ `actual`
