# จัดหน้ารายจ่ายใหม่ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** จัดหน้า `/expenses` ใหม่ให้รายการได้พื้นที่เต็ม สรุปหมวดเป็นกราฟวงกลมด้านข้าง และเปลี่ยนเดือนด้วยชิพแทนปุ่มลูกศร

**Architecture:** สูตรล้วนสองตัว (`donutSlices`, `recentMonths`) อยู่ใน lib มีเทสคุม · component วาดวงกลมและแถบเลือกช่วงเป็น client แยกไฟล์ · `page.tsx` เป็น server component ที่ query แล้วส่งข้อมูลพร้อมใช้ (คำนวณ href/สีให้เสร็จก่อนส่ง เพราะส่งฟังก์ชันข้าม server→client ไม่ได้)

**Tech Stack:** Next.js 16 App Router (server component + client component), Tailwind, shadcn Dialog, vitest

**Spec:** `docs/superpowers/specs/2026-08-05-expenses-page-redesign-design.md`

## Global Constraints

- โปรเจกต์นี้เป็น Next.js เวอร์ชันที่ API ต่างจากที่โมเดลเคยเห็น — อ่าน `node_modules/next/dist/docs/` ก่อนเขียนโค้ดที่แตะ page/searchParams
- ห้ามใส่ `"use client"` ในไฟล์ใต้ `src/lib/` และห้าม export util จากไฟล์ที่เป็น client component
- **ห้ามส่งฟังก์ชันจาก server component ไป client component** — คำนวณ `href` และ `color` ให้เสร็จฝั่ง server แล้วส่งเป็นข้อมูล
- ก่อนรันคำสั่ง node/npm ทุกครั้ง: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"`
- ด่านก่อน commit: `npx tsc --noEmit && npx eslint src/ && npx vitest run` (ถ้า tsc ฟ้อง LayoutRoutes/validator ให้ `rm -rf .next` ก่อน) — eslint มี warning เดิม 2 ตัวใน `payments.test.ts` ปล่อยไว้ ห้ามแก้
- เทสรวมปัจจุบัน **485 ข้อ** ต้องไม่พังสักข้อ
- ทำงานบน branch `feat/expenses-page-redesign` (มี commit spec แล้ว) ห้าม deploy จนกว่าจะถึง Task 5
- ข้อความบนหน้าจอเป็นภาษาไทยทั้งหมด · เงินแสดงด้วย `formatBaht()` จาก `@/lib/constants`

---

## โครงไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/chart.ts` | **แก้** เพิ่ม `donutSlices()` — สูตรแบ่งสัดส่วนวงกลม ไม่แตะ DOM |
| `src/lib/chart.test.ts` | **แก้** เทส `donutSlices` |
| `src/lib/month.ts` | **แก้** เพิ่ม `recentMonths()` |
| `src/lib/month.test.ts` | **แก้** เทส `recentMonths` |
| `src/components/charts/donut-chart.tsx` | **สร้าง** client · วาดวงกลมจาก slices ที่มี href/สีมาแล้ว |
| `src/app/(app)/expenses/period-picker.tsx` | **สร้าง** client · ชิพเดือน + ชิพช่วง + ปฏิทินเลือกเดือนอื่น |
| `src/app/(app)/expenses/expense-dialog.tsx` | **สร้าง** client · ปุ่ม + Dialog ห่อ ExpenseForm |
| `src/app/(app)/expenses/expense-form.tsx` | **แก้** เพิ่ม prop `onSaved?` หนึ่งตัว |
| `src/app/(app)/expenses/page.tsx` | **แก้ทั้งไฟล์** layout ใหม่ · รองรับ `?months=` · เอา Tabs และ `max-w-3xl` ออก |

---

### Task 1: สูตรวงกลม `donutSlices()`

**Files:**
- Modify: `src/lib/chart.ts` (เพิ่มท้ายไฟล์)
- Test: `src/lib/chart.test.ts` (เพิ่ม describe ใหม่ท้ายไฟล์)

**Interfaces:**
- Consumes: `Point` (`{ label: string; value: number }`) ที่ประกาศไว้บรรทัดแรกของ `chart.ts` แล้ว
- Produces:
  ```ts
  export type DonutSlice = { label: string; value: number; pct: number; startPct: number }
  export const DONUT_MIN_PCT = 5
  export const DONUT_OTHER_LABEL = "อื่นๆ"
  export function donutSlices(points: Point[], minPct?: number): DonutSlice[]
  ```

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

เพิ่มท้าย `src/lib/chart.test.ts` (เก็บ import เดิมไว้ เพิ่มชื่อที่ต้องใช้เข้าไปในบรรทัด import ที่มีอยู่):

```ts
describe("donutSlices — สัดส่วนกราฟวงกลมสรุปหมวดรายจ่าย", () => {
  it("เรียงจากมากไปน้อย และ pct รวมกันได้ 100", () => {
    const s = donutSlices([
      { label: "ข", value: 30 },
      { label: "ก", value: 70 },
    ])
    expect(s.map((x) => x.label)).toEqual(["ก", "ข"])
    expect(s.reduce((sum, x) => sum + x.pct, 0)).toBeCloseTo(100, 6)
  })

  it("startPct สะสมต่อกัน ชิ้นแรกเริ่มที่ 0", () => {
    const s = donutSlices([
      { label: "ก", value: 50 },
      { label: "ข", value: 30 },
      { label: "ค", value: 20 },
    ])
    expect(s.map((x) => x.startPct)).toEqual([0, 50, 80])
  })

  it("ชิ้นที่เล็กกว่าเกณฑ์ยุบเป็นอื่นๆ ต่อท้ายเสมอ", () => {
    const s = donutSlices([
      { label: "ก", value: 90 },
      { label: "ข", value: 6 },
      { label: "ค", value: 3 },
      { label: "ง", value: 1 },
    ])
    expect(s.map((x) => x.label)).toEqual(["ก", "ข", DONUT_OTHER_LABEL])
    expect(s[2].value).toBe(4)
  })

  // เคสจริงเดือน มิ.ย. 69: มีหมวดชื่อ "อื่นๆ" อยู่แล้ว ถ้าสร้างชิ้นใหม่ชื่อซ้ำ
  // legend จะมีสองบรรทัดชื่อเดียวกัน กดกรองแล้วงง
  it("หมวดชื่ออื่นๆ ที่มีอยู่แล้วต้องรวมเป็นก้อนเดียว ไม่แตกสองชิ้น", () => {
    const s = donutSlices([
      { label: "ค่ามือหมอ", value: 141735 },
      { label: "เงินเดือนประจำ", value: 52450 },
      { label: "ค่าเช่า", value: 36000 },
      { label: DONUT_OTHER_LABEL, value: 30320 },
      { label: "การตลาด", value: 20400 },
      { label: "วัสดุ", value: 18843.15 },
      { label: "ค่าน้ำค่าไฟ", value: 16197.53 },
      { label: "ซักรีด", value: 9900 },
    ])
    // 8 หมวด → 6 ผ่านเกณฑ์ (รวม "อื่นๆ" เดิม) → 2 ที่ตกเกณฑ์ยุบเข้าก้อนเดิม ไม่เกิดชิ้นใหม่
    expect(s).toHaveLength(6)
    expect(s.filter((x) => x.label === DONUT_OTHER_LABEL)).toHaveLength(1)
    const other = s.find((x) => x.label === DONUT_OTHER_LABEL)!
    // 30,320 เดิม + ค่าน้ำค่าไฟ 16,197.53 (4.97%) + ซักรีด 9,900 (3.04%)
    expect(other.value).toBeCloseTo(56417.53, 2)
    expect(other.pct).toBeCloseTo(17.314, 3)
    // ชิ้นที่ยุบต้องไม่เหลืออยู่แยกอีก
    expect(s.map((x) => x.label)).not.toContain("ซักรีด")
    expect(s.map((x) => x.label)).not.toContain("ค่าน้ำค่าไฟ")
  })

  // จับเส้นแบ่ง 5% ตรงๆ ด้วยตัวเลขกลมๆ — ไม่ผูกกับสัดส่วนข้อมูลจริงซึ่งเปลี่ยนได้ทุกเดือน
  // (ห้ามเอาข้อมูลจริงมาตัดบางหมวดออกเพื่อทดสอบเส้นแบ่ง เพราะยอดรวมเปลี่ยน สัดส่วนขยับหมด)
  it("5.01% อยู่ต่อ · 4.99% ถูกยุบ", () => {
    const s = donutSlices([
      { label: "ก", value: 9000 },
      { label: "ข", value: 501 },
      { label: "ค", value: 499 },
    ])
    expect(s.map((x) => x.label)).toEqual(["ก", "ข", DONUT_OTHER_LABEL])
    expect(s[2].value).toBe(499)
  })

  it("ยุบแล้วจะเหลือชิ้นเดียวชื่ออื่นๆ = ไม่ยุบ", () => {
    const s = donutSlices([
      { label: "ก", value: 4 },
      { label: "ข", value: 3 },
      { label: "ค", value: 3 },
    ])
    expect(s.map((x) => x.label)).toEqual(["ก", "ข", "ค"])
  })

  it("ค่า 0 และติดลบถูกตัดทิ้ง", () => {
    const s = donutSlices([
      { label: "ก", value: 100 },
      { label: "ข", value: 0 },
      { label: "ค", value: -50 },
    ])
    expect(s.map((x) => x.label)).toEqual(["ก"])
    expect(s[0].pct).toBe(100)
  })

  it("ไม่มีข้อมูลหรือรวมเป็นศูนย์ คืนอาเรย์ว่าง", () => {
    expect(donutSlices([])).toEqual([])
    expect(donutSlices([{ label: "ก", value: 0 }])).toEqual([])
  })

  it("ปรับเกณฑ์ได้ผ่านพารามิเตอร์", () => {
    const s = donutSlices([{ label: "ก", value: 92 }, { label: "ข", value: 8 }], 10)
    expect(s.map((x) => x.label)).toEqual(["ก", DONUT_OTHER_LABEL])
  })

  it("ค่าคงที่อ่านได้ ไม่ใช่เลขลอยในโค้ด", () => {
    expect(DONUT_MIN_PCT).toBe(5)
  })
})
```

- [ ] **Step 2: รันเทสให้เห็นว่าแดง**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx vitest run src/lib/chart.test.ts
```
คาดว่า FAIL — `donutSlices is not a function` / import ไม่เจอ

- [ ] **Step 3: เขียนโค้ดให้ผ่าน**

เพิ่มท้าย `src/lib/chart.ts`:

```ts
/** ชิ้นหนึ่งของกราฟวงกลม — pct คือสัดส่วน startPct คือ % สะสมก่อนหน้าชิ้นนี้ */
export type DonutSlice = {
  label: string
  value: number
  pct: number
  startPct: number
}

/** ชิ้นที่เล็กกว่านี้ยุบรวมกัน — วงกลมที่มีเส้นบางเฉียบอ่านไม่ออกและกดไม่โดน */
export const DONUT_MIN_PCT = 5

/** ชื่อก้อนรวม — ตรงกับชื่อหมวดจริงในระบบ จะได้กดกรองแล้วเจอของ */
export const DONUT_OTHER_LABEL = "อื่นๆ"

export function donutSlices(points: Point[], minPct = DONUT_MIN_PCT): DonutSlice[] {
  const positive = points.filter((p) => p.value > 0)
  const total = positive.reduce((sum, p) => sum + p.value, 0)
  if (total <= 0) return []

  const sorted = [...positive].sort((a, b) => b.value - a.value)
  const big = sorted.filter((p) => (p.value / total) * 100 >= minPct)
  const small = sorted.filter((p) => (p.value / total) * 100 < minPct)

  // ยุบแล้วเหลือชิ้นเดียวชื่อ "อื่นๆ" ไม่ได้บอกอะไรเลย — แสดงตามจริงดีกว่า
  const shouldGroup = small.length > 0 && big.length > 0

  let merged: { label: string; value: number }[]
  if (shouldGroup) {
    const otherValue = small.reduce((sum, p) => sum + p.value, 0)
    // หมวดชื่อ "อื่นๆ" ที่ใหญ่พออยู่แล้วต้องรวมเข้าก้อนเดียวกัน ไม่งั้น legend มีสองบรรทัดชื่อซ้ำ
    const existing = big.find((p) => p.label === DONUT_OTHER_LABEL)
    if (existing) {
      merged = big.map((p) =>
        p.label === DONUT_OTHER_LABEL ? { label: p.label, value: p.value + otherValue } : p
      )
    } else {
      merged = [...big, { label: DONUT_OTHER_LABEL, value: otherValue }]
    }
  } else {
    merged = sorted
  }

  // ชิ้น "อื่นๆ" อยู่ท้ายเสมอ ส่วนที่เหลือเรียงมากไปน้อย
  const ordered = [
    ...merged.filter((p) => p.label !== DONUT_OTHER_LABEL).sort((a, b) => b.value - a.value),
    ...merged.filter((p) => p.label === DONUT_OTHER_LABEL),
  ]

  let startPct = 0
  return ordered.map((p) => {
    const pct = (p.value / total) * 100
    const slice = { label: p.label, value: p.value, pct, startPct }
    startPct += pct
    return slice
  })
}
```

- [ ] **Step 4: รันเทสให้ผ่าน**

```bash
npx vitest run src/lib/chart.test.ts
```
คาดว่า PASS ทุกข้อ

- [ ] **Step 5: ด่านเต็ม แล้ว commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx tsc --noEmit && npx eslint src/ && npx vitest run
```

```bash
git add src/lib/chart.ts src/lib/chart.test.ts
git commit -m "feat(chart): สูตรแบ่งสัดส่วนกราฟวงกลม donutSlices"
```

---

### Task 2: `recentMonths()` + component วงกลม

**Files:**
- Modify: `src/lib/month.ts` (เพิ่มท้ายไฟล์)
- Test: `src/lib/month.test.ts` (เพิ่ม describe ท้ายไฟล์)
- Create: `src/components/charts/donut-chart.tsx`

**Interfaces:**
- Consumes: `shiftMonth(ym, delta)` ที่มีอยู่แล้วใน `month.ts` · `DonutSlice` จาก Task 1
- Produces:
  ```ts
  // src/lib/month.ts
  export function recentMonths(today: string, count: number): string[]

  // src/components/charts/donut-chart.tsx
  export type DonutSliceLink = DonutSlice & { href: string; color: string }
  export const DONUT_COLORS: string[]
  export function DonutChart(props: {
    slices: DonutSliceLink[]
    size?: number
    activeLabel?: string | null
  }): JSX.Element | null
  ```

- [ ] **Step 1: เขียนเทส `recentMonths` ที่ยังไม่ผ่าน**

เพิ่มท้าย `src/lib/month.test.ts` (เพิ่ม `recentMonths` เข้าไปในบรรทัด import ที่มีอยู่):

```ts
describe("recentMonths — ชิพเลือกเดือนบนหน้ารายจ่าย", () => {
  it("คืนเดือนล่าสุดก่อน ไล่ย้อนหลังตามจำนวนที่ขอ", () => {
    expect(recentMonths("2026-08-05", 6)).toEqual([
      "2026-08", "2026-07", "2026-06", "2026-05", "2026-04", "2026-03",
    ])
  })

  it("ข้ามปีได้ถูกต้อง", () => {
    expect(recentMonths("2026-01-15", 3)).toEqual(["2026-01", "2025-12", "2025-11"])
  })

  it("ขอเดือนเดียวก็ได้", () => {
    expect(recentMonths("2026-08-05", 1)).toEqual(["2026-08"])
  })

  it("ขอ 0 หรือติดลบ คืนอาเรย์ว่าง ไม่พัง", () => {
    expect(recentMonths("2026-08-05", 0)).toEqual([])
    expect(recentMonths("2026-08-05", -3)).toEqual([])
  })
})
```

- [ ] **Step 2: รันเทสให้เห็นว่าแดง**

```bash
npx vitest run src/lib/month.test.ts
```
คาดว่า FAIL — `recentMonths is not a function`

- [ ] **Step 3: เขียน `recentMonths`**

เพิ่มท้าย `src/lib/month.ts`:

```ts
/** เดือนล่าสุดไล่ย้อนหลัง count เดือน ใหม่สุดอยู่หน้าสุด — ใช้ทำชิพเลือกเดือน */
export function recentMonths(today: string, count: number): string[] {
  const start = today.slice(0, 7)
  return Array.from({ length: Math.max(0, count) }, (_, i) => shiftMonth(start, -i))
}
```

- [ ] **Step 4: รันเทสให้ผ่าน**

```bash
npx vitest run src/lib/month.test.ts
```
คาดว่า PASS

- [ ] **Step 5: สร้าง component วงกลม**

สร้าง `src/components/charts/donut-chart.tsx`:

```tsx
"use client"

import Link from "next/link"

import type { DonutSlice } from "@/lib/chart"

/** ชิ้นที่พร้อมวาดแล้ว — href กับสีคำนวณมาจากฝั่ง server (ส่งฟังก์ชันข้ามมาไม่ได้) */
export type DonutSliceLink = DonutSlice & { href: string; color: string }

/** สีวนตามลำดับชิ้น ไม่ผูกกับชื่อหมวด เพราะหมวดแก้ชื่อได้จากหน้าตั้งค่า */
export const DONUT_COLORS = [
  "#7F77DD", "#1D9E75", "#D85A30", "#378ADD",
  "#BA7517", "#D4537E", "#639922", "#888780",
]

const R = 40
const CIRC = 2 * Math.PI * R

/**
 * วงกลมสรุปสัดส่วน — แต่ละชิ้นเป็นลิงก์ กดแล้วกรองรายการตามหมวดนั้น
 * วาดด้วย stroke-dasharray บนวงกลมซ้อนกัน ไม่ใช้ arc path เพราะได้ผลเท่ากันแต่คณิตง่ายกว่า
 */
export function DonutChart({
  slices,
  size = 120,
  activeLabel = null,
}: {
  slices: DonutSliceLink[]
  size?: number
  activeLabel?: string | null
}) {
  if (slices.length === 0) return null

  return (
    <svg
      viewBox="0 0 100 100"
      style={{ width: size, height: size }}
      className="block"
      role="img"
      aria-label="สัดส่วนรายจ่ายแยกตามหมวด"
    >
      {slices.map((s) => {
        const active = activeLabel === s.label
        return (
          <Link key={s.label} href={s.href} aria-label={`${s.label} ${s.pct.toFixed(1)}%`}>
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={active ? 24 : 18}
              strokeDasharray={`${(s.pct / 100) * CIRC} ${CIRC}`}
              // −90 องศาเพื่อให้ชิ้นแรกเริ่มที่หัวนาฬิกา ไม่ใช่ 3 นาฬิกา
              transform={`rotate(${(s.startPct / 100) * 360 - 90} 50 50)`}
            />
          </Link>
        )
      })}
    </svg>
  )
}
```

- [ ] **Step 6: ด่านเต็ม แล้ว commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx tsc --noEmit && npx eslint src/ && npx vitest run
```

```bash
git add src/lib/month.ts src/lib/month.test.ts src/components/charts/donut-chart.tsx
git commit -m "feat(expenses): recentMonths + component กราฟวงกลมกดกรองได้"
```

---

### Task 3: แถบเลือกช่วง + Dialog บันทึกรายจ่าย

**Files:**
- Create: `src/app/(app)/expenses/period-picker.tsx`
- Create: `src/app/(app)/expenses/expense-dialog.tsx`
- Modify: `src/app/(app)/expenses/expense-form.tsx` (เพิ่ม prop `onSaved?` เท่านั้น)

**Interfaces:**
- Consumes: `monthShortLabel(ym)` และ `recentMonths(today, count)` จาก `@/lib/month` · `ExpenseForm` จาก `./expense-form` · `Button` `Dialog*` จาก `@/components/ui/*`
- Produces:
  ```ts
  export function PeriodPicker(props: {
    months: string[]          // ชิพเดือน ใหม่สุดหน้าสุด
    activeMonth: string | null // เดือนที่เลือกอยู่ (null เมื่ออยู่โหมดรวมช่วง)
    activeRange: number | null // 3 หรือ 6 เมื่ออยู่โหมดรวมช่วง ไม่งั้น null
  }): JSX.Element

  export function ExpenseDialog(props: {
    categories: string[]
    today: string
  }): JSX.Element
  ```

**บริบทที่ต้องรู้:** ปุ่ม/ชิพต้องเปลี่ยน URL ไม่ใช่ state ภายใน เพราะ `page.tsx` เป็น server component ที่อ่านค่าจาก `searchParams` — ใช้ `<Link>` ธรรมดา ยกเว้นช่องปฏิทินที่ต้อง `router.push` เพราะเป็น `onChange`

- [ ] **Step 1: เพิ่ม prop `onSaved` ให้ ExpenseForm**

แก้ `src/app/(app)/expenses/expense-form.tsx` สองจุด — **ห้ามแตะตรรกะอื่น**

จุดที่ 1 บรรทัด 13-19 เปลี่ยนเป็น:
```tsx
export function ExpenseForm({
  categories,
  today,
  onSaved,
}: {
  categories: string[]
  today: string
  /** เรียกเมื่อบันทึกสำเร็จ — ใช้ปิด dialog จากข้างนอก */
  onSaved?: () => void
}) {
```

จุดที่ 2 ในกิ่งที่บันทึกสำเร็จ ต่อจาก `router.refresh()`:
```tsx
        router.refresh()
        onSaved?.()
```

- [ ] **Step 2: สร้าง Dialog บันทึกรายจ่าย**

สร้าง `src/app/(app)/expenses/expense-dialog.tsx`:

```tsx
"use client"

import { useState } from "react"

import { ExpenseForm } from "./expense-form"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

/** ปุ่มบันทึกรายจ่าย — เดิมเป็นแท็บกินพื้นที่บนสุดตลอด ทั้งที่ส่วนใหญ่เข้ามาดูรายการ */
export function ExpenseDialog({
  categories,
  today,
}: {
  categories: string[]
  today: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">+ บันทึกรายจ่าย</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>บันทึกรายจ่าย</DialogTitle>
        </DialogHeader>
        <ExpenseForm categories={categories} today={today} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: สร้างแถบเลือกช่วง**

สร้าง `src/app/(app)/expenses/period-picker.tsx`:

```tsx
"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { monthShortLabel } from "@/lib/month"
import { Input } from "@/components/ui/input"

const CHIP = "rounded-md px-3 py-1.5 text-sm whitespace-nowrap"
const CHIP_ON = `${CHIP} bg-slate-900 text-white`
const CHIP_OFF = `${CHIP} border border-slate-200 text-slate-700 hover:bg-slate-50`

/**
 * เลือกช่วงที่จะดู — สองแถวแยกกันชัดเพื่อให้รู้เสมอว่ากำลังดูอะไร
 * แถวบนดูทีละเดือน แถวล่างดูรวมหลายเดือน
 */
export function PeriodPicker({
  months,
  activeMonth,
  activeRange,
}: {
  months: string[]
  activeMonth: string | null
  activeRange: number | null
}) {
  const router = useRouter()

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-sm text-slate-500">ดูทีละเดือน</span>
        {months.map((m) => (
          <Link
            key={m}
            href={`/expenses?month=${m}`}
            className={activeMonth === m ? CHIP_ON : CHIP_OFF}
          >
            {monthShortLabel(m)}
          </Link>
        ))}
        <Input
          type="month"
          aria-label="เลือกเดือนอื่น"
          className="h-8 w-auto text-sm"
          onChange={(e) => {
            if (e.target.value) router.push(`/expenses?month=${e.target.value}`)
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-sm text-slate-500">ดูรวมช่วง</span>
        {[3, 6].map((n) => (
          <Link
            key={n}
            href={`/expenses?months=${n}`}
            className={activeRange === n ? CHIP_ON : CHIP_OFF}
          >
            {n} เดือน
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: ด่านเต็ม แล้ว commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx tsc --noEmit && npx eslint src/ && npx vitest run
```

```bash
git add "src/app/(app)/expenses/period-picker.tsx" "src/app/(app)/expenses/expense-dialog.tsx" "src/app/(app)/expenses/expense-form.tsx"
git commit -m "feat(expenses): แถบเลือกช่วงแบบชิพ + dialog บันทึกรายจ่าย"
```

---

### Task 4: ประกอบหน้าใหม่

**Files:**
- Modify: `src/app/(app)/expenses/page.tsx` (เขียนใหม่ทั้งไฟล์)

**Interfaces:**
- Consumes: `PeriodPicker` และ `ExpenseDialog` จาก Task 3 · `DonutChart` `DonutSliceLink` `DONUT_COLORS` จาก Task 2 · `donutSlices` จาก Task 1 · `recentMonths` `monthLabel` `monthShortLabel` `shiftMonth` `daysInMonth` จาก `@/lib/month` · `ExpenseRowActions` เดิม (ไม่แตะ)
- Produces: หน้า `/expenses` ที่รับ `?month=` `?months=` `?category=`

**บริบทที่ต้องรู้:**
- ไฟล์เดิมมี `FALLBACK_CATEGORIES` และการอ่าน `settings.expense_categories` — **เก็บไว้ทั้งหมด** ย้ายมาไฟล์ใหม่ตามเดิม
- `expenses.amount` เป็น numeric ของ Postgres → มาเป็น string ต้อง `Number()` เสมอ
- `limit(300)` เดิมไม่พอโหมด 6 เดือน ขยายเป็น 1000 และเตือนเมื่อชนเพดาน

- [ ] **Step 1: เขียนหน้าใหม่ทั้งไฟล์**

เขียนทับ `src/app/(app)/expenses/page.tsx`:

```tsx
import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { formatBaht } from "@/lib/constants"
import { formatThaiDate, todayInShopTz } from "@/lib/datetime"
import { daysInMonth, monthLabel, monthShortLabel, recentMonths, shiftMonth } from "@/lib/month"
import { donutSlices } from "@/lib/chart"
import { DonutChart, DONUT_COLORS, type DonutSliceLink } from "@/components/charts/donut-chart"
import { ExpenseDialog } from "./expense-dialog"
import { ExpenseRowActions } from "./expense-row-actions"
import { PeriodPicker } from "./period-picker"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export const metadata = { title: "รายจ่าย · สุขกายา POS" }

/** จำนวนชิพเดือนที่โชว์ ที่เหลือย้อนผ่านช่องปฏิทิน */
const MONTH_CHIPS = 6
/** เพดานแถวที่ดึง — 6 เดือนราว 200 แถว เผื่อโตไว้ถึงสิ้นปี */
const ROW_LIMIT = 1000

const FALLBACK_CATEGORIES = [
  "ซักรีด",
  "ค่าเช่าสถานที่",
  "ค่าน้ำ / ค่าไฟ / Internet",
  "วัสดุ-สิ้นเปลือง (น้ำมัน บาล์ม ฯลฯ)",
  "การตลาด / โฆษณา",
  // ค่ามือหมออยู่หมวดนี้หมวดเดียว — เงินเดือนพนักงานประจำต้องแยก ไม่งั้นกำไรทางบัญชี
  // จะไม่หักเงินเดือน (สูตรตัดทั้งหมวดนี้ออกเพื่อกันนับค่ามือซ้ำ)
  "HR / payroll (ค่ามือหมอ)",
  "เงินเดือนพนักงานประจำ",
  "ชุดลูกค้า ชุดหมอ ชุดพนักงาน",
  "อื่นๆ",
]

function lastDayOf(month: string): string {
  return `${month}-${String(daysInMonth(month)).padStart(2, "0")}`
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; months?: string; category?: string }>
}) {
  const supabase = await createClient()
  const today = todayInShopTz()
  const params = await searchParams

  // โหมดรวมช่วงชนะเสมอเมื่อส่งมาถูกต้อง — ค่าอื่นถือว่าไม่ได้ส่ง
  const range = params.months === "3" ? 3 : params.months === "6" ? 6 : null
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : today.slice(0, 7)
  const pickedCategory = params.category?.trim() || null

  const endMonth = range ? today.slice(0, 7) : month
  const startMonth = range ? shiftMonth(endMonth, -(range - 1)) : month
  const from = `${startMonth}-01`
  const to = lastDayOf(endMonth)

  const periodLabel = range
    ? `${monthShortLabel(startMonth)} – ${monthShortLabel(endMonth)}`
    : monthLabel(month)

  const [{ data: setting }, { data: expenses }] = await Promise.all([
    supabase.from("settings").select("value").eq("key", "expense_categories").single(),
    supabase
      .from("expenses")
      .select("*")
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("expense_date", { ascending: false })
      .limit(ROW_LIMIT),
  ])

  const categories = setting?.value
    ? setting.value.split(",").map((c) => c.trim())
    : FALLBACK_CATEGORIES

  const rows = expenses ?? []
  const hitLimit = rows.length === ROW_LIMIT

  // วงกลมคิดจากทั้งช่วงเสมอ ไม่ใช่เฉพาะหมวดที่กรอง ไม่งั้นเหลือชิ้นเดียว 100% ไร้ประโยชน์
  const byCategory = rows.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount)
    return acc
  }, {})

  const visibleRows = pickedCategory
    ? rows.filter((e) => e.category === pickedCategory)
    : rows
  const visibleTotal = visibleRows.reduce((sum, e) => sum + Number(e.amount), 0)

  const baseQuery = range ? `?months=${range}` : `?month=${month}`
  const hrefFor = (category: string) =>
    category === pickedCategory
      ? baseQuery
      : `${baseQuery}&category=${encodeURIComponent(category)}`

  const slices: DonutSliceLink[] = donutSlices(
    Object.entries(byCategory).map(([label, value]) => ({ label, value }))
  ).map((s, i) => ({
    ...s,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
    href: hrefFor(s.label),
  }))

  // โหมดรวมช่วงคั่นหัวข้อเดือน ไม่งั้น 200 แถวเรียงรวดเดียวหาอะไรไม่เจอ
  const groups = range
    ? Array.from(
        visibleRows.reduce((map, e) => {
          const m = e.expense_date.slice(0, 7)
          map.set(m, [...(map.get(m) ?? []), e])
          return map
        }, new Map<string, typeof visibleRows>())
      ).sort((a, b) => b[0].localeCompare(a[0]))
    : [[endMonth, visibleRows] as const]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-bold">รายจ่าย</h1>
        <ExpenseDialog categories={categories} today={today} />
      </div>

      <Card>
        <CardContent className="py-4">
          <PeriodPicker
            months={recentMonths(today, MONTH_CHIPS)}
            activeMonth={range ? null : month}
            activeRange={range}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <div className="space-y-3 lg:order-1">
          {pickedCategory && (
            <div className="flex items-center justify-between gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm">
              <span className="truncate text-slate-600">
                กำลังดูเฉพาะหมวด <span className="font-medium">{pickedCategory}</span>
              </span>
              <Link href={baseQuery} className="shrink-0 underline">
                ดูทุกหมวด
              </Link>
            </div>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                รายการ
                <span className="ml-1 text-sm font-normal text-slate-500">
                  ({visibleRows.length} รายการ)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {visibleRows.length === 0 ? (
                <p className="px-6 py-6 text-center text-sm text-slate-500">
                  {pickedCategory
                    ? `ไม่มีรายจ่ายหมวด ${pickedCategory} ในช่วงนี้`
                    : "ยังไม่มีรายจ่ายในช่วงนี้"}
                </p>
              ) : (
                groups.map(([groupMonth, groupRows]) => (
                  <div key={groupMonth}>
                    {range && (
                      <div className="flex justify-between gap-2 border-y bg-slate-50 px-4 py-1.5 text-xs font-medium text-slate-600 sm:px-6">
                        <span>{monthLabel(groupMonth)}</span>
                        <span>
                          {formatBaht(groupRows.reduce((s, e) => s + Number(e.amount), 0))} ฿
                        </span>
                      </div>
                    )}
                    <ul className="divide-y">
                      {groupRows.map((e) => (
                        <li
                          key={e.id}
                          className="flex items-start justify-between gap-3 px-4 py-3 sm:px-6"
                        >
                          <div className="min-w-0">
                            <p className="font-medium">{e.item}</p>
                            <p className="text-xs text-slate-500">
                              {formatThaiDate(e.expense_date)}
                              {e.paid_by && ` · จ่ายโดย ${e.paid_by}`}
                            </p>
                            <Badge variant="outline" className="mt-1 text-xs">
                              {e.category}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-semibold whitespace-nowrap">
                              {formatBaht(Number(e.amount))} ฿
                            </span>
                            <ExpenseRowActions
                              expense={{
                                id: e.id,
                                expense_date: e.expense_date,
                                item: e.item,
                                category: e.category,
                                amount: Number(e.amount),
                                paid_by: e.paid_by,
                                notes: e.notes,
                              }}
                              categories={categories}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
              {hitLimit && (
                <p className="px-6 py-3 text-center text-xs text-amber-700">
                  แสดงได้สูงสุด {ROW_LIMIT} รายการ ช่วงนี้มีมากกว่านั้น — ยอดรวมและกราฟคิดจากที่แสดงเท่านั้น
                  ลองเลือกช่วงให้สั้นลง
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3 lg:order-2 lg:sticky lg:top-4 lg:self-start">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4">
              <p className="text-sm font-medium">
                รายจ่าย {periodLabel}
                {pickedCategory && ` · ${pickedCategory}`}
              </p>
              <p className="text-2xl font-bold text-red-800">{formatBaht(visibleTotal)} ฿</p>
            </CardContent>
          </Card>

          {slices.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">แยกตามหมวดหมู่</CardTitle>
                <p className="text-xs text-slate-500">กดที่ชิ้นหรือชื่อหมวดเพื่อกรองรายการ</p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 lg:flex-col">
                  <DonutChart slices={slices} size={120} activeLabel={pickedCategory} />
                  <div className="w-full space-y-1.5">
                    {slices.map((s) => (
                      <Link
                        key={s.label}
                        href={s.href}
                        className="flex items-center gap-2 text-sm hover:underline"
                      >
                        <span
                          className="size-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: s.color }}
                        />
                        <span
                          className={`min-w-0 flex-1 truncate ${
                            s.label === pickedCategory ? "font-medium text-slate-900" : "text-slate-600"
                          }`}
                        >
                          {s.label}
                        </span>
                        <span className="shrink-0 text-slate-500">{s.pct.toFixed(0)}%</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: ด่านเต็มรวม build**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```
ถ้า tsc ฟ้อง LayoutRoutes หรือ validator ให้ `rm -rf .next` แล้วรันใหม่

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/expenses/page.tsx"
git commit -m "feat(expenses): จัดหน้าใหม่ รายการเต็มพื้นที่ + วงกลมสรุปหมวดด้านข้าง"
```

---

### Task 5: ตรวจของจริง + deploy

**Files:** ไม่แก้โค้ด — งานตรวจสอบ (ถ้าเจอบั๊กให้แก้แล้ว commit เพิ่ม)

**Interfaces:**
- Consumes: หน้า `/expenses` จาก Task 4

- [ ] **Step 1: merge + deploy**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
git checkout main
git merge --no-ff feat/expenses-page-redesign -m "feat(expenses): จัดหน้ารายจ่ายใหม่ — วงกลมสรุปหมวด + ชิพเลือกเดือน"
npx vercel deploy --prod --yes
git push origin main
```

- [ ] **Step 2: ตรวจบนจอคอม**

เปิด `https://sookkaya-pos.vercel.app/expenses` ด้วย claude-in-chrome (บัญชีเจ้าของล็อกอินอยู่แล้ว) ตรวจทีละข้อ:

| ตรวจอะไร | ต้องได้ |
|---|---|
| ชิพเดือน 6 ตัว | ส.ค. ก.ค. มิ.ย. พ.ค. เม.ย. มี.ค. · ส.ค. เป็นตัวเน้น |
| กดชิพ ก.ค. | URL เป็น `?month=2026-07` · ยอดรวม **306,774 ฿** · 26 รายการ |
| กดชิพ มิ.ย. | ยอดรวม **325,846 ฿** · 29 รายการ · วงกลมมี 7 ชิ้น · "อื่นๆ" อยู่ที่ **17%** |
| กดชิ้น "ค่ามือหมอ" ในวงกลม | URL มี `&category=HR%20%2F%20payroll...` · รายการเหลือเฉพาะหมวดนั้น · ชิ้นนั้นหนาขึ้น |
| กด "ดูทุกหมวด" | กลับมาแสดงครบ |
| กด "6 เดือน" | หัวการ์ดเขียน "มี.ค. 69 – ส.ค. 69" · มีแถบคั่นหัวข้อเดือนพร้อมยอดรวมของแต่ละเดือน |
| กด "+ บันทึกรายจ่าย" | Dialog เปิด · กดปิดได้ · ฟอร์มครบเหมือนเดิม |

**ยอดรวมในการ์ดแดงต้องเท่ากับผลบวกของรายการที่แสดงเสมอ** — ถ้าไม่ตรงคือมีบั๊ก หยุดแล้วแก้

- [ ] **Step 3: ตรวจบนมือถือ**

`resize_window` เป็น 375px แล้วโหลดใหม่ ตรวจ:
- ไม่มีการเลื่อนแนวนอน (หน้าไม่ล้นขอบ)
- แถบชิพเลื่อนดูได้ครบ ไม่ทับกัน
- วงกลมกับ legend เรียงลงมา อ่านออก ไม่ล้น
- รายการอ่านง่าย ปุ่มแก้ไข/ลบ กดโดน

- [ ] **Step 4: ตรวจ error หลัง deploy**

ใช้ MCP Vercel `get_runtime_errors` (projectId `prj_aIjCLSIX6A5MoonNtjzMiRno5Md3`, teamId `team_aIZvGjaXuArkv1Vku7KHeW9C`) ช่วง 1 ชั่วโมงล่าสุด ต้องไม่มี error ใหม่

- [ ] **Step 5: สรุปให้เจ้าของร้านเป็นภาษาไทย**

บอกว่าเปลี่ยนอะไรไปบ้าง พร้อมภาพหน้าจอจริง (`computer` action screenshot) ทั้งจอคอมและมือถือ

---

## Self-review

**ครอบคลุม spec:**

| หัวข้อใน spec | Task |
|---|---|
| เอา `max-w-3xl` ออก · layout 2 คอลัมน์ · sticky | 4 |
| แถบเลือกช่วง 2 แถว + เลือกเดือนอื่น | 3 |
| สัญญา URL (`month` / `months` / `category`) · `months` ชนะ | 4 |
| `donutSlices` + กติกายุบ "อื่นๆ" | 1 |
| `recentMonths` | 2 |
| `DonutChart` + สี 8 สี + activeLabel | 2 |
| วงกลมกดกรองได้ · legend กดได้ | 2 (component) + 4 (href) |
| โหมดรวมช่วง + คั่นหัวข้อเดือน | 4 |
| เพดาน 1000 แถว + เตือนเมื่อชน | 4 |
| ฟอร์มเป็น Dialog + prop `onSaved` | 3 |
| มือถือเรียงลงมา | 4 (grid ไม่มี lg = คอลัมน์เดียว) + 5 (ตรวจจริง) |
| กรณีพิเศษ: ไม่มีข้อมูล / กรองแล้วว่าง / วงกลมคิดทั้งช่วง | 4 |
| การทดสอบ 2 ฟังก์ชัน + ตรวจด้วยตา | 1, 2, 5 |

ไม่มีข้อไหนของ spec ที่ไม่มี task รองรับ

**ชื่อและ type ตรงกันข้าม task:** `DonutSlice` `DONUT_MIN_PCT` `DONUT_OTHER_LABEL` `donutSlices` (Task 1) ใช้ตรงกันใน Task 2 และ 4 · `DonutSliceLink` `DONUT_COLORS` `DonutChart` (Task 2) ใช้ตรงกันใน Task 4 · `PeriodPicker` `ExpenseDialog` (Task 3) ใช้ตรงกันใน Task 4 · prop ของ `PeriodPicker` คือ `months` `activeMonth` `activeRange` เหมือนกันทั้งสองที่

**ข้อสังเกตที่ตั้งใจ:** สเปกบอกว่ามือถือใช้ `<details>` กางรายการหมวด แต่แผนใช้ flex เรียงลงมาแทน — เพราะ legend มีแค่ไม่กี่บรรทัดและกินที่น้อยกว่าที่ประเมินไว้ การซ่อนไว้ใน `<details>` ทำให้ต้องกดเพิ่มโดยไม่ได้พื้นที่คืนมาเท่าไหร่ ถ้าตอนตรวจจริงบนมือถือแล้วรู้สึกยาวเกินไป ค่อยเปลี่ยนเป็น `<details>` ใน Task 5
