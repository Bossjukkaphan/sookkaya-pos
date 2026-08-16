# หน้าจัดกำลังหมอ /insights/staffing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** หน้าวิเคราะห์สำหรับผู้จัดการ ตอบสองคำถาม: แต่ละประเภทวันควรจัดหมอกี่คน และถึงเวลาจ้างคนที่ 8 หรือยัง (เกณฑ์ 4 ข้อ)

**Architecture:** SQL view สองตัว (`v_staffing_daily` รายวัน · `v_staffing_monthly` รายเดือน) เป็นแหล่ง aggregate เดียว · ตรรกะตัดสิน (จำนวนแนะนำ, สถานะเกณฑ์, verdict) เป็น pure functions ใน `src/lib/staffing.ts` มีเทสต์ครบ · หน้าเป็น server component อ่าน view ตรง ๆ ไม่คำนวณเอง

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Supabase Postgres · vitest · Tailwind + shadcn/ui

**สเปก:** `docs/superpowers/specs/2026-08-17-staffing-insights-design.md`

## Global Constraints

- aggregate ทุกตัวมาจาก SQL view — **ห้ามรวมเลขฝั่งหน้าเว็บ** (supabase-js ตัดที่ 1,000 แถวเงียบ ๆ)
- ทุก view ประกาศ `with (security_invoker = true)` — `create or replace view` รีเซ็ตค่านี้เงียบ ๆ ต้องใส่ทุกครั้ง
- วันที่ "วันนี้" ใช้ `(now() at time zone 'Asia/Bangkok')::date` — ห้าม `current_date`
- เวลาเริ่มครองคิวใช้ตรรกะเดียวกับ `bedStartMin()`: `started_at` (แปลงเขตไทย) ถ้ามี ไม่งั้น `start_time`
- ข้อมูล `attendance` ก่อน 27 ก.ค. 2569 เป็นการเติมย้อนหลัง (`created_by = 'ประมาณจากบิลย้อนหลัง'`) — ตัวชี้วัดที่พึ่งเช็คอินตรง ๆ (`idle_therapists`) ใช้เฉพาะแถว `is_estimated = false`
- migration ใช้ MCP `apply_migration` (project `jrioyrmicioqammeevgh`) แล้ว**เก็บสำเนาไฟล์ลง `supabase/migrations/` ทุกครั้ง** ห้าม `supabase db push` / `supabase db reset`
- generate `src/types/database.ts` ใหม่แล้วต้องใส่คอมเมนต์หัวไฟล์สี่บรรทัดกลับก่อน `export type Json =`:
  ```ts
  /**
   * Types สร้างจาก Supabase schema
   * อัปเดตใหม่ด้วย: npx supabase gen types typescript --project-id jrioyrmicioqammeevgh
   */
  ```
- คอมเมนต์และข้อความหน้าจอเป็นภาษาไทย · ชื่อตัวแปรภาษาอังกฤษ
- ฟีเจอร์นี้**ไม่แตะเงิน** — ห้ามแก้ตาราง/ค่าใด ๆ ตรวจรับด้วย `reconciliation.sql` 38/38 PASS (`bed_double_booked` expected = 1) และยอด `v_daily_summary` ช่วง 1-16 ส.ค. ต้องเท่าเดิมเป๊ะ
- ขึ้น production: push main แล้ว `vercel deploy --prod --yes` เอง + เช็ค alias ว่าชี้ build ใหม่

## แผนผังไฟล์

| ไฟล์ | หน้าที่ | สถานะ |
|---|---|---|
| `src/lib/staffing.ts` | ค่าคงที่เกณฑ์ + pure functions ทั้งหมด | สร้าง (Task 1) |
| `src/lib/staffing.test.ts` | เทสต์ตรรกะตัดสิน | สร้าง (Task 1) |
| `supabase/migrations/20260817100000_staffing_views.sql` | สอง view | สร้าง (Task 2) |
| `src/types/database.ts` | types จากฐานข้อมูล | regenerate (Task 2) |
| `src/app/(app)/insights/staffing/page.tsx` | หน้า server component | สร้าง (Task 3) |
| `src/app/(app)/insights/staffing/sparkline.tsx` | SVG sparkline เล็ก | สร้าง (Task 3) |
| `src/lib/nav.ts` | เพิ่มลิงก์เมนู | แก้ (Task 3) |

ลำดับตั้งใจให้ **Task 1 (pure lib) ไม่พึ่ง schema** — Task 2 ค่อยสร้าง view — Task 3 ประกอบหน้า ไม่มีจุดไหนที่ `tsc` แดงระหว่างทาง (บทเรียนจากแผน two-room-queue ที่วางโค้ดก่อน schema)

---

## Task 1: ตรรกะตัดสินใน `src/lib/staffing.ts`

**Files:**
- Create: `src/lib/staffing.ts`
- Test: `src/lib/staffing.test.ts`

**Interfaces:**
- Produces (Task 3 ใช้):
  ```ts
  export type DayClass = "mon_thu" | "fri" | "weekend"
  export const DAY_CLASS_LABEL: Record<DayClass, string>
  export const STAFFING = {
    recommendMinPerTherapist: 2000, recommendMaxFullPct: 30, recommendMinDays: 3,
    weekendFullPctPass: 70, fridaySundayPerTherapistPass: 2500,
    turnAwaysPerMonthPass: 8, guaranteeShortfallPctPass: 15,
    nearBandPct: 15, turnAwayTrustMin: 4,
  } as const
  export function dayClass(isoDate: string): DayClass
  export type StaffingDayRow = {
    day_class: DayClass; therapists_checked_in: number; revenue: number
    peak_concurrent_therapists: number; idle_therapists: number; is_estimated: boolean
  }
  export type Recommendation = {
    count: number | null; inconclusive: boolean
    avgRevenue: number; avgPerTherapist: number; fullDayPct: number; idleCount: number
  }
  export function recommendedTherapists(rows: StaffingDayRow[]): Recommendation
  export type CriterionStatus = "pass" | "near" | "fail"
  export function criterionStatus(
    value: number, threshold: number, direction: "gte" | "lte"): CriterionStatus
  export function hireVerdict(monthsNewestFirst: { allPass: boolean }[]):
    { verdict: "ready" | "not_yet" }
  ```

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน** — สร้าง `src/lib/staffing.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  criterionStatus,
  dayClass,
  hireVerdict,
  recommendedTherapists,
  type StaffingDayRow,
} from "./staffing"

describe("dayClass — จำแนกประเภทวันจากวันที่", () => {
  it("จันทร์ถึงพฤหัสเป็น mon_thu", () => {
    expect(dayClass("2026-08-17")).toBe("mon_thu") // จันทร์
    expect(dayClass("2026-08-20")).toBe("mon_thu") // พฤหัส
  })
  it("ศุกร์แยกเป็นประเภทของตัวเอง — พฤติกรรมยอดใกล้เสาร์อาทิตย์กว่าวันธรรมดา", () => {
    expect(dayClass("2026-08-21")).toBe("fri")
  })
  it("เสาร์และอาทิตย์เป็น weekend", () => {
    expect(dayClass("2026-08-22")).toBe("weekend")
    expect(dayClass("2026-08-23")).toBe("weekend")
  })
})

// แถวตัวอย่าง: หมอ n คน ยอด revenue peak เท่าไร — ค่าอื่นตามค่าตั้งต้น
const day = (n: number, revenue: number, peak: number, over: Partial<StaffingDayRow> = {}):
  StaffingDayRow => ({
  day_class: "weekend", therapists_checked_in: n, revenue,
  peak_concurrent_therapists: peak, idle_therapists: 0, is_estimated: false, ...over,
})

describe("recommendedTherapists — จำนวนหมอน้อยสุดที่ยอดต่อหมอไม่จมและไม่เต็มบ่อย", () => {
  it("เลือก n น้อยสุดที่ผ่านทั้งยอดต่อหมอ ≥2000 และวันเต็ม ≤30%", () => {
    const rows = [
      // 5 คน: ต่อหมอ 2,400 แต่เต็ม 2 ใน 3 วัน (67%) → ไม่ผ่านข้อ (ข)
      day(5, 12_000, 5), day(5, 12_000, 5), day(5, 12_000, 4),
      // 6 คน: ต่อหมอ 2,500 เต็ม 0 ใน 3 วัน → ผ่านทั้งคู่
      day(6, 15_000, 5), day(6, 15_000, 5), day(6, 15_000, 4),
    ]
    const r = recommendedTherapists(rows)
    expect(r.count).toBe(6)
    expect(r.inconclusive).toBe(false)
  })
  it("n ที่มีข้อมูลน้อยกว่า 3 วันถูกข้าม — ห้ามตัดสินจากวันเดียว", () => {
    const rows = [
      day(4, 20_000, 3), // 4 คนมีวันเดียว แม้ตัวเลขสวยก็ห้ามใช้
      day(6, 15_000, 5), day(6, 15_000, 5), day(6, 15_000, 4),
    ]
    expect(recommendedTherapists(rows).count).toBe(6)
  })
  it("ไม่มี n ไหนผ่าน → inconclusive และคืน n ที่ยอดต่อหมอสูงสุดในกลุ่มที่ข้อมูลพอ", () => {
    const rows = [
      day(5, 8_000, 5), day(5, 8_000, 5), day(5, 8_000, 5),   // ต่อหมอ 1,600 เต็มทุกวัน
      day(6, 10_800, 6), day(6, 10_800, 6), day(6, 10_800, 6), // ต่อหมอ 1,800 เต็มทุกวัน
    ]
    const r = recommendedTherapists(rows)
    expect(r.inconclusive).toBe(true)
    expect(r.count).toBe(6)
  })
  it("ข้อมูลว่าง → count null และ inconclusive", () => {
    const r = recommendedTherapists([])
    expect(r.count).toBeNull()
    expect(r.inconclusive).toBe(true)
  })
  it("idleCount นับเฉพาะแถวข้อมูลเช็คอินจริง — แถวประมาณย้อนหลัง idle เป็น 0 เทียมเสมอ", () => {
    const rows = [
      day(6, 15_000, 4, { idle_therapists: 2, is_estimated: true }),  // ห้ามนับ
      day(6, 15_000, 4, { idle_therapists: 1, is_estimated: false }),
      day(6, 15_000, 4, { idle_therapists: 1, is_estimated: false }),
    ]
    expect(recommendedTherapists(rows).idleCount).toBe(2)
  })
})

describe("criterionStatus — ไฟสถานะเกณฑ์ เขียว/เหลือง/แดง", () => {
  it("ทิศ gte: ผ่านเมื่อถึงเกณฑ์ · เหลืองเมื่อขาดไม่เกิน 15% · แดงเมื่อต่ำกว่านั้น", () => {
    expect(criterionStatus(70, 70, "gte")).toBe("pass")
    expect(criterionStatus(59.5, 70, "gte")).toBe("near") // 85% ของ 70 = 59.5 พอดี
    expect(criterionStatus(59.4, 70, "gte")).toBe("fail")
  })
  it("ทิศ lte: ผ่านเมื่อไม่เกินเกณฑ์ · เหลืองเมื่อเกินไม่เกิน 15%", () => {
    expect(criterionStatus(15, 15, "lte")).toBe("pass")
    expect(criterionStatus(17.25, 15, "lte")).toBe("near") // 115% ของ 15 พอดี
    expect(criterionStatus(17.3, 15, "lte")).toBe("fail")
  })
})

describe("hireVerdict — ถึงเวลาจ้างเมื่อผ่านครบสองเดือนติด", () => {
  it("เดือนล่าสุดผ่านครบแต่เดือนก่อนไม่ → ยังไม่ถึงเวลา", () => {
    expect(hireVerdict([{ allPass: true }, { allPass: false }]).verdict).toBe("not_yet")
  })
  it("สองเดือนติดผ่านครบ → ถึงเวลาพิจารณา", () => {
    expect(hireVerdict([{ allPass: true }, { allPass: true }]).verdict).toBe("ready")
  })
  it("มีข้อมูลเดือนเดียว → ยังไม่ถึงเวลา (กันเดือนแรกที่บังเอิญสวย)", () => {
    expect(hireVerdict([{ allPass: true }]).verdict).toBe("not_yet")
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run src/lib/staffing.test.ts`
Expected: FAIL — ไม่มีไฟล์ `./staffing`

- [ ] **Step 3: เขียน `src/lib/staffing.ts`**

```ts
/**
 * ตรรกะตัดสินการจัดกำลังหมอ — ที่เดียวของเกณฑ์ตัวเลขทั้งหมด
 *
 * เกณฑ์มาจากการวิเคราะห์ 17 ส.ค. 2569 (สเปก 2026-08-17-staffing-insights-design.md):
 * งานวันจันทร์-พฤหัสรองรับ ~5 คน (ต่อหมอ 2,248฿ ที่ 5 คน vs 1,780฿ ที่ 6 คน)
 * เสาร์-อาทิตย์ 7 คนคุ้ม (ครึ่งหนึ่งของวันหมอเต็มพร้อมกันทั้ง 7)
 * ร้านโตแล้วเกณฑ์เก่าไม่เหมาะ — แก้ที่ค่าคงที่นี้ที่เดียว
 */

export type DayClass = "mon_thu" | "fri" | "weekend"

export const DAY_CLASS_LABEL: Record<DayClass, string> = {
  mon_thu: "จันทร์–พฤหัส",
  fri: "ศุกร์",
  weekend: "เสาร์–อาทิตย์",
}

export const STAFFING = {
  /** จำนวนแนะนำ: ยอดต่อหมอเฉลี่ยขั้นต่ำของ n ที่ยอมรับได้ */
  recommendMinPerTherapist: 2000,
  /** จำนวนแนะนำ: สัดส่วนวันที่หมอเต็มพร้อมกันสูงสุดที่ยอมรับได้ (%) */
  recommendMaxFullPct: 30,
  /** จำนวนแนะนำ: n ต้องมีข้อมูลอย่างน้อยกี่วันถึงเข้ารอบ */
  recommendMinDays: 3,
  /** เกณฑ์จ้างคนที่ 8 ข้อ 1: % วันเสาร์-อาทิตย์ที่หมอเต็มพร้อมกัน */
  weekendFullPctPass: 70,
  /** เกณฑ์ข้อ 2: ยอดต่อหมอต่อวัน ศุกร์-อาทิตย์ (บาท) */
  fridaySundayPerTherapistPass: 2500,
  /** เกณฑ์ข้อ 3: ลูกค้าที่ปฏิเสธต่อเดือน (ครั้ง) */
  turnAwaysPerMonthPass: 8,
  /** เกณฑ์ข้อ 4: % หมอ-วันที่ต่ำกว่าการันตี 500฿ ไม่เกิน */
  guaranteeShortfallPctPass: 15,
  /** แถบเหลือง: ยังไม่ผ่านแต่อยู่ภายในกี่ % ของเกณฑ์ */
  nearBandPct: 15,
  /** จำนวนบันทึกปฏิเสธขั้นต่ำต่อเดือนที่ทำให้ตัวเลขข้อ 3 น่าเชื่อ */
  turnAwayTrustMin: 4,
} as const

/** จันทร์-พฤหัส / ศุกร์ / เสาร์-อาทิตย์ — ศุกร์แยกเพราะยอดใกล้วันหยุดกว่าวันธรรมดา */
export function dayClass(isoDate: string): DayClass {
  const [y, m, d] = isoDate.split("-").map(Number)
  // 0=อาทิตย์ … 6=เสาร์ (UTC ปลอดภัยเพราะสร้างจากปี-เดือน-วันตรง ๆ ไม่มีเขตเวลา)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  if (dow === 5) return "fri"
  if (dow === 0 || dow === 6) return "weekend"
  return "mon_thu"
}

export type StaffingDayRow = {
  day_class: DayClass
  therapists_checked_in: number
  revenue: number
  peak_concurrent_therapists: number
  idle_therapists: number
  is_estimated: boolean
}

export type Recommendation = {
  /** จำนวนหมอแนะนำ · null = ข้อมูลไม่พอจะตอบ */
  count: number | null
  inconclusive: boolean
  avgRevenue: number
  avgPerTherapist: number
  /** % ของวันที่หมอยุ่งเต็มพร้อมกัน (peak ≥ จำนวนที่เช็คอิน) */
  fullDayPct: number
  /** ครั้งที่หมอมาแล้วไม่ได้คิวเลย — นับเฉพาะข้อมูลเช็คอินจริง */
  idleCount: number
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/**
 * จำนวนหมอน้อยที่สุด n ที่ (ก) ยอดต่อหมอเฉลี่ย ≥ 2,000฿ และ (ข) วันที่เต็ม ≤ 30%
 * — น้อยกว่านั้นคือจัดขาด (เต็มบ่อย เสียลูกค้า) มากกว่านั้นคือจัดเกิน (ยอดต่อหมอจม)
 * n ที่มีข้อมูลน้อยกว่า 3 วันไม่เข้ารอบ ห้ามตัดสินจากวันเดียว
 */
export function recommendedTherapists(rows: StaffingDayRow[]): Recommendation {
  const summary = {
    avgRevenue: Math.round(avg(rows.map((r) => r.revenue))),
    avgPerTherapist: Math.round(
      avg(rows.filter((r) => r.therapists_checked_in > 0)
        .map((r) => r.revenue / r.therapists_checked_in))
    ),
    fullDayPct: rows.length
      ? Math.round((100 * rows.filter(
          (r) => r.peak_concurrent_therapists >= r.therapists_checked_in
        ).length) / rows.length)
      : 0,
    idleCount: rows.filter((r) => !r.is_estimated)
      .reduce((a, r) => a + r.idle_therapists, 0),
  }

  const byN = new Map<number, StaffingDayRow[]>()
  for (const r of rows) {
    if (r.therapists_checked_in <= 0) continue
    byN.set(r.therapists_checked_in, [...(byN.get(r.therapists_checked_in) ?? []), r])
  }
  const eligible = [...byN.entries()]
    .filter(([, g]) => g.length >= STAFFING.recommendMinDays)
    .sort(([a], [b]) => a - b)

  for (const [n, g] of eligible) {
    const perTherapist = avg(g.map((r) => r.revenue / n))
    const fullPct = (100 * g.filter((r) => r.peak_concurrent_therapists >= n).length) / g.length
    if (perTherapist >= STAFFING.recommendMinPerTherapist &&
        fullPct <= STAFFING.recommendMaxFullPct) {
      return { count: n, inconclusive: false, ...summary }
    }
  }

  // ไม่มี n ผ่าน — ชี้ n ที่ยอดต่อหมอดีสุดไว้เป็นจุดตั้งต้น แต่ประกาศตรง ๆ ว่ายังสรุปไม่ได้
  const fallback = eligible
    .map(([n, g]) => ({ n, per: avg(g.map((r) => r.revenue / n)) }))
    .sort((a, b) => b.per - a.per)[0]
  return { count: fallback?.n ?? null, inconclusive: true, ...summary }
}

export type CriterionStatus = "pass" | "near" | "fail"

/** เหลือง = ยังไม่ผ่านแต่อยู่ภายใน 15% ของเกณฑ์ — ให้เห็นว่ากำลังเข้าใกล้ */
export function criterionStatus(
  value: number,
  threshold: number,
  direction: "gte" | "lte"
): CriterionStatus {
  const band = STAFFING.nearBandPct / 100
  if (direction === "gte") {
    if (value >= threshold) return "pass"
    return value >= threshold * (1 - band) ? "near" : "fail"
  }
  if (value <= threshold) return "pass"
  return value <= threshold * (1 + band) ? "near" : "fail"
}

/**
 * ถึงเวลาจ้างเมื่อเดือนล่าสุดและเดือนก่อนหน้าผ่านครบ 4 ข้อติดกัน
 * เดือนเดียวไม่พอ — เดือนที่บังเอิญสวย (เทศกาล/โปรฯ) จะหลอกให้จ้างเกิน
 */
export function hireVerdict(
  monthsNewestFirst: { allPass: boolean }[]
): { verdict: "ready" | "not_yet" } {
  const ready =
    monthsNewestFirst.length >= 2 &&
    monthsNewestFirst[0].allPass &&
    monthsNewestFirst[1].allPass
  return { verdict: ready ? "ready" : "not_yet" }
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/lib/staffing.test.ts`
Expected: PASS ทุกข้อ

- [ ] **Step 5: Commit**

```bash
git add src/lib/staffing.ts src/lib/staffing.test.ts
git commit -m "feat: ตรรกะตัดสินจัดกำลังหมอ — จำนวนแนะนำ เกณฑ์ 4 ข้อ และ verdict จ้างเพิ่ม"
```

---

## Task 2: view `v_staffing_daily` + `v_staffing_monthly`

**Files:**
- Create: `supabase/migrations/20260817100000_staffing_views.sql`
- Regenerate: `src/types/database.ts`

**Interfaces:**
- Consumes: ตาราง `attendance`, `sales`, `turn_aways`, `queue_entries`, view `v_therapist_daily`
- Produces (Task 3 select ตรง ๆ):
  `v_staffing_daily(work_date, day_class, therapists_checked_in, is_estimated, bills, revenue, revenue_per_therapist, guarantee_shortfall_count, idle_therapists, turn_away_count, peak_concurrent_therapists)`
  `v_staffing_monthly(month, weekend_days, weekend_full_days, weekend_full_pct, fri_sun_revenue_per_therapist, turn_away_total, therapist_days, guarantee_shortfall_total, guarantee_shortfall_pct, estimated_days)`

- [ ] **Step 1: เขียนไฟล์ migration** — `supabase/migrations/20260817100000_staffing_views.sql`:

```sql
-- สอง view ของหน้า "จัดกำลังหมอ" (/insights/staffing)
--
-- v_staffing_daily: หนึ่งแถวต่อวันที่มีการเช็คอิน — จำนวนหมอ ยอด peak การใช้หมอพร้อมกัน
-- v_staffing_monthly: สรุปรายเดือนของเกณฑ์ตัดสินจ้างคนที่ 8 ทั้ง 4 ข้อ
--
-- เส้นแบ่งข้อมูลสำคัญ: attendance ก่อน 27 ก.ค. 2569 เติมย้อนหลังจากบิล
-- (created_by = 'ประมาณจากบิลย้อนหลัง') หมอที่มาแต่ไม่มีบิลไม่มีแถวในช่วงนั้น
-- คอลัมน์ is_estimated มีไว้ให้หน้าจอกรอง — idle_therapists ของช่วงประมาณเป็น 0 เทียมเสมอ

create or replace view public.v_staffing_daily
with (security_invoker = true) as
with att as (
  select work_date,
         count(*) as therapists_checked_in,
         bool_or(created_by = 'ประมาณจากบิลย้อนหลัง') as is_estimated
  from public.attendance
  where therapist_id is not null
  group by work_date
),
sal as (
  select sale_date, count(*) as bills, sum(net_amount) as revenue
  from public.sales
  where therapist_id is not null
  group by sale_date
),
shortfall as (
  -- นับจาก v_therapist_daily เพื่อใช้กติกาการันตีตัวเดียวกับหน้า /commission
  select work_date, count(*) as guarantee_shortfall_count
  from public.v_therapist_daily
  where total_commission < guarantee_amount
  group by work_date
),
idle as (
  -- หมอที่เช็คอินแต่ทั้งวันไม่มีบิลสักใบ — สัญญาณจ้างเกิน (มีความหมายเฉพาะเช็คอินจริง)
  select a.work_date, count(*) as idle_therapists
  from public.attendance a
  where a.therapist_id is not null
    and not exists (
      select 1 from public.sales s
      where s.sale_date = a.work_date and s.therapist_id = a.therapist_id)
  group by a.work_date
),
ta as (
  select queue_date, count(*) as turn_away_count
  from public.turn_aways
  group by queue_date
),
q as (
  -- เวลาเริ่มครองคิว: ตรรกะเดียวกับ bedStartMin() — เริ่มจริง (started_at เขตไทย) ถ้ามี
  -- ไม่งั้นเวลาจอง · ช่วงครองคือ [start, start + duration)
  select queue_date, therapist_id,
    (extract(hour from coalesce(started_at at time zone 'Asia/Bangkok',
                                queue_date + start_time)) * 60
     + extract(minute from coalesce(started_at at time zone 'Asia/Bangkok',
                                    queue_date + start_time)))::int as start_min,
    duration_min
  from public.queue_entries
  where status not in ('cancelled', 'rejected') and therapist_id is not null
),
peak as (
  -- จุดสูงสุดของ "หมอไม่ซ้ำที่ติดคิวพร้อมกัน" ในวัน — จุดวัดคือเวลาเริ่มของแต่ละคิว
  -- (ระหว่างสองเวลาเริ่ม จำนวนคิวที่ทับกันไม่เพิ่ม จึงเช็คเฉพาะจุดเริ่มพอ)
  select queue_date, max(cnt) as peak_concurrent_therapists
  from (
    select a.queue_date,
      (select count(distinct b.therapist_id) from q b
        where b.queue_date = a.queue_date
          and b.start_min <= a.start_min
          and b.start_min + b.duration_min > a.start_min) as cnt
    from q a
  ) z
  group by queue_date
)
select
  att.work_date,
  case when extract(isodow from att.work_date) between 1 and 4 then 'mon_thu'
       when extract(isodow from att.work_date) = 5 then 'fri'
       else 'weekend' end                                   as day_class,
  att.therapists_checked_in,
  att.is_estimated,
  coalesce(sal.bills, 0)                                    as bills,
  coalesce(sal.revenue, 0)                                  as revenue,
  round(sal.revenue / nullif(att.therapists_checked_in, 0)) as revenue_per_therapist,
  coalesce(shortfall.guarantee_shortfall_count, 0)          as guarantee_shortfall_count,
  coalesce(idle.idle_therapists, 0)                         as idle_therapists,
  coalesce(ta.turn_away_count, 0)                           as turn_away_count,
  coalesce(peak.peak_concurrent_therapists, 0)              as peak_concurrent_therapists
from att
left join sal       on sal.sale_date  = att.work_date
left join shortfall on shortfall.work_date = att.work_date
left join idle      on idle.work_date = att.work_date
left join ta        on ta.queue_date  = att.work_date
left join peak      on peak.queue_date = att.work_date;

create or replace view public.v_staffing_monthly
with (security_invoker = true) as
select
  to_char(work_date, 'YYYY-MM')                             as month,
  count(*) filter (where day_class = 'weekend')             as weekend_days,
  count(*) filter (where day_class = 'weekend'
    and peak_concurrent_therapists >= therapists_checked_in) as weekend_full_days,
  round(100.0 * count(*) filter (where day_class = 'weekend'
      and peak_concurrent_therapists >= therapists_checked_in)
    / nullif(count(*) filter (where day_class = 'weekend'), 0), 1)
                                                            as weekend_full_pct,
  round(avg(revenue_per_therapist)
    filter (where day_class in ('fri', 'weekend')))         as fri_sun_revenue_per_therapist,
  sum(turn_away_count)                                      as turn_away_total,
  sum(therapists_checked_in)                                as therapist_days,
  sum(guarantee_shortfall_count)                            as guarantee_shortfall_total,
  round(100.0 * sum(guarantee_shortfall_count)
    / nullif(sum(therapists_checked_in), 0), 1)             as guarantee_shortfall_pct,
  count(*) filter (where is_estimated)                      as estimated_days
from public.v_staffing_daily
group by to_char(work_date, 'YYYY-MM');
```

- [ ] **Step 2: apply ผ่าน MCP**

`apply_migration` (project `jrioyrmicioqammeevgh`) ชื่อ `staffing_views` เนื้อหาตรงกับไฟล์เป๊ะ

- [ ] **Step 3: ตรวจ view กับวันที่รู้คำตอบ**

Run ผ่าน `execute_sql`:
```sql
select work_date, day_class, therapists_checked_in, is_estimated,
       revenue, peak_concurrent_therapists, idle_therapists
from v_staffing_daily
where work_date in ('2026-08-16', '2026-08-12', '2026-07-20')
order by work_date;
```
Expected: 16 ส.ค. (อาทิตย์) `weekend` เช็คอิน 7 ยอด 28,240 · 12 ส.ค. (พุธ) `mon_thu` เช็คอิน 7 · 20 ก.ค. `is_estimated = true`
และ:
```sql
select month, weekend_days, weekend_full_pct, fri_sun_revenue_per_therapist,
       turn_away_total, guarantee_shortfall_pct
from v_staffing_monthly order by month;
```
Expected: แถวมี.ค.–ส.ค. ครบ 6 เดือน · ส.ค. `turn_away_total = 4` · `guarantee_shortfall_pct` ส.ค. ≈ 9.3

- [ ] **Step 4: ตรวจว่า security_invoker ติดจริง**

```sql
select relname, reloptions from pg_class
where relname in ('v_staffing_daily', 'v_staffing_monthly');
```
Expected: ทั้งคู่มี `security_invoker=true`

- [ ] **Step 5: regenerate types + คืนคอมเมนต์หัวไฟล์**

`generate_typescript_types` → ทับ `src/types/database.ts` → ใส่คอมเมนต์สี่บรรทัด (ดู Global Constraints) กลับก่อน `export type Json =`

- [ ] **Step 6: ตรวจ type + เทสต์ทั้งชุด**

Run: `npx tsc --noEmit && npm test`
Expected: ผ่านทั้งคู่ ไม่มีไฟล์ไหนพัง

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260817100000_staffing_views.sql src/types/database.ts
git commit -m "feat: view v_staffing_daily + v_staffing_monthly สำหรับหน้าจัดกำลังหมอ"
```

---

## Task 3: หน้า `/insights/staffing` + เมนู

**Files:**
- Create: `src/app/(app)/insights/staffing/page.tsx`
- Create: `src/app/(app)/insights/staffing/sparkline.tsx`
- Modify: `src/lib/nav.ts` (หมวดผู้บริหาร ต่อจาก "ROI ส่วนลด")

**Interfaces:**
- Consumes: ทุก export ของ `@/lib/staffing` (Task 1) · view ทั้งสอง (Task 2) · `canSeeInsights`/`InsightsAccessDenied` จาก `../shared` · `formatBaht` จาก `@/lib/constants` · `todayInShopTz` จาก `@/lib/datetime`

- [ ] **Step 1: สร้าง `sparkline.tsx`**

```tsx
/** เส้นแนวโน้มจิ๋วในเซลล์ตาราง — SVG ล้วน ไม่พึ่งไลบรารีกราฟ */
export function Sparkline({ values, width = 96, height = 24 }: {
  values: number[]
  width?: number
  height?: number
}) {
  const pts = values.filter((v) => Number.isFinite(v))
  if (pts.length < 2) return <span className="text-xs text-slate-400">–</span>
  const min = Math.min(...pts)
  const max = Math.max(...pts)
  const span = max - min || 1
  const step = width / (pts.length - 1)
  const points = pts
    .map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
    .join(" ")
  return (
    <svg width={width} height={height} aria-hidden className="text-slate-400">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle
        cx={((pts.length - 1) * step).toFixed(1)}
        cy={(height - 2 - ((pts[pts.length - 1] - min) / span) * (height - 4)).toFixed(1)}
        r="2.5" fill="currentColor" className="text-emerald-600"
      />
    </svg>
  )
}
```

- [ ] **Step 2: สร้าง `page.tsx`**

โครงหลัก (server component เต็มไฟล์):

```tsx
import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { InsightsAccessDenied, canSeeInsights } from "../shared"
import {
  DAY_CLASS_LABEL, STAFFING, criterionStatus, hireVerdict, recommendedTherapists,
  type CriterionStatus, type DayClass, type StaffingDayRow,
} from "@/lib/staffing"
import { formatBaht } from "@/lib/constants"
import { todayInShopTz } from "@/lib/datetime"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sparkline } from "./sparkline"

export const metadata = { title: "จัดกำลังหมอ · สุขกายา POS" }

const STATUS_ICON: Record<CriterionStatus, string> = {
  pass: "🟢", near: "🟡", fail: "🔴",
}

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export default async function StaffingPage() {
  const supabase = await createClient()
  const profile = await getMyProfile()
  if (!canSeeInsights(profile?.role)) {
    return <InsightsAccessDenied title="จัดกำลังหมอ" />
  }

  const today = todayInShopTz()
  // 8 สัปดาห์ล่าสุดสำหรับการ์ดจำนวนแนะนำ — สั้นกว่านี้ข้อมูลต่อ n ไม่พอ ยาวกว่านี้โดนช่วงร้านยังเล็กถ่วง
  const from8w = shiftDate(today, -56)

  const [dailyRes, monthlyRes] = await Promise.all([
    supabase.from("v_staffing_daily").select("*").gte("work_date", from8w)
      .order("work_date"),
    supabase.from("v_staffing_monthly").select("*").order("month", { ascending: false })
      .limit(6),
  ])
  const daily = (dailyRes.data ?? []) as (StaffingDayRow & { work_date: string })[]
  const monthly = monthlyRes.data ?? []

  // ---------- ส่วนบน: จัดกี่คนต่อประเภทวัน ----------
  const classes: DayClass[] = ["mon_thu", "fri", "weekend"]
  const recs = classes.map((c) => ({
    dayClass: c,
    rec: recommendedTherapists(daily.filter((r) => r.day_class === c)),
  }))

  // ---------- ส่วนล่าง: เกณฑ์ 4 ข้อจากเดือนล่าสุด + sparkline 6 เดือน ----------
  const newest = monthly[0]
  const numbersOf = (m: (typeof monthly)[number]) => ({
    weekendFullPct: Number(m.weekend_full_pct ?? 0),
    friSunPerTherapist: Number(m.fri_sun_revenue_per_therapist ?? 0),
    turnAways: Number(m.turn_away_total ?? 0),
    shortfallPct: Number(m.guarantee_shortfall_pct ?? 0),
  })
  const criteria = newest
    ? [
        {
          label: "วันเสาร์-อาทิตย์ที่หมอยุ่งเต็มพร้อมกัน",
          value: `${numbersOf(newest).weekendFullPct}%`,
          threshold: `≥ ${STAFFING.weekendFullPctPass}%`,
          status: criterionStatus(numbersOf(newest).weekendFullPct,
            STAFFING.weekendFullPctPass, "gte"),
          trend: monthly.map((m) => numbersOf(m).weekendFullPct).reverse(),
        },
        {
          label: "ยอดต่อหมอต่อวัน (ศุกร์-อาทิตย์)",
          value: formatBaht(numbersOf(newest).friSunPerTherapist),
          threshold: `≥ ${formatBaht(STAFFING.fridaySundayPerTherapistPass)}`,
          status: criterionStatus(numbersOf(newest).friSunPerTherapist,
            STAFFING.fridaySundayPerTherapistPass, "gte"),
          trend: monthly.map((m) => numbersOf(m).friSunPerTherapist).reverse(),
        },
        {
          label: "ลูกค้าที่ปฏิเสธ",
          value: `${numbersOf(newest).turnAways} ครั้ง`,
          threshold: `≥ ${STAFFING.turnAwaysPerMonthPass} ครั้ง/เดือน`,
          status: criterionStatus(numbersOf(newest).turnAways,
            STAFFING.turnAwaysPerMonthPass, "gte"),
          trend: monthly.map((m) => numbersOf(m).turnAways).reverse(),
          trustNote: numbersOf(newest).turnAways < STAFFING.turnAwayTrustMin
            ? `ตัวเลขนี้เชื่อได้ต่อเมื่อพนักงานกดปุ่มปฏิเสธทุกครั้งที่รับลูกค้าไม่ได้ — เดือนนี้บันทึกเพียง ${numbersOf(newest).turnAways} ครั้ง`
            : null,
        },
        {
          label: "หมอ-วันที่ต่ำกว่าการันตี 500฿",
          value: `${numbersOf(newest).shortfallPct}%`,
          threshold: `≤ ${STAFFING.guaranteeShortfallPctPass}%`,
          status: criterionStatus(numbersOf(newest).shortfallPct,
            STAFFING.guaranteeShortfallPctPass, "lte"),
          trend: monthly.map((m) => numbersOf(m).shortfallPct).reverse(),
        },
      ]
    : []
  const passCount = criteria.filter((c) => c.status === "pass").length
  const allPassByMonth = monthly.map((m) => {
    const n = numbersOf(m)
    return {
      allPass:
        criterionStatus(n.weekendFullPct, STAFFING.weekendFullPctPass, "gte") === "pass" &&
        criterionStatus(n.friSunPerTherapist, STAFFING.fridaySundayPerTherapistPass, "gte") === "pass" &&
        criterionStatus(n.turnAways, STAFFING.turnAwaysPerMonthPass, "gte") === "pass" &&
        criterionStatus(n.shortfallPct, STAFFING.guaranteeShortfallPctPass, "lte") === "pass",
    }
  })
  const { verdict } = hireVerdict(allPassByMonth)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">จัดกำลังหมอ</h1>
        <p className="text-sm text-slate-600">
          แต่ละวันควรจัดหมอกี่คน และถึงเวลาจ้างเพิ่มหรือยัง
        </p>
      </div>

      {/* เส้นแบ่งข้อมูล — ก่อน 27 ก.ค. เป็นข้อมูลเติมย้อนหลัง (ดูสเปก) */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="py-3 text-xs text-amber-900">
          การเช็คอินจริงเริ่ม 27 ก.ค. 2569 — ก่อนหน้านั้นประมาณจากบิลย้อนหลัง
          ตัวเลขที่พึ่งการเช็คอินตรง ๆ (เช่น หมอว่างทั้งวัน)
          คำนวณจากช่วงข้อมูลจริงเท่านั้น
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="font-semibold">สัปดาห์นี้จัดกี่คนดี</h2>
        <p className="text-xs text-slate-500">จากข้อมูล 8 สัปดาห์ล่าสุด</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {recs.map(({ dayClass: c, rec }) => (
            <Card key={c}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{DAY_CLASS_LABEL[c]}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {rec.count === null || rec.inconclusive ? (
                  <p className="text-2xl font-bold text-slate-400">
                    {rec.count === null ? "ข้อมูลยังไม่พอ" : `~${rec.count} คน?`}
                  </p>
                ) : (
                  <p className="text-3xl font-bold">{rec.count} คน</p>
                )}
                <p className="text-sm text-slate-600">
                  ยอดเฉลี่ย {formatBaht(rec.avgRevenue)}/วัน · ต่อหมอ{" "}
                  {formatBaht(rec.avgPerTherapist)}
                </p>
                <p className="text-sm text-slate-600">
                  วันที่หมอเต็มพร้อมกัน {rec.fullDayPct}%
                </p>
                <p className="text-sm text-slate-600">
                  หมอว่างทั้งวัน {rec.idleCount} ครั้ง
                  <span className="text-xs text-slate-400"> (นับจากเช็คอินจริง)</span>
                </p>
                {c === "weekend" && (
                  <p className="pt-1 text-xs text-slate-500">
                    วันหยุดนักขัตฤกษ์จัดตามการ์ดนี้
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">ถึงเวลาจ้างคนที่ 8 หรือยัง</h2>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              ผ่าน {passCount} จาก 4 เกณฑ์ —{" "}
              {verdict === "ready" ? (
                <span className="text-emerald-700">ถึงเวลาพิจารณา (ผ่านครบ 2 เดือนติด)</span>
              ) : (
                <span className="text-slate-600">ยังไม่ถึงเวลา</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-500">
                  <th className="py-1.5 font-medium">เกณฑ์</th>
                  <th className="py-1.5 font-medium">เดือนนี้</th>
                  <th className="py-1.5 font-medium">ต้องการ</th>
                  <th className="py-1.5 font-medium">สถานะ</th>
                  <th className="py-1.5 font-medium">6 เดือน</th>
                </tr>
              </thead>
              <tbody>
                {criteria.map((c) => (
                  <tr key={c.label} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-2">
                      {c.label}
                      {"trustNote" in c && c.trustNote && (
                        <p className="pt-1 text-xs text-amber-700">{c.trustNote}</p>
                      )}
                    </td>
                    <td className="py-2 pr-2 font-medium">{c.value}</td>
                    <td className="py-2 pr-2 text-slate-500">{c.threshold}</td>
                    <td className="py-2 pr-2">{STATUS_ICON[c.status]}</td>
                    <td className="py-2"><Sparkline values={c.trend} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!newest && (
              <p className="py-4 text-center text-sm text-slate-500">ยังไม่มีข้อมูล</p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
```

หมายเหตุถึงผู้เขียน: type ของแถว view ที่ generate มาอาจให้ค่าเป็น `number | null` — cast ผ่าน `Number(... ?? 0)` แบบที่ `numbersOf` ทำ อย่าปล่อย NaN เข้า `criterionStatus`

- [ ] **Step 3: เพิ่มลิงก์เมนูใน `src/lib/nav.ts`**

หมวดผู้บริหาร ต่อจากรายการ "ROI ส่วนลด" (`/insights/promotions`):

```ts
{
  href: "/insights/staffing",
  label: "จัดกำลังหมอ",
  icon: Users,
  description: "แต่ละวันควรจัดหมอกี่คน และถึงเวลาจ้างเพิ่มหรือยัง",
  minRole: "manager",
},
```

(`Users` ถูก import อยู่แล้วในไฟล์)

- [ ] **Step 4: ตรวจทั้งชุด**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: ผ่านทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/insights/staffing" src/lib/nav.ts
git commit -m "feat: หน้าจัดกำลังหมอ /insights/staffing — การ์ดจำนวนแนะนำ + เกณฑ์จ้างคนที่ 8"
```

---

## Task 4: ตรวจรับและขึ้น production

**Files:** ไม่มีไฟล์ใหม่ — งานตรวจและ deploy

- [ ] **Step 1: ชุดตรวจเต็ม**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: เทสต์ผ่านทั้งหมด (ของเดิม 743 + ของใหม่ Task 1) · lint ไม่มี error ใหม่ (warning `MAX_PAYMENT_LINES` เดิมมีอยู่ก่อน) · build ผ่าน

- [ ] **Step 2: reconciliation ต้องไม่ขยับ**

รัน `supabase/reconciliation.sql` ทั้งไฟล์ผ่าน `execute_sql`
Expected: **38/38 PASS** (`bed_double_booked` = 1 ตาม expected)

- [ ] **Step 3: เงินต้องไม่ขยับ**

```sql
select sum(volume) as volume, sum(net_revenue) as revenue, sum(cash_in) as cash_in
from v_daily_summary where sale_date between '2026-08-01' and '2026-08-16';
```
Expected: ตรงกับก่อนเริ่มงานเป๊ะ — volume 213,166 revenue 202,326.70 cash_in 236,529 **ค่าจริงให้ query เก็บไว้ก่อนเริ่ม Task 1 แล้วเทียบตอนนี้** (ตัวเลขในบรรทัดนี้เป็นของ 1-14 ส.ค.+2 วัน โดยประมาณ — ยึดค่าที่เก็บจริงตอนเริ่มเป็นหลัก)

- [ ] **Step 4: ตรวจหน้าจริงเท่าที่ทำได้โดยไม่มี login**

`npm run build` ผ่านแล้ว ส่วนการเปิดหน้า `/insights/staffing` ด้วยสิทธิ์ manager ต้องให้ Boss เปิดดูเอง — จุดที่ต้องดู: การ์ด 3 ใบมีตัวเลข · ตารางเกณฑ์ 4 แถวมีไฟสถานะและ sparkline · ป้ายเหลืองเส้นแบ่งข้อมูลอยู่บนสุด · ลิงก์ "จัดกำลังหมอ" โผล่ในเมนูหมวดผู้บริหาร (ทั้งจอกว้างและหน้า "เพิ่มเติม" ของมือถือ ซึ่งอ่านจาก `nav.ts` ที่เดียวกัน)

- [ ] **Step 5: merge + deploy**

```bash
git checkout main && git pull --ff-only
git merge --no-ff <feature-branch>
npm test
git push origin main
npx vercel deploy --prod --yes
npx vercel inspect sookkaya-pos.vercel.app   # alias ต้องชี้ build ใหม่
```

- [ ] **Step 6: รายงาน Boss + อัปเดต memory**

สรุป: หน้าใหม่อยู่ไหน อ่านยังไง เกณฑ์แก้ได้ที่ `staffing.ts` ที่เดียว · เตือนเรื่องวินัยกดปุ่มปฏิเสธลูกค้าอีกครั้ง (เกณฑ์ข้อ 3 พึ่งมัน) · อัปเดต memory ของโปรเจกต์ว่ามีหน้านี้แล้ว

---

## Self-Review (ทำแล้ว)

- **Spec coverage:** view สองตัว → Task 2 · pure functions + ค่าคงที่ → Task 1 · หน้าสองส่วน + ป้ายข้อมูล + trust note + เมนู → Task 3 · reconciliation + เงินไม่ขยับ + deploy → Task 4 · "ไม่ทำ" ทั้ง 4 ข้อของสเปกไม่มี task ไหนละเมิด ✓
- **Placeholder scan:** ไม่มี TBD/TODO — โค้ดเต็มทุก step ✓
- **Type consistency:** `StaffingDayRow`/`Recommendation`/`criterionStatus("gte"|"lte")`/`hireVerdict` ตรงกันระหว่าง Task 1 (นิยาม) กับ Task 3 (ผู้ใช้) · ชื่อคอลัมน์ view ใน Task 2 ตรงกับที่ `page.tsx` select ✓
