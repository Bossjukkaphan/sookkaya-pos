# Daily Report เข้าไลน์จาก POS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ POS คำนวณและยิงการ์ดสรุปยอดขายรายวันเข้ากลุ่มไลน์ "Sookkaya Management" ทุก 22:00 น. แทน Google Apps Script ที่อ่าน Google Sheet

**Architecture:** Vercel Cron ยิง `/api/cron/daily-report` → route ดึงข้อมูลจาก view ด้วย service client → ส่งต่อให้ฟังก์ชันบริสุทธิ์ใน `src/lib/daily-report.ts` คำนวณ → `src/lib/daily-report-flex.ts` ประกอบเป็น Flex Message → `pushAssistantFlex()` ยิงเข้า LINE สูตรกับการประกอบการ์ดแยกออกจากการ query ทั้งหมด เพื่อให้เทสได้โดยไม่ต้องต่อฐานข้อมูลหรือยิงไลน์จริง

**Tech Stack:** Next.js 16 App Router (route handler), Supabase JS (service role), vitest, LINE Messaging API push endpoint

**Spec:** `docs/superpowers/specs/2026-08-05-line-daily-report-design.md`

## Global Constraints

- โปรเจกต์นี้เป็น Next.js เวอร์ชันที่ API ต่างจากที่โมเดลเคยเห็น — อ่าน `node_modules/next/dist/docs/` ก่อนเขียนโค้ดที่แตะ route handler / config
- ห้ามใส่ `"use client"` ในไฟล์ใต้ `src/lib/` และห้าม export util จากไฟล์ที่เป็น client component
- ไฟล์ใต้ `src/lib/` ที่แตะ env หรือ network ต้องมี `import "server-only"` บรรทัดแรก
- วันที่ทุกจุดเป็นสตริง `YYYY-MM-DD` และต้องคิดจากเวลาไทยผ่าน `todayInShopTz()` เท่านั้น (Vercel รันที่ UTC)
- ห้าม log ค่า `LINE_ASSISTANT_CHANNEL_TOKEN`, group id, หรือ service role key
- ค่ามือต้องอ่านจาก `v_commission_daily.commission` เท่านั้น ห้าม `sum(sales.commission)` เอง จะขาดประกันมือ 500/วัน และค่ารีเควส 40
- ตัวเลขเงินในการ์ดปัดเป็นจำนวนเต็มเสมอ: `formatBaht(Math.round(n))`
- ด่านก่อน commit ทุกครั้ง: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"` แล้ว `npx tsc --noEmit && npx eslint src/ && npx vitest run`
  (ถ้า tsc ฟ้อง LayoutRoutes/validator ให้ `rm -rf .next` ก่อน) — eslint มี warning เดิม 2 ตัวใน `payments.test.ts` ปล่อยไว้ ห้ามแก้
- ทำงานบน branch `feat/line-daily-report` (มี commit spec อยู่แล้ว) ห้าม deploy จนกว่าจะถึง Task 4

---

## โครงไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/daily-report.ts` | **สร้างใหม่** · สูตรล้วน แปลงข้อมูลดิบเป็น `DailyReport` ไม่แตะฐานข้อมูล ไม่แตะ env |
| `src/lib/daily-report.test.ts` | **สร้างใหม่** · เทสสูตร |
| `src/lib/daily-report-flex.ts` | **สร้างใหม่** · แปลง `DailyReport` เป็น Flex Message ตามโครงการ์ดเดิม |
| `src/lib/daily-report-flex.test.ts` | **สร้างใหม่** · เทสโครงการ์ด |
| `src/lib/date-range.ts` | **แก้** · export `addDays` ที่มีอยู่แล้วเป็น private |
| `src/lib/line-assistant.ts` | **แก้** · เพิ่ม `pushAssistantFlex()` |
| `src/app/api/cron/daily-report/route.ts` | **สร้างใหม่** · ตรวจ CRON_SECRET → query → ประกอบ → ส่ง |
| `vercel.json` | **แก้** · เพิ่ม cron `0 15 * * *` |
| `.env.example` | **แก้** · เพิ่มตัวแปรที่ยังไม่ได้ document |

---

### Task 1: สูตรรายงาน (`src/lib/daily-report.ts`)

**Files:**
- Create: `src/lib/daily-report.ts`
- Test: `src/lib/daily-report.test.ts`
- Modify: `src/lib/date-range.ts:25` (เปลี่ยน `function addDays` เป็น `export function addDays`)

**Interfaces:**
- Consumes: `addMonths(isoDate, months)` จาก `@/lib/datetime` (บวกเดือนแบบไม่ให้วันล้นเดือน — 31 ม.ค. −1 เดือน = 31 ธ.ค., 31 มี.ค. −1 เดือน = 28/29 ก.พ.) · `addDays(iso, days)` จาก `@/lib/date-range`
- Produces:
  ```ts
  export type DailySummaryRow = { sale_date: string; sessions: number; net_revenue: number; cash_in: number }
  export type TopTherapist = { name: string; income: number; sessions: number }
  export type DailyReportInput = {
    today: string
    daily: DailySummaryRow[]
    commission: number
    customers: number
    topTherapist: TopTherapist | null
    bookingsTomorrow: number
    memberCreditEmpty: number
    memberCreditLow: number
  }
  export type DailyReport = {
    date: string
    empty: boolean
    netRevenue: number
    cashIn: number
    commission: number
    grossProfit: number
    margin: number
    sessions: number
    customers: number
    vsAvg7dPct: number | null
    mtd: number
    mtdDeltaPct: number | null
    topTherapist: TopTherapist | null
    bookingsTomorrow: number
    alerts: string[]
  }
  export const PRIOR_DAYS = 7
  export const MIN_PRIOR_DAYS = 3
  export const LOW_SESSION_RATIO = 0.7
  export const CREDIT_LOW_BAHT = 1500
  export const MAX_ALERTS = 3
  export function buildDailyReport(input: DailyReportInput): DailyReport
  ```

- [x] **Step 1: เปิด addDays ให้ใช้ข้ามไฟล์**

แก้ `src/lib/date-range.ts` บรรทัด 25 จาก
```ts
function addDays(iso: string, days: number): string {
```
เป็น
```ts
export function addDays(iso: string, days: number): string {
```
ห้ามเขียน addDays ตัวใหม่ใน `daily-report.ts` — โปรเจกต์นี้ถือกติกาว่าสูตรวันที่/เงินอยู่ที่เดียว

- [x] **Step 2: เขียนเทสที่ยังไม่ผ่าน**

สร้าง `src/lib/daily-report.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  CREDIT_LOW_BAHT,
  MAX_ALERTS,
  buildDailyReport,
  type DailyReportInput,
  type DailySummaryRow,
} from "./daily-report"

/** ตัวเลขจริงวันที่ 4 ส.ค. 2569 ที่สืบไว้ตอนทำ spec — ใช้เป็นหมุดกันสูตรเพี้ยน */
const row = (sale_date: string, sessions: number, net_revenue: number, cash_in = 0): DailySummaryRow => ({
  sale_date, sessions, net_revenue, cash_in,
})

const base: DailyReportInput = {
  today: "2026-08-04",
  daily: [row("2026-08-04", 16, 11673.67, 19107)],
  commission: 4680,
  customers: 14,
  topTherapist: null,
  bookingsTomorrow: 0,
  memberCreditEmpty: 0,
  memberCreditLow: 0,
}

describe("buildDailyReport — ตัวเลขหลัก", () => {
  it("กำไรขั้นต้น = ยอดสุทธิ − ค่ามือ และ margin คิดจากยอดสุทธิ", () => {
    const r = buildDailyReport(base)
    expect(r.netRevenue).toBe(11673.67)
    expect(r.commission).toBe(4680)
    expect(r.grossProfit).toBeCloseTo(6993.67, 2)
    expect(r.margin).toBeCloseTo(59.91, 2)
  })

  it("ยอดสุทธิเป็น 0 ไม่ทำให้ margin หารด้วยศูนย์", () => {
    const r = buildDailyReport({
      ...base,
      daily: [row("2026-08-04", 1, 0, 0)],
      commission: 500,
    })
    expect(r.margin).toBe(0)
  })

  it("ส่งค่าอื่นผ่านตรงๆ ไม่แปลง", () => {
    const r = buildDailyReport({ ...base, customers: 14, bookingsTomorrow: 5 })
    expect(r.date).toBe("2026-08-04")
    expect(r.cashIn).toBe(19107)
    expect(r.sessions).toBe(16)
    expect(r.customers).toBe(14)
    expect(r.bookingsTomorrow).toBe(5)
  })
})

describe("buildDailyReport — โหมดไม่มีบิล", () => {
  it("ไม่มีแถวของวันนี้เลย = empty และเลขเป็น 0 ทั้งหมด", () => {
    const r = buildDailyReport({ ...base, daily: [], commission: 0, customers: 0 })
    expect(r.empty).toBe(true)
    expect(r.netRevenue).toBe(0)
    expect(r.sessions).toBe(0)
  })

  // วันที่มีแต่คนมาเติมเครดิต ไม่มีคนนวด — v_daily_summary มีแถวแต่ sessions = 0
  it("มีแถวแต่ sessions เป็น 0 ก็ถือว่า empty", () => {
    const r = buildDailyReport({
      ...base,
      daily: [row("2026-08-04", 0, 0, 3000)],
      commission: 0,
      customers: 0,
    })
    expect(r.empty).toBe(true)
  })

  it("มีบิลอย่างน้อยหนึ่งใบ = ไม่ empty", () => {
    expect(buildDailyReport(base).empty).toBe(false)
  })
})

describe("buildDailyReport — เทียบค่าเฉลี่ย 7 วัน", () => {
  const prior = (days: [string, number, number][]): DailySummaryRow[] =>
    days.map(([d, s, n]) => row(d, s, n))

  it("มีข้อมูลครบ 3 วันขึ้นไปถึงคำนวณ", () => {
    const r = buildDailyReport({
      ...base,
      daily: [
        ...prior([["2026-08-01", 10, 10000], ["2026-08-02", 10, 10000], ["2026-08-03", 10, 10000]]),
        row("2026-08-04", 16, 12000),
      ],
    })
    // เฉลี่ย 10,000 · วันนี้ 12,000 → +20%
    expect(r.vsAvg7dPct).toBeCloseTo(20, 5)
  })

  it("มีข้อมูลย้อนหลังแค่ 2 วัน = ไม่คำนวณ", () => {
    const r = buildDailyReport({
      ...base,
      daily: [
        ...prior([["2026-08-02", 10, 10000], ["2026-08-03", 10, 10000]]),
        row("2026-08-04", 16, 12000),
      ],
    })
    expect(r.vsAvg7dPct).toBeNull()
  })

  // v_daily_summary ไม่มีแถวของวันที่ร้านปิด ถ้าหารด้วย 7 ตายตัว ค่าเฉลี่ยจะต่ำเกินจริง
  it("หารด้วยจำนวนวันที่มีข้อมูลจริง ไม่ใช่ 7 ตายตัว", () => {
    const r = buildDailyReport({
      ...base,
      daily: [
        ...prior([["2026-08-01", 10, 9000], ["2026-08-02", 10, 10000], ["2026-08-03", 10, 11000]]),
        row("2026-08-04", 16, 10000),
      ],
    })
    // เฉลี่ยจาก 3 วัน = 10,000 (ถ้าหารด้วย 7 จะได้ 4,285.7 แล้ว % จะพุ่งผิด)
    expect(r.vsAvg7dPct).toBeCloseTo(0, 5)
  })

  it("วันที่ปิดร้าน (sessions 0) ไม่ถูกนับเป็นฐานเฉลี่ย", () => {
    const r = buildDailyReport({
      ...base,
      daily: [
        ...prior([["2026-08-01", 10, 10000], ["2026-08-02", 0, 0], ["2026-08-03", 10, 10000]]),
        row("2026-08-04", 16, 10000),
      ],
    })
    expect(r.vsAvg7dPct).toBeNull() // เหลือ 2 วัน ไม่ถึงขั้นต่ำ
  })

  it("ไม่นับวันเกิน 7 วันย้อนหลัง และไม่นับวันนี้เข้าฐานเฉลี่ย", () => {
    const r = buildDailyReport({
      ...base,
      daily: [
        row("2026-07-20", 10, 999999), // เกิน 7 วัน ต้องไม่ถูกนับ
        ...prior([["2026-07-29", 10, 10000], ["2026-07-30", 10, 10000], ["2026-08-03", 10, 10000]]),
        row("2026-08-04", 16, 10000),
      ],
    })
    expect(r.vsAvg7dPct).toBeCloseTo(0, 5)
  })
})

describe("buildDailyReport — ยอดสะสมเดือนนี้ (MTD)", () => {
  it("รวมตั้งแต่วันที่ 1 ถึงวันนี้ และเทียบเดือนที่แล้วช่วงวันเท่ากัน", () => {
    const r = buildDailyReport({
      ...base,
      today: "2026-08-03",
      daily: [
        row("2026-07-01", 10, 1000), row("2026-07-02", 10, 1000), row("2026-07-03", 10, 1000),
        row("2026-07-31", 10, 50000), // เกินวันที่ 3 ของเดือนที่แล้ว ต้องไม่ถูกนับ
        row("2026-08-01", 10, 1200), row("2026-08-02", 10, 1200), row("2026-08-03", 10, 1200),
      ],
    })
    expect(r.mtd).toBeCloseTo(3600, 2)
    expect(r.mtdDeltaPct).toBeCloseTo(20, 5) // 3600 vs 3000
  })

  it("เดือนที่แล้วไม่มียอดเลย = ไม่แสดง %", () => {
    const r = buildDailyReport({
      ...base,
      today: "2026-08-03",
      daily: [row("2026-08-01", 10, 1200)],
    })
    expect(r.mtd).toBeCloseTo(1200, 2)
    expect(r.mtdDeltaPct).toBeNull()
  })

  // 31 มี.ค. ย้อนไป ก.พ. ไม่มีวันที่ 31 — addMonths ต้องหดให้เป็นวันสุดท้ายของเดือน
  it("วันที่ไม่มีในเดือนที่แล้ว ใช้วันสุดท้ายของเดือนนั้น", () => {
    const r = buildDailyReport({
      ...base,
      today: "2026-03-31",
      daily: [
        row("2026-02-01", 10, 500), row("2026-02-28", 10, 500),
        row("2026-03-31", 10, 2000),
      ],
    })
    expect(r.mtd).toBeCloseTo(2000, 2)
    expect(r.mtdDeltaPct).toBeCloseTo(100, 5) // 2000 vs 1000
  })
})

describe("buildDailyReport — Action alerts", () => {
  it("เครดิตหมดและใกล้หมด ขึ้นเตือนพร้อมจำนวนคน", () => {
    const r = buildDailyReport({ ...base, memberCreditEmpty: 2, memberCreditLow: 18 })
    expect(r.alerts[0]).toContain("2 คน เครดิตหมด")
    expect(r.alerts[1]).toContain("18 คน เครดิตใกล้หมด")
    expect(r.alerts[1]).toContain(String(CREDIT_LOW_BAHT))
  })

  it("ไม่มีสมาชิกเข้าเงื่อนไข = ไม่มีเตือนเรื่องเครดิต", () => {
    expect(buildDailyReport(base).alerts).toEqual([])
  })

  it("เซสชันต่ำกว่าค่าเฉลี่ย 7 วันเกิน 30% ขึ้นเตือน", () => {
    const r = buildDailyReport({
      ...base,
      daily: [
        row("2026-08-01", 20, 10000), row("2026-08-02", 20, 10000), row("2026-08-03", 20, 10000),
        row("2026-08-04", 10, 6000),
      ],
    })
    // เฉลี่ย 20 · วันนี้ 10 = 50% ของค่าเฉลี่ย ต่ำกว่าเกณฑ์ 0.7
    expect(r.alerts.some((a) => a.includes("Sessions ต่ำกว่าค่าเฉลี่ย"))).toBe(true)
    expect(r.alerts.some((a) => a.includes("50%"))).toBe(true)
  })

  it("ข้อมูลย้อนหลังไม่ถึงขั้นต่ำ ไม่ตัดสินเรื่องเซสชัน", () => {
    const r = buildDailyReport({
      ...base,
      daily: [row("2026-08-03", 20, 10000), row("2026-08-04", 1, 500)],
    })
    expect(r.alerts.some((a) => a.includes("Sessions ต่ำกว่า"))).toBe(false)
  })

  it("กำไรขั้นต้นติดลบขึ้นเตือน", () => {
    const r = buildDailyReport({ ...base, commission: 20000 })
    expect(r.alerts.some((a) => a.includes("กำไรขั้นต้นติดลบ"))).toBe(true)
  })

  it("เข้าเงื่อนไขครบทุกข้อ ตัดเหลือ 3 ข้อแรก", () => {
    const r = buildDailyReport({
      ...base,
      commission: 99999,
      memberCreditEmpty: 2,
      memberCreditLow: 18,
      daily: [
        row("2026-08-01", 20, 10000), row("2026-08-02", 20, 10000), row("2026-08-03", 20, 10000),
        row("2026-08-04", 5, 6000),
      ],
    })
    expect(r.alerts).toHaveLength(MAX_ALERTS)
    expect(r.alerts[0]).toContain("เครดิตหมด")
    expect(r.alerts[2]).toContain("Sessions ต่ำกว่า")
  })

  it("วันที่ไม่มีบิลเลย ไม่ต้องเตือนกำไรติดลบ", () => {
    const r = buildDailyReport({ ...base, daily: [], commission: 0, customers: 0 })
    expect(r.alerts.some((a) => a.includes("กำไรขั้นต้นติดลบ"))).toBe(false)
  })
})
```

- [x] **Step 3: รันเทสให้เห็นว่าแดง**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx vitest run src/lib/daily-report.test.ts
```
คาดว่า FAIL — `Failed to resolve import "./daily-report"`

- [x] **Step 4: เขียนโค้ดให้ผ่าน**

สร้าง `src/lib/daily-report.ts`:

```ts
/** สูตรของการ์ดสรุปยอดขายรายวันที่ส่งเข้าไลน์ — ฟังก์ชันบริสุทธิ์ล้วน ไม่แตะฐานข้อมูล
 *  spec: docs/superpowers/specs/2026-08-05-line-daily-report-design.md */

import { addMonths } from "./datetime"
import { addDays } from "./date-range"

export type DailySummaryRow = {
  sale_date: string
  sessions: number
  net_revenue: number
  cash_in: number
}

export type TopTherapist = { name: string; income: number; sessions: number }

export type DailyReportInput = {
  /** วันที่รายงาน ตามเวลาไทย */
  today: string
  /** แถว v_daily_summary ตั้งแต่ต้นเดือนที่แล้วถึงวันนี้ (ลำดับไม่สำคัญ) */
  daily: DailySummaryRow[]
  /** v_commission_daily.commission ของวันนี้ — รวมประกันมือและค่ารีเควสแล้ว */
  commission: number
  customers: number
  topTherapist: TopTherapist | null
  bookingsTomorrow: number
  memberCreditEmpty: number
  memberCreditLow: number
}

export type DailyReport = {
  date: string
  /** ไม่มีบิลเลยในวันนี้ — การ์ดจะย่อเหลือแค่หัวกับปุ่ม ไม่โชว์เลข 0 ให้เข้าใจผิด */
  empty: boolean
  netRevenue: number
  cashIn: number
  commission: number
  grossProfit: number
  margin: number
  sessions: number
  customers: number
  vsAvg7dPct: number | null
  mtd: number
  mtdDeltaPct: number | null
  topTherapist: TopTherapist | null
  bookingsTomorrow: number
  alerts: string[]
}

/** จำนวนวันย้อนหลังที่ใช้หาค่าเฉลี่ย */
export const PRIOR_DAYS = 7
/** ต้องมีวันที่เปิดร้านอย่างน้อยเท่านี้ถึงจะเทียบค่าเฉลี่ย ไม่งั้นตัวเลข % หลอก */
export const MIN_PRIOR_DAYS = 3
/** เซสชันต่ำกว่าค่าเฉลี่ยคูณค่านี้ = ผิดปกติ */
export const LOW_SESSION_RATIO = 0.7
/** เครดิตเหลือไม่เกินนี้ = ใกล้หมด ต้องเตือนให้เชียร์เติม */
export const CREDIT_LOW_BAHT = 1500
/** เตือนเกินนี้คนจะเลิกอ่าน */
export const MAX_ALERTS = 3

function monthStart(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`
}

function sumNetRevenue(rows: DailySummaryRow[], from: string, to: string): number {
  return rows
    .filter((r) => r.sale_date >= from && r.sale_date <= to)
    .reduce((sum, r) => sum + r.net_revenue, 0)
}

export function buildDailyReport(input: DailyReportInput): DailyReport {
  const { today, daily, commission, customers } = input

  const todayRow = daily.find((r) => r.sale_date === today)
  const sessions = todayRow?.sessions ?? 0
  const netRevenue = todayRow?.net_revenue ?? 0
  const cashIn = todayRow?.cash_in ?? 0
  const empty = sessions === 0

  const grossProfit = netRevenue - commission
  const margin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0

  // ฐานเฉลี่ย: เฉพาะวันที่เปิดร้านใน 7 วันก่อนหน้า ไม่รวมวันนี้
  const prior = daily.filter(
    (r) =>
      r.sessions > 0 &&
      r.sale_date >= addDays(today, -PRIOR_DAYS) &&
      r.sale_date <= addDays(today, -1)
  )
  const hasBaseline = prior.length >= MIN_PRIOR_DAYS
  const avgNetRevenue = hasBaseline
    ? prior.reduce((s, r) => s + r.net_revenue, 0) / prior.length
    : 0
  const avgSessions = hasBaseline
    ? prior.reduce((s, r) => s + r.sessions, 0) / prior.length
    : 0
  const vsAvg7dPct =
    hasBaseline && avgNetRevenue > 0
      ? ((netRevenue - avgNetRevenue) / avgNetRevenue) * 100
      : null

  const mtd = sumNetRevenue(daily, monthStart(today), today)
  // addMonths หดวันที่ให้พอดีเดือน (31 มี.ค. → 28/29 ก.พ.) จึงเทียบ "ช่วงวันเท่ากัน" ได้เสมอ
  const prevSameDay = addMonths(today, -1)
  const mtdPrev = sumNetRevenue(daily, monthStart(prevSameDay), prevSameDay)
  const mtdDeltaPct = mtdPrev > 0 ? ((mtd - mtdPrev) / mtdPrev) * 100 : null

  const alerts: string[] = []
  if (input.memberCreditEmpty > 0) {
    alerts.push(`🔴 Member ${input.memberCreditEmpty} คน เครดิตหมด → เชียร์ขาย Top-up ใหม่`)
  }
  if (input.memberCreditLow > 0) {
    alerts.push(
      `🟠 Member ${input.memberCreditLow} คน เครดิตใกล้หมด (≤฿${CREDIT_LOW_BAHT.toLocaleString("th-TH")}) → เตือนเติมต่อ`
    )
  }
  if (hasBaseline && avgSessions > 0 && sessions < avgSessions * LOW_SESSION_RATIO) {
    const gap = Math.round((1 - sessions / avgSessions) * 100)
    alerts.push(`📉 Sessions ต่ำกว่าค่าเฉลี่ย 7 วัน ${gap}% → ส่งโปร LINE OA พรุ่งนี้`)
  }
  if (!empty && grossProfit < 0) {
    alerts.push(
      `⚠️ กำไรขั้นต้นติดลบ ฿${Math.round(Math.abs(grossProfit)).toLocaleString("th-TH")} → ตรวจค่ามือ/ส่วนลด`
    )
  }

  return {
    date: today,
    empty,
    netRevenue,
    cashIn,
    commission,
    grossProfit,
    margin,
    sessions,
    customers,
    vsAvg7dPct,
    mtd,
    mtdDeltaPct,
    topTherapist: input.topTherapist,
    bookingsTomorrow: input.bookingsTomorrow,
    alerts: alerts.slice(0, MAX_ALERTS),
  }
}
```

- [x] **Step 5: รันเทสให้ผ่าน**

```bash
npx vitest run src/lib/daily-report.test.ts
```
คาดว่า PASS ทุกข้อ

- [x] **Step 6: ด่านเต็ม แล้ว commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx tsc --noEmit && npx eslint src/ && npx vitest run
```
เทสรวมต้องผ่านทั้งหมด (ของเดิม 448 ข้อ + ของใหม่)

```bash
git add src/lib/daily-report.ts src/lib/daily-report.test.ts src/lib/date-range.ts
git commit -m "feat(daily-report): สูตรการ์ดสรุปยอดขายรายวัน"
```

---

### Task 2: ประกอบการ์ด Flex (`src/lib/daily-report-flex.ts`)

**Files:**
- Create: `src/lib/daily-report-flex.ts`
- Test: `src/lib/daily-report-flex.test.ts`

**Interfaces:**
- Consumes: `DailyReport` จาก `@/lib/daily-report` (ฟิลด์ตามที่ Task 1 กำหนด) · `formatBaht(amount)` จาก `@/lib/constants` · `formatThaiDate(isoDate)` จาก `@/lib/datetime`
- Produces:
  ```ts
  export const DASHBOARD_URL = "https://sookkaya-pos.vercel.app/today"
  export function dailyReportFlex(report: DailyReport): { type: "flex"; altText: string; contents: unknown }
  ```

**บริบทที่ต้องรู้:** โครงการ์ดนี้ลอกมาจาก `LineDailyReport_v9_FLEX.gs` ตัวเดิมทีละบรรทัด สี ขนาดฟอนต์ ระยะห่างต้องเหมือนเป๊ะ เพราะเจ้าของร้านอ่านการ์ดนี้ทุกวันมาหลายเดือนแล้ว ที่เปลี่ยนมี 3 อย่างเท่านั้น: ป้าย `✨ กำไรสุทธิ` → `✨ กำไรขั้นต้น`, ปุ่มชี้ไป `/today` ของ POS, และเพิ่มแถว MTD กับคิวจองพรุ่งนี้

- [x] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

สร้าง `src/lib/daily-report-flex.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { DASHBOARD_URL, dailyReportFlex } from "./daily-report-flex"
import type { DailyReport } from "./daily-report"

const report: DailyReport = {
  date: "2026-08-04",
  empty: false,
  netRevenue: 11673.67,
  cashIn: 19107,
  commission: 4680,
  grossProfit: 6993.67,
  margin: 59.91,
  sessions: 16,
  customers: 14,
  vsAvg7dPct: -9.0,
  mtd: 52272.68,
  mtdDeltaPct: 8.2,
  topTherapist: { name: "โจโจ้", income: 1160, sessions: 3 },
  bookingsTomorrow: 5,
  alerts: ["🔴 Member 2 คน เครดิตหมด → เชียร์ขาย Top-up ใหม่"],
}

/** เก็บ text ทุกตัวในต้นไม้ ทำให้เทสไม่ผูกกับตำแหน่ง node ที่อาจขยับ */
function allText(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(allText)
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>
    const self = typeof o.text === "string" ? [o.text] : []
    return [...self, ...Object.values(o).flatMap(allText)]
  }
  return []
}

function find(node: unknown, pred: (o: Record<string, unknown>) => boolean): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const n of node) { const hit = find(n, pred); if (hit) return hit }
    return null
  }
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>
    if (pred(o)) return o
    for (const v of Object.values(o)) { const hit = find(v, pred); if (hit) return hit }
  }
  return null
}

describe("dailyReportFlex — โครงการ์ด", () => {
  const msg = dailyReportFlex(report)
  const bubble = msg.contents as Record<string, unknown>

  it("เป็น flex bubble ขนาด mega มีครบ header body footer", () => {
    expect(msg.type).toBe("flex")
    expect(bubble.type).toBe("bubble")
    expect(bubble.size).toBe("mega")
    expect(bubble.header).toBeDefined()
    expect(bubble.body).toBeDefined()
    expect(bubble.footer).toBeDefined()
  })

  it("altText มีวันที่แบบไทยและยอดสุทธิ ให้เห็นในหน้ารายการแชท", () => {
    expect(msg.altText).toContain("4 ส.ค. 2569")
    expect(msg.altText).toContain("11,674")
  })

  it("หัวการ์ดเป็นเขียวแบรนด์ พร้อมวันที่เต็ม", () => {
    const header = bubble.header as Record<string, unknown>
    expect(header.backgroundColor).toBe("#2A4A3A")
    expect(allText(header)).toContain("🌿 SOOKKAYA")
    expect(allText(header)).toContain("Daily Report")
    expect(allText(header).some((t) => t.includes("4 ส.ค. 2569"))).toBe(true)
  })
})

describe("dailyReportFlex — ตัวเลขบนการ์ด", () => {
  const texts = allText(dailyReportFlex(report).contents)

  it("ยอดสุทธิปัดเป็นจำนวนเต็ม ไม่มีทศนิยม", () => {
    expect(texts).toContain("฿11,674")
    expect(texts.some((t) => t.includes("11,673.67"))).toBe(false)
  })

  it("โชว์ครบทั้ง Cash In กำไรขั้นต้น Margin", () => {
    expect(texts).toContain("💵 Cash In")
    expect(texts).toContain("✨ กำไรขั้นต้น")
    expect(texts).toContain("📊 Margin")
    expect(texts).toContain("฿19,107")
    expect(texts).toContain("฿6,994")
    expect(texts).toContain("59.9%")
  })

  it("แถวปฏิบัติการครบ 5 แถว รวม MTD และคิวพรุ่งนี้", () => {
    expect(texts).toContain("👥 Sessions")
    expect(texts).toContain("16 sessions · 14 ลูกค้า")
    expect(texts).toContain("💼 ค่ามือรวม")
    expect(texts).toContain("฿4,680")
    expect(texts).toContain("🏆 TOP หมอ")
    expect(texts).toContain("โจโจ้ · ฿1,160 (3 sess)")
    expect(texts).toContain("📅 MTD")
    expect(texts.some((t) => t.includes("฿52,273") && t.includes("8.2%"))).toBe(true)
    expect(texts).toContain("🗓 คิวจองพรุ่งนี้")
    expect(texts).toContain("5 คิว")
  })

  it("ยอดตกใช้ลูกศรลงสีแดง ยอดขึ้นใช้ลูกศรขึ้นสีเขียว", () => {
    const down = find(dailyReportFlex(report).contents, (o) =>
      typeof o.text === "string" && o.text.includes("vs avg 7d")
    )
    expect(down?.text).toBe("▼ 9.0% vs avg 7d")
    expect(down?.color).toBe("#C0392B")

    const up = find(dailyReportFlex({ ...report, vsAvg7dPct: 12.34 }).contents, (o) =>
      typeof o.text === "string" && o.text.includes("vs avg 7d")
    )
    expect(up?.text).toBe("▲ 12.3% vs avg 7d")
    expect(up?.color).toBe("#5F8A4F")
  })

  it("กำไรติดลบเปลี่ยนเป็นสีแดง", () => {
    const loss = find(dailyReportFlex({ ...report, grossProfit: -500, margin: -4.3 }).contents,
      (o) => o.text === "฿-500")
    expect(loss?.color).toBe("#C0392B")
  })
})

describe("dailyReportFlex — ส่วนที่ซ่อนได้", () => {
  it("ไม่มีหมอทำงาน ซ่อนแถว TOP หมอ", () => {
    const texts = allText(dailyReportFlex({ ...report, topTherapist: null }).contents)
    expect(texts).not.toContain("🏆 TOP หมอ")
  })

  it("เดือนที่แล้วไม่มียอด แสดง MTD เปล่าๆ ไม่มี %", () => {
    const texts = allText(dailyReportFlex({ ...report, mtdDeltaPct: null }).contents)
    expect(texts).toContain("฿52,273")
    expect(texts.some((t) => t.includes("vs เดือนที่แล้ว"))).toBe(false)
  })

  it("ไม่มีข้อมูลย้อนหลังพอ ซ่อนบรรทัดเทียบค่าเฉลี่ย", () => {
    const texts = allText(dailyReportFlex({ ...report, vsAvg7dPct: null }).contents)
    expect(texts.some((t) => t.includes("vs avg 7d"))).toBe(false)
  })

  it("ไม่มี alert ซ่อนหัวข้อ Action ทั้งบล็อก", () => {
    const texts = allText(dailyReportFlex({ ...report, alerts: [] }).contents)
    expect(texts.some((t) => t.includes("Action ที่ต้องทำวันนี้"))).toBe(false)
  })
})

describe("dailyReportFlex — วันที่ไม่มีบิล", () => {
  const texts = allText(
    dailyReportFlex({
      ...report, empty: true, netRevenue: 0, cashIn: 0, commission: 0,
      grossProfit: 0, margin: 0, sessions: 0, customers: 0,
      vsAvg7dPct: null, topTherapist: null, alerts: [],
    }).contents
  )

  it("บอกตรงๆ ว่ายังไม่มีบิล ไม่โชว์เลข 0 ให้เข้าใจผิดว่าขายไม่ได้", () => {
    expect(texts.some((t) => t.includes("ยังไม่มีบิลในระบบ"))).toBe(true)
    expect(texts).not.toContain("NET REVENUE · วันนี้")
    expect(texts).not.toContain("💵 Cash In")
  })

  it("ยังมีหัวการ์ดและปุ่มเหมือนเดิม", () => {
    expect(texts).toContain("🌿 SOOKKAYA")
  })
})

describe("dailyReportFlex — ปุ่ม", () => {
  it("ปุ่มพาไปหน้ายอดขายวันนี้ของ POS ไม่ใช่ dashboard เก่าบน GitHub Pages", () => {
    const btn = find(dailyReportFlex(report).contents, (o) => o.type === "button")
    const action = btn?.action as Record<string, unknown>
    expect(action.uri).toBe(DASHBOARD_URL)
    expect(DASHBOARD_URL).toBe("https://sookkaya-pos.vercel.app/today")
    expect(action.label).toBe("📊 ดูยอดขายวันนี้")
  })
})
```

- [x] **Step 2: รันเทสให้เห็นว่าแดง**

```bash
npx vitest run src/lib/daily-report-flex.test.ts
```
คาดว่า FAIL — `Failed to resolve import "./daily-report-flex"`

- [x] **Step 3: เขียนโค้ดให้ผ่าน**

สร้าง `src/lib/daily-report-flex.ts`:

```ts
/** ประกอบการ์ด Flex ของรายงานรายวัน — ลอกโครงจาก LineDailyReport_v9_FLEX.gs ตัวเดิม
 *  เจ้าของร้านอ่านการ์ดนี้ทุกวันมาหลายเดือน สี/ขนาด/ลำดับจึงต้องคงเดิม
 *  spec: docs/superpowers/specs/2026-08-05-line-daily-report-design.md */

import type { DailyReport } from "./daily-report"
import { formatBaht } from "./constants"
import { formatThaiDate } from "./datetime"

const BRAND = {
  green: "#2A4A3A",
  gold: "#C9A96E",
  beige: "#F4ECDE",
  beigeDk: "#E5E0D5",
  text: "#2A1F1D",
  textSub: "#786A5E",
  textMuted: "#9C8E80",
  positive: "#5F8A4F",
  negative: "#C0392B",
} as const

export const DASHBOARD_URL = "https://sookkaya-pos.vercel.app/today"

const THAI_WEEKDAYS = [
  "วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ",
  "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์",
]

/** "วันอังคารที่ 4 ส.ค. 2569" */
function fullThaiDate(isoDate: string): string {
  const weekday = THAI_WEEKDAYS[new Date(`${isoDate}T00:00:00Z`).getUTCDay()]
  return `${weekday}ที่ ${formatThaiDate(isoDate)}`
}

/** การ์ดนี้ไม่โชว์สตางค์ — ปัดก่อนเสมอ ไม่งั้น formatBaht จะโผล่ทศนิยมสองตำแหน่ง */
function baht(n: number): string {
  return `฿${formatBaht(Math.round(n))}`
}

function statCol(label: string, value: string, valueColor: string) {
  return {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    contents: [
      { type: "text", text: label, color: BRAND.textMuted, size: "xxs", weight: "bold" },
      { type: "text", text: value, color: valueColor, size: "sm", weight: "bold" },
    ],
  }
}

function opRow(label: string, value: string, valueColor: string) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: label, color: BRAND.textSub, size: "xs", flex: 4 },
      {
        type: "text", text: value, color: valueColor, size: "xs",
        flex: 6, align: "end", weight: "bold", wrap: true,
      },
    ],
  }
}

function separator() {
  return { type: "separator", margin: "lg", color: BRAND.beigeDk }
}

function header(report: DailyReport) {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: BRAND.green,
    paddingAll: "18px",
    spacing: "xs",
    contents: [
      { type: "text", text: "🌿 SOOKKAYA", color: BRAND.beige, weight: "bold", size: "lg", letterSpacing: "0.1em" },
      { type: "text", text: "Daily Report", color: BRAND.gold, size: "xs", letterSpacing: "0.2em" },
      { type: "text", text: fullThaiDate(report.date), color: BRAND.beige, size: "sm", margin: "sm" },
    ],
  }
}

function footer() {
  return {
    type: "box",
    layout: "vertical",
    paddingAll: "14px",
    paddingTop: "0px",
    contents: [
      {
        type: "button",
        style: "primary",
        color: BRAND.green,
        height: "md",
        action: { type: "uri", label: "📊 ดูยอดขายวันนี้", uri: DASHBOARD_URL },
      },
      {
        type: "text",
        text: "รายละเอียดหมอแต่ละคน · สมาชิก · Top บริการ · MTD",
        color: BRAND.textMuted, size: "xxs", align: "center", margin: "sm", wrap: true,
      },
    ],
  }
}

function body(report: DailyReport) {
  if (report.empty) {
    return {
      type: "box",
      layout: "vertical",
      paddingAll: "18px",
      contents: [
        {
          type: "text",
          text: "วันนี้ยังไม่มีบิลในระบบ",
          color: BRAND.textSub, size: "sm", wrap: true,
        },
      ],
    }
  }

  const heroRow: Record<string, unknown>[] = [
    { type: "text", text: "NET REVENUE · วันนี้", color: BRAND.textMuted, size: "xxs", weight: "bold" },
  ]
  if (report.vsAvg7dPct !== null) {
    const up = report.vsAvg7dPct >= 0
    heroRow.push({
      type: "text",
      text: `${up ? "▲" : "▼"} ${Math.abs(report.vsAvg7dPct).toFixed(1)}% vs avg 7d`,
      color: up ? BRAND.positive : BRAND.negative,
      size: "xxs", weight: "bold", align: "end",
    })
  }

  const opsRows: Record<string, unknown>[] = [
    opRow("👥 Sessions", `${report.sessions} sessions · ${report.customers} ลูกค้า`, BRAND.text),
    opRow("💼 ค่ามือรวม", baht(report.commission), BRAND.gold),
  ]
  if (report.topTherapist) {
    const t = report.topTherapist
    opsRows.push(opRow("🏆 TOP หมอ", `${t.name} · ${baht(t.income)} (${t.sessions} sess)`, BRAND.text))
  }
  opsRows.push(
    opRow(
      "📅 MTD",
      report.mtdDeltaPct === null
        ? baht(report.mtd)
        : `${baht(report.mtd)} · ${report.mtdDeltaPct >= 0 ? "▲" : "▼"}${Math.abs(report.mtdDeltaPct).toFixed(1)}% vs เดือนที่แล้ว`,
      BRAND.text
    )
  )
  opsRows.push(opRow("🗓 คิวจองพรุ่งนี้", `${report.bookingsTomorrow} คิว`, BRAND.text))

  const contents: Record<string, unknown>[] = [
    {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "box", layout: "horizontal", contents: heroRow },
        { type: "text", text: baht(report.netRevenue), color: BRAND.text, size: "xxl", weight: "bold", margin: "xs" },
      ],
    },
    separator(),
    {
      type: "box",
      layout: "horizontal",
      spacing: "md",
      margin: "md",
      contents: [
        statCol("💵 Cash In", baht(report.cashIn), BRAND.text),
        statCol("✨ กำไรขั้นต้น", baht(report.grossProfit), report.grossProfit >= 0 ? BRAND.positive : BRAND.negative),
        statCol("📊 Margin", `${report.margin.toFixed(1)}%`, BRAND.text),
      ],
    },
    separator(),
    { type: "box", layout: "vertical", spacing: "sm", margin: "md", contents: opsRows },
  ]

  if (report.alerts.length > 0) {
    contents.push(separator())
    contents.push({
      type: "text", text: "⚠️ Action ที่ต้องทำวันนี้",
      color: BRAND.negative, size: "sm", weight: "bold", margin: "md",
    })
    for (const alert of report.alerts) {
      contents.push({
        type: "text", text: `• ${alert}`,
        color: BRAND.text, size: "xs", wrap: true, margin: "sm",
      })
    }
  }

  return { type: "box", layout: "vertical", paddingAll: "18px", spacing: "none", contents }
}

export function dailyReportFlex(report: DailyReport): {
  type: "flex"
  altText: string
  contents: unknown
} {
  return {
    type: "flex",
    altText: `🌿 Sookkaya — ${formatThaiDate(report.date)} · Net Revenue ${baht(report.netRevenue)}`,
    contents: {
      type: "bubble",
      size: "mega",
      styles: { body: { backgroundColor: "#FFFFFF" }, footer: { backgroundColor: "#FFFFFF" } },
      header: header(report),
      body: body(report),
      footer: footer(),
    },
  }
}
```

- [x] **Step 4: รันเทสให้ผ่าน**

```bash
npx vitest run src/lib/daily-report-flex.test.ts
```
คาดว่า PASS ทุกข้อ

- [x] **Step 5: ด่านเต็ม แล้ว commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx tsc --noEmit && npx eslint src/ && npx vitest run
```

```bash
git add src/lib/daily-report-flex.ts src/lib/daily-report-flex.test.ts
git commit -m "feat(daily-report): ประกอบการ์ด Flex ตามโครงเดิม"
```

---

### Task 3: ต่อท่อจริง — route + ส่งไลน์ + cron

**Files:**
- Create: `src/app/api/cron/daily-report/route.ts`
- Modify: `src/lib/line-assistant.ts` (เพิ่มฟังก์ชันท้ายไฟล์)
- Modify: `vercel.json`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `buildDailyReport(input)` + type `DailyReportInput`, `DailySummaryRow`, `TopTherapist` จาก `@/lib/daily-report` · `dailyReportFlex(report)` จาก `@/lib/daily-report-flex` · `createServiceClient()` จาก `@/lib/supabase/service` · `todayInShopTz()` จาก `@/lib/datetime` · `addDays(iso, days)` จาก `@/lib/date-range` (Task 1 เปิด export ให้แล้ว) · `addMonths(iso, months)` จาก `@/lib/datetime`
- Produces: endpoint `GET /api/cron/daily-report`

**บริบทที่ต้องรู้:**
- `/api/cron` อยู่ใน `PUBLIC_ROUTES` ของ `src/lib/supabase/proxy.ts` แล้ว **ไม่ต้องแก้** แต่แปลว่า route นี้เปิดโล่ง ต้องตรวจ `CRON_SECRET` เองในตัว route
- `expenses` และ `member_balances` ถูก RLS คุม cron ไม่มี session จึงต้องใช้ `createServiceClient()`
- `member_balances` มีมากกว่า 1,000 แถว เกินเพดาน supabase-js — **ห้ามดึงแถวมานับเอง** ต้องใช้ `{ count: "exact", head: true }`
- `v_therapist_daily` เป็น view ไม่มี FK ให้ embed ชื่อหมอ ต้อง query `therapists` แยกอีกรอบ

- [x] **Step 1: เพิ่มฟังก์ชันส่ง Flex**

แก้ `src/lib/line-assistant.ts` เพิ่มท้ายไฟล์ (คงฟังก์ชัน `pushAssistantMessage` เดิมไว้ ห้ามแก้):

```ts
/** push การ์ด Flex ผ่าน OA ผู้ช่วยตัวเดียวกับ pushAssistantMessage
 *  คืน false เงียบๆ เมื่อ env ยังไม่ตั้งหรือส่งไม่สำเร็จ — cron ต้องไม่ล้มทั้ง request
 *  log เฉพาะ status กับ body ของ LINE ห้าม log token */
export async function pushAssistantFlex(
  to: string,
  message: { type: "flex"; altText: string; contents: unknown }
): Promise<boolean> {
  const token = process.env.LINE_ASSISTANT_CHANNEL_TOKEN
  if (!token || !to) return false
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to, messages: [message] }),
    })
    if (!res.ok) {
      console.error("LINE push flex failed", res.status, await res.text())
    }
    return res.ok
  } catch (e) {
    console.error("LINE push flex threw", e)
    return false
  }
}
```

- [x] **Step 2: เขียน route**

สร้าง `src/app/api/cron/daily-report/route.ts`:

```ts
import { NextResponse } from "next/server"

import { createServiceClient } from "@/lib/supabase/service"
import { pushAssistantFlex } from "@/lib/line-assistant"
import { buildDailyReport, CREDIT_LOW_BAHT, PRIOR_DAYS } from "@/lib/daily-report"
import type { DailySummaryRow, TopTherapist } from "@/lib/daily-report"
import { dailyReportFlex } from "@/lib/daily-report-flex"
import { addMonths, todayInShopTz } from "@/lib/datetime"
import { addDays } from "@/lib/date-range"

/** Vercel Cron ยิงทุกคืน 22:00 ไทย (ดู vercel.json) — สรุปยอดขายวันนี้เป็นการ์ด Flex
 *  เข้ากลุ่ม Sookkaya Management ผ่าน OA ผู้ช่วย แทน Google Apps Script ตัวเดิม
 *  spec: docs/superpowers/specs/2026-08-05-line-daily-report-design.md */
export async function GET(request: Request) {
  // route นี้อยู่ใต้ /api/cron ซึ่ง PUBLIC_ROUTES ปล่อยผ่าน จึงต้องกันคนนอกเอง
  const auth = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const supabase = createServiceClient()
  const today = todayInShopTz()
  const tomorrow = addDays(today, 1)
  // ต้นเดือนของเดือนที่แล้ว — ครอบทั้งฐานเฉลี่ย 7 วันและ MTD เดือนที่แล้วในคิวรีเดียว
  const from = `${addMonths(today, -1).slice(0, 7)}-01`

  const [daily, commission, customerRows, therapistTop, bookings, creditEmpty, creditLow] =
    await Promise.all([
      supabase
        .from("v_daily_summary")
        .select("sale_date, sessions, net_revenue, cash_in")
        .gte("sale_date", from)
        .lte("sale_date", today),
      supabase.from("v_commission_daily").select("commission").eq("work_date", today).maybeSingle(),
      supabase.from("sales").select("customer_id").eq("sale_date", today).not("customer_id", "is", null),
      supabase
        .from("v_therapist_daily")
        .select("therapist_id, sessions, total_income")
        .eq("work_date", today)
        .order("total_income", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("queue_entries")
        .select("*", { count: "exact", head: true })
        .eq("queue_date", tomorrow)
        .not("status", "in", "(cancelled,rejected)"),
      // member_balances เกิน 1,000 แถว ห้ามดึงมานับเอง ต้องให้ฐานข้อมูลนับให้
      supabase
        .from("member_balances")
        .select("*", { count: "exact", head: true })
        .gt("credit_granted", 0)
        .lte("credit_balance", 0),
      supabase
        .from("member_balances")
        .select("*", { count: "exact", head: true })
        .gt("credit_balance", 0)
        .lte("credit_balance", CREDIT_LOW_BAHT),
    ])

  // ตัวเลขไม่ครบ = ไม่ส่ง ดีกว่าส่งการ์ดที่ผิดเข้ากลุ่มผู้บริหาร
  const failed = [daily, commission, customerRows, therapistTop, bookings, creditEmpty, creditLow]
    .map((r) => r.error?.message)
    .filter(Boolean)
  if (failed.length > 0) {
    console.error("daily-report query failed", failed)
    return NextResponse.json({ ok: false, error: failed[0] })
  }

  let topTherapist: TopTherapist | null = null
  if (therapistTop.data?.therapist_id) {
    const { data: therapist } = await supabase
      .from("therapists")
      .select("name")
      .eq("id", therapistTop.data.therapist_id)
      .maybeSingle()
    if (therapist) {
      topTherapist = {
        name: therapist.name,
        income: Number(therapistTop.data.total_income ?? 0),
        sessions: Number(therapistTop.data.sessions ?? 0),
      }
    }
  }

  const report = buildDailyReport({
    today,
    daily: (daily.data ?? []).map(
      (r): DailySummaryRow => ({
        sale_date: r.sale_date ?? "",
        sessions: Number(r.sessions ?? 0),
        net_revenue: Number(r.net_revenue ?? 0),
        cash_in: Number(r.cash_in ?? 0),
      })
    ),
    commission: Number(commission.data?.commission ?? 0),
    customers: new Set((customerRows.data ?? []).map((r) => r.customer_id)).size,
    topTherapist,
    bookingsTomorrow: bookings.count ?? 0,
    memberCreditEmpty: creditEmpty.count ?? 0,
    memberCreditLow: creditLow.count ?? 0,
  })

  const sent = await pushAssistantFlex(
    process.env.LINE_MANAGEMENT_GROUP_ID ?? "",
    dailyReportFlex(report)
  )
  // ตอบ 200 เสมอแม้ส่งไม่สำเร็จ — ให้ Vercel เลิกยิงซ้ำ ไม่งั้นกลุ่มโดนสแปม
  return NextResponse.json({
    ok: sent,
    date: report.date,
    empty: report.empty,
    netRevenue: report.netRevenue,
    priorDays: PRIOR_DAYS,
  })
}
```

- [x] **Step 3: ตั้ง cron**

แก้ `vercel.json` ให้เป็น:

```json
{
  "regions": ["sin1"],
  "crons": [
    { "path": "/api/cron/birthday-reminder", "schedule": "0 1 * * *" },
    { "path": "/api/cron/daily-report", "schedule": "0 15 * * *" }
  ]
}
```

`0 15 * * *` UTC = 22:00 น. เวลาไทย

- [x] **Step 4: เติม .env.example ให้ครบ**

แก้ `.env.example` เพิ่มบรรทัดที่ยังขาด (คงบรรทัดเดิมไว้):

```
# OA ผู้ช่วย (Sookkaya Assistant) — ใช้ส่งเตือนวันเกิดและรายงานรายวัน
LINE_ASSISTANT_CHANNEL_TOKEN=
LINE_ASSISTANT_CHANNEL_SECRET=
# กลุ่มทีมร้าน — รับแจ้งคิวจองใหม่และเตือนวันเกิด
LINE_ASSISTANT_QUEUE_GROUP_ID=
# กลุ่มผู้บริหาร Sookkaya Management — รับการ์ดสรุปยอดขายรายวัน 22:00 น.
LINE_MANAGEMENT_GROUP_ID=
```

- [x] **Step 5: ด่านเต็ม แล้ว commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```
ถ้า tsc ฟ้อง LayoutRoutes หรือ validator ให้ `rm -rf .next` แล้วรันใหม่

```bash
git add src/app/api/cron/daily-report/route.ts src/lib/line-assistant.ts vercel.json .env.example
git commit -m "feat(daily-report): cron 22:00 ยิงการ์ดเข้ากลุ่มผู้บริหาร"
```

---

### Task 4: ตั้งค่าจริง ตรวจของจริง แล้วเปิดใช้

**Files:** ไม่แก้โค้ด — งานตั้งค่าและตรวจสอบ

**Interfaces:**
- Consumes: endpoint `GET /api/cron/daily-report` จาก Task 3

**บริบทที่ต้องรู้:** ห้าม deploy จนกว่า Task 1-3 ผ่านครบ · ตัวเลขที่ออกมาต้องเอาไปเทียบกับหน้า `/today` ด้วยตาก่อนถือว่าใช้ได้ · ค่า group id ของกลุ่ม Sookkaya Management คือ `C20fece7eb07ca5b2f86ccf31e9c86dfd`

- [x] **Step 1: ยืนยันว่า OA ที่ POS ใช้ เป็นตัวเดียวกับที่ส่ง Daily Report**

ค่าใน Vercel ถูกปิดไว้ (`vercel env pull` ได้ `[SENSITIVE]`) จึงต้องเทียบผ่าน LINE API หลัง deploy แทน
วิธี: ดูจากผลลัพธ์ Step 4 — ถ้าการ์ดเข้ากลุ่มได้สำเร็จ แปลว่า token ที่ POS ถืออยู่คุยกับกลุ่มนี้ได้ ถือว่าเป็น OA เดียวกัน

ถ้า Step 4 ได้ `ok: false` ให้ตรวจว่า OA คนละตัว โดยรันบนเครื่อง (แทน `<token>` ด้วยค่าจาก LINE console):
```bash
curl -s -H "Authorization: Bearer <token>" https://api.line.me/v2/bot/info
```
ต้องได้ `"basicId":"@369wlnfe"` `"displayName":"Sookkaya Assistant"`
ถ้าได้ OA อื่น ให้เพิ่ม env `LINE_DAILY_REPORT_CHANNEL_TOKEN` แยก แล้วแก้ `pushAssistantFlex` ให้รับ token ทางพารามิเตอร์ — **หยุดแล้วรายงานเจ้าของร้านก่อน อย่าเดา**

- [x] **Step 2: ตั้ง env ใหม่บน Vercel**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
cd sookkaya-pos-v2
printf 'C20fece7eb07ca5b2f86ccf31e9c86dfd' | npx vercel env add LINE_MANAGEMENT_GROUP_ID production
```

- [x] **Step 3: merge แล้ว deploy**

```bash
git checkout main
git merge --no-ff feat/line-daily-report -m "feat(daily-report): ย้าย Daily Report เข้าไลน์มาไว้ใน POS"
npx vercel deploy --prod --yes
git push origin main
```

- [x] **Step 4: ยิง route ด้วยมือ แล้วดูการ์ดจริง**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
cd sookkaya-pos-v2
npx vercel env pull /tmp/dr.env --environment=production --yes
curl -s -H "Authorization: Bearer $(grep '^CRON_SECRET=' /tmp/dr.env | cut -d= -f2- | tr -d '\"')" \
  https://sookkaya-pos.vercel.app/api/cron/daily-report
rm -f /tmp/dr.env
```

ต้องได้ `{"ok":true,...}` และการ์ดต้องเข้ากลุ่ม Sookkaya Management จริง

ถ้าได้ `{"ok":false}` ให้ดู log ด้วย MCP `get_runtime_logs` ของ Vercel (projectId `prj_aIjCLSIX6A5MoonNtjzMiRno5Md3`, teamId `team_aIZvGjaXuArkv1Vku7KHeW9C`) — ข้อความจาก `console.error` จะบอกว่าติดที่ query หรือที่ LINE

- [x] **Step 5: เทียบตัวเลขทุกช่องกับหน้า /today**

เปิด `https://sookkaya-pos.vercel.app/today` ของวันเดียวกัน แล้วเทียบทีละช่อง:

| ช่องในการ์ด | เทียบกับอะไรในหน้า /today |
|---|---|
| NET REVENUE | ยอดสุทธิในการ์ด "รายรับ" (แถวล่างสุดของ waterfall) |
| Cash In | ยอดในการ์ด "เงินเข้าจริง" |
| Sessions · ลูกค้า | StatCard "เซสชัน" และตัวเลขลูกค้าใต้ช่องนั้น |
| ค่ามือรวม | StatCard "ค่ามือรวม" |
| กำไรขั้นต้น · Margin | StatCard "กำไรขั้นต้น" และ % ใต้ช่องนั้น |

ทุกช่องต้องตรงเป๊ะ (ยกเว้นเศษสตางค์ที่การ์ดปัดทิ้ง) ถ้าไม่ตรงแม้ช่องเดียว **หยุด อย่าเปิดใช้ ให้กลับไปหาสาเหตุ**

TOP หมอ · MTD · คิวจองพรุ่งนี้ ตรวจด้วย SQL ผ่าน MCP Supabase (project `jrioyrmicioqammeevgh`):
```sql
select t.name, td.sessions, td.total_income
from v_therapist_daily td join therapists t on t.id = td.therapist_id
where td.work_date = current_date order by td.total_income desc limit 1;

select sum(net_revenue) as mtd from v_daily_summary
where sale_date >= date_trunc('month', current_date)::date and sale_date <= current_date;

select count(*) from queue_entries
where queue_date = current_date + 1 and status not in ('cancelled','rejected');
```

- [x] **Step 6: ตรวจว่าไม่มี error หลัง deploy**

ใช้ MCP Vercel `get_runtime_errors` ช่วง 1 ชั่วโมงล่าสุด ต้องไม่มี error ใหม่

- [x] **Step 7: สรุปให้เจ้าของร้านพร้อมรายการที่เขาต้องทำเอง**

รายงานเป็นภาษาไทย ต้องมีครบ 3 ข้อนี้:
1. **ปิด trigger 22:00 ของ Google Apps Script เดิม** — ไม่งั้นได้การ์ดวันละ 2 ใบ ตัวเลขไม่ตรงกัน วิธี: เปิดโปรเจกต์ Apps Script → เมนู Triggers → ลบ trigger ที่เรียก `sendDailyReport`
2. **ออก channel access token ใหม่ให้ OA `@369wlnfe`** แล้วแจ้งกลับมาอัปเดตใน Vercel — ตัวปัจจุบันเขียนเปลือยอยู่ในไฟล์ `.gs` บนเครื่องมาตั้งแต่ มิ.ย. 2569 · OA ตัวนี้คนละตัวกับ OA ลูกค้า ไม่กระทบ Slip2Go
3. **ตัวเลข Margin จะลดจาก ~73% เหลือ ~60%** เพราะการ์ดเดิมนับค่ามือขาดประกันมือกับค่ารีเควส ไม่ใช่ระบบใหม่พัง

---

## Self-review

**ครอบคลุม spec:**

| หัวข้อใน spec | Task |
|---|---|
| สถาปัตยกรรม 3 ชั้น | 1, 2, 3 |
| นิยามตัวเลขทุกช่อง (net revenue, cash in, ค่ามือ, กำไรขั้นต้น, margin, sessions, ลูกค้า, vs avg 7d, TOP หมอ, MTD, คิวพรุ่งนี้) | 1 (สูตร) + 3 (query) |
| Action alerts 4 ข้อ ตัดเหลือ 3 | 1 |
| โครง Flex ครบทุก node + สี | 2 |
| ปุ่มชี้ `/today` | 2 |
| กรณีพิเศษ 6 แบบ | 1 (empty, ไม่มีหมอ, ข้อมูลไม่พอ) · 3 (env ไม่ตั้ง, LINE ล้ม, query พัง) |
| ความปลอดภัย CRON_SECRET + service client + ไม่ log token | 3 |
| env vars | 3 (`.env.example`) + 4 (ตั้งจริง) |
| cron `0 15 * * *` | 3 |
| การทดสอบทั้งสองไฟล์ lib | 1, 2 |
| ตรวจของจริงก่อนเปิดใช้ | 4 |
| ขั้นตอนตัดสวิตช์ 3 ข้อ | 4 |

ไม่มีข้อไหนของ spec ที่ไม่มี task รองรับ

**ชื่อและ type ตรงกันข้าม task:** `DailyReport`/`DailyReportInput`/`DailySummaryRow`/`TopTherapist` ประกาศใน Task 1 ใช้ตรงกันใน Task 2 และ 3 · `buildDailyReport` `dailyReportFlex` `pushAssistantFlex` `DASHBOARD_URL` `CREDIT_LOW_BAHT` `PRIOR_DAYS` `addDays` สะกดตรงกันทุกที่ · `vsAvg7dPct` เป็น `number | null` เหมือนกันทั้ง Task 1 และ 2

**ไม่มี placeholder:** ทุก step ที่ต้องเขียนโค้ดมีโค้ดจริงครบ ไม่มี TBD/TODO ไม่มี "similar to Task N"
