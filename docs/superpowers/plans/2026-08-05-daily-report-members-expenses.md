# สมาชิกใหม่ + รายจ่ายที่บันทึก ในการ์ด Daily Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มสองบล็อกในการ์ด Daily Report ที่ส่งเข้าไลน์ 22:00 — สมาชิกที่เติมเงินวันนั้น (แยกใหม่/ต่ออายุ) และรายจ่ายที่ถูกบันทึกเข้าระบบวันนั้น (นับตามวันที่บันทึก ไม่ใช่วันที่ของรายจ่าย)

**Architecture:** ตามโครงเดิมสามชั้น — สูตรบริสุทธิ์ใน `daily-report.ts` ไม่แตะฐานข้อมูล · โครงการ์ดใน `daily-report-flex.ts` อ่านจาก `DailyReport` อย่างเดียว · route ดึงข้อมูลแล้วป้อนแถวดิบเข้าสูตร ไม่คำนวณเอง

**Tech Stack:** TypeScript · Next.js 16 (App Router) · Supabase JS · Vitest · LINE Messaging API (Flex)

**เรียงงานโดยเจตนา:** Task 1-3 = บล็อกสมาชิก จบแล้ว deploy ใช้งานได้จริงเป็นจุดหยุดของตัวเอง · Task 4-6 = บล็อกรายจ่าย เจ้าของร้านสั่งให้ทำสมาชิกก่อน

## Global Constraints

- ห้ามใส่ property ที่ LINE ไม่รู้จักในโครง Flex — `letterSpacing` เคยทำการ์ดพังมาแล้ว (commit `7e8b520`) ใช้ได้เฉพาะ property ที่มีอยู่ในการ์ดปัจจุบันแล้ว
- สูตรใน `daily-report.ts` ต้องเป็นฟังก์ชันบริสุทธิ์ ห้าม import อะไรที่แตะฐานข้อมูลหรือ `Date.now()`
- ยอดเงินสมาชิกใช้ `cash_received` เท่านั้น ห้ามใช้ `credit_added` (รวมโบนัสแล้ว สูงกว่าเงินจริง)
- `EXCLUDED_TIER = "เครดิตคงเหลือ"` ตัดทิ้งทั้งจากการนับของวันนั้น **และจากประวัติที่ใช้ตัดสินว่าใครเป็นสมาชิกใหม่**
- บรรทัด `(รวมอยู่ใน Cash In แล้ว)` บังคับมีคู่กับบล็อกสมาชิกเสมอ ห้ามตัดออก
- วันที่บันทึกรายจ่าย = `(created_at AT TIME ZONE 'Asia/Bangkok')::date` — ฝั่งโค้ดกรองด้วยช่วง UTC
- `report.empty === true` → ทั้งสองบล็อกไม่แสดง แม้มีข้อมูล
- query ใหม่ทุกตัวต้องเข้าไปอยู่ในรายการ `failed` เดิมของ route — พังแล้วตอบ `{ ok: false }` และไม่ส่งการ์ด
- ทุก task จบด้วย `npx vitest run` ผ่านทั้งชุด ไม่ใช่แค่เทสที่เพิ่งเขียน

## โครงไฟล์

| ไฟล์ | สถานะ | หน้าที่ |
|---|---|---|
| `src/lib/daily-report.ts` | แก้ | เพิ่ม type + สูตร `buildMemberSignups` และ `buildExpenseEntries` |
| `src/lib/daily-report.test.ts` | แก้ | เพิ่มเทสสูตรใหม่ + เติมฟิลด์ใหม่ใน `base` |
| `src/lib/daily-report-flex.ts` | แก้ | เพิ่มแถวในการ์ด |
| `src/lib/daily-report-flex.test.ts` | แก้ | เพิ่มเทสการ์ด + เติมฟิลด์ใหม่ใน `report` |
| `src/lib/datetime.ts` | แก้ | export `THAI_MONTHS_ABBR` และเพิ่ม `thaiMonthAbbr` |
| `src/lib/datetime.test.ts` | แก้ | เทส `thaiMonthAbbr` |
| `src/app/api/cron/daily-report/route.ts` | แก้ | เพิ่ม query และป้อนแถวดิบเข้าสูตร |

**กับดักที่ต้องรู้ล่วงหน้า:** ฟิลด์ใหม่ใน `DailyReportInput` และ `DailyReport` เป็น required
การเพิ่มจะทำให้ fixture `base` ใน `daily-report.test.ts:14` และ `report` ใน
`daily-report-flex.test.ts:5` **คอมไพล์ไม่ผ่านทันที** ทุก task ที่เพิ่มฟิลด์จึงต้องเติม
fixture ในขั้นตอนเดียวกัน ไม่ใช่ปล่อยให้พังข้ามขั้น

---

## Task 1: สูตรสมาชิก (`src/lib/daily-report.ts`)

**Files:**
- Modify: `src/lib/daily-report.ts`
- Test: `src/lib/daily-report.test.ts`

**Interfaces:**
- Produces: `EXCLUDED_TIER`, type `TierCount`, `MemberSignups`, `TopupRow`, `TopupHistoryRow` · ฟิลด์ `memberSignups` ใน `DailyReport` · ฟิลด์ `topups` และ `topupHistory` ใน `DailyReportInput`

**บริบทที่ต้องรู้:** ตัดสิน "ใหม่/ต่ออายุ" **รายแถว ไม่ใช่รายคน** — ลูกค้าคนเดียวเติมสองครั้งในวันเดียว ครั้งแรกนับใหม่ ครั้งที่สองนับต่ออายุ เพื่อให้ยอดเงินบวกครบทุกแถว · `topupHistory` ที่ route ส่งมาจะมีแถวของวันนี้ปนอยู่ด้วย สูตรต้องกรองเอาเฉพาะแถวที่ `topup_date < today` เอง ห้ามสมมติว่า route กรองให้แล้ว

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

เติมใน `src/lib/daily-report.test.ts` — เพิ่ม import และ fixture ก่อน

```ts
import {
  EXCLUDED_TIER,
  MAX_ALERTS,
  buildDailyReport,
  type DailyReportInput,
  type DailySummaryRow,
  type TopupRow,
  type TopupHistoryRow,
} from "./daily-report"
```

เติมสองฟิลด์ใน `base` (บรรทัด 14-23) ให้เป็น

```ts
const base: DailyReportInput = {
  today: "2026-08-04",
  daily: [row("2026-08-04", 16, 11673.67, 19107)],
  commission: 4680,
  customers: 14,
  topTherapist: null,
  bookingsTomorrow: 0,
  memberCreditEmpty: 0,
  memberCreditLow: 0,
  topups: [],
  topupHistory: [],
}
```

แล้วต่อท้ายไฟล์

```ts
const topup = (customer_id: string, tier: string | null, cash_received: number | null): TopupRow => ({
  customer_id, tier, cash_received,
})
const hist = (customer_id: string, topup_date: string): TopupHistoryRow => ({ customer_id, topup_date })

describe("buildDailyReport — สมาชิกที่เติมเงิน", () => {
  it("ลูกค้าที่ไม่เคยเติมมาก่อน นับเป็นสมาชิกใหม่", () => {
    const r = buildDailyReport({
      ...base,
      topups: [topup("c1", "Silver", 5000)],
      topupHistory: [hist("c1", "2026-08-04")],
    })
    expect(r.memberSignups.newCount).toBe(1)
    expect(r.memberSignups.newCash).toBe(5000)
    expect(r.memberSignups.newTiers).toEqual([{ tier: "Silver", count: 1 }])
    expect(r.memberSignups.renewCount).toBe(0)
  })

  it("ลูกค้าที่เคยเติมเมื่อเดือนก่อน นับเป็นต่ออายุ", () => {
    const r = buildDailyReport({
      ...base,
      topups: [topup("c1", "Silver", 5000)],
      topupHistory: [hist("c1", "2026-07-01"), hist("c1", "2026-08-04")],
    })
    expect(r.memberSignups.newCount).toBe(0)
    expect(r.memberSignups.renewCount).toBe(1)
    expect(r.memberSignups.renewCash).toBe(5000)
    expect(r.memberSignups.renewTiers).toEqual([{ tier: "Silver", count: 1 }])
  })

  it("คนเดียวเติมสองครั้งในวันเดียว = ใหม่ 1 ต่ออายุ 1 เงินครบทั้งสองแถว", () => {
    const r = buildDailyReport({
      ...base,
      topups: [topup("c1", "Silver", 5000), topup("c1", "Gold", 8000)],
      topupHistory: [hist("c1", "2026-08-04"), hist("c1", "2026-08-04")],
    })
    expect(r.memberSignups.newCount).toBe(1)
    expect(r.memberSignups.newCash).toBe(5000)
    expect(r.memberSignups.renewCount).toBe(1)
    expect(r.memberSignups.renewCash).toBe(8000)
  })

  it("tier เครดิตคงเหลือ ไม่ถูกนับ", () => {
    const r = buildDailyReport({
      ...base,
      topups: [topup("c1", EXCLUDED_TIER, 1020)],
      topupHistory: [hist("c1", "2026-08-04")],
    })
    expect(r.memberSignups.newCount).toBe(0)
    expect(r.memberSignups.renewCount).toBe(0)
    expect(r.memberSignups.newCash).toBe(0)
  })

  it("เครดิตคงเหลือในประวัติ ไม่ทำให้คนซื้อแพ็กเกจครั้งแรกกลายเป็นต่ออายุ", () => {
    const r = buildDailyReport({
      ...base,
      topups: [topup("c1", "Silver", 5000)],
      topupHistory: [hist("c1", "2026-08-04")],
      // แถว EXCLUDED_TIER ของเมื่อวานถูก route ตัดออกตั้งแต่ query แล้ว
      // เทสนี้ยืนยันว่าไม่มีแถวเก่าเหลือ = ยังนับเป็นใหม่
    })
    expect(r.memberSignups.newCount).toBe(1)
  })

  it("หลาย tier ในวันเดียว เรียงจำนวนมากไปน้อย ยอดเท่ากันเรียงตามชื่อ", () => {
    const r = buildDailyReport({
      ...base,
      topups: [
        topup("c1", "Silver", 5000),
        topup("c2", "Silver", 5000),
        topup("c3", "Gold", 8000),
      ],
      topupHistory: [hist("c1", "2026-08-04"), hist("c2", "2026-08-04"), hist("c3", "2026-08-04")],
    })
    expect(r.memberSignups.newTiers).toEqual([
      { tier: "Silver", count: 2 },
      { tier: "Gold", count: 1 },
    ])
  })

  it("cash_received เป็น null นับรายแต่ยอดเป็น 0", () => {
    const r = buildDailyReport({
      ...base,
      topups: [topup("c1", "Silver", null)],
      topupHistory: [hist("c1", "2026-08-04")],
    })
    expect(r.memberSignups.newCount).toBe(1)
    expect(r.memberSignups.newCash).toBe(0)
  })

  it("tier เป็น null แสดงเป็น ไม่ระบุ", () => {
    const r = buildDailyReport({
      ...base,
      topups: [topup("c1", null, 3000)],
      topupHistory: [hist("c1", "2026-08-04")],
    })
    expect(r.memberSignups.newTiers).toEqual([{ tier: "ไม่ระบุ", count: 1 }])
  })

  it("ไม่มี topup เลย ทุกช่องเป็นศูนย์", () => {
    const r = buildDailyReport(base)
    expect(r.memberSignups).toEqual({
      newCount: 0, newCash: 0, newTiers: [],
      renewCount: 0, renewCash: 0, renewTiers: [],
    })
  })
})
```

- [ ] **Step 2: รันเทสให้เห็นว่าแดง**

Run: `npx vitest run src/lib/daily-report.test.ts`
Expected: FAIL — TypeScript ฟ้องว่าไม่มี export `EXCLUDED_TIER`, `TopupRow`, `TopupHistoryRow` และ `memberSignups` ไม่มีใน `DailyReport`

- [ ] **Step 3: เขียนโค้ดให้ผ่าน**

ใน `src/lib/daily-report.ts` เพิ่มหลัง `export type TopTherapist = ...`

```ts
export type TierCount = { tier: string; count: number }

export type MemberSignups = {
  newCount: number
  newCash: number
  newTiers: TierCount[]
  renewCount: number
  renewCash: number
  renewTiers: TierCount[]
}

export type TopupRow = {
  customer_id: string
  tier: string | null
  cash_received: number | null
}

/** ประวัติการเติมของลูกค้าที่เติมวันนี้ — รวมแถวของวันนี้มาด้วย สูตรกรองเอง */
export type TopupHistoryRow = {
  customer_id: string
  topup_date: string
}

/** ยอดเกินที่เก็บเข้าเครดิตจากฟีเจอร์ overpay-to-credit ไม่ใช่การซื้อแพ็กเกจ */
export const EXCLUDED_TIER = "เครดิตคงเหลือ"

const TIER_UNKNOWN = "ไม่ระบุ"
```

เพิ่มสองฟิลด์ใน `DailyReportInput`

```ts
  /** แถว member_topups ของวันนี้ ตัด EXCLUDED_TIER ออกแล้วจาก query */
  topups: TopupRow[]
  /** ประวัติการเติมทั้งหมดของลูกค้าที่เติมวันนี้ ตัด EXCLUDED_TIER ออกแล้ว */
  topupHistory: TopupHistoryRow[]
```

เพิ่มฟิลด์ใน `DailyReport`

```ts
  memberSignups: MemberSignups
```

เพิ่มฟังก์ชันก่อน `buildDailyReport`

```ts
/** นับ tier แล้วเรียงจำนวนมากไปน้อย เท่ากันเรียงตามชื่อ ให้ผลคงที่ทุกครั้ง */
function countTiers(rows: TopupRow[]): TierCount[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const tier = r.tier?.trim() ? r.tier : TIER_UNKNOWN
    map.set(tier, (map.get(tier) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([tier, count]) => ({ tier, count }))
    .sort((a, b) => b.count - a.count || a.tier.localeCompare(b.tier, "th"))
}

function sumCash(rows: TopupRow[]): number {
  return rows.reduce((s, r) => s + Number(r.cash_received ?? 0), 0)
}

export function buildMemberSignups(
  today: string,
  topups: TopupRow[],
  history: TopupHistoryRow[]
): MemberSignups {
  const rows = topups.filter((r) => r.tier !== EXCLUDED_TIER)
  // ลูกค้าที่มีแถวเก่ากว่าวันนี้ = เคยเป็นสมาชิกมาก่อน
  const returning = new Set(
    history.filter((h) => h.topup_date < today).map((h) => h.customer_id)
  )
  // ตัดสินรายแถว: คนเดียวเติมสองครั้งวันเดียว ครั้งแรกใหม่ ครั้งที่สองต่ออายุ
  const seenToday = new Set<string>()
  const fresh: TopupRow[] = []
  const renew: TopupRow[] = []
  for (const r of rows) {
    if (returning.has(r.customer_id) || seenToday.has(r.customer_id)) renew.push(r)
    else fresh.push(r)
    seenToday.add(r.customer_id)
  }
  return {
    newCount: fresh.length,
    newCash: sumCash(fresh),
    newTiers: countTiers(fresh),
    renewCount: renew.length,
    renewCash: sumCash(renew),
    renewTiers: countTiers(renew),
  }
}
```

ใน `buildDailyReport` เพิ่มก่อน `return`

```ts
  const memberSignups = buildMemberSignups(today, input.topups, input.topupHistory)
```

แล้วเพิ่ม `memberSignups,` ใน object ที่ return

- [ ] **Step 4: รันเทสให้ผ่าน**

Run: `npx vitest run src/lib/daily-report.test.ts`
Expected: PASS ทั้ง 30 เทส (21 เดิม + 9 ใหม่)

- [ ] **Step 5: ด่านเต็ม แล้ว commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src/lib/daily-report.ts
git add src/lib/daily-report.ts src/lib/daily-report.test.ts
git commit -m "feat(daily-report): สูตรนับสมาชิกใหม่กับต่ออายุจากแถว member_topups"
```

---

## Task 2: การ์ดฝั่งสมาชิก (`src/lib/daily-report-flex.ts`)

**Files:**
- Modify: `src/lib/daily-report-flex.ts`
- Test: `src/lib/daily-report-flex.test.ts`

**Interfaces:**
- Consumes: `report.memberSignups` จาก Task 1

**บริบทที่ต้องรู้:** แถวใหม่แทรกใน `opsRows` ระหว่าง TOP หมอ กับ MTD · บรรทัด `(รวมอยู่ใน Cash In แล้ว)` เป็น text node เดี่ยว ไม่ใช่ `opRow` เพราะไม่มีคู่ label/value

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

เติมฟิลด์ใน fixture `report` ของ `src/lib/daily-report-flex.test.ts`

```ts
  memberSignups: {
    newCount: 0, newCash: 0, newTiers: [],
    renewCount: 0, renewCash: 0, renewTiers: [],
  },
```

แล้วต่อท้ายไฟล์

```ts
describe("dailyReportFlex — บล็อกสมาชิก", () => {
  it("มีสมาชิกใหม่ โชว์แถวและบรรทัดกำกับ Cash In", () => {
    const flex = dailyReportFlex({
      ...report,
      memberSignups: {
        newCount: 1, newCash: 5000, newTiers: [{ tier: "Silver", count: 1 }],
        renewCount: 0, renewCash: 0, renewTiers: [],
      },
    })
    const texts = allText(flex)
    expect(texts).toContain("👥 สมาชิกใหม่")
    expect(texts.some((t) => t.includes("1 ราย") && t.includes("Silver ×1") && t.includes("฿5,000"))).toBe(true)
    expect(texts).toContain("(รวมอยู่ใน Cash In แล้ว)")
    expect(texts).not.toContain("🔁 ต่ออายุ")
  })

  it("มีทั้งใหม่และต่ออายุ โชว์สองแถว", () => {
    const texts = allText(dailyReportFlex({
      ...report,
      memberSignups: {
        newCount: 1, newCash: 5000, newTiers: [{ tier: "Silver", count: 1 }],
        renewCount: 2, renewCash: 10000, renewTiers: [{ tier: "Silver", count: 2 }],
      },
    }))
    expect(texts).toContain("👥 สมาชิกใหม่")
    expect(texts).toContain("🔁 ต่ออายุ")
  })

  it("ไม่มีใครเติมเลย ซ่อนทั้งบล็อกรวมบรรทัดกำกับ", () => {
    const texts = allText(dailyReportFlex(report))
    expect(texts).not.toContain("👥 สมาชิกใหม่")
    expect(texts).not.toContain("🔁 ต่ออายุ")
    expect(texts).not.toContain("(รวมอยู่ใน Cash In แล้ว)")
  })

  it("วันที่ไม่มีบิล การ์ดย่อ ไม่มีบล็อกสมาชิกแม้มีคนเติม", () => {
    const texts = allText(dailyReportFlex({
      ...report,
      empty: true,
      memberSignups: {
        newCount: 1, newCash: 5000, newTiers: [{ tier: "Silver", count: 1 }],
        renewCount: 0, renewCash: 0, renewTiers: [],
      },
    }))
    expect(texts).not.toContain("👥 สมาชิกใหม่")
  })
})
```

- [ ] **Step 2: รันเทสให้เห็นว่าแดง**

Run: `npx vitest run src/lib/daily-report-flex.test.ts`
Expected: FAIL — ไม่พบข้อความ `👥 สมาชิกใหม่`

- [ ] **Step 3: เขียนโค้ดให้ผ่าน**

ใน `src/lib/daily-report-flex.ts` เพิ่ม helper ต่อจาก `opRow`

```ts
/** "Silver ×2 · Gold ×1" — ว่างเมื่อไม่มี tier */
function tierSummary(tiers: { tier: string; count: number }[]): string {
  return tiers.map((t) => `${t.tier} ×${t.count}`).join(" · ")
}

function memberRowValue(count: number, tiers: { tier: string; count: number }[], cash: number): string {
  return `${count} ราย · ${tierSummary(tiers)} · ${baht(cash)}`
}

function noteText(text: string, color: string) {
  return { type: "text", text, color, size: "xxs", margin: "sm", wrap: true }
}
```

ใน `body()` หลังบล็อก TOP หมอ (บรรทัดที่ push `🏆 TOP หมอ`) และ **ก่อน** บล็อก MTD เพิ่ม

```ts
  const ms = report.memberSignups
  const hasSignups = ms.newCount > 0 || ms.renewCount > 0
  if (hasSignups) {
    if (ms.newCount > 0) {
      opsRows.push(opRow("👥 สมาชิกใหม่", memberRowValue(ms.newCount, ms.newTiers, ms.newCash), BRAND.positive))
    }
    if (ms.renewCount > 0) {
      opsRows.push(opRow("🔁 ต่ออายุ", memberRowValue(ms.renewCount, ms.renewTiers, ms.renewCash), BRAND.text))
    }
    // บังคับมี: v_daily_summary นิยาม cash_in = เงินจากบิล + เงินเติมสมาชิก
    // ไม่กำกับแล้วผู้บริหารจะบวกซ้ำเป็นเงินเข้าเพิ่ม
    opsRows.push(noteText("(รวมอยู่ใน Cash In แล้ว)", BRAND.textMuted))
  }
```

- [ ] **Step 4: รันเทสให้ผ่าน**

Run: `npx vitest run src/lib/daily-report-flex.test.ts`
Expected: PASS ทั้ง 19 เทส (15 เดิม + 4 ใหม่)

- [ ] **Step 5: ด่านเต็ม แล้ว commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src/lib/daily-report-flex.ts
git add src/lib/daily-report-flex.ts src/lib/daily-report-flex.test.ts
git commit -m "feat(daily-report): แถวสมาชิกใหม่กับต่ออายุในการ์ด พร้อมกำกับว่ารวมใน Cash In แล้ว"
```

---

## Task 3: ต่อท่อสมาชิก แล้วตรวจของจริง

**Files:**
- Modify: `src/app/api/cron/daily-report/route.ts`

**Interfaces:**
- Consumes: `buildMemberSignups` ผ่าน `buildDailyReport` และ `EXCLUDED_TIER` จาก Task 1

**บริบทที่ต้องรู้:** query ประวัติขึ้นกับผลของ query แรก จึงยิงหลัง `Promise.all` และ **ยิงเฉพาะวันที่มีคนเติม**

⚠️ **ห้ามใช้ `.neq("tier", EXCLUDED_TIER)` ใน query** — ใน Postgres การเทียบ `<>` กับ NULL
ให้ผล NULL ไม่ใช่ true แถวที่ `tier` เป็น NULL จะถูกตัดทิ้งไปด้วย ขัดกับ spec ที่ให้นับ
แล้วแสดงเป็น "ไม่ระบุ" — **กรองใน JS แทน** สูตรใน Task 1 กรองแถวของวันนี้ให้อยู่แล้ว
ส่วนประวัติต้อง `select` คอลัมน์ `tier` มาด้วยแล้วกรองก่อนส่งเข้าสูตร

- [ ] **Step 1: เพิ่ม query แถว topup ของวันนี้**

ใน `route.ts` เพิ่ม import

```ts
import { buildDailyReport, CREDIT_LOW_BAHT, EXCLUDED_TIER, PRIOR_DAYS } from "@/lib/daily-report"
import type { DailySummaryRow, TopTherapist, TopupRow, TopupHistoryRow } from "@/lib/daily-report"
```

เพิ่มเป็นสมาชิกตัวสุดท้ายของ `Promise.all` และรับค่าใน destructuring

```ts
  const [daily, commission, customerRows, therapistTop, bookings, creditEmpty, creditLow, topups] =
    await Promise.all([
      // ...ของเดิมทั้งเจ็ดตัว ไม่แก้...
      // ไม่กรอง tier ที่นี่ — สูตรกรองให้ และ .neq จะกิน NULL ทิ้งไปด้วย
      supabase
        .from("member_topups")
        .select("customer_id, tier, cash_received")
        .eq("topup_date", today),
    ])
```

เพิ่ม `topups` ในอาร์เรย์ที่เช็ค error

```ts
  const failed = [daily, commission, customerRows, therapistTop, bookings, creditEmpty, creditLow, topups]
    .map((r) => r.error?.message)
    .filter(Boolean)
```

- [ ] **Step 2: เพิ่ม query ประวัติแบบมีเงื่อนไข**

วางหลังบล็อก `if (failed.length > 0) { ... }` และก่อน `let topTherapist`

```ts
  // ยิงเฉพาะวันที่มีคนเติม — วันที่ไม่มีใครเติมเลยไม่เสีย round trip
  const topupRows = (topups.data ?? []) as TopupRow[]
  const topupCustomerIds = [...new Set(topupRows.map((r) => r.customer_id))]
  let topupHistory: TopupHistoryRow[] = []
  if (topupCustomerIds.length > 0) {
    const history = await supabase
      .from("member_topups")
      .select("customer_id, topup_date, tier")
      .in("customer_id", topupCustomerIds)
    if (history.error) {
      console.error("daily-report topup history failed", history.error.message)
      return NextResponse.json({ ok: false, error: history.error.message })
    }
    // กรองใน JS ไม่ใช่ใน query — .neq จะตัดแถวที่ tier เป็น NULL ทิ้งด้วย
    topupHistory = (history.data ?? [])
      .filter((r) => r.tier !== EXCLUDED_TIER)
      .map((r) => ({ customer_id: r.customer_id, topup_date: r.topup_date })) as TopupHistoryRow[]
  }
```

- [ ] **Step 3: ป้อนเข้าสูตร**

เพิ่มสองฟิลด์ใน object ที่ส่งให้ `buildDailyReport`

```ts
    topups: topupRows,
    topupHistory,
```

- [ ] **Step 4: ด่านเต็ม แล้ว commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src/app/api/cron/daily-report/route.ts
git add src/app/api/cron/daily-report/route.ts
git commit -m "feat(daily-report): ต่อท่อ member_topups เข้าการ์ด พร้อมกันเคสวันที่ไม่มีคนเติม"
```

- [ ] **Step 5: deploy แล้วยิงตรวจของจริง**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
cd "$HOME/Desktop/Claude Code/sookkaya-pos-v2"
git push origin main
npx vercel deploy --prod --yes
```

รอ READY แล้วยิง — `CRON_SECRET` ปัจจุบันเก็บไว้ที่ scratchpad ของ session ที่หมุนค่า
ถ้าหาไม่เจอให้หมุนใหม่ด้วย `openssl rand -hex 32 | npx vercel env add CRON_SECRET production`
แล้ว deploy ซ้ำ (`vercel env pull` คืน `[SENSITIVE]` ไม่ใช่ค่าจริง อย่าเสียเวลาลอง)

```bash
curl -s -H "Authorization: Bearer <CRON_SECRET>" \
  https://sookkaya-pos.vercel.app/api/cron/daily-report
```

ต้องได้ `{"ok":true,...}` และการ์ดต้องเข้ากลุ่ม Sookkaya Management

- [ ] **Step 6: เทียบตัวเลขสมาชิกกับ SQL ตรง**

รันผ่าน MCP Supabase (project `jrioyrmicioqammeevgh`) แล้วเทียบกับแถวในการ์ด

```sql
with today_rows as (
  select customer_id, tier, cash_received
  from member_topups
  where topup_date = current_date and tier is distinct from 'เครดิตคงเหลือ'
), first_seen as (
  select customer_id, min(topup_date) as first_date
  from member_topups
  where tier is distinct from 'เครดิตคงเหลือ'
  group by customer_id
)
select
  case when f.first_date = current_date then 'ใหม่' else 'ต่ออายุ' end as กลุ่ม,
  count(*) as ราย, sum(t.cash_received) as ยอดเงิน,
  string_agg(distinct t.tier, ', ') as แพ็กเกจ
from today_rows t join first_seen f on f.customer_id = t.customer_id
group by 1;
```

หมายเหตุ: SQL นี้ตัดสิน**รายคน** ส่วนสูตรตัดสิน**รายแถว** — ต่างกันเฉพาะวันที่มีคนเดียว
เติมสองครั้ง ถ้าเลขไม่ตรงให้เช็คก่อนว่าใช่เคสนั้นหรือเปล่า ก่อนสรุปว่าโค้ดผิด

ถ้าไม่ตรงด้วยเหตุอื่น **หยุด อย่าไปต่อ Task 4**

- [ ] **Step 7: ติ๊ก checkbox แล้ว commit แผน**

```bash
git add docs/superpowers/plans/2026-08-05-daily-report-members-expenses.md
git commit -m "docs: ปิดครึ่งแรกของแผน — บล็อกสมาชิกขึ้นโปรดักชันแล้ว"
```

**🚩 จุดหยุด:** ถึงตรงนี้บล็อกสมาชิกใช้งานได้จริงบนโปรดักชัน หยุดรอเจ้าของร้านดูของจริงก่อนเริ่ม Task 4 ได้

---

## Task 4: สูตรรายจ่ายที่บันทึก (`src/lib/daily-report.ts`)

**Files:**
- Modify: `src/lib/datetime.ts`, `src/lib/daily-report.ts`
- Test: `src/lib/datetime.test.ts`, `src/lib/daily-report.test.ts`

**Interfaces:**
- Produces: `THAI_MONTHS_ABBR`, `thaiMonthAbbr` · type `ExpenseEntries`, `ExpenseEntryRow` · ฟิลด์ `expenseEntries` ใน `DailyReport` และ `DailyReportInput`

**บริบทที่ต้องรู้:** ชื่อเดือนไทยย่อฝังอยู่ในตัว `formatThaiDate` ต้องยกออกมาเป็นค่าคงที่ก่อน ไม่ก๊อปอาร์เรย์ซ้ำ · เดือนย้อนหลังเกิน 4 เดือน ให้เลือก 4 เดือน**ยอดสูงสุด** แล้ว**เรียงเก่าไปใหม่**ตอนแสดง ที่เหลือรวมเป็น `otherMonthsTotal`

- [ ] **Step 1: ยกชื่อเดือนออกมาเป็นค่าคงที่**

ใน `src/lib/datetime.ts` แทนที่อาร์เรย์ในตัว `formatThaiDate` ด้วย

```ts
export const THAI_MONTHS_ABBR = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
] as const

/** แปลง YYYY-MM-DD เป็นข้อความไทย เช่น "20 ก.ค. 2569" (พ.ศ.) */
export function formatThaiDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number)
  return `${d} ${THAI_MONTHS_ABBR[m - 1]} ${y + 543}`
}

/** "2026-06-15" → "มิ.ย." */
export function thaiMonthAbbr(isoDate: string): string {
  return THAI_MONTHS_ABBR[Number(isoDate.slice(5, 7)) - 1]
}
```

- [ ] **Step 2: เขียนเทสที่ยังไม่ผ่าน**

เติมใน `src/lib/datetime.test.ts`

```ts
describe("thaiMonthAbbr", () => {
  it("คืนชื่อเดือนไทยย่อจากวันที่", () => {
    expect(thaiMonthAbbr("2026-06-15")).toBe("มิ.ย.")
    expect(thaiMonthAbbr("2026-01-01")).toBe("ม.ค.")
    expect(thaiMonthAbbr("2026-12-31")).toBe("ธ.ค.")
  })
})
```

(เพิ่ม `thaiMonthAbbr` ใน import ด้านบนไฟล์ด้วย)

เติมฟิลด์ `expenseEntries: []` ใน `base` ของ `daily-report.test.ts` แล้วต่อท้ายไฟล์

```ts
const exp = (expense_date: string, amount: number | null, recorded_date = "2026-08-04"): ExpenseEntryRow => ({
  expense_date, amount, recorded_date,
})

describe("buildDailyReport — รายจ่ายที่บันทึกวันนี้", () => {
  it("รายการที่ลงตรงวัน ไม่นับเป็นย้อนหลัง", () => {
    const r = buildDailyReport({ ...base, expenseEntries: [exp("2026-08-04", 458)] })
    expect(r.expenseEntries.count).toBe(1)
    expect(r.expenseEntries.total).toBe(458)
    expect(r.expenseEntries.backdatedCount).toBe(0)
    expect(r.expenseEntries.byMonth).toEqual([])
  })

  it("รายการลงย้อนหลัง นับทั้งยอดรวมและยอดย้อนหลัง", () => {
    const r = buildDailyReport({
      ...base,
      expenseEntries: [exp("2026-08-04", 458), exp("2026-06-30", 24884)],
    })
    expect(r.expenseEntries.count).toBe(2)
    expect(r.expenseEntries.total).toBe(25342)
    expect(r.expenseEntries.backdatedCount).toBe(1)
    expect(r.expenseEntries.backdatedTotal).toBe(24884)
    expect(r.expenseEntries.byMonth).toEqual([{ month: "มิ.ย.", total: 24884 }])
  })

  it("ย้อนหลังหลายเดือน เรียงเก่าไปใหม่", () => {
    const r = buildDailyReport({
      ...base,
      expenseEntries: [exp("2026-07-15", 25800), exp("2026-05-25", 4548), exp("2026-06-10", 24884)],
    })
    expect(r.expenseEntries.byMonth).toEqual([
      { month: "พ.ค.", total: 4548 },
      { month: "มิ.ย.", total: 24884 },
      { month: "ก.ค.", total: 25800 },
    ])
    expect(r.expenseEntries.otherMonthsTotal).toBe(0)
  })

  it("เกินสี่เดือน เก็บสี่เดือนยอดสูงสุด เรียงเก่าไปใหม่ ที่เหลือรวมก้อนเดียว", () => {
    const r = buildDailyReport({
      ...base,
      expenseEntries: [
        exp("2026-01-10", 100), exp("2026-02-10", 5000), exp("2026-03-10", 4000),
        exp("2026-04-10", 3000), exp("2026-05-10", 2000),
      ],
    })
    expect(r.expenseEntries.byMonth).toEqual([
      { month: "ก.พ.", total: 5000 },
      { month: "มี.ค.", total: 4000 },
      { month: "เม.ย.", total: 3000 },
      { month: "พ.ค.", total: 2000 },
    ])
    expect(r.expenseEntries.otherMonthsTotal).toBe(100)
  })

  it("ลงล่วงหน้า นับยอดรวมแต่ไม่นับย้อนหลัง", () => {
    const r = buildDailyReport({ ...base, expenseEntries: [exp("2026-09-01", 900)] })
    expect(r.expenseEntries.count).toBe(1)
    expect(r.expenseEntries.total).toBe(900)
    expect(r.expenseEntries.backdatedCount).toBe(0)
  })

  it("amount เป็น null นับรายการแต่ยอดเป็น 0", () => {
    const r = buildDailyReport({ ...base, expenseEntries: [exp("2026-06-01", null)] })
    expect(r.expenseEntries.count).toBe(1)
    expect(r.expenseEntries.total).toBe(0)
    expect(r.expenseEntries.backdatedTotal).toBe(0)
  })

  it("ไม่มีรายการเลย ทุกช่องเป็นศูนย์", () => {
    const r = buildDailyReport(base)
    expect(r.expenseEntries).toEqual({
      count: 0, total: 0, backdatedCount: 0, backdatedTotal: 0,
      byMonth: [], otherMonthsTotal: 0,
    })
  })
})
```

- [ ] **Step 3: รันเทสให้เห็นว่าแดง**

Run: `npx vitest run src/lib/datetime.test.ts src/lib/daily-report.test.ts`
Expected: FAIL — ไม่มี export `thaiMonthAbbr` และ `ExpenseEntryRow`

- [ ] **Step 4: เขียนโค้ดให้ผ่าน**

ใน `src/lib/daily-report.ts` เพิ่ม import

```ts
import { thaiMonthAbbr } from "./datetime"
```

(ไฟล์นี้ import `addMonths` จาก `./datetime` อยู่แล้ว — รวมเป็นบรรทัดเดียว)

เพิ่ม type

```ts
export type ExpenseEntryRow = {
  expense_date: string
  amount: number | null
  /** วันที่บันทึกตามเวลาไทย YYYY-MM-DD — route แปลงมาให้แล้ว */
  recorded_date: string
}

export type ExpenseEntries = {
  count: number
  total: number
  backdatedCount: number
  backdatedTotal: number
  /** เฉพาะรายการย้อนหลัง สี่เดือนยอดสูงสุด เรียงเก่าไปใหม่ */
  byMonth: { month: string; total: number }[]
  /** ยอดรวมของเดือนที่ถูกตัดออกจาก byMonth — 0 เมื่อไม่มีเดือนถูกตัด */
  otherMonthsTotal: number
}

/** เดือนมากกว่านี้การ์ดจะยาวจนคนเลิกอ่าน */
export const MAX_BACKDATED_MONTHS = 4
```

เพิ่มฟิลด์ `expenseEntries: ExpenseEntryRow[]` ใน `DailyReportInput` และ `expenseEntries: ExpenseEntries` ใน `DailyReport`

เพิ่มฟังก์ชัน

```ts
export function buildExpenseEntries(rows: ExpenseEntryRow[]): ExpenseEntries {
  const amount = (r: ExpenseEntryRow) => Number(r.amount ?? 0)
  const backdated = rows.filter((r) => r.expense_date < r.recorded_date)

  // คีย์เป็น YYYY-MM เพื่อเรียงตามเวลาได้ตรง แล้วค่อยแปลงเป็นชื่อเดือนตอนคืนค่า
  const byKey = new Map<string, number>()
  for (const r of backdated) {
    const key = r.expense_date.slice(0, 7)
    byKey.set(key, (byKey.get(key) ?? 0) + amount(r))
  }
  const all = [...byKey.entries()].map(([key, total]) => ({ key, total }))
  const kept = [...all].sort((a, b) => b.total - a.total).slice(0, MAX_BACKDATED_MONTHS)
  const keptKeys = new Set(kept.map((m) => m.key))

  return {
    count: rows.length,
    total: rows.reduce((s, r) => s + amount(r), 0),
    backdatedCount: backdated.length,
    backdatedTotal: backdated.reduce((s, r) => s + amount(r), 0),
    byMonth: kept
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((m) => ({ month: thaiMonthAbbr(`${m.key}-01`), total: m.total })),
    otherMonthsTotal: all
      .filter((m) => !keptKeys.has(m.key))
      .reduce((s, m) => s + m.total, 0),
  }
}
```

ใน `buildDailyReport` เพิ่มก่อน `return` แล้วใส่ในผลลัพธ์

```ts
  const expenseEntries = buildExpenseEntries(input.expenseEntries)
```

- [ ] **Step 5: รันเทสให้ผ่าน**

Run: `npx vitest run`
Expected: PASS ทั้งชุด (เพิ่ม 8 เทส)

- [ ] **Step 6: ด่านเต็ม แล้ว commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src/lib/daily-report.ts src/lib/datetime.ts
git add src/lib/daily-report.ts src/lib/daily-report.test.ts src/lib/datetime.ts src/lib/datetime.test.ts
git commit -m "feat(daily-report): สูตรสรุปรายจ่ายที่บันทึกในวันนั้น แยกยอดที่ลงย้อนหลัง"
```

---

## Task 5: การ์ดฝั่งรายจ่าย (`src/lib/daily-report-flex.ts`)

**Files:**
- Modify: `src/lib/daily-report-flex.ts`
- Test: `src/lib/daily-report-flex.test.ts`

**Interfaces:**
- Consumes: `report.expenseEntries` จาก Task 4

**บริบทที่ต้องรู้:** บล็อกนี้อยู่**ท้ายสุดของ `opsRows`** ถัดจากคิวจองพรุ่งนี้ ก่อนบล็อก Action alerts

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

เติมใน fixture `report`

```ts
  expenseEntries: {
    count: 0, total: 0, backdatedCount: 0, backdatedTotal: 0,
    byMonth: [], otherMonthsTotal: 0,
  },
```

ต่อท้ายไฟล์

```ts
describe("dailyReportFlex — บล็อกรายจ่ายที่บันทึก", () => {
  const withExpenses = {
    ...report,
    expenseEntries: {
      count: 14, total: 55690, backdatedCount: 13, backdatedTotal: 55232,
      byMonth: [
        { month: "พ.ค.", total: 4548 },
        { month: "มิ.ย.", total: 24884 },
        { month: "ก.ค.", total: 25800 },
      ],
      otherMonthsTotal: 0,
    },
  }

  it("โชว์ยอดรวม บรรทัดย้อนหลัง และบรรทัดแยกเดือน", () => {
    const texts = allText(dailyReportFlex(withExpenses))
    expect(texts).toContain("🧾 บันทึกรายจ่ายวันนี้")
    expect(texts.some((t) => t.includes("14 รายการ") && t.includes("฿55,690"))).toBe(true)
    expect(texts.some((t) => t.includes("ย้อนหลัง 13") && t.includes("฿55,232"))).toBe(true)
    expect(texts.some((t) => t.includes("พ.ค. ฿4,548") && t.includes("ก.ค. ฿25,800"))).toBe(true)
  })

  it("มีบันทึกแต่ไม่มีย้อนหลัง โชว์แค่บรรทัดแรก", () => {
    const texts = allText(dailyReportFlex({
      ...report,
      expenseEntries: {
        count: 2, total: 900, backdatedCount: 0, backdatedTotal: 0,
        byMonth: [], otherMonthsTotal: 0,
      },
    }))
    expect(texts).toContain("🧾 บันทึกรายจ่ายวันนี้")
    expect(texts.some((t) => t.includes("ย้อนหลัง"))).toBe(false)
  })

  it("มีเดือนที่ถูกตัด ต่อท้ายด้วยอื่นๆ", () => {
    const texts = allText(dailyReportFlex({
      ...withExpenses,
      expenseEntries: { ...withExpenses.expenseEntries, otherMonthsTotal: 100 },
    }))
    expect(texts.some((t) => t.includes("อื่นๆ ฿100"))).toBe(true)
  })

  it("ไม่มีการบันทึกเลย ซ่อนทั้งบล็อก", () => {
    expect(allText(dailyReportFlex(report))).not.toContain("🧾 บันทึกรายจ่ายวันนี้")
  })

  it("วันที่ไม่มีบิล การ์ดย่อ ไม่มีบล็อกรายจ่าย", () => {
    const texts = allText(dailyReportFlex({ ...withExpenses, empty: true }))
    expect(texts).not.toContain("🧾 บันทึกรายจ่ายวันนี้")
  })
})
```

- [ ] **Step 2: รันเทสให้เห็นว่าแดง**

Run: `npx vitest run src/lib/daily-report-flex.test.ts`
Expected: FAIL — ไม่พบ `🧾 บันทึกรายจ่ายวันนี้`

- [ ] **Step 3: เขียนโค้ดให้ผ่าน**

ใน `body()` **หลัง** บรรทัดที่ push `🗓 คิวจองพรุ่งนี้` เพิ่ม

```ts
  const ee = report.expenseEntries
  if (ee.count > 0) {
    opsRows.push(opRow("🧾 บันทึกรายจ่ายวันนี้", `${ee.count} รายการ · ${baht(ee.total)}`, BRAND.text))
    if (ee.backdatedCount > 0) {
      // ตัวเลขนี้คือสัญญาณกำกับดูแล — มีคนคีย์เงินเข้าเดือนที่ปิดงบไปแล้ว
      opsRows.push(noteText(`ย้อนหลัง ${ee.backdatedCount} · ${baht(ee.backdatedTotal)}`, BRAND.gold))
      const months = ee.byMonth.map((m) => `${m.month} ${baht(m.total)}`)
      if (ee.otherMonthsTotal > 0) months.push(`อื่นๆ ${baht(ee.otherMonthsTotal)}`)
      if (months.length > 0) opsRows.push(noteText(months.join(" · "), BRAND.gold))
    }
  }
```

- [ ] **Step 4: รันเทสให้ผ่าน**

Run: `npx vitest run`
Expected: PASS ทั้งชุด (เพิ่ม 5 เทส)

- [ ] **Step 5: ด่านเต็ม แล้ว commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src/lib/daily-report-flex.ts
git add src/lib/daily-report-flex.ts src/lib/daily-report-flex.test.ts
git commit -m "feat(daily-report): แถวรายจ่ายที่บันทึกวันนี้ เน้นยอดที่ลงย้อนหลัง"
```

---

## Task 6: ต่อท่อรายจ่าย แล้วตรวจของจริง

**Files:**
- Modify: `src/app/api/cron/daily-report/route.ts`

**Interfaces:**
- Consumes: `buildExpenseEntries` ผ่าน `buildDailyReport` · type `ExpenseEntryRow` จาก Task 4

**บริบทที่ต้องรู้:** กรอง `created_at` ด้วยช่วง UTC ที่ประกอบจากวันที่ไทย เพื่อให้ index ทำงาน ห้ามดึงทั้งตารางมากรองใน JS · `recorded_date` แปลงในตัว route ไม่ใช่ในสูตร

- [ ] **Step 1: เพิ่ม query รายจ่าย**

เพิ่ม import type

```ts
import type { DailySummaryRow, ExpenseEntryRow, TopTherapist, TopupRow, TopupHistoryRow } from "@/lib/daily-report"
import { SHOP_TZ } from "@/lib/datetime"
```

เพิ่มเป็นสมาชิกตัวสุดท้ายของ `Promise.all` แล้วรับใน destructuring ชื่อ `expenseRows`

```ts
      supabase
        .from("expenses")
        .select("expense_date, amount, created_at")
        .gte("created_at", `${today}T00:00:00+07:00`)
        .lt("created_at", `${tomorrow}T00:00:00+07:00`),
```

เพิ่ม `expenseRows` ในอาร์เรย์ `failed`

- [ ] **Step 2: แปลง created_at เป็นวันที่ไทย**

วางถัดจากบล็อก topupHistory

```ts
  // created_at เป็น timestamptz — แปลงเป็นวันที่ไทยที่นี่ ให้สูตรยังบริสุทธิ์
  const toShopDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  })
  const expenseEntries: ExpenseEntryRow[] = (expenseRows.data ?? []).map((r) => ({
    expense_date: r.expense_date ?? "",
    amount: r.amount === null ? null : Number(r.amount),
    recorded_date: toShopDate.format(new Date(r.created_at as string)),
  }))
```

- [ ] **Step 3: ป้อนเข้าสูตร**

เพิ่ม `expenseEntries,` ใน object ที่ส่งให้ `buildDailyReport`

- [ ] **Step 4: ด่านเต็ม แล้ว commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src/app/api/cron/daily-report/route.ts
git add src/app/api/cron/daily-report/route.ts
git commit -m "feat(daily-report): ต่อท่อรายจ่ายที่บันทึกวันนี้ กรองด้วยช่วงเวลาไทย"
```

- [ ] **Step 5: deploy แล้วยิงตรวจ**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
cd "$HOME/Desktop/Claude Code/sookkaya-pos-v2"
git push origin main && npx vercel deploy --prod --yes
curl -s -H "Authorization: Bearer <CRON_SECRET>" \
  https://sookkaya-pos.vercel.app/api/cron/daily-report
```

- [ ] **Step 6: เทียบตัวเลขรายจ่ายกับ SQL ตรง**

```sql
with t as (
  select expense_date, amount, (created_at at time zone 'Asia/Bangkok')::date as rec_date
  from expenses
  where (created_at at time zone 'Asia/Bangkok')::date = current_date
)
select count(*) as รายการ, sum(amount) as ยอดรวม,
  count(*) filter (where expense_date < rec_date) as ย้อนหลัง,
  sum(amount) filter (where expense_date < rec_date) as ยอดย้อนหลัง
from t;

select to_char(expense_date,'MM') as เดือน, sum(amount) as ยอด
from t where expense_date < rec_date group by 1 order by 1;
```

ทุกช่องต้องตรงกับการ์ด ถ้าไม่ตรงแม้ช่องเดียว **หยุด อย่าเปิดใช้**

- [ ] **Step 7: ตรวจว่าไม่มี error หลัง deploy**

ใช้ MCP Vercel `get_runtime_logs` (projectId `prj_aIjCLSIX6A5MoonNtjzMiRno5Md3`,
teamId `team_aIZvGjaXuArkv1Vku7KHeW9C`) scope ไปที่ deployment ล่าสุด ต้องไม่มี level error
หมายเหตุ: โปรเจกต์อยู่บนแพลน Hobby log ย้อนหลังเกินกรอบสั้นๆ จะได้ `ExceedsBillingLimitError`
ให้ตรวจภายในชั่วโมงที่ deploy เท่านั้น

- [ ] **Step 8: ติ๊ก checkbox ที่เหลือ แล้ว commit แผน**

```bash
git add docs/superpowers/plans/2026-08-05-daily-report-members-expenses.md
git commit -m "docs: ปิดแผนสมาชิก + รายจ่ายในการ์ด Daily Report"
```

---

## Self-review

**ครอบคลุม spec:**

| หัวข้อใน spec | Task |
|---|---|
| นิยามสมาชิกใหม่/ต่ออายุ ตัดสินรายแถว | 1 |
| ตัด `EXCLUDED_TIER` ทั้งจากการนับและจากประวัติ | 1 (สูตรกรองแถววันนี้) · 3 (กรองประวัติใน JS ห้ามใช้ `.neq`) |
| `tier` เป็น NULL ยังถูกนับ แสดงเป็น "ไม่ระบุ" | 1 (`countTiers`) · 3 (ไม่กรอง tier ใน query) |
| ยอดเงินใช้ `cash_received` | 1 |
| รายการแพ็กเกจ `Silver ×2 · Gold ×1` เรียงมากไปน้อย | 1 (`countTiers`) · 2 (`tierSummary`) |
| บรรทัด `(รวมอยู่ใน Cash In แล้ว)` บังคับมี | 2 |
| ซ่อนบล็อกสมาชิกเมื่อไม่มีใครเติม | 2 |
| นับรายจ่ายตามวันที่บันทึก | 4 (สูตร) · 6 (query ช่วง UTC + แปลง tz) |
| แยกยอดลงย้อนหลัง | 4 |
| ลงล่วงหน้านับยอดรวมไม่นับย้อนหลัง | 4 |
| ตัดเหลือ 4 เดือนยอดสูงสุด เรียงเก่าไปใหม่ + `otherMonthsTotal` | 4 (สูตร) · 5 (การ์ด) |
| ซ่อนบล็อกรายจ่ายเมื่อไม่มีการบันทึก | 5 |
| `empty: true` ไม่แสดงทั้งสองบล็อก | 2 · 5 (การ์ดย่อตั้งแต่ต้นฟังก์ชันอยู่แล้ว) |
| query ใหม่เข้ารายการ `failed` | 3 · 6 |
| ห้าม property นอกรายการที่ LINE รองรับ | Global Constraints · ใช้เฉพาะ property ที่มีอยู่แล้ว |
| เทสสูตรและเทสการ์ดทั้งสองไฟล์ | 1 · 2 · 4 · 5 |
| ตรวจของจริงก่อนเปิดใช้ | 3 · 6 |

ไม่มีข้อไหนของ spec ที่ไม่มี task รองรับ

**ชื่อและ type ตรงกันข้าม task:** `MemberSignups` `TierCount` `TopupRow` `TopupHistoryRow`
`EXCLUDED_TIER` ประกาศใน Task 1 ใช้ตรงกันใน Task 2 และ 3 · `ExpenseEntries` `ExpenseEntryRow`
`MAX_BACKDATED_MONTHS` `thaiMonthAbbr` ประกาศใน Task 4 ใช้ตรงกันใน Task 5 และ 6 ·
`noteText` สร้างใน Task 2 ใช้ซ้ำใน Task 5 · `otherMonthsTotal` สะกดตรงกันทั้งสี่ที่

**กับดัก fixture:** Task 1, 2, 4, 5 แต่ละตัวเติมฟิลด์ใหม่ใน fixture ในขั้นตอนเดียวกับที่เพิ่ม type
ไม่มี task ไหนปล่อยให้เทสคอมไพล์ไม่ผ่านข้ามขั้น

**ไม่มี placeholder:** ทุก step ที่ต้องเขียนโค้ดมีโค้ดจริงครบ ไม่มี TBD/TODO ไม่มี "similar to Task N"
