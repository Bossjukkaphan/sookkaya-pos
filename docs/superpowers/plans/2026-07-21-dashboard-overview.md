# SOOKKAYA หน้าภาพรวม + ระบบหน้าตาใหม่ (รอบ 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: ใช้ superpowers:subagent-driven-development (แนะนำ)
> หรือ superpowers:executing-plans ลงมือทีละ Task · ทุก step เป็น checkbox ให้ติ๊กตามจริง

**Goal:** เจ้าของร้านเปิดแอปมาเจอหน้าเดียวที่บอกได้ว่า *เดือนนี้เป็นยังไง เทียบเดือนก่อนดีขึ้นไหม ถึงเป้าหรือยัง และปีนี้สะสมมาเท่าไหร่*

**Architecture:** เพิ่ม 3 คอลัมน์ใน view `v_monthly_pl` ด้วย window function (YTD และเดือนก่อน)
หน้าเว็บอ่านแถวเดียวได้ครบ ไม่บวกเลขเงินเอง · กราฟวาดเป็น SVG ฝั่ง server จากฟังก์ชันบริสุทธิ์ที่มีเทส
ไม่เพิ่ม dependency และไม่ต้องทำหน้าเป็น client component

**Tech Stack:** Next.js 16 · Supabase Postgres · TypeScript · Tailwind + shadcn/ui · vitest

**Spec:** `docs/superpowers/specs/2026-07-21-dashboard-overview-design.md`

**ก่อนรันทุกคำสั่ง:** `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"`

**Supabase project ref:** `jrioyrmicioqammeevgh`

**ก่อนเขียนโค้ด Next.js:** อ่าน `AGENTS.md` — Next.js 16 มี breaking change จากที่คุณเคยรู้
(`searchParams` เป็น Promise) ดูตัวอย่างจริงใน `src/app/(app)/finance/page.tsx`

**เทสตอนนี้ผ่าน 67 ข้อ · reconciliation 18 ข้อ** — ทุก Task บอกว่าต้องได้เท่าไหร่

---

## File Structure

| ไฟล์ | หน้าที่ |
| ---- | ------- |
| `src/lib/chart.ts` | ฟังก์ชันบริสุทธิ์: สเกลแกน · พิกัดแท่ง · path เส้น |
| `src/lib/chart.test.ts` | เทสของข้างบน |
| `src/components/charts/bar-chart.tsx` | กราฟแท่ง SVG (server component) |
| `src/components/charts/line-chart.tsx` | กราฟเส้น SVG (server component) |
| `src/components/stat-card.tsx` | การ์ด KPI ใบเล็กโทนสว่าง |
| `src/components/app-shell.tsx` | เมนู responsive ตาม role — แทน `app-nav.tsx` |
| `src/app/(app)/layout.tsx` | *(แก้)* ใช้ `AppShell` และวาง sidebar |
| `src/app/(app)/today/page.tsx` | ยอดวันนี้ — ย้ายมาจาก `(app)/page.tsx` |
| `src/app/(app)/page.tsx` | *(แทนที่)* เหลือแค่ redirect ตาม role |
| `src/app/(app)/overview/page.tsx` | หน้าภาพรวม |
| `src/types/database.ts` | *(แก้)* 3 คอลัมน์ใหม่ของ `v_monthly_pl` |
| `supabase/reconciliation.sql` | *(แก้)* เพิ่มการตรวจ YTD (18 → 20 ข้อ) |

ไฟล์ที่ **ลบ**: `src/components/app-nav.tsx` (ย้ายเนื้อหาไป `app-shell.tsx`)

---

## Task 1: เพิ่มคอลัมน์ YTD ใน `v_monthly_pl`

**Files:** migration ผ่าน MCP · `src/types/database.ts` · `supabase/reconciliation.sql`

- [ ] **Step 1: apply migration ชื่อ `add_ytd_columns_to_monthly_pl`**

`create or replace view` เพิ่มคอลัมน์ต่อท้ายได้ โดยคอลัมน์เดิม 13 ตัวต้องชื่อและชนิดเดิมเป๊ะ
ไม่งั้น Postgres จะปฏิเสธ — หน้า `/finance` ที่ `select *` อยู่จึงไม่กระทบ

```sql
create or replace view public.v_monthly_pl as
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
),
base as (
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
    coalesce(s.net_revenue, 0) - coalesce(e.expense_total, 0)  as profit_cash,
    coalesce(s.net_revenue, 0) - coalesce(c.commission_cost, 0)
      - (coalesce(e.expense_total, 0) - coalesce(e.payroll_paid, 0)) as profit_accrual
  from months m
  left join sales_m s on s.month = m.month
  left join comm_m  c on c.month = m.month
  left join exp_m   e on e.month = m.month
)
select
  base.*,
  -- รายได้เดือนก่อนหน้า ใช้ทำลูกศรขึ้น/ลงบนการ์ดใหญ่
  lag(net_revenue) over (order by month) as prev_net_revenue,
  -- สะสม "ต้นปี" คือ partition ตามปีในสตริงเดือน ไม่ใช่ 12 เดือนย้อนหลัง
  sum(net_revenue) over (
    partition by left(month, 4) order by month
    rows between unbounded preceding and current row
  ) as ytd_net_revenue,
  sum(profit_cash) over (
    partition by left(month, 4) order by month
    rows between unbounded preceding and current row
  ) as ytd_profit_cash
from base;
```

- [ ] **Step 2: ตรวจว่าคอลัมน์เดิมไม่เพี้ยนและคอลัมน์ใหม่ถูก**

```sql
select month, round(net_revenue) rev, round(profit_cash) pc,
       round(prev_net_revenue) prev, round(ytd_net_revenue) ytd_rev,
       round(ytd_profit_cash) ytd_pc
from public.v_monthly_pl order by month;
```

Expected ครบทุกแถว:

| month | rev | pc | prev | ytd_rev | ytd_pc |
| ----- | --- | -- | ---- | ------- | ------ |
| 2026-03 | 174842 | −107695 | *(ว่าง)* | 174842 | −107695 |
| 2026-04 | 316123 | −70428 | 174842 | 490965 | −178124 |
| 2026-05 | 286158 | −27606 | 316123 | 777124 | −205730 |
| 2026-06 | 347018 | 88991 | 286158 | 1124141 | −116739 |
| 2026-07 | *(ขยับทุกวัน)* | | 347018 | | |

ถ้า `rev` หรือ `pc` ของ มี.ค.–มิ.ย. เปลี่ยนไปจากเดิมแม้บาทเดียว **หยุด** — แปลว่าแก้ view พลาด

- [ ] **Step 3: ตรวจว่าหน้า `/finance` ยังใช้ได้**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npm run build
```

Expected: build ผ่าน (หน้า `/finance` ใช้ `select *` จึงได้คอลัมน์เพิ่มมาเฉยๆ ไม่พัง)

- [ ] **Step 4: เพิ่ม type ใน `src/types/database.ts`**

ใน `Views.v_monthly_pl.Row` เพิ่ม 3 บรรทัด เรียงตามตัวอักษรให้เข้ากับที่มีอยู่:

```ts
          prev_net_revenue: number | null
          ytd_net_revenue: number | null
          ytd_profit_cash: number | null
```

- [ ] **Step 5: เพิ่มการตรวจใน `supabase/reconciliation.sql`**

ใน `expected(...)` ต่อจาก `('promo_unmatched_rows', 20)` ใส่ comma แล้วเพิ่ม:

```sql
  ,
  -- รอบ 1 หน้าภาพรวม: ยอดสะสมต้นปีถึง มิ.ย. (ก.ค. ยังขยับทุกวัน จึงไม่เอามาตรวจ)
  ('ytd_net_revenue_2026_06',  1124141),
  ('ytd_profit_cash_2026_06',  -116739)
```

ใน `actual(...)` ต่อท้าย:

```sql
  union all
  select 'ytd_net_revenue_2026_06', round(ytd_net_revenue)
  from public.v_monthly_pl where month = '2026-06'

  union all
  select 'ytd_profit_cash_2026_06', round(ytd_profit_cash)
  from public.v_monthly_pl where month = '2026-06'
```

- [ ] **Step 6: รันชุดตรวจทั้งไฟล์** — Expected: **20 ข้อ PASS ทั้งหมด**

ถ้ามี FAIL **หยุด** ห้ามแก้ค่า expected ให้ผ่าน

- [ ] **Step 7: Commit**

```bash
git add src/types/database.ts supabase/reconciliation.sql
git commit -m "feat: เพิ่มยอดสะสมต้นปีใน v_monthly_pl"
```

---

## Task 2: `src/lib/chart.ts` + เทส (TDD)

กราฟทั้งหมดในแอปจะสร้างจากฟังก์ชันพวกนี้ ถ้าสเกลผิด กราฟทุกหน้าผิดตามกันหมด
จึงต้องมีเทสก่อนเขียนโค้ด

**Files:** Create `src/lib/chart.ts` · Test `src/lib/chart.test.ts`

- [ ] **Step 1: เขียนเทสก่อน** — สร้าง `src/lib/chart.test.ts`

```ts
import { describe, expect, it } from "vitest"
import { barGeometry, linePath, linearScale } from "./chart"

describe("linearScale", () => {
  it("รวมศูนย์ไว้ในช่วงเสมอ เพื่อให้แท่งกราฟตั้งบนเส้นฐานจริง", () => {
    const s = linearScale([100, 200], 100)
    expect(s.min).toBe(0)
    expect(s.max).toBe(200)
    expect(s.y(200)).toBeCloseTo(0)
    expect(s.y(0)).toBeCloseTo(100)
    expect(s.zeroY).toBeCloseTo(100)
  })

  it("ค่าติดลบวางใต้เส้นศูนย์ได้ — กำไร 3 เดือนแรกติดลบจริง", () => {
    const s = linearScale([-107695, 88991], 150)
    expect(s.min).toBe(-107695)
    expect(s.max).toBe(88991)
    expect(s.y(-107695)).toBeCloseTo(150)
    expect(s.y(88991)).toBeCloseTo(0)
    expect(s.zeroY).toBeGreaterThan(0)
    expect(s.zeroY).toBeLessThan(150)
  })

  it("ไม่หารด้วยศูนย์เมื่อไม่มีข้อมูล", () => {
    const s = linearScale([], 100)
    expect(Number.isFinite(s.y(0))).toBe(true)
    expect(Number.isFinite(s.zeroY)).toBe(true)
  })

  it("ไม่หารด้วยศูนย์เมื่อทุกค่าเท่ากันและเป็นศูนย์", () => {
    const s = linearScale([0, 0, 0], 100)
    expect(Number.isFinite(s.y(0))).toBe(true)
  })
})

describe("barGeometry", () => {
  it("แบ่งความกว้างเท่าๆ กันและแท่งไม่ทับกัน", () => {
    const bars = barGeometry([
      { label: "มี.ค.", value: 100 },
      { label: "เม.ย.", value: 200 },
    ], 100, 50)

    expect(bars).toHaveLength(2)
    expect(bars[0].x + bars[0].w).toBeLessThanOrEqual(bars[1].x)
    expect(bars[1].h).toBeGreaterThan(bars[0].h)
  })

  it("แท่งค่าติดลบเริ่มที่เส้นศูนย์แล้วยื่นลงล่าง", () => {
    const bars = barGeometry([
      { label: "มี.ค.", value: -100 },
      { label: "มิ.ย.", value: 100 },
    ], 100, 100)

    expect(bars[0].y).toBeCloseTo(50)
    expect(bars[0].h).toBeCloseTo(50)
    expect(bars[1].y).toBeCloseTo(0)
  })

  it("คืนอาเรย์ว่างเมื่อไม่มีข้อมูล ไม่ throw", () => {
    expect(barGeometry([], 100, 50)).toEqual([])
  })
})

describe("linePath", () => {
  it("สร้าง path ที่เริ่มด้วย M แล้วต่อด้วย L ทีละจุด", () => {
    const d = linePath([
      { label: "a", value: 0 },
      { label: "b", value: 100 },
    ], 100, 50)

    expect(d.startsWith("M ")).toBe(true)
    expect(d.split("L")).toHaveLength(2)
  })

  it("คืนสตริงว่างเมื่อไม่มีข้อมูล — SVG จะไม่วาดอะไรเลย", () => {
    expect(linePath([], 100, 50)).toBe("")
  })

  it("จุดเดียวก็ยังได้ path ที่ valid", () => {
    const d = linePath([{ label: "a", value: 50 }], 100, 50)
    expect(d.startsWith("M ")).toBe(true)
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าไม่ผ่าน** — `npm test` → FAIL `Failed to resolve import "./chart"`

- [ ] **Step 3: เขียน `src/lib/chart.ts`**

```ts
export type Point = { label: string; value: number }

export type Scale = {
  min: number
  max: number
  /** แปลงค่าเป็นพิกัด y ในกล่องสูง height โดย 0 คือขอบบน */
  y: (value: number) => number
  /** พิกัด y ของเส้นศูนย์ — แท่งค่าติดลบเริ่มจากเส้นนี้ */
  zeroY: number
}

/**
 * ดึงศูนย์เข้ามาอยู่ในช่วงเสมอ ไม่งั้นแท่งกราฟจะลอยและอ่านสัดส่วนผิด
 * เช่นรายได้ 174,842 กับ 347,018 ถ้าไม่รวมศูนย์ แท่งแรกจะดูเหมือนศูนย์บาท
 */
export function linearScale(values: number[], height: number): Scale {
  const finite = values.filter((v) => Number.isFinite(v))
  const min = finite.length > 0 ? Math.min(0, ...finite) : 0
  let max = finite.length > 0 ? Math.max(0, ...finite) : 0

  // ช่วงเป็นศูนย์เกิดได้จริงเมื่อเดือนใหม่ยังไม่มียอด — กันหารศูนย์
  if (max === min) max = min + 1

  const span = max - min
  const y = (value: number) => height - ((value - min) / span) * height

  return { min, max, y, zeroY: y(0) }
}

export type Bar = { x: number; y: number; w: number; h: number } & Point

/** พิกัดแท่งกราฟ · gap คือสัดส่วนช่องว่างต่อช่อง (0.3 = แท่งกว้าง 70% ของช่อง) */
export function barGeometry(
  points: Point[],
  width: number,
  height: number,
  gap = 0.3
): Bar[] {
  if (points.length === 0) return []

  const scale = linearScale(points.map((p) => p.value), height)
  const slot = width / points.length
  const w = slot * (1 - gap)

  return points.map((p, i) => {
    const valueY = scale.y(p.value)
    return {
      ...p,
      x: i * slot + (slot - w) / 2,
      y: Math.min(valueY, scale.zeroY),
      w,
      h: Math.abs(scale.zeroY - valueY),
    }
  })
}

/** path ของกราฟเส้น · คืนสตริงว่างเมื่อไม่มีจุด เพื่อให้ SVG ไม่วาดอะไรเลย */
export function linePath(points: Point[], width: number, height: number): string {
  if (points.length === 0) return ""

  const scale = linearScale(points.map((p) => p.value), height)
  const step = points.length > 1 ? width / (points.length - 1) : 0

  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${i * step} ${scale.y(p.value)}`)
    .join(" ")
}
```

- [ ] **Step 4: `npm test`** → ผ่านทั้งหมด **77 ข้อ** (67 + 10 ใหม่)

- [ ] **Step 5: `npx eslint src`** → ไม่มี error

- [ ] **Step 6: Commit**

```bash
git add src/lib/chart.ts src/lib/chart.test.ts
git commit -m "feat: ฟังก์ชันคำนวณพิกัดกราฟพร้อมเทส"
```

---

## Task 3: component กราฟ SVG

**Files:** Create `src/components/charts/bar-chart.tsx` · `src/components/charts/line-chart.tsx`

- [ ] **Step 1: สร้าง `src/components/charts/bar-chart.tsx`**

```tsx
import { barGeometry, type Point } from "@/lib/chart"

const W = 320
const H = 120

/**
 * กราฟแท่ง เรนเดอร์เป็น SVG ฝั่ง server — ไม่ต้องเป็น client component
 * และไม่ต้องโหลดไลบรารีกราฟ · ชี้ค้างที่แท่งจะเห็นค่าจาก <title>
 */
export function BarChart({
  points,
  format,
  color = "#059669",
}: {
  points: Point[]
  format: (value: number) => string
  color?: string
}) {
  const bars = barGeometry(points, W, H)

  if (bars.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">ยังไม่มีข้อมูล</p>
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-32 w-full"
        role="img"
        aria-label="กราฟแท่ง"
      >
        {bars.map((b) => (
          <rect
            key={b.label}
            x={b.x}
            y={b.y}
            width={b.w}
            height={Math.max(b.h, 1)}
            rx={2}
            fill={b.value < 0 ? "#dc2626" : color}
          >
            <title>{`${b.label} — ${format(b.value)}`}</title>
          </rect>
        ))}
      </svg>
      <div className="flex text-[10px] text-slate-500">
        {bars.map((b) => (
          <span key={b.label} className="flex-1 text-center">
            {b.label}
          </span>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: สร้าง `src/components/charts/line-chart.tsx`**

```tsx
import { linePath, linearScale, type Point } from "@/lib/chart"

const W = 320
const H = 120

/** กราฟเส้น เรนเดอร์ฝั่ง server · มีเส้นศูนย์ให้เห็นเมื่อมีค่าติดลบ */
export function LineChart({
  points,
  format,
  color = "#059669",
}: {
  points: Point[]
  format: (value: number) => string
  color?: string
}) {
  if (points.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">ยังไม่มีข้อมูล</p>
  }

  const scale = linearScale(points.map((p) => p.value), H)
  const d = linePath(points, W, H)
  const step = points.length > 1 ? W / (points.length - 1) : 0

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-32 w-full"
        role="img"
        aria-label="กราฟเส้น"
      >
        {scale.min < 0 && (
          <line
            x1={0}
            y1={scale.zeroY}
            x2={W}
            y2={scale.zeroY}
            stroke="#cbd5e1"
            strokeDasharray="3 3"
          />
        )}
        <path d={d} fill="none" stroke={color} strokeWidth={2} />
        {points.map((p, i) => (
          <circle key={p.label} cx={i * step} cy={scale.y(p.value)} r={3} fill={color}>
            <title>{`${p.label} — ${format(p.value)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex text-[10px] text-slate-500">
        {points.map((p) => (
          <span key={p.label} className="flex-1 text-center">
            {p.label}
          </span>
        ))}
      </div>
    </div>
  )
}
```

> หมายเหตุ: จุดแรกและจุดสุดท้ายของกราฟเส้นอยู่ที่ขอบพอดี (x = 0 และ x = W)
> วงกลม r=3 จึงถูกตัดครึ่ง ตั้งใจให้เป็นแบบนั้นเพื่อให้ label ใต้กราฟตรงกับจุด

- [ ] **Step 3: `npm run build && npx eslint src && npm test`**

Expected: build ผ่าน · lint สะอาด · 77 เทสผ่าน
(component ยังไม่มีใครเรียก แต่ต้อง compile ผ่าน)

- [ ] **Step 4: Commit**

```bash
git add src/components/charts
git commit -m "feat: กราฟแท่งและกราฟเส้นแบบ SVG ฝั่ง server"
```

---

## Task 4: `stat-card.tsx` + `app-shell.tsx`

**Files:** Create `src/components/stat-card.tsx` · `src/components/app-shell.tsx`
Delete `src/components/app-nav.tsx` · Modify `src/app/(app)/layout.tsx`

- [ ] **Step 1: สร้าง `src/components/stat-card.tsx`**

```tsx
import { Card, CardContent } from "@/components/ui/card"

/** การ์ด KPI ใบเล็กโทนสว่าง — ใช้ซ้ำได้ทุกหน้าในรอบ 2-4 */
export function StatCard({
  label,
  value,
  hint,
  tone = "normal",
}: {
  label: string
  value: string
  hint?: string
  tone?: "normal" | "bad"
}) {
  return (
    <Card>
      <CardContent className="py-3.5">
        <p className="text-xs text-slate-500">{label}</p>
        <p
          className={`text-lg font-bold ${
            tone === "bad" ? "text-red-700" : "text-slate-900"
          }`}
        >
          {value}
        </p>
        {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: สร้าง `src/components/app-shell.tsx`**

เอาเนื้อหาจาก `app-nav.tsx` มาขยาย — เมนูเดิม 5 อันสำหรับ staff และเพิ่ม "ภาพรวม" ให้ manager ขึ้นไป
จอ `sm:` ขึ้นไปเป็นแถบข้างแนวตั้ง จอเล็กเป็นแถบล่างเหมือนเดิม

```tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  HandCoins,
  LayoutDashboard,
  MoreHorizontal,
  Receipt,
  Users,
} from "lucide-react"

import { cn } from "@/lib/utils"

const STAFF_LINKS = [
  { href: "/pos", label: "บันทึกขาย", icon: Receipt },
  { href: "/today", label: "ยอดวันนี้", icon: BarChart3 },
  { href: "/commission", label: "ค่ามือ", icon: HandCoins },
  { href: "/customers", label: "ลูกค้า", icon: Users },
  { href: "/more", label: "เพิ่มเติม", icon: MoreHorizontal },
]

const OVERVIEW_LINK = {
  href: "/overview",
  label: "ภาพรวม",
  icon: LayoutDashboard,
}

export function AppShell({ role }: { role: string }) {
  const pathname = usePathname()
  const canSeeOverview = role === "admin" || role === "manager"
  const links = canSeeOverview ? [OVERVIEW_LINK, ...STAFF_LINKS] : STAFF_LINKS

  return (
    <nav
      className={cn(
        // จอแคบ: แถบล่างเหมือนเดิม — ใช้ order ดันลงล่างแทนการย้ายตำแหน่งใน DOM
        "order-last sticky bottom-0 z-10 border-t bg-white",
        // จอกว้าง: แถบข้างแนวตั้งติดซ้าย
        "sm:order-first sm:top-0 sm:bottom-auto sm:h-dvh sm:w-52 sm:shrink-0 sm:border-t-0 sm:border-r"
      )}
      aria-label="เมนูหลัก"
    >
      <ul className="flex sm:flex-col sm:gap-1 sm:p-3">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={href} className="flex-1 sm:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] transition-colors",
                  "sm:flex-row sm:justify-start sm:gap-3 sm:rounded-md sm:px-3 sm:py-2.5 sm:text-sm",
                  active
                    ? "font-semibold text-emerald-700 sm:bg-emerald-50"
                    : "text-slate-500 hover:text-slate-900 sm:hover:bg-slate-50"
                )}
              >
                <Icon className="size-5 sm:size-4" aria-hidden />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
```

- [ ] **Step 3: แก้ `src/app/(app)/layout.tsx`**

เปลี่ยน import จาก `AppNav` เป็น `AppShell` และเปลี่ยนโครงกล่องนอกให้ sidebar อยู่ซ้ายบนจอกว้าง:

แทนที่ `import { AppNav } from "@/components/app-nav"` ด้วย

```tsx
import { AppShell } from "@/components/app-shell"
```

แทนที่ `<div className="flex min-h-full flex-1 flex-col sm:flex-col-reverse sm:justify-end">`
และโครงข้างในทั้งหมด ด้วย:

```tsx
    <div className="flex min-h-full flex-1 flex-col sm:flex-row">
      <AppShell role={profile?.role ?? "staff"} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-emerald-800">สุขกายา</span>
              {profile?.role && (
                <Badge variant="secondary">
                  {ROLE_LABEL[profile.role] ?? profile.role}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-slate-600 sm:inline">
                {profile?.full_name}
              </span>
              <form action={signOut}>
                <Button type="submit" variant="outline" size="sm">
                  ออกจากระบบ
                </Button>
              </form>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 p-4">{children}</main>
      </div>
    </div>
```

`<AppShell>` วางไว้เป็นลูกตัวแรกของ flex container ก็จริง แต่คลาส `order-last sm:order-first`
ใน Step 2 จะดันมันลงล่างสุดบนจอแคบเอง — พนักงานจึงยังเห็นแถบเมนูอยู่ก้นจอเหมือนเดิม

- [ ] **Step 4: ลบ `src/components/app-nav.tsx`**

```bash
git rm src/components/app-nav.tsx
```

- [ ] **Step 5: `npm run build && npx eslint src && npm test`**

Expected: build ผ่าน (จะยังมี error เรื่อง `/today` ยังไม่มี — ถ้า build บ่นเรื่องลิงก์ ไม่เป็นไร
Next.js ไม่ตรวจ href ตอน build · ถ้า TypeScript บ่นให้ทำ Task 5 ก่อนแล้วกลับมา build ใหม่)

- [ ] **Step 6: Commit**

```bash
git add src/components src/app/\(app\)/layout.tsx
git commit -m "feat: เมนูแบบ sidebar บนจอกว้าง และการ์ด KPI ที่ใช้ซ้ำได้"
```

---

## Task 5: ย้ายยอดวันนี้ไป `/today` และทำ `/` เป็นตัวส่งต่อ

**Files:** Create `src/app/(app)/today/page.tsx` · แทนที่ `src/app/(app)/page.tsx`

- [ ] **Step 1: ย้ายไฟล์**

```bash
mkdir -p "src/app/(app)/today"
git mv "src/app/(app)/page.tsx" "src/app/(app)/today/page.tsx"
```

เนื้อหาข้างในไม่ต้องแก้อะไรเลย — ไม่มีการอ้าง path ของตัวเอง

- [ ] **Step 2: สร้าง `src/app/(app)/page.tsx` ใหม่ทั้งไฟล์**

```tsx
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

/**
 * หน้าแรกไม่มีเนื้อหาของตัวเอง เป็นแค่ตัวส่งต่อตามสิทธิ์
 * middleware ทำแบบนี้ไม่ได้เพราะต้อง query ตาราง profiles ทุก request
 * เจ้าของร้านเข้ามาควรเจอภาพรวม · พนักงานควรเจอยอดวันนี้
 */
export default async function HomePage() {
  const supabase = await createClient()
  const { data: profile } = await supabase.from("profiles").select("role").single()
  const role = profile?.role ?? "staff"

  redirect(role === "admin" || role === "manager" ? "/overview" : "/today")
}
```

- [ ] **Step 3: แก้ลิงก์ที่ยังชี้ `/` ให้ชี้ `/today`**

หา `href="/"` ทั้งโปรเจกต์:

```bash
grep -rn 'href="/"' src/
```

`src/app/(app)/insights/shared.tsx` และ `src/app/(app)/finance/shared.tsx` มีปุ่ม "กลับหน้าแรก"
ปล่อยไว้ที่ `/` ได้ เพราะ `/` จะส่งต่อให้เอง — **ห้ามแก้เป็น `/today`** ไม่งั้นเจ้าของร้าน
กดกลับหน้าแรกแล้วไปโผล่หน้าพนักงาน

ตรวจว่าไม่มีที่ไหนเหลืออ้าง `/` เป็น "ยอดวันนี้" นอกจาก `app-shell.tsx` ที่แก้ไปแล้วใน Task 4

- [ ] **Step 4: `npm run build && npx eslint src && npm test`**

Expected: build ผ่าน · route list มี `/today` และ `/` · 77 เทสผ่าน

- [ ] **Step 5: Commit**

```bash
git add -A "src/app/(app)"
git commit -m "feat: หน้าแรกส่งต่อตามสิทธิ์ ยอดวันนี้ย้ายไป /today"
```

---

## Task 6: หน้า `/overview`

**Files:** Create `src/app/(app)/overview/page.tsx`

- [ ] **Step 1: สร้าง `src/app/(app)/overview/page.tsx`**

```tsx
import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { formatBaht } from "@/lib/constants"
import { todayInShopTz } from "@/lib/datetime"
import { isMonthIncomplete } from "@/lib/finance"
import { BarChart } from "@/components/charts/bar-chart"
import { LineChart } from "@/components/charts/line-chart"
import { StatCard } from "@/components/stat-card"
import { InsightsAccessDenied, canSeeInsights } from "../insights/shared"
import { monthLabel, monthShortLabel, shiftMonth } from "../finance/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export const metadata = { title: "ภาพรวม · สุขกายา POS" }

const n = (x: number | string | null | undefined) => Number(x ?? 0)

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const supabase = await createClient()
  const { data: profile } = await supabase.from("profiles").select("role").single()

  if (!canSeeInsights(profile?.role)) {
    return <InsightsAccessDenied title="ภาพรวม" />
  }

  const params = await searchParams
  const month = params.month ?? todayInShopTz().slice(0, 7)

  const [{ data: plRows }, { data: targetSetting }, { count: memberCount }] =
    await Promise.all([
      supabase.from("v_monthly_pl").select("*").order("month"),
      supabase
        .from("settings")
        .select("value")
        .eq("key", "monthly_target")
        .maybeSingle(),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("customer_type", "สมาชิก"),
    ])

  const rows = (plRows ?? []).filter(
    (r): r is typeof r & { month: string } => r.month !== null
  )
  const selected = rows.find((r) => r.month === month) ?? null

  const netRevenue = n(selected?.net_revenue)
  const profitCash = n(selected?.profit_cash)
  const cashIn = n(selected?.cash_in)
  const sessions = n(selected?.sessions)
  const prevRevenue = n(selected?.prev_net_revenue)
  const ytdRevenue = n(selected?.ytd_net_revenue)
  const ytdProfit = n(selected?.ytd_profit_cash)
  const fixedCost = n(selected?.fixed_cost)

  // margin เป็นการหารเลขสองตัวที่ view ให้มาแล้ว ไม่ใช่การนิยามสูตรเงินใหม่
  const margin = netRevenue > 0 ? (profitCash / netRevenue) * 100 : 0

  const deltaPct = prevRevenue > 0 ? ((netRevenue - prevRevenue) / prevRevenue) * 100 : 0

  const target = Number(targetSetting?.value ?? 0)
  const targetPct = target > 0 ? Math.min((netRevenue / target) * 100, 100) : 0
  const targetRemaining = target - netRevenue

  const precedingFixed = rows.filter((r) => r.month < month).slice(-3).map((r) => n(r.fixed_cost))
  const incomplete = isMonthIncomplete(fixedCost, precedingFixed)

  const last6 = rows.filter((r) => r.month <= month).slice(-6)
  const revenuePoints = last6.map((r) => ({
    label: monthShortLabel(r.month),
    value: n(r.net_revenue),
  }))
  const marginPoints = last6.map((r) => ({
    label: monthShortLabel(r.month),
    value: n(r.net_revenue) > 0 ? Math.round((n(r.profit_cash) / n(r.net_revenue)) * 100) : 0,
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">ภาพรวม</h1>
          <p className="text-sm text-slate-600">{monthLabel(month)}</p>
        </div>
        <div className="flex gap-1">
          <Link
            href={`/overview?month=${shiftMonth(month, -1)}`}
            className="rounded-md border px-3 py-2 text-sm hover:bg-slate-100"
          >
            ←
          </Link>
          <Link
            href={`/overview?month=${shiftMonth(month, 1)}`}
            className="rounded-md border px-3 py-2 text-sm hover:bg-slate-100"
          >
            →
          </Link>
        </div>
      </div>

      {/* การ์ดใหญ่โทนเข้ม — ตัวเลขที่เจ้าของร้านต้องเห็นก่อนอย่างอื่น */}
      <div className="rounded-xl bg-gradient-to-br from-emerald-800 to-emerald-950 p-5 text-white">
        <p className="text-xs text-emerald-300">รายได้เดือนนี้</p>
        <p className="text-3xl font-extrabold">{formatBaht(netRevenue)} ฿</p>
        {prevRevenue > 0 && (
          <p className="text-xs text-emerald-200">
            {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(Math.round(deltaPct))}% จากเดือนก่อน (
            {formatBaht(prevRevenue)} ฿)
          </p>
        )}

        {target > 0 && (
          <>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-emerald-300"
                style={{ width: `${targetPct}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-emerald-100">
              เป้า {formatBaht(target)} ฿ · ทำได้ {Math.round(targetPct)}%
              {targetRemaining > 0 && ` · เหลืออีก ${formatBaht(targetRemaining)} ฿`}
            </p>
          </>
        )}

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] text-emerald-300">กำไรเงินสด</p>
            <p className="text-base font-bold">{formatBaht(profitCash)} ฿</p>
          </div>
          <div>
            <p className="text-[10px] text-emerald-300">Margin</p>
            <p className="text-base font-bold">{margin.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-[10px] text-emerald-300">เงินเข้าจริง</p>
            <p className="text-base font-bold">{formatBaht(cashIn)} ฿</p>
          </div>
        </div>
      </div>

      {incomplete && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3 text-sm text-amber-900">
            <p className="font-semibold">เดือนนี้ยังบันทึกรายจ่ายไม่ครบ</p>
            <p className="text-amber-800">
              ค่าเช่าและเงินเดือนมักบันทึกตอนสิ้นเดือน กำไรและ margin ที่เห็นข้างบน
              จึงสูงกว่าความจริง — อย่าเพิ่งใช้ตัวเลขนี้ตัดสินใจ
            </p>
          </CardContent>
        </Card>
      )}

      {!selected && (
        <p className="py-6 text-center text-sm text-slate-500">ยังไม่มีข้อมูลเดือนนี้</p>
      )}

      {/* ทุกตัวเลขในแถวนี้มาจากแถวเดือนเดียวกับการ์ดใหญ่ — ห้ามผสมเดือน */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label={`รายได้สะสมถึง ${monthShortLabel(month)}`}
          value={`${formatBaht(ytdRevenue)} ฿`}
        />
        <StatCard
          label={`กำไรสะสมถึง ${monthShortLabel(month)}`}
          value={`${formatBaht(ytdProfit)} ฿`}
          tone={ytdProfit < 0 ? "bad" : "normal"}
        />
        <StatCard label="เซสชันเดือนนี้" value={String(sessions)} />
        <StatCard label="สมาชิก" value={`${memberCount ?? 0} คน`} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">รายได้ 6 เดือนล่าสุด</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart points={revenuePoints} format={(v) => `${formatBaht(v)} ฿`} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Margin 6 เดือนล่าสุด</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart points={marginPoints} format={(v) => `${v}%`} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">สรุปรายเดือน</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500">
                <th className="px-4 py-1 text-left font-normal">เดือน</th>
                <th className="px-4 py-1 text-right font-normal">รายได้</th>
                <th className="px-4 py-1 text-right font-normal">กำไรเงินสด</th>
              </tr>
            </thead>
            <tbody>
              {last6.map((r) => (
                <tr
                  key={r.month}
                  className={r.month === month ? "bg-emerald-50 font-medium" : ""}
                >
                  <td className="px-4 py-1.5">{monthShortLabel(r.month)}</td>
                  <td className="px-4 py-1.5 text-right">{formatBaht(n(r.net_revenue))}</td>
                  <td
                    className={`px-4 py-1.5 text-right ${
                      n(r.profit_cash) < 0 ? "text-red-700" : ""
                    }`}
                  >
                    {formatBaht(n(r.profit_cash))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/finance?month=${month}`}>ดูการเงินละเอียด</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/insights/customers">ลูกค้าและคนที่หายไป</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/members">สมาชิก</Link>
        </Button>
      </div>
    </div>
  )
}
```

> **หมายเหตุ Member Credit Alert:** spec ระบุบล็อกนี้ไว้ แต่หน้า `/members` แสดงยอดคงเหลือ
> และวันหมดอายุอยู่แล้ว การทำซ้ำที่นี่จะกลายเป็นตัวเลขเดียวกันสองที่ ซึ่งเป็นสิ่งที่โปรเจกต์นี้
> เจอปัญหามาแล้ว จึงใส่เป็น**ปุ่มลิงก์ไป `/members`** แทน ถ้าเจ้าของร้านอยากได้ตัวเลขจริง
> บนหน้านี้ ค่อยเพิ่มในรอบ 3 พร้อมกับตอนรื้อหน้า `/members`

- [ ] **Step 2: export `monthLabel` จาก `finance/shared.tsx`**

ตรวจว่า `monthLabel`, `monthShortLabel`, `shiftMonth` ถูก export แล้ว (ทั้งสามตัวมี `export` อยู่)
ถ้ายังไม่ export ตัวไหน ให้เพิ่ม `export`

- [ ] **Step 3: `npm run build && npx eslint src && npm test`**

Expected: build ผ่าน · route list มี `/overview` · lint สะอาด · 77 เทสผ่าน

- [ ] **Step 4: ตรวจตัวเลขกับฐานข้อมูล** — `execute_sql`

```sql
select month, round(net_revenue) rev, round(prev_net_revenue) prev,
       round(profit_cash) pc, round(ytd_net_revenue) ytd_rev,
       round(ytd_profit_cash) ytd_pc, sessions
from public.v_monthly_pl where month = '2026-06';
```

หน้า `/overview?month=2026-06` ต้องแสดงตรงกันทุกช่อง:
รายได้ **347,018** · ▲21% จากเดือนก่อน (286,158) · กำไรเงินสด **88,991** · Margin **25.6%** ·
เซสชัน **529** · รายได้สะสมถึง มิ.ย. **1,124,141** · กำไรสะสมถึง มิ.ย. **−116,739** (สีแดง)

**ตรวจให้แน่ว่าการ์ดสะสมเป็นของเดือนเดียวกับการ์ดใหญ่** — ถ้าเปิด `?month=2026-06`
แล้วกำไรสะสมขึ้น +4,437 แปลว่าไปดึงแถว ก.ค. มา ผิด

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/overview"
git commit -m "feat: หน้าภาพรวมพร้อมกราฟและยอดสะสมต้นปี"
```

---

## Task 7: ตรวจทั้งระบบ

**Files:** `README.md`

- [ ] **Step 1: รัน reconciliation ทั้งไฟล์** — Expected **20 ข้อ PASS**

- [ ] **Step 2: `npm test && npm run build && npx eslint src`** — Expected 77 เทส · build ผ่าน · lint สะอาด

- [ ] **Step 3: `get_advisors` type `security`** — ไม่มี ERROR ใหม่

- [ ] **Step 4: ตรวจสิทธิ์ด้วยบัญชี staff**

เข้าด้วย role `staff` แล้ว:
- เปิด `/` → ต้องเด้งไป `/today` ไม่ใช่ `/overview`
- เปิด `/overview` ตรงๆ → ต้องขึ้นการ์ด "ไม่มีสิทธิ์" และ **ห้ามมีตัวเลขการเงินหลุดใน HTML**
- เมนูต้องไม่มีคำว่า "ภาพรวม"

- [ ] **Step 5: อัปเดต `README.md`**

- ตารางหน้า: เพิ่ม `/overview` และเปลี่ยน `/` เป็น `/today` พร้อมหมายเหตุว่า `/` เป็นตัวส่งต่อ
- กฎบัญชีข้อ 4: เปลี่ยน "ต้อง PASS ครบ 18 ข้อ" เป็น "20 ข้อ"
- เพิ่มบรรทัดในรายการเฟส:
  ```markdown
  - [x] **รอบ 1 หน้าตาใหม่** — เมนู sidebar · การ์ด KPI · กราฟ SVG · หน้า `/overview`
  ```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: อัปเดต README สำหรับหน้าภาพรวม"
```

- [ ] **Step 7: หยุดตรงนี้ รอเจ้าของโปรเจกต์ตรวจก่อน merge และ deploy**

ห้ามรัน `vercel deploy` เอง — หน้า `/` เปลี่ยนพฤติกรรมสำหรับผู้ใช้ทุกคน
ต้องให้คนตรวจก่อนว่าพนักงานยังใช้งานได้ปกติ

---

## เสร็จแล้วได้อะไร

- เจ้าของร้านเปิดแอปมาเจอภาพรวมทันที ไม่ต้องไล่กด 3 หน้าเพื่อรู้ว่าเดือนนี้เป็นยังไง
- เห็นยอดสะสมทั้งปีเป็นครั้งแรก — ก่อนหน้านี้ไม่มีหน้าไหนบอก
- มีชิ้นส่วนที่รอบ 2-4 หยิบไปใช้ได้ทันที: เมนู · การ์ด KPI · กราฟสองแบบ
- พนักงานไม่ได้รับผลกระทบ — เมนูเดิม ปุ่มเดิม แค่ปลายทางเปลี่ยนจาก `/` เป็น `/today`
