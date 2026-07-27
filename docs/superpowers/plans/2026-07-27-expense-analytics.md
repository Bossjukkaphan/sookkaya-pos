# หน้าวิเคราะห์รายจ่าย Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างหน้า `/insights/expenses` ที่ตอบว่าต้นทุนโตหรือลดเพราะอะไร เตือนหมวดที่ผิดปกติ และให้ตัวเลขสำหรับวางงบเดือนหน้า

**Architecture:** สูตรทั้งหมดอยู่ใน `src/lib/expense-analytics.ts` เป็นฟังก์ชันบริสุทธิ์ที่ไม่แตะฐานข้อมูล ทดสอบด้วย vitest ได้เต็มที่ · หน้าเว็บเป็น server component ที่ดึงข้อมูลดิบแล้วส่งให้สูตร · ใช้ `BarChart`/`LineChart` ที่มีอยู่แล้ว ไม่สร้าง component กราฟใหม่

**Tech Stack:** Next.js 16 App Router (server components) · Supabase (postgres views, RLS) · TypeScript · vitest · Tailwind

**Spec:** `docs/superpowers/specs/2026-07-27-expense-analytics-design.md`

---

## หมายเหตุก่อนเริ่ม

**ต้องรัน `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"` ก่อนทุกคำสั่ง npm/npx** — node ติดตั้งผ่าน nvm ไม่ได้อยู่ใน PATH ปกติ

**`AGENTS.md` ของ repo กำหนดว่า** Next.js เวอร์ชันนี้มี breaking changes จาก training data — ถ้าไม่แน่ใจ API ไหน ให้อ่าน `node_modules/next/dist/docs/` ก่อนเขียน

**Gate ที่ต้องผ่านก่อน commit ทุกครั้ง:**
```bash
npx tsc --noEmit && npx eslint src/ && npx vitest run
```
ถ้า `tsc` ฟ้อง `LayoutRoutes` ไม่ตรงกัน ให้ `rm -rf .next/dev` แล้วรันใหม่ (type cache ค้าง)

**เบี่ยงจาก spec 1 จุด — ตั้งใจ:** spec เขียนว่า "ไม่มี migration" แต่ Task 1 เพิ่ม view `v_commission_daily`
เหตุผล: ค่ามือรายวันต้องอ่านจาก `v_therapist_daily` ซึ่งมี 1 แถวต่อหมอต่อวัน (ตอนนี้ ~900 แถวใน 4 เดือน)
PostgREST จำกัดผลลัพธ์ที่ 1,000 แถวโดยดีฟอลต์ ถ้าร้านโตเป็น 10 หมอจะเกินลิมิตแล้วตัวเลขจะหายเงียบ
view ที่รวมยอดมาให้แล้วมี 1 แถวต่อวัน (~150 แถว) ปลอดภัยถาวร และเป็น view อ่านอย่างเดียวจากของที่มีอยู่ ไม่แตะข้อมูลจริง

---

## โครงสร้างไฟล์

| ไฟล์ | สร้าง/แก้ | หน้าที่ |
|---|---|---|
| `supabase/migrations/20260728090000_commission_daily_view.sql` | สร้าง | view รวมค่ามือรายวัน |
| `src/lib/month.ts` | สร้าง | ชื่อเดือนไทย · เลื่อนเดือน · จำนวนวันในเดือน |
| `src/lib/month.test.ts` | สร้าง | เทส |
| `src/app/(app)/finance/shared.tsx` | แก้ | เลิกประกาศเอง ใช้จาก `@/lib/month` |
| `src/app/(app)/expenses/page.tsx` | แก้ | เลิกประกาศเอง ใช้จาก `@/lib/month` |
| `src/lib/expense-analytics.ts` | สร้าง | สูตรทั้งหมดของหน้านี้ |
| `src/lib/expense-analytics.test.ts` | สร้าง | เทส |
| `src/app/(app)/insights/expenses/page.tsx` | สร้าง | หน้าเว็บ |
| `src/components/app-shell.tsx` | แก้ | เพิ่มเมนู |

---

### Task 1: View รวมค่ามือรายวัน

**Files:**
- Create: `supabase/migrations/20260728090000_commission_daily_view.sql`
- Modify: `src/types/database.ts` (สร้างใหม่ด้วยคำสั่ง ไม่ต้องพิมพ์เอง)

- [ ] **Step 1: เขียนไฟล์ migration**

```sql
-- ค่ามือรายวันรวมทุกหมอ — หน้าวิเคราะห์รายจ่ายต้องใช้ค่ามือที่ "เกิดจากงานจริง"
-- ไม่ใช่ยอดที่จ่ายออกเป็นงวด (ยอดจ่ายขึ้นกับว่างวดไหนตกวันไหน ไม่ได้บอกเรื่องต้นทุน)
--
-- ทำไมต้องมี view: v_therapist_daily มี 1 แถวต่อหมอต่อวัน (~900 แถวใน 4 เดือน)
-- PostgREST คืนได้สูงสุด 1,000 แถว ถ้าร้านโตจะเกินลิมิตแล้วตัวเลขหายเงียบโดยไม่ error
--
-- security_invoker = true บังคับเสมอ — ชุดตรวจ reconciliation ข้อ
-- views_without_security_invoker ต้องเป็น 0 ไม่งั้นพนักงานยิง REST API อ่านได้เกินสิทธิ์
create view public.v_commission_daily
with (security_invoker = true) as
select work_date,
       sum(total_income) as commission
from public.v_therapist_daily
where work_date is not null
group by work_date;
```

- [ ] **Step 2: ใช้ migration กับฐานข้อมูลจริง**

ใช้ MCP tool `apply_migration` ของ Supabase (project_id `jrioyrmicioqammeevgh`) ชื่อ migration `commission_daily_view`
ส่ง SQL เดียวกับ Step 1

- [ ] **Step 3: ตรวจว่า view คืนค่าถูกและไม่ทำ reconciliation พัง**

รันผ่าน MCP `execute_sql`:
```sql
select
 (select count(*) from v_commission_daily) as days,
 -- เทียบ view กับต้นทางโดยตรง — ค่าต้องเท่ากันเสมอไม่ว่าร้านจะขายเพิ่มระหว่างวันหรือไม่
 (select sum(commission)::int from v_commission_daily) as via_view,
 (select sum(total_income)::int from v_therapist_daily) as via_source,
 (select count(*) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relkind='v'
      and c.reloptions is distinct from array['security_invoker=true']::text[]) as views_without_invoker;
```
คาดหวัง: `via_view` = `via_source` (เท่ากันเป๊ะ) และ `views_without_invoker` = **0**

**ห้ามตรึงยอดของเดือนที่ยังไม่จบไว้เป็นเกณฑ์ตรวจ** — ร้านขายทุกวัน ยอดค่ามือของเดือนปัจจุบัน
ขยับตลอด เกณฑ์ที่ถูกคือ "view ตรงกับต้นทาง" ซึ่งเป็นจริงเสมอ
(บทเรียนจริง 27/7/2569: แผนเคยตรึงไว้ 131,035 แล้วอีก 3 ชั่วโมงต่อมากลายเป็น 131,260
เพราะร้านขายต่ออีก 19 บิล — subagent หยุดงานเพราะนึกว่า view ผิด)

- [ ] **Step 4: สร้าง types ใหม่**

ใช้ MCP tool `generate_typescript_types` ของ Supabase (project_id `jrioyrmicioqammeevgh`)
แล้วเขียนผลลัพธ์ทับ `src/types/database.ts` ทั้งไฟล์
(อย่าใช้ `npx supabase gen types` — repo นี้ไม่ได้ติดตั้ง supabase CLI ไว้)

ตรวจว่ามี view ใหม่โผล่จริง:
```bash
grep -n "v_commission_daily" src/types/database.ts
```
คาดหวัง: เจออย่างน้อย 1 บรรทัด

- [ ] **Step 5: Gate + commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx tsc --noEmit && npx eslint src/ && npx vitest run
git add supabase/migrations/20260728090000_commission_daily_view.sql src/types/database.ts
git commit -m "feat(db): view v_commission_daily รวมค่ามือรายวัน"
```

---

### Task 2: รวมตัวช่วยเรื่องเดือนไว้ที่เดียว

ตอนนี้ `finance/shared.tsx` กับ `expenses/page.tsx` ต่างประกาศ `THAI_MONTHS` และ `shiftMonth` ของตัวเอง
หน้าใหม่ต้องใช้อีก ถ้าไม่รวมตอนนี้จะกลายเป็นสำเนาที่สาม

**Files:**
- Create: `src/lib/month.ts`
- Create: `src/lib/month.test.ts`
- Modify: `src/app/(app)/finance/shared.tsx`
- Modify: `src/app/(app)/expenses/page.tsx`

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

สร้าง `src/lib/month.test.ts`:
```ts
import { describe, expect, it } from "vitest"
import { daysInMonth, monthLabel, monthShortLabel, shiftMonth } from "./month"

describe("monthLabel — ปีพุทธศักราชและชื่อเดือนไทย", () => {
  it("แปลง 2026-07 เป็น กรกฎาคม 2569", () => {
    expect(monthLabel("2026-07")).toBe("กรกฎาคม 2569")
  })

  it("เดือนแรกและเดือนสุดท้ายไม่หลุดขอบ array", () => {
    expect(monthLabel("2026-01")).toBe("มกราคม 2569")
    expect(monthLabel("2026-12")).toBe("ธันวาคม 2569")
  })
})

describe("monthShortLabel — ใช้บนหัวตารางที่มีที่แคบ", () => {
  it("ย่อชื่อเดือนและปีเหลือสองหลัก", () => {
    expect(monthShortLabel("2026-07")).toBe("ก.ค. 69")
  })
})

describe("shiftMonth", () => {
  it("เลื่อนภายในปีเดียวกัน", () => {
    expect(shiftMonth("2026-07", -1)).toBe("2026-06")
  })

  it("ข้ามปีทั้งสองทิศ", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12")
    expect(shiftMonth("2026-12", 1)).toBe("2027-01")
  })

  it("เลื่อนหลายเดือนพร้อมกัน", () => {
    expect(shiftMonth("2026-07", -3)).toBe("2026-04")
  })
})

describe("daysInMonth", () => {
  it("เดือน 30 และ 31 วัน", () => {
    expect(daysInMonth("2026-06")).toBe(30)
    expect(daysInMonth("2026-07")).toBe(31)
  })

  it("กุมภาพันธ์ปีปกติและปีอธิกสุรทิน", () => {
    expect(daysInMonth("2026-02")).toBe(28)
    expect(daysInMonth("2028-02")).toBe(29)
  })
})
```

- [ ] **Step 2: รันเทสให้เห็นว่าไม่ผ่าน**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx vitest run src/lib/month.test.ts
```
คาดหวัง: FAIL — `Failed to resolve import "./month"`

- [ ] **Step 3: เขียน `src/lib/month.ts`**

```ts
/** ตัวช่วยเรื่องเดือนที่ใช้ร่วมกันทั้งหน้าการเงิน รายจ่าย และวิเคราะห์รายจ่าย
 *  เดือนในระบบเป็นสตริง "YYYY-MM" เสมอ (ปี ค.ศ.) แสดงผลเป็น พ.ศ. */

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
]

const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
]

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  return `${THAI_MONTHS[m - 1]} ${y + 543}`
}

export function monthShortLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  return `${THAI_MONTHS_SHORT[m - 1]} ${(y + 543) % 100}`
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number)
  // UTC เสมอ — ถ้าใช้ new Date(y, m) ตามเขตเวลาเครื่อง วันที่ 1 ของเดือนอาจถอยไปเดือนก่อน
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7)
}

/** วันที่ 0 ของเดือนถัดไป = วันสุดท้ายของเดือนนี้ */
export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
```

- [ ] **Step 4: รันเทสให้ผ่าน**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx vitest run src/lib/month.test.ts
```
คาดหวัง: PASS ทั้ง 8 เคส

- [ ] **Step 5: ให้ `finance/shared.tsx` ใช้ตัวกลางแทน**

ใน `src/app/(app)/finance/shared.tsx` ลบบล็อก `THAI_MONTHS`, `THAI_MONTHS_SHORT`, `monthLabel`, `monthShortLabel`, `shiftMonth` (บรรทัด 6–30) ออกทั้งหมด แล้วใส่ re-export แทน เพื่อไม่ต้องไล่แก้ทุกไฟล์ที่ import จากที่นี่อยู่แล้ว:

```tsx
import Link from "next/link"

import { monthLabel, monthShortLabel, shiftMonth } from "@/lib/month"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

// ไฟล์อื่นเคย import ชื่อพวกนี้จากที่นี่ — ส่งต่อให้ ไม่ต้องไล่แก้ทุก import
// (import แล้ว export ต่อ ไม่ใช่ `export ... from` เพราะจะซ้ำกับ import ข้างบนแล้ว eslint ฟ้อง)
export { monthLabel, monthShortLabel, shiftMonth }
```
ส่วนที่เหลือของไฟล์ (`FinanceMonthHeader`, `FinanceAccessDenied`) ไม่ต้องแก้ —
`FinanceMonthHeader` ใช้ `monthLabel` กับ `shiftMonth` จาก import ข้างบนได้เลย

- [ ] **Step 6: ให้ `expenses/page.tsx` ใช้ตัวกลางแทน**

ใน `src/app/(app)/expenses/page.tsx`:

ลบ `const THAI_MONTHS = [...]` (บรรทัด 25–28) และ `function shiftMonth(...)` (บรรทัด 30–34) ออก
แล้วเพิ่ม import:
```tsx
import { monthLabel, shiftMonth } from "@/lib/month"
```

แทนที่บรรทัด `const monthName = \`${THAI_MONTHS[mm - 1]} ${my + 543}\`` ด้วย:
```tsx
  const monthName = monthLabel(month)
```

ตัวแปร `my` และ `mm` ยังถูกใช้คำนวณ `monthEnd` อยู่ อย่าลบ

- [ ] **Step 7: Gate ทั้งชุด**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```
คาดหวัง: ผ่านหมด · เทสรวมต้องเพิ่มจาก 216 เป็น 224

- [ ] **Step 8: Commit**

```bash
git add src/lib/month.ts src/lib/month.test.ts "src/app/(app)/finance/shared.tsx" "src/app/(app)/expenses/page.tsx"
git commit -m "refactor: รวมตัวช่วยเรื่องเดือนไว้ที่ src/lib/month.ts"
```

---

### Task 3: ชนิดข้อมูล ไม้บรรทัด และค่ากลาง

**Files:**
- Create: `src/lib/expense-analytics.ts`
- Create: `src/lib/expense-analytics.test.ts`

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

สร้าง `src/lib/expense-analytics.test.ts`:
```ts
import { describe, expect, it } from "vitest"
import { median, rulerOf } from "./expense-analytics"

describe("rulerOf — หมวดไหนใช้ไม้บรรทัดอะไร", () => {
  it("หมวดที่ควรโตตามงาน", () => {
    expect(rulerOf("HR / payroll (ค่ามือหมอ)")).toBe("revenue_linked")
    expect(rulerOf("วัสดุ-สิ้นเปลือง (น้ำมัน บาล์ม ฯลฯ)")).toBe("revenue_linked")
    expect(rulerOf("ซักรีด")).toBe("revenue_linked")
  })

  it("หมวดที่ไม่ควรโตตามงาน", () => {
    expect(rulerOf("ค่าเช่าสถานที่")).toBe("fixed")
    expect(rulerOf("เงินเดือนพนักงานประจำ")).toBe("fixed")
    expect(rulerOf("ค่าน้ำ / ค่าไฟ / Internet")).toBe("fixed")
  })

  it("หมวดที่เจ้าของร้านตั้งใจจ่ายเอง ไม่เตือน", () => {
    expect(rulerOf("การตลาด / โฆษณา")).toBe("discretionary")
    expect(rulerOf("อื่นๆ")).toBe("discretionary")
  })

  // ชื่อหมวด HR เคยถูกเปลี่ยนมาแล้วเมื่อ 27/7/2569 จึงต้องจับด้วยคำขึ้นต้น
  it("จับด้วยคำขึ้นต้น ไม่ใช่ชื่อเต็ม", () => {
    expect(rulerOf("HR / payroll (เงินประกัน ค่ามือ เงินเดือน)")).toBe("revenue_linked")
  })

  // กันเตือนผิดด้วยไม้บรรทัดผิดอัน — ปลอดภัยกว่าเดา
  it("หมวดที่ไม่รู้จักตกไปกลุ่มไม่เตือน", () => {
    expect(rulerOf("หมวดที่พึ่งสร้างเมื่อวาน")).toBe("discretionary")
  })
})

describe("median", () => {
  it("จำนวนคี่เอาตัวกลาง", () => {
    expect(median([38250, 41650, 39500])).toBe(39500)
  })

  it("จำนวนคู่เอาค่าเฉลี่ยของสองตัวกลาง", () => {
    expect(median([10, 20, 30, 40])).toBe(25)
  })

  it("ค่าซ้ำกันได้", () => {
    expect(median([12000, 12000, 9900])).toBe(12000)
  })

  it("ค่าเดียว", () => {
    expect(median([5])).toBe(5)
  })

  it("ไม่มีค่าเลยคืน 0", () => {
    expect(median([])).toBe(0)
  })
})
```

- [ ] **Step 2: รันเทสให้เห็นว่าไม่ผ่าน**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx vitest run src/lib/expense-analytics.test.ts
```
คาดหวัง: FAIL — `Failed to resolve import "./expense-analytics"`

- [ ] **Step 3: เขียนส่วนแรกของ `src/lib/expense-analytics.ts`**

```ts
/** สูตรของหน้าวิเคราะห์รายจ่าย — ฟังก์ชันบริสุทธิ์ล้วน ไม่แตะฐานข้อมูล
 *  spec: docs/superpowers/specs/2026-07-27-expense-analytics-design.md */

export type ExpenseRow = {
  /** "2026-07-15" */
  expense_date: string
  category: string
  item: string
  amount: number
}

export type Ruler = "revenue_linked" | "fixed" | "discretionary"

/** เกณฑ์เตือน — ต้องเข้าครบทั้งสองข้อ (เจ้าของร้านเลือกเมื่อ 27/7/2569) */
export const WARN_PCT = 10
export const ALERT_PCT = 30
export const MIN_IMPACT_BAHT = 2000

/** จำนวนเดือนย้อนหลังที่ใช้หาค่าปกติ — ต้องครบเท่านี้ถึงจะตัดสิน */
export const BASELINE_MONTHS = 3

/** ค่ามือหมอต้องอ่านจากงานที่ทำจริง ไม่ใช่จากแถวรายจ่าย เพราะยอดจ่ายขึ้นกับงวด */
export const COMMISSION_CATEGORY_PREFIX = "HR / payroll"

/** จับคู่ด้วยคำขึ้นต้น ไม่ใช่ชื่อเต็ม เพราะชื่อหมวดแก้ได้จากหน้าตั้งค่า
 *  หมวดที่จับไม่ได้ตกไปกลุ่ม discretionary เสมอ — เห็นตัวเลขครบแต่ไม่เตือนผิด */
const RULER_BY_PREFIX: { prefix: string; ruler: Ruler }[] = [
  { prefix: "HR / payroll", ruler: "revenue_linked" },
  { prefix: "วัสดุ-สิ้นเปลือง", ruler: "revenue_linked" },
  { prefix: "ซักรีด", ruler: "revenue_linked" },
  { prefix: "ค่าเช่าสถานที่", ruler: "fixed" },
  { prefix: "เงินเดือนพนักงานประจำ", ruler: "fixed" },
  { prefix: "ค่าน้ำ", ruler: "fixed" },
]

export function rulerOf(category: string): Ruler {
  return RULER_BY_PREFIX.find((r) => category.startsWith(r.prefix))?.ruler ?? "discretionary"
}

/** ค่ากลาง ไม่ใช่ค่าเฉลี่ย — เดือนที่บันทึกไม่ครบหรือจ่ายผิดจังหวะจะถูกเขี่ยทิ้งเอง
 *  (ทดสอบย้อนหลังแล้ว: ค่าเฉลี่ยทำให้ค่าเช่าและค่าน้ำค่าไฟ มิ.ย. 69 เตือนหลอกทั้งคู่) */
export function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
```

- [ ] **Step 4: รันเทสให้ผ่าน**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx vitest run src/lib/expense-analytics.test.ts
```
คาดหวัง: PASS 10 เคส (เทสรวมทั้งชุด 224 → 234)

- [ ] **Step 5: Commit**

```bash
git add src/lib/expense-analytics.ts src/lib/expense-analytics.test.ts
git commit -m "feat(expense-analytics): ไม้บรรทัดตามหมวด + ค่ากลาง"
```

---

### Task 4: compareRange — บล็อก 1 "เดือนนี้ต่างจากปกติเพราะอะไร"

เทียบกับเดือนก่อนหน้าเดือนเดียว ตัดวันให้เท่ากันทั้งสองฝั่ง

**Files:**
- Modify: `src/lib/expense-analytics.ts`
- Modify: `src/lib/expense-analytics.test.ts`

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

**แก้ import บรรทัดบนสุด** ของ `src/lib/expense-analytics.test.ts` ให้เป็น (เพิ่มชื่อใหม่เข้าไป
ในบรรทัดเดิม ห้ามเขียน import ใหม่กลางไฟล์):
```ts
import { compareRange, median, rulerOf, type ExpenseRow } from "./expense-analytics"
```

แล้วเพิ่มโค้ดข้างล่างนี้ **ท้ายไฟล์**:
```ts
const row = (date: string, category: string, item: string, amount: number): ExpenseRow => ({
  expense_date: date,
  category,
  item,
  amount,
})

describe("compareRange — บล็อก 1", () => {
  const rows = [
    row("2026-06-05", "ซักรีด", "ซักผ้า มิ.ย.", 7400),
    row("2026-06-15", "อื่นๆ", "ค่าช่างทำประตู", 23000),
    // วันที่ 29 อยู่นอกช่วง 1-27 ต้องไม่ถูกนับ
    row("2026-06-29", "ค่าเช่าสถานที่", "ค่าเช่า มิ.ย.", 36000),
    row("2026-07-05", "ซักรีด", "ซักผ้า ก.ค.", 5000),
    row("2026-07-10", "อื่นๆ", "โอนให้คุณบอส", 2990),
  ]
  const revenue = new Map([
    ["2026-06-10", 316788],
    ["2026-07-10", 322242],
  ])

  const result = compareRange({ rows, revenueByDate: revenue, month: "2026-07", throughDay: 27 })

  it("ตัดวันเท่ากันทั้งสองฝั่ง — ค่าเช่าวันที่ 29 ต้องไม่ถูกนับ", () => {
    expect(result.current.expense).toBe(7990)
    expect(result.previous.expense).toBe(30400)
  })

  it("ดึงรายได้ของช่วงเดียวกันมาด้วย", () => {
    expect(result.current.revenue).toBe(322242)
    expect(result.previous.revenue).toBe(316788)
  })

  it("เรียงหมวดตามขนาดผลกระทบ ไม่ใช่ตามเครื่องหมาย", () => {
    expect(result.byCategory.map((c) => c.category)).toEqual(["อื่นๆ", "ซักรีด"])
    expect(result.byCategory[0].deltaBaht).toBe(-20010)
    expect(result.byCategory[1].deltaBaht).toBe(-2400)
  })

  it("โชว์รายการใหญ่สุดของช่วงปัจจุบัน เรียงจากมากไปน้อย", () => {
    expect(result.topItems).toEqual([
      { item: "ซักผ้า ก.ค.", amount: 5000 },
      { item: "โอนให้คุณบอส", amount: 2990 },
    ])
  })

  it("หมวดที่มีเฉพาะเดือนก่อนก็ต้องโผล่ในรายการส่วนต่าง", () => {
    const onlyPrev = compareRange({
      rows: [row("2026-06-03", "การตลาด / โฆษณา", "ยิงแอด", 5000)],
      revenueByDate: new Map(),
      month: "2026-07",
      throughDay: 27,
    })
    expect(onlyPrev.byCategory).toEqual([
      { category: "การตลาด / โฆษณา", deltaBaht: -5000 },
    ])
  })

  it("เดือนที่ปิดแล้วส่ง throughDay 31 เพื่อเอาทั้งเดือน", () => {
    const full = compareRange({ rows, revenueByDate: revenue, month: "2026-07", throughDay: 31 })
    expect(full.previous.expense).toBe(66400)
  })
})
```

- [ ] **Step 2: รันเทสให้เห็นว่าไม่ผ่าน**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx vitest run src/lib/expense-analytics.test.ts
```
คาดหวัง: FAIL — `compareRange is not exported`

- [ ] **Step 3: เขียน compareRange**

**ก่อนอื่นเพิ่ม import ที่หัวไฟล์** `src/lib/expense-analytics.ts` (ใต้ comment บนสุด
ก่อน `export type ExpenseRow`) — `import` ต้องอยู่บนสุดของโมดูล ห้ามแทรกกลางไฟล์:
```ts
import { shiftMonth } from "./month"
```

แล้วเพิ่มโค้ดข้างล่างนี้ **ท้ายไฟล์**:
```ts
/** เลขวันจากสตริงวันที่ "2026-07-15" → 15 */
function dayOf(isoDate: string): number {
  return Number(isoDate.slice(8, 10))
}

/** แถวของเดือนที่ระบุ ถึงวันที่ throughDay เท่านั้น */
export function rowsInRange(
  rows: ExpenseRow[],
  month: string,
  throughDay: number
): ExpenseRow[] {
  return rows.filter(
    (r) => r.expense_date.startsWith(`${month}-`) && dayOf(r.expense_date) <= throughDay
  )
}

/** รวมค่าจาก map ที่คีย์เป็นวันที่ ภายในช่วงวันเดียวกัน
 *  วนตามวันแทนการไล่คีย์ทั้ง map เพื่อให้ throughDay ที่เกินจำนวนวันจริงไม่พัง */
export function sumDaily(
  daily: Map<string, number>,
  month: string,
  throughDay: number
): number {
  let total = 0
  for (let d = 1; d <= throughDay; d++) {
    total += daily.get(`${month}-${String(d).padStart(2, "0")}`) ?? 0
  }
  return total
}

function sumByCategory(rows: ExpenseRow[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.category, (m.get(r.category) ?? 0) + r.amount)
  return m
}

export function compareRange(input: {
  rows: ExpenseRow[]
  revenueByDate: Map<string, number>
  month: string
  /** เดือนที่ยังไม่จบส่งวันที่ปัจจุบัน · เดือนที่ปิดแล้วส่ง 31 */
  throughDay: number
}): {
  current: { expense: number; revenue: number }
  previous: { expense: number; revenue: number }
  byCategory: { category: string; deltaBaht: number }[]
  topItems: { item: string; amount: number }[]
} {
  const { rows, revenueByDate, month, throughDay } = input
  const prevMonth = shiftMonth(month, -1)

  const curRows = rowsInRange(rows, month, throughDay)
  const prevRows = rowsInRange(rows, prevMonth, throughDay)

  const cur = sumByCategory(curRows)
  const prev = sumByCategory(prevRows)

  const categories = new Set([...cur.keys(), ...prev.keys()])
  const byCategory = [...categories]
    .map((category) => ({
      category,
      deltaBaht: (cur.get(category) ?? 0) - (prev.get(category) ?? 0),
    }))
    .filter((c) => c.deltaBaht !== 0)
    // เรียงตามขนาดผลกระทบ ไม่ใช่ตามเครื่องหมาย — ตัวที่ลดเยอะก็สำคัญพอกับตัวที่เพิ่มเยอะ
    .sort((a, b) => Math.abs(b.deltaBaht) - Math.abs(a.deltaBaht))

  const topItems = [...curRows]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((r) => ({ item: r.item, amount: r.amount }))

  return {
    current: {
      expense: curRows.reduce((s, r) => s + r.amount, 0),
      revenue: sumDaily(revenueByDate, month, throughDay),
    },
    previous: {
      expense: prevRows.reduce((s, r) => s + r.amount, 0),
      revenue: sumDaily(revenueByDate, prevMonth, throughDay),
    },
    byCategory,
    topItems,
  }
}
```

- [ ] **Step 4: รันเทสให้ผ่าน**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx vitest run src/lib/expense-analytics.test.ts
```
คาดหวัง: PASS 16 เคสในไฟล์นี้ (เทสรวมทั้งชุด 234 → 240)

- [ ] **Step 5: Commit**

```bash
git add src/lib/expense-analytics.ts src/lib/expense-analytics.test.ts
git commit -m "feat(expense-analytics): compareRange เทียบช่วงวันเท่ากัน"
```

---

### Task 5: detectAnomalies — บล็อก 2 "มีอะไรผิดปกติ"

**Files:**
- Modify: `src/lib/expense-analytics.ts`
- Modify: `src/lib/expense-analytics.test.ts`

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

**แก้ import บรรทัดบนสุด** ของไฟล์เทสให้เพิ่ม `detectAnomalies` เข้าไป:
```ts
import {
  compareRange, detectAnomalies, median, rulerOf, type ExpenseRow,
} from "./expense-analytics"
```

แล้วเพิ่มโค้ดข้างล่างนี้ **ท้ายไฟล์**:
```ts
describe("detectAnomalies — บล็อก 2", () => {
  /** เคสจริงเดือน มิ.ย. 2569: เงินเดือนประจำโตจริง ส่วนค่าเช่ากับค่าน้ำค่าไฟเป็นสัญญาณหลอก
   *  ที่ค่าเฉลี่ยจับผิด แต่ค่ากลางจับถูก — เทสนี้คือเหตุผลที่เลือกค่ากลาง */
  const salary = (month: string, amount: number) =>
    row(`${month}-30`, "เงินเดือนพนักงานประจำ", "เงินเดือน reception", amount)
  const rent = (month: string, amount: number) =>
    row(`${month}-05`, "ค่าเช่าสถานที่", "ค่าเช่า", amount)
  const util = (month: string, amount: number) =>
    row(`${month}-10`, "ค่าน้ำ / ค่าไฟ / Internet", "ค่าไฟ", amount)

  const rows = [
    salary("2026-03", 38250), salary("2026-04", 39500),
    salary("2026-05", 41650), salary("2026-06", 52450),
    rent("2026-03", 36566), rent("2026-04", 18000),
    rent("2026-05", 41000), rent("2026-06", 36000),
    util("2026-03", 2941), util("2026-04", 16375),
    util("2026-05", 20016), util("2026-06", 16198),
  ]

  const result = detectAnomalies({
    rows,
    revenueByDate: new Map(),
    commissionByDate: new Map(),
    month: "2026-06",
    throughDay: 31,
    monthClosed: true,
  })
  const byName = (name: string) => result.find((d) => d.category.startsWith(name))!

  it("เงินเดือนประจำโต 32.8% ต้องเตือนแดง", () => {
    const d = byName("เงินเดือน")
    expect(d.baseline).toBe(39500)
    expect(d.current).toBe(52450)
    expect(Math.round(d.deltaPct * 10) / 10).toBe(32.8)
    expect(d.level).toBe("alert")
  })

  it("ค่าเช่าเป็นจังหวะจ่าย ไม่ใช่ค่าเช่าขึ้น — ต้องเงียบ", () => {
    expect(byName("ค่าเช่า").level).toBe("ok")
  })

  it("ค่าน้ำค่าไฟที่ มี.ค. บันทึกไม่ครบ ต้องไม่ทำให้เตือนหลอก", () => {
    expect(byName("ค่าน้ำ").level).toBe("ok")
  })

  it("เดือนที่ยังไม่จบต้องไม่ตรวจหมวดคงที่ เพราะจ่ายเป็นก้อนวันที่ตายตัว", () => {
    const partial = detectAnomalies({
      rows,
      revenueByDate: new Map(),
      commissionByDate: new Map(),
      month: "2026-06",
      throughDay: 27,
      monthClosed: false,
    })
    expect(partial.find((d) => d.category.startsWith("เงินเดือน"))).toBeUndefined()
  })

  it("มีประวัติไม่ครบ 3 เดือน ต้องเป็น unknown ไม่ใช่ ok", () => {
    const short = detectAnomalies({
      rows: [salary("2026-05", 41650), salary("2026-06", 52450)],
      revenueByDate: new Map(),
      commissionByDate: new Map(),
      month: "2026-06",
      throughDay: 31,
      monthClosed: true,
    })
    expect(short.find((d) => d.category.startsWith("เงินเดือน"))!.level).toBe("unknown")
  })

  it("ค่ามือหมออ่านจากงานจริง ไม่ใช่จากแถวรายจ่าย", () => {
    const commission = new Map([
      ["2026-04-15", 110775], ["2026-05-15", 104135],
      ["2026-06-15", 126150], ["2026-07-15", 131035],
    ])
    const revenue = new Map([
      ["2026-04-15", 288887], ["2026-05-15", 238863],
      ["2026-06-15", 316788], ["2026-07-15", 322242],
    ])
    const out = detectAnomalies({
      // แถวรายจ่ายค่ามือตั้งใจใส่ยอดผิดเพี้ยน เพื่อพิสูจน์ว่าไม่ได้ถูกใช้
      rows: [row("2026-07-10", "HR / payroll (ค่ามือหมอ)", "ค่ามืองวด 1-10", 999999)],
      revenueByDate: revenue,
      commissionByDate: commission,
      month: "2026-07",
      throughDay: 27,
      monthClosed: false,
    })
    const d = out.find((x) => x.category.startsWith("HR / payroll"))!
    // 131035/322242 = 40.66% เทียบค่ากลาง 39.82% = โตแค่ 2.1% ยังไม่ถึงเกณฑ์
    expect(Math.round(d.current * 100) / 100).toBe(40.66)
    expect(Math.round(d.baseline * 100) / 100).toBe(39.82)
    expect(d.level).toBe("ok")
  })

  it("หมวดที่ตั้งใจจ่ายเองไม่ถูกนำมาตรวจเลย", () => {
    const out = detectAnomalies({
      rows: [
        row("2026-04-01", "การตลาด / โฆษณา", "แอด", 44869),
        row("2026-05-01", "การตลาด / โฆษณา", "แอด", 12320),
        row("2026-06-01", "การตลาด / โฆษณา", "แอด", 1000),
        row("2026-07-01", "การตลาด / โฆษณา", "แอด", 90000),
      ],
      revenueByDate: new Map(),
      commissionByDate: new Map(),
      month: "2026-07",
      throughDay: 27,
      monthClosed: false,
    })
    expect(out).toHaveLength(0)
  })

  it("เข้าเกณฑ์ % แต่เงินไม่ถึง 2,000 ต้องไม่เตือน", () => {
    const small = (month: string, amount: number) =>
      row(`${month}-10`, "ค่าน้ำ / ค่าไฟ / Internet", "ค่าไฟ", amount)
    const out = detectAnomalies({
      rows: [small("2026-03", 1000), small("2026-04", 1000), small("2026-05", 1000), small("2026-06", 2500)],
      revenueByDate: new Map(),
      commissionByDate: new Map(),
      month: "2026-06",
      throughDay: 31,
      monthClosed: true,
    })
    // โต 150% แต่เป็นเงินแค่ 1,500 บาท
    expect(out.find((d) => d.category.startsWith("ค่าน้ำ"))!.level).toBe("ok")
  })

  it("ค่าที่อยู่ตรงเส้นเกณฑ์พอดีต้องนับว่าเข้าเกณฑ์", () => {
    const u = (month: string, amount: number) =>
      row(`${month}-10`, "ค่าเช่าสถานที่", "ค่าเช่า", amount)
    const out = detectAnomalies({
      rows: [u("2026-03", 20000), u("2026-04", 20000), u("2026-05", 20000), u("2026-06", 22000)],
      revenueByDate: new Map(),
      commissionByDate: new Map(),
      month: "2026-06",
      throughDay: 31,
      monthClosed: true,
    })
    // โต 10.0% พอดี และเป็นเงิน 2,000 พอดี
    expect(out.find((d) => d.category.startsWith("ค่าเช่า"))!.level).toBe("warn")
  })

  it("ยอดขายเป็นศูนย์ต้องไม่หารด้วยศูนย์", () => {
    const out = detectAnomalies({
      rows: [row("2026-07-01", "ซักรีด", "ซักผ้า", 5000)],
      revenueByDate: new Map(),
      commissionByDate: new Map(),
      month: "2026-07",
      throughDay: 27,
      monthClosed: false,
    })
    const d = out.find((x) => x.category === "ซักรีด")!
    expect(Number.isFinite(d.current)).toBe(true)
    expect(d.level).toBe("unknown")
  })

  it("ลดลงเกินเกณฑ์และเป็นเงินพอ ต้องขึ้นว่าดีขึ้น", () => {
    const s = (month: string, amount: number) =>
      row(`${month}-10`, "ค่าเช่าสถานที่", "ค่าเช่า", amount)
    const out = detectAnomalies({
      rows: [s("2026-03", 40000), s("2026-04", 40000), s("2026-05", 40000), s("2026-06", 30000)],
      revenueByDate: new Map(),
      commissionByDate: new Map(),
      month: "2026-06",
      throughDay: 31,
      monthClosed: true,
    })
    expect(out.find((d) => d.category.startsWith("ค่าเช่า"))!.level).toBe("better")
  })
})
```

- [ ] **Step 2: รันเทสให้เห็นว่าไม่ผ่าน**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx vitest run src/lib/expense-analytics.test.ts
```
คาดหวัง: FAIL — `detectAnomalies is not exported`

- [ ] **Step 3: เขียน detectAnomalies**

เพิ่มท้าย `src/lib/expense-analytics.ts`:
```ts
export type Level = "unknown" | "ok" | "better" | "warn" | "alert"

export type CategoryDelta = {
  category: string
  ruler: Ruler
  /** revenue_linked = % ของยอดขาย · fixed = บาท */
  current: number
  baseline: number
  /** ผลเป็นเงินของช่วงที่เทียบ ใช้ตัดสินเกณฑ์ 2,000 และเขียนบรรทัด "ประหยัดได้เท่าไร" */
  impactBaht: number
  deltaPct: number
  level: Level
}

function levelOf(deltaPct: number, impactBaht: number): Level {
  if (Math.abs(impactBaht) < MIN_IMPACT_BAHT) return "ok"
  if (deltaPct >= ALERT_PCT) return "alert"
  if (deltaPct >= WARN_PCT) return "warn"
  if (deltaPct <= -WARN_PCT) return "better"
  return "ok"
}

export function detectAnomalies(input: {
  rows: ExpenseRow[]
  revenueByDate: Map<string, number>
  commissionByDate: Map<string, number>
  month: string
  throughDay: number
  /** false = ข้ามหมวดคงที่ทั้งหมด เพราะจ่ายเป็นก้อนวันที่ตายตัว เทียบกลางเดือนไม่มีความหมาย */
  monthClosed: boolean
}): CategoryDelta[] {
  const { rows, revenueByDate, commissionByDate, month, throughDay, monthClosed } = input

  const baselineMonths = Array.from({ length: BASELINE_MONTHS }, (_, i) =>
    shiftMonth(month, -(i + 1))
  )

  const categories = new Set(
    rows
      .map((r) => r.category)
      .filter((c) => rulerOf(c) !== "discretionary")
  )

  const out: CategoryDelta[] = []

  for (const category of categories) {
    const ruler = rulerOf(category)
    if (ruler === "fixed" && !monthClosed) continue

    const isCommission = category.startsWith(COMMISSION_CATEGORY_PREFIX)

    /** ค่าของเดือนหนึ่งตามไม้บรรทัดของหมวดนี้ · null = คิดไม่ได้ (ไม่มีข้อมูล) */
    const valueOf = (m: string): number | null => {
      const baht = isCommission
        ? sumDaily(commissionByDate, m, throughDay)
        : rowsInRange(rows, m, throughDay)
            .filter((r) => r.category === category)
            .reduce((s, r) => s + r.amount, 0)

      if (ruler === "fixed") return baht > 0 ? baht : null

      const revenue = sumDaily(revenueByDate, m, throughDay)
      if (revenue <= 0) return null
      return (baht / revenue) * 100
    }

    const current = valueOf(month)
    const history = baselineMonths.map(valueOf).filter((v): v is number => v !== null)

    if (current === null || history.length < BASELINE_MONTHS) {
      out.push({
        category,
        ruler,
        current: current ?? 0,
        baseline: 0,
        impactBaht: 0,
        deltaPct: 0,
        level: "unknown",
      })
      continue
    }

    const baseline = median(history)
    const deltaPct = baseline === 0 ? 0 : ((current - baseline) / baseline) * 100
    const impactBaht =
      ruler === "fixed"
        ? current - baseline
        : ((current - baseline) / 100) * sumDaily(revenueByDate, month, throughDay)

    out.push({
      category,
      ruler,
      current,
      baseline,
      impactBaht,
      deltaPct,
      level: levelOf(deltaPct, impactBaht),
    })
  }

  // เรื่องที่ต้องแก้ขึ้นก่อน แล้วค่อยเรื่องที่ดีขึ้น
  const order: Record<Level, number> = { alert: 0, warn: 1, better: 2, ok: 3, unknown: 4 }
  return out.sort(
    (a, b) => order[a.level] - order[b.level] || Math.abs(b.impactBaht) - Math.abs(a.impactBaht)
  )
}
```

- [ ] **Step 4: รันเทสให้ผ่าน**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx vitest run src/lib/expense-analytics.test.ts
```
คาดหวัง: PASS 27 เคสในไฟล์นี้ (เทสรวมทั้งชุด 240 → 251) · เคส "เงินเดือนประจำโต 32.8%" คือหลักฐานว่าค่ากลางทำงานถูก

- [ ] **Step 5: Commit**

```bash
git add src/lib/expense-analytics.ts src/lib/expense-analytics.test.ts
git commit -m "feat(expense-analytics): detectAnomalies เทียบค่ากลาง 3 เดือนตามไม้บรรทัดหมวด"
```

---

### Task 6: monthlySeries + projectMonthEnd — บล็อก 3 และ 4

**Files:**
- Modify: `src/lib/expense-analytics.ts`
- Modify: `src/lib/expense-analytics.test.ts`

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

**แก้ import บรรทัดบนสุด** ของไฟล์เทสให้เพิ่มสองชื่อนี้เข้าไป:
```ts
import {
  compareRange, detectAnomalies, median, monthlySeries, projectMonthEnd, rulerOf,
  type ExpenseRow,
} from "./expense-analytics"
```

แล้วเพิ่มโค้ดข้างล่างนี้ **ท้ายไฟล์**:
```ts
describe("monthlySeries — บล็อก 3 และ 4", () => {
  const salary = (month: string, amount: number) =>
    row(`${month}-30`, "เงินเดือนพนักงานประจำ", "เงินเดือน", amount)
  const rows = [
    salary("2026-03", 38250), salary("2026-04", 39500),
    salary("2026-05", 41650), salary("2026-06", 52450),
    salary("2026-07", 5000), // เดือนปัจจุบันยังไม่จบ ยอดยังไม่ครบ
  ]
  const revenueByMonth = new Map([
    ["2026-03", 174842], ["2026-04", 316123],
    ["2026-05", 286158], ["2026-06", 347018], ["2026-07", 322242],
  ])

  const result = monthlySeries({ rows, revenueByMonth, currentMonth: "2026-07" })

  it("เรียงเดือนจากเก่าไปใหม่", () => {
    expect(result.months).toEqual(["2026-03", "2026-04", "2026-05", "2026-06", "2026-07"])
  })

  it("ลูกศรแนวโน้มไม่นับเดือนปัจจุบัน ไม่งั้นทุกหมวดจะชี้ลงเสมอ", () => {
    const salaryRow = result.byCategory.find((c) => c.category.startsWith("เงินเดือน"))!
    expect(salaryRow.trend).toBe("up")
  })

  it("ค่ากลางคิดจากเดือนที่ปิดแล้ว 3 เดือนล่าสุด", () => {
    const salaryRow = result.byCategory.find((c) => c.category.startsWith("เงินเดือน"))!
    expect(salaryRow.median3).toBe(41650)
  })

  it("ต้นทุนต่อรายได้ 100 บาท", () => {
    const jun = result.costPer100Revenue[3]
    expect(Math.round(jun * 10) / 10).toBe(15.1)
  })

  it("เดือนที่ปิดแล้วไม่ถึง 3 เดือน ไม่แสดงลูกศรและไม่มีค่ากลาง", () => {
    const short = monthlySeries({
      rows: [salary("2026-05", 41650), salary("2026-06", 52450)],
      revenueByMonth,
      currentMonth: "2026-06",
    })
    const r = short.byCategory[0]
    expect(r.trend).toBeNull()
    expect(r.median3).toBeNull()
  })
})

describe("projectMonthEnd — ประมาณการสิ้นเดือน", () => {
  it("เติมเฉพาะหมวดประจำที่ยังบันทึกไม่ถึงค่าปกติ ส่วนหมวดตั้งใจจ่ายเองนับตามจริง", () => {
    const rows = [
      // ค่าเช่า: ปกติ 36,000 แต่เดือนนี้บันทึกแค่ 2,500 → ต้องเติมให้ถึง 36,000
      row("2026-04-05", "ค่าเช่าสถานที่", "ค่าเช่า", 36000),
      row("2026-05-05", "ค่าเช่าสถานที่", "ค่าเช่า", 36000),
      row("2026-06-05", "ค่าเช่าสถานที่", "ค่าเช่า", 36000),
      row("2026-07-05", "ค่าเช่าสถานที่", "มัดจำ", 2500),
      // อื่นๆ เป็นหมวดตั้งใจจ่ายเอง → นับเฉพาะที่บันทึกแล้ว ไม่เดาต่อ
      row("2026-04-20", "อื่นๆ", "ค่าป้ายร้าน", 104500),
      row("2026-05-20", "อื่นๆ", "เครื่องซักผ้า", 22290),
      row("2026-06-20", "อื่นๆ", "ค่าช่าง", 23000),
      row("2026-07-20", "อื่นๆ", "โอนให้คุณบอส", 2990),
    ]
    const result = projectMonthEnd({ rows, month: "2026-07", throughDay: 27 })
    expect(result.total).toBe(38990)
    expect(result.assumedCategories).toEqual(["ค่าเช่าสถานที่"])
  })

  it("บันทึกเกินค่าปกติแล้วไม่ต้องเติม", () => {
    const rows = [
      row("2026-04-05", "ค่าเช่าสถานที่", "ค่าเช่า", 10000),
      row("2026-05-05", "ค่าเช่าสถานที่", "ค่าเช่า", 10000),
      row("2026-06-05", "ค่าเช่าสถานที่", "ค่าเช่า", 10000),
      row("2026-07-05", "ค่าเช่าสถานที่", "ค่าเช่า", 15000),
    ]
    const result = projectMonthEnd({ rows, month: "2026-07", throughDay: 27 })
    expect(result.total).toBe(15000)
    expect(result.assumedCategories).toEqual([])
  })
})
```

- [ ] **Step 2: รันเทสให้เห็นว่าไม่ผ่าน**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx vitest run src/lib/expense-analytics.test.ts
```
คาดหวัง: FAIL — `monthlySeries is not exported`

- [ ] **Step 3: เขียน monthlySeries และ projectMonthEnd**

เพิ่มท้าย `src/lib/expense-analytics.ts`:
```ts
export type Trend = "up" | "down" | "flat"

export type MonthlySeries = {
  months: string[]
  byCategory: {
    category: string
    ruler: Ruler
    /** เรียงตรงกับ months */
    amounts: number[]
    /** null = เดือนที่ปิดแล้วไม่ถึง 3 เดือน */
    median3: number | null
    trend: Trend | null
  }[]
  /** ต้นทุนรวมต่อรายได้ 100 บาท เรียงตรงกับ months */
  costPer100Revenue: number[]
}

export function monthlySeries(input: {
  rows: ExpenseRow[]
  revenueByMonth: Map<string, number>
  currentMonth: string
}): MonthlySeries {
  const { rows, revenueByMonth, currentMonth } = input

  const months = [...new Set(rows.map((r) => r.expense_date.slice(0, 7)))].sort()
  // เดือนปัจจุบันยอดยังไม่ครบ ถ้านับรวมจะได้ลูกศรชี้ลงทุกหมวดเสมอ
  const closed = months.filter((m) => m < currentMonth)
  const last3Closed = closed.slice(-3)

  const categories = [...new Set(rows.map((r) => r.category))].sort()

  const amountOf = (category: string, month: string) =>
    rows
      .filter((r) => r.category === category && r.expense_date.startsWith(`${month}-`))
      .reduce((s, r) => s + r.amount, 0)

  const byCategory = categories.map((category) => {
    const history = last3Closed.map((m) => amountOf(category, m))
    const enough = last3Closed.length === 3
    let trend: Trend | null = null
    if (enough) {
      const [a, b, c] = history
      trend = c > b && b > a ? "up" : c < b && b < a ? "down" : "flat"
    }
    return {
      category,
      ruler: rulerOf(category),
      amounts: months.map((m) => amountOf(category, m)),
      median3: enough ? median(history) : null,
      trend,
    }
  })

  const costPer100Revenue = months.map((m) => {
    const revenue = revenueByMonth.get(m) ?? 0
    if (revenue <= 0) return 0
    const expense = rows
      .filter((r) => r.expense_date.startsWith(`${m}-`))
      .reduce((s, r) => s + r.amount, 0)
    return (expense / revenue) * 100
  })

  return { months, byCategory, costPer100Revenue }
}

/** ประมาณรายจ่ายทั้งเดือนจากยอดที่บันทึกแล้ว + หมวดประจำที่ยังบันทึกไม่ครบ
 *  หมวดที่เจ้าของร้านตั้งใจจ่ายเอง (การตลาด อื่นๆ) นับเฉพาะที่บันทึกแล้ว ไม่เดาต่อ
 *  เพราะเป็นของก้อนเดียวที่ไม่ได้เกิดทุกเดือน */
export function projectMonthEnd(input: {
  rows: ExpenseRow[]
  month: string
  throughDay: number
}): { total: number; assumedCategories: string[] } {
  const { rows, month, throughDay } = input
  const baselineMonths = Array.from({ length: BASELINE_MONTHS }, (_, i) =>
    shiftMonth(month, -(i + 1))
  )
  const categories = [...new Set(rows.map((r) => r.category))].sort()

  let total = 0
  const assumedCategories: string[] = []

  for (const category of categories) {
    const recorded = rowsInRange(rows, month, throughDay)
      .filter((r) => r.category === category)
      .reduce((s, r) => s + r.amount, 0)

    if (rulerOf(category) === "discretionary") {
      total += recorded
      continue
    }

    const history = baselineMonths
      .map((m) =>
        rows
          .filter((r) => r.category === category && r.expense_date.startsWith(`${m}-`))
          .reduce((s, r) => s + r.amount, 0)
      )
      .filter((v) => v > 0)

    const typical = history.length === BASELINE_MONTHS ? median(history) : 0
    if (typical > recorded) {
      total += typical
      assumedCategories.push(category)
    } else {
      total += recorded
    }
  }

  return { total, assumedCategories }
}
```

- [ ] **Step 4: รันเทสให้ผ่าน**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx vitest run src/lib/expense-analytics.test.ts
```
คาดหวัง: PASS 34 เคสในไฟล์นี้ (เทสรวมทั้งชุด 251 → 258)

- [ ] **Step 5: Gate + commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx tsc --noEmit && npx eslint src/ && npx vitest run
git add src/lib/expense-analytics.ts src/lib/expense-analytics.test.ts
git commit -m "feat(expense-analytics): monthlySeries + projectMonthEnd"
```

---

### Task 7: หน้าเว็บ บล็อก 1 และ 2

**Files:**
- Create: `src/app/(app)/insights/expenses/page.tsx`

- [ ] **Step 1: เขียนหน้าเว็บส่วนดึงข้อมูลและบล็อก 1–2**

สร้าง `src/app/(app)/insights/expenses/page.tsx`:
```tsx
import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { InsightsAccessDenied, canSeeInsights } from "../shared"
import { formatBaht } from "@/lib/constants"
import { todayInShopTz } from "@/lib/datetime"
import { daysInMonth, monthLabel, shiftMonth } from "@/lib/month"
import {
  compareRange,
  detectAnomalies,
  type CategoryDelta,
  type ExpenseRow,
} from "@/lib/expense-analytics"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"

export const metadata = { title: "วิเคราะห์รายจ่าย · สุขกายา POS" }

function toDailyMap(
  rows: { date: string | null; value: number | null }[]
): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    if (!r.date) continue
    m.set(r.date, (m.get(r.date) ?? 0) + Number(r.value ?? 0))
  }
  return m
}

export default async function ExpenseInsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const profile = await getMyProfile()
  if (!canSeeInsights(profile?.role)) {
    return <InsightsAccessDenied title="วิเคราะห์รายจ่าย" />
  }

  const supabase = await createClient()
  const today = todayInShopTz()
  const params = await searchParams
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : today.slice(0, 7)

  const isCurrentMonth = month === today.slice(0, 7)
  // เดือนที่ยังไม่จบดูถึงวันนี้ · เดือนที่ปิดแล้วดูทั้งเดือน
  const throughDay = isCurrentMonth ? Number(today.slice(8, 10)) : daysInMonth(month)

  const [{ data: expenseRows }, { data: dailyRows }, { data: commissionRows }] =
    await Promise.all([
      supabase.from("expenses").select("expense_date, category, item, amount"),
      supabase.from("v_daily_summary").select("sale_date, net_revenue"),
      supabase.from("v_commission_daily").select("work_date, commission"),
    ])

  const rows: ExpenseRow[] = (expenseRows ?? []).map((r) => ({
    expense_date: r.expense_date,
    category: r.category,
    item: r.item,
    amount: Number(r.amount),
  }))

  const revenueByDate = toDailyMap(
    (dailyRows ?? []).map((r) => ({ date: r.sale_date, value: r.net_revenue }))
  )
  const commissionByDate = toDailyMap(
    (commissionRows ?? []).map((r) => ({ date: r.work_date, value: r.commission }))
  )

  const cmp = compareRange({ rows, revenueByDate, month, throughDay })
  const anomalies = detectAnomalies({
    rows,
    revenueByDate,
    commissionByDate,
    month,
    throughDay,
    monthClosed: !isCurrentMonth,
  })

  const expenseDelta = cmp.current.expense - cmp.previous.expense
  const revenueDelta = cmp.current.revenue - cmp.previous.revenue
  const pct = (delta: number, base: number) => (base === 0 ? 0 : (delta / base) * 100)
  const maxBar = Math.max(1, ...cmp.byCategory.map((c) => Math.abs(c.deltaBaht)))

  const rangeLabel = isCurrentMonth
    ? `1–${throughDay} ${monthLabel(month)}`
    : monthLabel(month)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">วิเคราะห์รายจ่าย</h1>
          <p className="text-sm text-slate-600">
            {rangeLabel}
            {isCurrentMonth && " · เดือนนี้ยังไม่จบ เทียบช่วงวันเท่ากันกับเดือนที่แล้ว"}
          </p>
        </div>
        <div className="flex gap-1">
          <Link
            href={`/insights/expenses?month=${shiftMonth(month, -1)}`}
            className="rounded-md border px-3 py-2 text-sm hover:bg-slate-100"
          >
            ←
          </Link>
          <Link
            href={`/insights/expenses?month=${shiftMonth(month, 1)}`}
            className="rounded-md border px-3 py-2 text-sm hover:bg-slate-100"
          >
            →
          </Link>
        </div>
      </div>

      {/* บล็อก 1 — ต่างจากคราวที่แล้วเพราะอะไร */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">ต่างจากเดือนที่แล้วเพราะอะไร</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <SummaryLine
              label="รายจ่าย"
              value={cmp.current.expense}
              delta={expenseDelta}
              pct={pct(expenseDelta, cmp.previous.expense)}
              goodWhenDown
            />
            <SummaryLine
              label="รายได้"
              value={cmp.current.revenue}
              delta={revenueDelta}
              pct={pct(revenueDelta, cmp.previous.revenue)}
            />
          </div>

          <div className="space-y-1.5 border-t pt-3">
            {cmp.byCategory.length === 0 && (
              <p className="py-2 text-center text-sm text-slate-500">
                ไม่มีความเปลี่ยนแปลงระหว่างสองช่วง
              </p>
            )}
            {cmp.byCategory.map((c) => (
              <div key={c.category} className="flex items-center gap-2 text-sm">
                <span className="w-40 shrink-0 truncate text-slate-600">{c.category}</span>
                <span
                  className={`h-2 rounded-full ${c.deltaBaht > 0 ? "bg-red-400" : "bg-emerald-400"}`}
                  style={{ width: `${(Math.abs(c.deltaBaht) / maxBar) * 100}%` }}
                />
                <span
                  className={`ml-auto shrink-0 font-medium ${c.deltaBaht > 0 ? "text-red-700" : "text-emerald-700"}`}
                >
                  {c.deltaBaht > 0 ? "+" : "−"}
                  {formatBaht(Math.abs(c.deltaBaht))}
                </span>
              </div>
            ))}
          </div>

          {cmp.topItems.length > 0 && (
            <div className="border-t pt-3">
              <p className="mb-1 text-xs font-semibold text-slate-600">
                รายการใหญ่สุดของช่วงนี้ — ยอดที่พุ่งมักมาจากรายการเดียว
              </p>
              <ul className="space-y-0.5 text-sm text-slate-600">
                {cmp.topItems.map((t, i) => (
                  <li key={`${t.item}-${i}`} className="flex justify-between gap-2">
                    <span className="truncate">{t.item}</span>
                    <span className="shrink-0 font-medium">{formatBaht(t.amount)} ฿</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* บล็อก 2 — ผิดปกติไหม (ฐานคนละตัวกับบล็อก 1 โดยตั้งใจ) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">มีอะไรผิดปกติบ้าง</CardTitle>
          <p className="text-xs text-slate-500">
            เทียบกับค่าปกติ (ค่ากลาง 3 เดือนย้อนหลัง) ไม่ใช่เทียบเดือนที่แล้ว —
            ตัวเลข % จึงไม่เท่ากับด้านบน
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {anomalies.filter((d) => d.level === "alert" || d.level === "warn").length === 0 && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              ตรวจแล้ว ตอนนี้ไม่มีหมวดไหนผิดปกติ
            </p>
          )}
          {anomalies
            .filter((d) => d.level !== "ok" && d.level !== "unknown")
            .map((d) => (
              <AnomalyCard key={d.category} delta={d} />
            ))}

          {/* spec กำหนดว่าต้องบอกผู้ใช้ว่าหมวดไหนยังตัดสินไม่ได้ ไม่ใช่เงียบไปเฉยๆ
              ไม่งั้นจะเข้าใจผิดว่า "ไม่ขึ้นเตือน = ตรวจแล้วปกติ" */}
          {anomalies.some((d) => d.level === "unknown") && (
            <p className="text-xs text-slate-500">
              ยังตัดสินไม่ได้เพราะมีประวัติไม่ครบ 3 เดือน:{" "}
              {anomalies
                .filter((d) => d.level === "unknown")
                .map((d) => d.category)
                .join(" · ")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryLine({
  label,
  value,
  delta,
  pct,
  goodWhenDown = false,
}: {
  label: string
  value: number
  delta: number
  pct: number
  goodWhenDown?: boolean
}) {
  const good = goodWhenDown ? delta <= 0 : delta >= 0
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold">{formatBaht(value)} ฿</p>
      <p className={`text-xs ${good ? "text-emerald-700" : "text-red-700"}`}>
        {delta >= 0 ? "↑" : "↓"} {formatBaht(Math.abs(delta))} ฿ ({pct >= 0 ? "+" : "−"}
        {Math.abs(pct).toFixed(1)}%)
      </p>
    </div>
  )
}

const LEVEL_STYLE: Record<string, { box: string; icon: string }> = {
  alert: { box: "border-red-300 bg-red-50 text-red-900", icon: "🔴" },
  warn: { box: "border-amber-300 bg-amber-50 text-amber-900", icon: "🟡" },
  better: { box: "border-emerald-300 bg-emerald-50 text-emerald-900", icon: "🟢" },
}

function AnomalyCard({ delta }: { delta: CategoryDelta }) {
  const style = LEVEL_STYLE[delta.level] ?? LEVEL_STYLE.warn
  const isRatio = delta.ruler === "revenue_linked"
  const fmt = (v: number) => (isRatio ? `${v.toFixed(1)}% ของยอดขาย` : `${formatBaht(v)} ฿`)

  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${style.box}`}>
      <p className="font-semibold">
        {style.icon} {delta.category}{" "}
        {delta.level === "better" ? "ดีขึ้น" : "โตเร็วกว่าปกติ"}
      </p>
      <p className="mt-0.5 text-xs">
        ช่วงนี้ {fmt(delta.current)} · ค่าปกติ {fmt(delta.baseline)} ({delta.deltaPct >= 0 ? "+" : "−"}
        {Math.abs(delta.deltaPct).toFixed(1)}%)
      </p>
      <p className="mt-0.5 text-xs font-medium">
        {delta.impactBaht >= 0
          ? `ถ้าคุมได้เท่าค่าปกติ จะประหยัดได้ ${formatBaht(Math.abs(delta.impactBaht))} ฿`
          : `ประหยัดได้แล้ว ${formatBaht(Math.abs(delta.impactBaht))} ฿ เทียบค่าปกติ`}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Gate**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
rm -rf .next/dev
npx tsc --noEmit && npx eslint src/ && npm run build
```
คาดหวัง: ผ่านหมด

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/insights/expenses/page.tsx"
git commit -m "feat(insights): หน้าวิเคราะห์รายจ่าย บล็อก 1-2"
```

---

### Task 8: หน้าเว็บ บล็อก 3 และ 4 + เมนู

**Files:**
- Modify: `src/app/(app)/insights/expenses/page.tsx`
- Modify: `src/components/app-shell.tsx`

- [ ] **Step 1: เพิ่ม import และการคำนวณของบล็อก 3–4**

ใน `src/app/(app)/insights/expenses/page.tsx` เพิ่มใน import จาก `@/lib/expense-analytics`:
```tsx
import {
  compareRange,
  detectAnomalies,
  monthlySeries,
  projectMonthEnd,
  type CategoryDelta,
  type ExpenseRow,
} from "@/lib/expense-analytics"
```

เพิ่ม import กราฟและชื่อเดือนแบบย่อ:
```tsx
import { LineChart } from "@/components/charts/line-chart"
import { monthShortLabel } from "@/lib/month"
```

หลังบรรทัด `const anomalies = detectAnomalies({...})` เพิ่ม:
```tsx
  const revenueByMonth = new Map<string, number>()
  for (const [date, value] of revenueByDate) {
    const m = date.slice(0, 7)
    revenueByMonth.set(m, (revenueByMonth.get(m) ?? 0) + value)
  }

  const series = monthlySeries({ rows, revenueByMonth, currentMonth: today.slice(0, 7) })
  const projection = projectMonthEnd({ rows, month, throughDay })

  const costPoints = series.months.map((m, i) => ({
    label: monthShortLabel(m),
    value: Math.round(series.costPer100Revenue[i] * 10) / 10,
  }))

  const latestClosed = series.months.filter((m) => m < today.slice(0, 7)).slice(-1)[0]
  const latestIndex = latestClosed ? series.months.indexOf(latestClosed) : -1
  const latestRevenue = latestClosed ? (revenueByMonth.get(latestClosed) ?? 0) : 0
  const shareRows =
    latestIndex < 0 || latestRevenue <= 0
      ? []
      : series.byCategory
          .map((c) => ({
            category: c.category,
            per100: (c.amounts[latestIndex] / latestRevenue) * 100,
          }))
          .filter((c) => c.per100 > 0)
          .sort((a, b) => b.per100 - a.per100)
  const profitPer100 = 100 - shareRows.reduce((s, c) => s + c.per100, 0)
```

- [ ] **Step 2: เพิ่ม JSX ของบล็อก 3–4 ก่อนปิด `</div>` ตัวนอกสุด**

```tsx
      {/* บล็อก 3 — ขายได้ 100 บาท หายไปไหน */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            ขายได้ 100 บาท หายไปไหน{latestClosed ? ` · ${monthLabel(latestClosed)}` : ""}
          </CardTitle>
          <p className="text-xs text-slate-500">
            ใช้เดือนที่ปิดแล้วล่าสุด เพราะเดือนที่ยังไม่จบยอดยังไม่ครบ
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {shareRows.length === 0 ? (
            <p className="py-2 text-center text-sm text-slate-500">ยังไม่มีเดือนที่ปิดแล้ว</p>
          ) : (
            <>
              <div className="space-y-1.5">
                {shareRows.map((c) => (
                  <div key={c.category} className="flex items-center gap-2 text-sm">
                    <span className="w-40 shrink-0 truncate text-slate-600">{c.category}</span>
                    <span
                      className="h-2 rounded-full bg-orange-400"
                      style={{ width: `${Math.min(c.per100, 100)}%` }}
                    />
                    <span className="ml-auto shrink-0 font-medium">{c.per100.toFixed(1)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-1.5 text-sm font-semibold">
                  <span>เหลือเป็นกำไร</span>
                  <span className={profitPer100 >= 0 ? "text-emerald-700" : "text-red-700"}>
                    {profitPer100.toFixed(1)} บาท
                  </span>
                </div>
              </div>
              <div className="border-t pt-3">
                <p className="mb-1 text-xs font-semibold text-slate-600">
                  ต้นทุนรวมต่อรายได้ 100 บาท — ต่ำกว่า 100 คือมีกำไร
                </p>
                <LineChart points={costPoints} unit=" บาท" color="#ea580c" />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* บล็อก 4 — ตารางวางงบ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">รายจ่ายรายเดือนแยกหมวด</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-2 text-left whitespace-nowrap">หมวด</th>
                  {series.months.map((m) => (
                    <th key={m} className="px-2 py-2 text-right whitespace-nowrap">
                      {monthShortLabel(m)}
                      {m === today.slice(0, 7) && <span className="text-amber-600"> *</span>}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right whitespace-nowrap">ค่าปกติ</th>
                  <th className="px-2 py-2 text-right">แนวโน้ม</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {series.byCategory.map((c) => (
                  <tr key={c.category}>
                    <td className="px-4 py-2 whitespace-nowrap">{c.category}</td>
                    {c.amounts.map((a, i) => (
                      <td key={series.months[i]} className="px-2 py-2 text-right">
                        {a === 0 ? "—" : formatBaht(a)}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right text-slate-500">
                      {c.median3 === null ? "—" : formatBaht(c.median3)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {c.trend === "up" ? "↗" : c.trend === "down" ? "↘" : c.trend === "flat" ? "→" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-1 px-4 pt-3 text-xs text-slate-500">
            <p>* เดือนนี้ยังไม่จบ ยอดยังไม่ครบ · ลูกศรแนวโน้มคิดจากเดือนที่ปิดแล้ว 3 เดือนล่าสุด</p>
            {isCurrentMonth && (
              <p className="font-medium text-slate-700">
                ประมาณการรายจ่าย {monthLabel(month)} ทั้งเดือน ≈ {formatBaht(projection.total)} ฿
                {projection.assumedCategories.length > 0 &&
                  ` (เดาจากค่าปกติของ ${projection.assumedCategories.join(" · ")})`}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
```

- [ ] **Step 3: เพิ่มเมนู**

ใน `src/components/app-shell.tsx` ในหมวด `"ผู้บริหาร"` ของ `SECTIONS` เพิ่มบรรทัดนี้ต่อจาก `/insights/heatmap`:
```tsx
      { href: "/insights/expenses", label: "วิเคราะห์รายจ่าย", icon: Wallet, minRole: "manager" },
```
`Wallet` ถูก import อยู่แล้วในไฟล์นี้ (ใช้กับเมนูรายจ่าย) ไม่ต้องเพิ่ม import

- [ ] **Step 4: Gate ทั้งชุด**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
rm -rf .next/dev
npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```
คาดหวัง: ผ่านหมด

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/insights/expenses/page.tsx" src/components/app-shell.tsx
git commit -m "feat(insights): บล็อก 3-4 ต้นทุนต่อรายได้ + ตารางวางงบ + เมนู"
```

---

### Task 9: Deploy และตรวจบนหน้าจริง

**Files:** ไม่มีไฟล์ใหม่

- [ ] **Step 1: Deploy**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
git pull --rebase origin main
npx vercel deploy --prod --yes
git push origin main
```

- [ ] **Step 2: ตรวจตัวเลขบนหน้าจริงเทียบกับที่คำนวณไว้ใน spec**

เปิด `https://sookkaya-pos.vercel.app/insights/expenses` ด้วย claude-in-chrome
(หน้า sookkaya-pos ถูกบล็อกใน Claude_Browser pane ต้องใช้ claude-in-chrome เท่านั้น)

**เดือนที่ปิดแล้วเท่านั้นที่ตรึงตัวเลขได้** — ไปที่ `?month=2026-06` แล้วต้องเห็น:
- การ์ดแดง **เงินเดือนพนักงานประจำ +32.8%** (52,450 เทียบค่าปกติ 39,500)
- **ไม่มี**การ์ดของค่าเช่าสถานที่ และ**ไม่มี**การ์ดของค่าน้ำ/ค่าไฟ
  (ถ้าโผล่มา แปลว่าโค้ดกลับไปใช้ค่าเฉลี่ยแทนค่ากลาง)
- รายจ่ายเต็มเดือน **300,962** · รายได้ **347,018**

**เดือนปัจจุบันห้ามตรึงตัวเลข** เพราะร้านขายทุกวัน ให้รัน SQL นี้ ณ เวลาที่เปิดหน้าเว็บ
แล้วเทียบกับที่หน้าเว็บแสดง (ต้องตรงกัน):
```sql
select
 (select coalesce(sum(amount),0)::int from expenses
    where expense_date between date_trunc('month', current_date at time zone 'Asia/Bangkok')
      and (current_date at time zone 'Asia/Bangkok')) as expense_mtd,
 (select coalesce(sum(net_revenue),0)::int from v_daily_summary
    where sale_date between date_trunc('month', current_date at time zone 'Asia/Bangkok')
      and (current_date at time zone 'Asia/Bangkok')) as revenue_mtd;
```

- [ ] **Step 3: ตรวจสิทธิ์**

ยืนยันว่าเมนู "วิเคราะห์รายจ่าย" โผล่ในกลุ่มผู้บริหาร และผู้ใช้ role `staff` เปิดหน้านี้แล้วเห็น
`InsightsAccessDenied` ไม่ใช่ตัวเลข

- [ ] **Step 4: รันชุดตรวจ reconciliation**

รัน `supabase/reconciliation.sql` ผ่าน MCP `execute_sql`
คาดหวัง: PASS ครบ **24/24** — โดยเฉพาะข้อ `views_without_security_invoker` ต้องเป็น 0
(view ใหม่จาก Task 1 ต้องมี `security_invoker = true`)

- [ ] **Step 5: Commit ถ้ามีอะไรค้าง**

```bash
git status --short
```
ถ้าไม่มีอะไรค้าง แปลว่าจบงาน

---

## หมายเหตุท้ายแผน

**สิ่งที่ตั้งใจไม่ทำในรอบนี้** (บันทึกไว้ใน spec แล้ว): ช่องติ๊ก "รายการนี้เป็นการลงทุน" ·
ตั้งงบต่อหมวดแล้วเทียบงบจริง · เทียบปีต่อปี · แจ้งเตือนเข้าไลน์ ·
แก้ป้าย `cost_type` ที่ปนกันอยู่ (หน้านี้ไม่ได้ใช้ป้ายนั้นเลย)

**ข้อจำกัดที่ผู้ใช้จะเจอ**: มีข้อมูลแค่ 5 เดือน หมวดที่ประวัติไม่ครบ 3 เดือนจะขึ้น `unknown`
และไม่ถูกนำมาเตือน · เดือน มี.ค. บันทึกไม่ครบทุกหมวด ค่ากลางกันผลกระทบไว้แล้ว
แต่ตัวเลข มี.ค. ในตารางบล็อก 4 ยังต่ำกว่าความจริง
