# SOOKKAYA Analytics เฟส 2 — Implementation Plan

> **For agentic workers:** ใช้ superpowers:subagent-driven-development หรือ executing-plans

**Goal:** ให้เจ้าของร้านเห็นกำไรรายเดือน กระแสเงินสด และจุดคุ้มทุน โดยตัวเลขตรงกับ Excel เดิม

**Architecture:** view `v_monthly_pl` รวมยอดรายเดือนจากแหล่งเดียว (ยอดขาย + ค่ามือจาก `v_therapist_daily` + รายจ่ายแยกประเภท) แล้วหน้าเว็บแค่แสดงผล ไม่คำนวณสูตรการเงินเอง

**Tech Stack:** Next.js 16 · Supabase Postgres · TypeScript · Tailwind + shadcn/ui

**ก่อนรันทุกคำสั่ง:** `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"`

**Spec:** `docs/superpowers/specs/2026-07-20-analytics-phase2-design.md`

---

## File Structure

| ไฟล์ | หน้าที่ |
| ---- | ------- |
| `src/app/(app)/finance/page.tsx` | การเงินรายเดือน — กำไร 2 มุมมอง, เตือนข้อมูลไม่ครบ, เทียบเป้า, P&L ย้อนหลัง |
| `src/app/(app)/finance/unit-economics/page.tsx` | จุดคุ้มทุนและกำไรต่อเมนู |
| `src/app/(app)/settings/cost-types-tab.tsx` | แก้การจัดกลุ่มต้นทุน |
| `src/lib/finance.ts` | ฟังก์ชันบริสุทธิ์: จุดคุ้มทุน, ตรวจว่าเดือนข้อมูลครบไหม |
| `src/lib/finance.test.ts` | เทสของฟังก์ชันข้างบน |

---

## Task 1: View `v_monthly_pl`

- [ ] **Step 1: apply migration ชื่อ `create_monthly_pl_view`**

```sql
create view public.v_monthly_pl
with (security_invoker = true) as
with months as (
  select distinct to_char(sale_date, 'YYYY-MM') as month from public.sales
  union
  select distinct to_char(expense_date, 'YYYY-MM') from public.expenses
),
sales_m as (
  select to_char(sale_date,'YYYY-MM') as month,
         sum(net_revenue) as net_revenue,
         sum(cash_in)     as cash_in,
         sum(sessions)    as sessions
  from public.v_daily_summary group by 1
),
comm_m as (
  select to_char(work_date,'YYYY-MM') as month,
         sum(total_income)    as commission_cost,
         sum(net_commission) - sum(total_commission) as guarantee_topup
  from public.v_therapist_daily group by 1
),
exp_m as (
  select to_char(expense_date,'YYYY-MM') as month,
         sum(amount)                                          as expense_total,
         sum(amount) filter (where cost_type = 'fixed')       as fixed_cost,
         sum(amount) filter (where cost_type = 'variable')    as variable_cost,
         sum(amount) filter (where cost_type = 'onetime')     as onetime_cost,
         sum(amount) filter (where category like 'HR / payroll%') as payroll_paid
  from public.expenses group by 1
)
select
  m.month,
  coalesce(s.net_revenue, 0)      as net_revenue,
  coalesce(s.cash_in, 0)          as cash_in,
  coalesce(s.sessions, 0)         as sessions,
  coalesce(c.commission_cost, 0)  as commission_cost,
  coalesce(c.guarantee_topup, 0)  as guarantee_topup,
  coalesce(e.expense_total, 0)    as expense_total,
  coalesce(e.fixed_cost, 0)       as fixed_cost,
  coalesce(e.variable_cost, 0)    as variable_cost,
  coalesce(e.onetime_cost, 0)     as onetime_cost,
  coalesce(e.payroll_paid, 0)     as payroll_paid,
  -- กำไรแบบ Excel: รายได้ที่รับรู้ ลบรายจ่ายที่จ่ายจริงทั้งหมด
  coalesce(s.net_revenue, 0) - coalesce(e.expense_total, 0)  as profit_cash,
  -- กำไรเชิงบัญชี: ค่ามือที่เกิดขึ้นจากงานเดือนนั้น + รายจ่ายที่ไม่ใช่ค่ามือ
  coalesce(s.net_revenue, 0) - coalesce(c.commission_cost, 0)
    - (coalesce(e.expense_total, 0) - coalesce(e.payroll_paid, 0)) as profit_accrual
from months m
left join sales_m s on s.month = m.month
left join comm_m  c on c.month = m.month
left join exp_m   e on e.month = m.month;
```

- [ ] **Step 2: ตรวจว่าตรงกับ Excel**

```sql
select month, round(net_revenue) nr, round(expense_total) exp,
       round(profit_cash) cash, round(profit_accrual) accrual, round(fixed_cost) fixed
from public.v_monthly_pl order by month;
```

Expected `profit_cash`: มี.ค. **−107695** · เม.ย. **−70428** · พ.ค. **−27606** · มิ.ย. **88991**
ถ้าไม่ตรงแม้เดือนเดียว **หยุด**

- [ ] **Step 3: เพิ่ม type ใน `src/types/database.ts`**

เพิ่ม `v_monthly_pl` ใน `Views` ตามรูปแบบเดียวกับ `v_daily_summary` (ทุกคอลัมน์ nullable)

---

## Task 2: `src/lib/finance.ts` + เทส (TDD)

- [ ] **Step 1: เขียนเทสก่อน** — สร้าง `src/lib/finance.test.ts`

```ts
import { describe, expect, it } from "vitest"
import { breakEvenSessions, isMonthIncomplete, unitEconomics } from "./finance"

describe("unitEconomics", () => {
  it("คำนวณจากตัวเลขจริงเดือน มิ.ย. 69", () => {
    const u = unitEconomics({
      netRevenue: 347018, sessions: 529,
      variableCost: 125059, fixedCost: 104648, onetimeCost: 28320,
    })
    expect(u.revenuePerSession).toBe(656)
    expect(u.variableCostPerSession).toBe(236)
    expect(u.contributionMargin).toBe(420)
  })

  it("ไม่หารด้วยศูนย์เมื่อไม่มีเซสชัน", () => {
    const u = unitEconomics({
      netRevenue: 0, sessions: 0, variableCost: 0, fixedCost: 50000, onetimeCost: 0,
    })
    expect(u.revenuePerSession).toBe(0)
    expect(u.contributionMargin).toBe(0)
  })
})

describe("breakEvenSessions", () => {
  it("ปัดขึ้นเสมอ เพราะทำเซสชันครึ่งเดียวไม่ได้", () => {
    expect(breakEvenSessions(104648, 420)).toBe(250)
    expect(breakEvenSessions(1000, 300)).toBe(4)
  })

  it("คืน null เมื่อกำไรต่อเซสชันเป็นศูนย์หรือติดลบ — คุ้มทุนไม่ได้เลย", () => {
    expect(breakEvenSessions(104648, 0)).toBeNull()
    expect(breakEvenSessions(104648, -50)).toBeNull()
  })
})

describe("isMonthIncomplete", () => {
  it("เตือนเมื่อต้นทุนคงที่ต่ำกว่าครึ่งของค่าเฉลี่ยย้อนหลัง", () => {
    expect(isMonthIncomplete(2636, [77757, 102666, 104648])).toBe(true)
  })

  it("ไม่เตือนเมื่อบันทึกครบตามปกติ", () => {
    expect(isMonthIncomplete(104648, [77757, 75815, 102666])).toBe(false)
  })

  it("ไม่เตือนเมื่อยังไม่มีข้อมูลย้อนหลังให้เทียบ", () => {
    expect(isMonthIncomplete(0, [])).toBe(false)
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าไม่ผ่าน** — `npm test` → FAIL (ไม่มีไฟล์ finance.ts)

- [ ] **Step 3: เขียน `src/lib/finance.ts`**

```ts
export type UnitInput = {
  netRevenue: number
  sessions: number
  variableCost: number
  fixedCost: number
  onetimeCost: number
}

export type UnitResult = {
  revenuePerSession: number
  variableCostPerSession: number
  contributionMargin: number
}

/** กำไรที่ร้านได้เพิ่มทุกครั้งที่ขายอีก 1 เซสชัน หลังหักต้นทุนที่ผันแปรตามงาน */
export function unitEconomics(input: UnitInput): UnitResult {
  if (input.sessions <= 0) {
    return { revenuePerSession: 0, variableCostPerSession: 0, contributionMargin: 0 }
  }
  const revenuePerSession = Math.round(input.netRevenue / input.sessions)
  const variableCostPerSession = Math.round(input.variableCost / input.sessions)
  return {
    revenuePerSession,
    variableCostPerSession,
    contributionMargin: revenuePerSession - variableCostPerSession,
  }
}

/**
 * ต้องขายกี่เซสชันถึงจะครอบคลุมต้นทุนที่ต้องจ่ายไม่ว่าจะมีลูกค้าหรือไม่
 * คืน null ถ้ากำไรต่อเซสชันไม่เป็นบวก — ขายเท่าไหร่ก็ไม่มีวันคุ้ม
 */
export function breakEvenSessions(
  fixedCost: number,
  contributionMargin: number
): number | null {
  if (contributionMargin <= 0) return null
  return Math.ceil(fixedCost / contributionMargin)
}

/**
 * รายจ่ายก้อนใหญ่ (ค่าเช่า เงินเดือน) บันทึกตอนสิ้นเดือน
 * ต้นเดือนกำไรจึงดูสูงเกินจริง — ตรวจจับเพื่อเตือนก่อนเจ้าของร้านตัดสินใจผิด
 */
export function isMonthIncomplete(
  fixedCostThisMonth: number,
  fixedCostPreviousMonths: number[]
): boolean {
  if (fixedCostPreviousMonths.length === 0) return false
  const average =
    fixedCostPreviousMonths.reduce((sum, v) => sum + v, 0) /
    fixedCostPreviousMonths.length
  if (average <= 0) return false
  return fixedCostThisMonth < average * 0.5
}
```

- [ ] **Step 4: `npm test`** → ผ่านทั้งหมด (16 เดิม + 8 ใหม่ = 24)

- [ ] **Step 5: Commit** — `git commit -m "feat: ฟังก์ชันคำนวณจุดคุ้มทุนพร้อมเทส"`

---

## Task 3: หน้า `/finance`

- [ ] **Step 1: สร้าง `src/app/(app)/finance/page.tsx`**

ข้อกำหนด:

1. **สิทธิ์ admin เท่านั้น** — อ่าน role จาก `profiles` ถ้าไม่ใช่ admin แสดงข้อความสั้นๆ
   ว่าหน้านี้แสดงกำไรขาดทุนทั้งร้าน จำกัดเฉพาะเจ้าของร้าน พร้อมปุ่มกลับหน้าแรก
   **ห้าม query ข้อมูลการเงินเมื่อไม่มีสิทธิ์**
2. เลือกเดือนด้วย query param `?month=YYYY-MM` ค่าเริ่มต้น = เดือนปัจจุบันจาก
   `todayInShopTz().slice(0,7)` มีปุ่ม ← → เลื่อนเดือน (ดูรูปแบบใน `reports/page.tsx`)
3. ดึงจาก `v_monthly_pl` ทุกเดือน เรียงตาม `month`
4. **แถบเตือนข้อมูลไม่ครบ** — ใช้ `isMonthIncomplete(fixedCostเดือนนี้, fixedCost 3 เดือนก่อน)`
   ถ้า true แสดงแถบสีเหลืองว่า *"ยังบันทึกรายจ่ายไม่ครบ กำไรที่เห็นสูงกว่าความจริง"*
   พร้อมบอกว่าปกติต้นทุนคงที่เดือนละประมาณเท่าไหร่ (ค่าเฉลี่ยย้อนหลัง)
5. **กำไร 2 มุมมองคู่กัน** — การ์ดซ้าย "เงินสดจริง" (`profit_cash`) แสดงรายการ
   รายได้รับรู้ − รายจ่ายทั้งหมด · การ์ดขวา "กำไรเชิงบัญชี" (`profit_accrual`)
   แสดง รายได้รับรู้ − ค่ามือที่เกิดขึ้น − รายจ่ายอื่น
   ใต้การ์ดมีคำอธิบายว่าต่างกันเพราะจังหวะจ่ายค่ามือไม่ตรงเดือน
6. **เทียบเป้า** — แถบความคืบหน้า `net_revenue / monthly_target` (อ่านจาก `settings`)
   แสดงเปอร์เซ็นต์และยอดที่เหลือ
7. **P&L ย้อนหลัง 6 เดือน** — ตาราง เดือน / รายได้ / รายจ่าย / กำไรเงินสด
   กำไรติดลบเป็นสีแดง เดือนที่กำลังดูอยู่ไฮไลต์
8. **รายจ่ายแยกประเภท** — fixed / variable / onetime พร้อมเปอร์เซ็นต์ของยอดรวม
9. `export const metadata = { title: "การเงิน · สุขกายา POS" }`

- [ ] **Step 2: เพิ่มลิงก์ในหน้า `/more`** (icon `Wallet` มีอยู่แล้ว ใช้ `PiggyBank` แทน)

- [ ] **Step 3: `npm run build && npx eslint src && npm test`** ต้องผ่านทั้งหมด

- [ ] **Step 4: ตรวจตัวเลขบนหน้าจริง** — `/finance?month=2026-06` ต้องแสดง
  กำไรเงินสด **88,991** · ต้นทุนคงที่ **104,648**

- [ ] **Step 5: Commit**

---

## Task 4: หน้า `/finance/unit-economics`

- [ ] **Step 1: สร้าง `src/app/(app)/finance/unit-economics/page.tsx`**

1. สิทธิ์ admin เท่านั้น (เหมือน Task 3)
2. เลือกเดือนแบบเดียวกับ `/finance`
3. ใช้ `unitEconomics()` และ `breakEvenSessions()` จาก `@/lib/finance`
4. แสดง 4 ตัวเลขใหญ่: รายได้เฉลี่ย/เซสชัน · ต้นทุนผันแปร/เซสชัน ·
   กำไรที่ได้เพิ่มทุกเซสชัน · เซสชันที่ทำได้จริง
5. **จุดคุ้มทุน 2 แบบ** เทียบกับที่ทำได้จริง:
   - คุ้มต้นทุนคงที่ = `breakEvenSessions(fixed_cost, contributionMargin)`
   - คุ้มทุนจริง = `breakEvenSessions(fixed_cost + onetime_cost, contributionMargin)`
   ถ้าฟังก์ชันคืน `null` ให้แสดงว่า "กำไรต่อเซสชันไม่เป็นบวก — ยังไม่มีจุดคุ้มทุน"
6. **กำไรต่อเมนู** — query `services` (`name, price, commission, material_cost, is_active`)
   เฉพาะที่ `is_active` คำนวณ `profit = price - commission - material_cost`
   และ `margin = profit / price` เรียงจากกำไรน้อยไปมาก แสดงตาราง
   เมนู / ราคา / ค่ามือ / วัสดุ / กำไร / % — กำไรต่ำกว่า 30% เป็นสีเหลือง
   ถ้า `material_cost` เป็น null ให้ข้ามเมนูนั้นและบอกจำนวนที่ข้าม
7. `export const metadata = { title: "จุดคุ้มทุน · สุขกายา POS" }`

- [ ] **Step 2: ลิงก์จาก `/finance`** ปุ่ม "ดูจุดคุ้มทุน"

- [ ] **Step 3: build + lint + test ผ่าน**

- [ ] **Step 4: ตรวจตัวเลข** — `?month=2026-06` ต้องได้ กำไร/เซสชัน **฿420** ·
  จุดคุ้มทุน **250 เซสชัน**

- [ ] **Step 5: Commit**

---

## Task 5: แท็บจัดกลุ่มต้นทุนใน `/settings`

- [ ] **Step 1: สร้าง `src/app/(app)/settings/cost-types-tab.tsx`**

1. แสดง 8 หมวดจาก `expense_category_types` ให้เลือก fixed/variable/onetime ต่อหมวด
2. แสดงรายจ่ายของเดือนล่าสุดที่จัดกลุ่มไว้ ให้กดเปลี่ยน `cost_type` รายรายการได้
   (จำเป็นเพราะหมวด HR/payroll ปนทั้งค่ามือและเงินเดือน)
3. server action ใหม่ใน `settings-actions.ts`: `saveCategoryType` และ `saveExpenseCostType`
   ทั้งคู่จำกัด admin/manager และ `revalidatePath("/finance")` ด้วย

- [ ] **Step 2: เพิ่มแท็บใน `settings/page.tsx`** ชื่อ "ต้นทุน" แสดงเฉพาะ admin/manager

- [ ] **Step 3: build + lint + test ผ่าน**

- [ ] **Step 4: Commit**

---

## Task 6: ตรวจสอบและ deploy

- [ ] **Step 1: เพิ่มการตรวจใน `supabase/reconciliation.sql`**

```sql
  ('profit_cash_2026_03', -107695),
  ('profit_cash_2026_04',  -70428),
  ('profit_cash_2026_05',  -27606),
  ('profit_cash_2026_06',   88991),
```

พร้อม actual:

```sql
  union all
  select 'profit_cash_' || replace(month,'-','_'), round(profit_cash)
  from public.v_monthly_pl where month between '2026-03' and '2026-06'
```

- [ ] **Step 2: รันชุดตรวจ** — ต้อง PASS ครบ 14 ข้อ

- [ ] **Step 3: `npm test && npm run build && npx eslint src`** ผ่านทั้งหมด

- [ ] **Step 4: `get_advisors` type security** — ต้องไม่มี ERROR ใหม่

- [ ] **Step 5: `npx vercel deploy --prod`**

- [ ] **Step 6: อัปเดต README** เพิ่ม `/finance` และ `/finance/unit-economics`
  ในตารางหน้า และติ๊กเฟส 2

- [ ] **Step 7: Commit**

---

## เสร็จแล้วได้อะไร

- เห็นกำไรรายเดือน 2 มุมมอง ตรงกับ Excel เดิมทุกบาท
- รู้จุดคุ้มทุนจริง และเห็นว่าเดือนนี้ทำได้เกินหรือขาด
- รู้ว่าเมนูไหนขายดีแต่กำไรบาง
- แก้การจัดกลุ่มต้นทุนเองได้โดยไม่ต้อง deploy
- มีระบบเตือนเมื่อข้อมูลเดือนยังไม่ครบ ไม่ตัดสินใจจากตัวเลขหลอกตา
