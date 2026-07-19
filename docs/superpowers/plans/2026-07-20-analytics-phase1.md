# SOOKKAYA Analytics เฟส 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้เจ้าของร้านดูยอดขายและค่ามือหมอย้อนหลังตามช่วงเวลาที่เลือกเองได้ โดยย้ายสูตรการเงินทั้งหมดไปอยู่ใน SQL view ที่เดียว

**Architecture:** Postgres view เป็นแหล่งความจริงเดียวของสูตร (ค่ามือ+ประกัน, net revenue, cash in) โดย view เก็บข้อมูล**รายวัน** แล้วให้ Next.js บวกรวมตามช่วงที่ผู้ใช้เลือก — บังคับให้ประกันมือคิดรายวันถูกต้องโดยโครงสร้าง ไม่ใช่โดยความจำ ส่วน logic ที่เป็นฟังก์ชันบริสุทธิ์ (แปลงเวลา, คำนวณช่วงวันที่) อยู่ใน TypeScript พร้อม unit test

**Tech Stack:** Next.js 16 (App Router) · Supabase Postgres (ref `jrioyrmicioqammeevgh`) · TypeScript · Vitest · Tailwind + shadcn/ui

**ก่อนรันทุกคำสั่ง:**
```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
cd "/Users/jw/Desktop/Claude Code/sookkaya-pos-v2"
```

**Spec:** `docs/superpowers/specs/2026-07-20-analytics-phase1-design.md`

---

## File Structure

| ไฟล์ | หน้าที่ |
| ---- | ------- |
| `src/lib/excel-time.ts` | แปลงค่าเวลาจาก Excel (`10.05`, `4.20pm`, `1515`) → `HH:MM` — ฟังก์ชันบริสุทธิ์ |
| `src/lib/excel-time.test.ts` | unit test ของตัวแปลงเวลา |
| `src/lib/date-range.ts` | คำนวณช่วงวันที่จาก preset + ช่วงเปรียบเทียบก่อนหน้า — ฟังก์ชันบริสุทธิ์ |
| `src/lib/date-range.test.ts` | unit test ของช่วงวันที่ |
| `src/components/date-range-picker.tsx` | UI เลือกช่วงเวลา ใช้ร่วมทุกหน้า |
| `src/app/(app)/sales/page.tsx` | หน้ายอดขายย้อนหลังตามช่วง |
| `src/app/(app)/commission/summary/page.tsx` | สรุปค่ามือข้ามวัน (manager+) |
| `src/app/(app)/commission/summary/matrix-view.tsx` | มุมมองตาราง หมอ × วัน |
| `supabase/reconciliation.sql` | ชุดตรวจตัวเลขกับ Excel ต้องผ่านก่อนปิดงาน |
| `scripts/gen-sale-time-backfill.py` | อ่าน Excel → สร้าง SQL อัปเดต `sale_time` |

**แก้ไขของเดิม:** `src/app/(app)/commission/page.tsx` และ `src/app/(app)/reports/page.tsx` ให้ดึงจาก view แทนการคำนวณเอง (แก้บั๊กประกันมือ "วันทำงานผี" ไปพร้อมกัน)

---

## Task 1: ตั้งค่า Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: ติดตั้ง**

```bash
npm install -D vitest
```

- [ ] **Step 2: สร้าง config**

สร้าง `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
})
```

- [ ] **Step 3: เพิ่ม script**

ใน `package.json` เพิ่มใน `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: ยืนยันว่ารันได้**

Run: `npm test`
Expected: `No test files found` และ exit code 1 — ปกติ เพราะยังไม่มีเทส

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: ตั้งค่า vitest สำหรับ unit test"
```

---

## Task 2: ตัวแปลงเวลาจาก Excel

ข้อมูลเวลาในไฟล์เดิมมี 4 รูปแบบปนกัน ตัวนี้คือ logic ที่เสี่ยงที่สุดของเฟส เพราะถ้าแปลงผิดจะได้ heatmap ที่หลอกตา

**Files:**
- Create: `src/lib/excel-time.ts`
- Test: `src/lib/excel-time.test.ts`

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

สร้าง `src/lib/excel-time.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { parseExcelTime } from "./excel-time"

describe("parseExcelTime", () => {
  it("แปลงรูปแบบ ชั่วโมง.นาที โดยเติมศูนย์ขวา", () => {
    expect(parseExcelTime(10.05)).toBe("10:05")
    expect(parseExcelTime(10.3)).toBe("10:30")
    expect(parseExcelTime(10.1)).toBe("10:10")
    expect(parseExcelTime(11.46)).toBe("11:46")
    expect(parseExcelTime(21.09)).toBe("21:09")
  })

  it("แปลงเลข 4 หลักแบบ HHMM", () => {
    expect(parseExcelTime(1515)).toBe("15:15")
  })

  it("แปลงข้อความที่มี am/pm", () => {
    expect(parseExcelTime("4.20pm")).toBe("16:20")
    expect(parseExcelTime("6.00pm")).toBe("18:00")
    expect(parseExcelTime("12.30pm")).toBe("12:30")
    expect(parseExcelTime("12.15am")).toBe("00:15")
    expect(parseExcelTime("10.05am")).toBe("10:05")
  })

  it("แปลงค่าเศษส่วนของ Excel", () => {
    expect(parseExcelTime(0.5)).toBe("12:00")
    expect(parseExcelTime(0.458333333333333)).toBe("11:00")
  })

  it("คืน null เมื่อตีความไม่ได้ ไม่เดา", () => {
    expect(parseExcelTime(10.7)).toBeNull()   // .70 ไม่ใช่นาทีที่ถูกต้อง
    expect(parseExcelTime(null)).toBeNull()
    expect(parseExcelTime("")).toBeNull()
    expect(parseExcelTime("เช้า")).toBeNull()
    expect(parseExcelTime(99)).toBeNull()
    expect(parseExcelTime(-3)).toBeNull()
  })

  it("ไม่ยอมรับเวลาที่เกินขอบเขต", () => {
    expect(parseExcelTime(25.3)).toBeNull()
    expect(parseExcelTime(2599)).toBeNull()
  })
})
```

- [ ] **Step 2: รันเทสให้เห็นว่าไม่ผ่าน**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./excel-time"`

- [ ] **Step 3: เขียน implementation**

สร้าง `src/lib/excel-time.ts`:

```ts
/**
 * แปลงค่าเวลาจากไฟล์ Excel เดิมซึ่งบันทึกไว้หลายรูปแบบปนกัน
 *
 * รูปแบบที่พบจริงในไฟล์ (2,254 แถว):
 *   10.05, 10.3  -> ชั่วโมง.นาที (ทศนิยมเติมศูนย์ทางขวา: .3 = 30 นาที)
 *   1515         -> HHMM
 *   "4.20pm"     -> 16:20
 *   0.4583       -> เศษส่วนของวันแบบ Excel
 *
 * คืน null เมื่อตีความไม่ได้ — ปล่อยว่างดีกว่าเดาผิด
 */
export function parseExcelTime(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null

  if (typeof value === "string") return parseTimeString(value)
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  if (value < 0) return null

  // เศษส่วนของวันแบบ Excel (0 = เที่ยงคืน, 0.5 = เที่ยง)
  if (value > 0 && value < 1) {
    const totalMinutes = Math.round(value * 24 * 60)
    return formatHM(Math.floor(totalMinutes / 60), totalMinutes % 60)
  }

  // HHMM เช่น 1515
  if (value >= 100) {
    const hour = Math.floor(value / 100)
    const minute = Math.round(value % 100)
    return isValidHM(hour, minute) ? formatHM(hour, minute) : null
  }

  // ชั่วโมง.นาที เช่น 10.05, 10.3
  return parseHourDotMinute(value)
}

/** ".3" หมายถึง 30 นาที ไม่ใช่ 3 นาที — ต้องเติมศูนย์ทางขวาให้ครบ 2 หลัก */
function parseHourDotMinute(value: number): string | null {
  const text = value.toString()
  const [hourPart, fracPart = ""] = text.split(".")
  const hour = Number(hourPart)
  const minute = fracPart === "" ? 0 : Number(fracPart.padEnd(2, "0").slice(0, 2))
  return isValidHM(hour, minute) ? formatHM(hour, minute) : null
}

function parseTimeString(raw: string): string | null {
  const text = raw.trim().toLowerCase()
  const match = text.match(/^(\d{1,2})[.:](\d{1,2})\s*(am|pm)?$/)
  if (!match) return null

  let hour = Number(match[1])
  const minute = Number(match[2].padEnd(2, "0").slice(0, 2))
  const meridiem = match[3]

  if (meridiem === "pm" && hour < 12) hour += 12
  if (meridiem === "am" && hour === 12) hour = 0

  return isValidHM(hour, minute) ? formatHM(hour, minute) : null
}

function isValidHM(hour: number, minute: number): boolean {
  return (
    Number.isInteger(hour) && Number.isInteger(minute) &&
    hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
  )
}

function formatHM(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}
```

- [ ] **Step 4: รันเทสให้ผ่าน**

Run: `npm test`
Expected: PASS ทั้ง 6 กลุ่ม

- [ ] **Step 5: Commit**

```bash
git add src/lib/excel-time.ts src/lib/excel-time.test.ts
git commit -m "feat: ตัวแปลงเวลาจาก Excel พร้อมเทส"
```

---

## Task 3: ไลบรารีช่วงวันที่

**Files:**
- Create: `src/lib/date-range.ts`
- Test: `src/lib/date-range.test.ts`

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

สร้าง `src/lib/date-range.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { previousRange, rangeFromPreset, rangeLengthDays } from "./date-range"

const TODAY = "2026-07-20"   // วันจันทร์

describe("rangeFromPreset", () => {
  it("วันนี้", () => {
    expect(rangeFromPreset("today", TODAY)).toEqual({ from: "2026-07-20", to: "2026-07-20" })
  })

  it("7 วันล่าสุด นับรวมวันนี้", () => {
    expect(rangeFromPreset("last7", TODAY)).toEqual({ from: "2026-07-14", to: "2026-07-20" })
  })

  it("เดือนนี้ สิ้นสุดที่วันนี้ ไม่ใช่สิ้นเดือน", () => {
    expect(rangeFromPreset("thisMonth", TODAY)).toEqual({ from: "2026-07-01", to: "2026-07-20" })
  })

  it("เดือนที่แล้ว เต็มเดือน", () => {
    expect(rangeFromPreset("lastMonth", TODAY)).toEqual({ from: "2026-06-01", to: "2026-06-30" })
  })

  it("เดือนที่แล้วข้ามปี", () => {
    expect(rangeFromPreset("lastMonth", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" })
  })

  it("เดือนที่แล้วของเดือน ก.พ. ปีอธิกสุรทิน", () => {
    expect(rangeFromPreset("lastMonth", "2028-03-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" })
  })
})

describe("rangeLengthDays", () => {
  it("นับรวมวันเริ่มและวันจบ", () => {
    expect(rangeLengthDays({ from: "2026-07-20", to: "2026-07-20" })).toBe(1)
    expect(rangeLengthDays({ from: "2026-07-14", to: "2026-07-20" })).toBe(7)
    expect(rangeLengthDays({ from: "2026-06-01", to: "2026-06-30" })).toBe(30)
  })
})

describe("previousRange", () => {
  it("ถอยหลังไปเท่ากับความยาวของช่วงเดิม", () => {
    expect(previousRange({ from: "2026-07-14", to: "2026-07-20" }))
      .toEqual({ from: "2026-07-07", to: "2026-07-13" })
  })

  it("ช่วงวันเดียวถอยไปวันก่อนหน้า", () => {
    expect(previousRange({ from: "2026-07-20", to: "2026-07-20" }))
      .toEqual({ from: "2026-07-19", to: "2026-07-19" })
  })

  it("ข้ามเดือนได้ถูกต้อง", () => {
    expect(previousRange({ from: "2026-06-01", to: "2026-06-30" }))
      .toEqual({ from: "2026-05-02", to: "2026-05-31" })
  })
})
```

- [ ] **Step 2: รันเทสให้เห็นว่าไม่ผ่าน**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./date-range"`

- [ ] **Step 3: เขียน implementation**

สร้าง `src/lib/date-range.ts`:

```ts
export type DateRange = { from: string; to: string }

export type RangePreset = "today" | "last7" | "thisMonth" | "lastMonth"

export const PRESET_LABELS: Record<RangePreset, string> = {
  today: "วันนี้",
  last7: "7 วัน",
  thisMonth: "เดือนนี้",
  lastMonth: "เดือนที่แล้ว",
}

/**
 * ทุกฟังก์ชันทำงานบนสตริง YYYY-MM-DD และใช้ UTC ภายใน
 * เพื่อไม่ให้ timezone ของเครื่องมาเลื่อนวัน — วันที่ "วันนี้" ต้องส่งเข้ามา
 * จาก todayInShopTz() ใน src/lib/datetime.ts เสมอ
 */
function toUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(iso: string, days: number): string {
  const d = toUtc(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toIso(d)
}

export function rangeFromPreset(preset: RangePreset, today: string): DateRange {
  const [year, month] = today.split("-").map(Number)

  switch (preset) {
    case "today":
      return { from: today, to: today }
    case "last7":
      return { from: addDays(today, -6), to: today }
    case "thisMonth":
      return { from: `${today.slice(0, 7)}-01`, to: today }
    case "lastMonth": {
      const firstOfThis = new Date(Date.UTC(year, month - 1, 1))
      const lastOfPrev = new Date(firstOfThis)
      lastOfPrev.setUTCDate(0)
      return { from: `${toIso(lastOfPrev).slice(0, 7)}-01`, to: toIso(lastOfPrev) }
    }
  }
}

export function rangeLengthDays(range: DateRange): number {
  const ms = toUtc(range.to).getTime() - toUtc(range.from).getTime()
  return Math.round(ms / 86_400_000) + 1
}

/** ช่วงก่อนหน้าที่ยาวเท่ากัน สำหรับเทียบว่าดีขึ้นหรือแย่ลง */
export function previousRange(range: DateRange): DateRange {
  const length = rangeLengthDays(range)
  return {
    from: addDays(range.from, -length),
    to: addDays(range.from, -1),
  }
}
```

- [ ] **Step 4: รันเทสให้ผ่าน**

Run: `npm test`
Expected: PASS ทั้ง 12 เคส

- [ ] **Step 5: Commit**

```bash
git add src/lib/date-range.ts src/lib/date-range.test.ts
git commit -m "feat: ไลบรารีช่วงวันที่พร้อมเทส"
```

---

## Task 4: Migration — เพิ่มคอลัมน์และค่าตั้งต้น

**Files:**
- ใช้ Supabase MCP `apply_migration` (project ref `jrioyrmicioqammeevgh`)

- [ ] **Step 1: ใช้ migration ชื่อ `add_cost_type_and_material_cost`**

```sql
alter table public.expenses add column cost_type text not null default 'variable'
  check (cost_type in ('fixed','variable','onetime'));

create table public.expense_category_types (
  category  text primary key,
  cost_type text not null check (cost_type in ('fixed','variable','onetime'))
);

alter table public.expense_category_types enable row level security;

create policy ect_read on public.expense_category_types
  for select to authenticated using (public.app_role() in ('admin','manager','staff'));
create policy ect_write on public.expense_category_types
  for all to authenticated
  using (public.app_role() in ('admin','manager'))
  with check (public.app_role() in ('admin','manager'));

insert into public.expense_category_types (category, cost_type) values
  ('ค่าเช่าสถานที่', 'fixed'),
  ('ค่าน้ำ / ค่าไฟ / Internet', 'fixed'),
  ('HR / payroll (เงินประกัน ค่ามือ เงินเดือน)', 'variable'),
  ('วัสดุ-สิ้นเปลือง (น้ำมัน บาล์ม ฯลฯ)', 'variable'),
  ('ซักรีด', 'variable'),
  ('การตลาด / โฆษณา', 'onetime'),
  ('ชุดลูกค้า ชุดหมอ ชุดพนักงาน', 'onetime'),
  ('อื่นๆ', 'onetime');

alter table public.services add column material_cost numeric;

insert into public.settings (key, value) values ('monthly_target', '400000')
  on conflict (key) do nothing;
```

- [ ] **Step 2: ยืนยันว่าคอลัมน์เพิ่มแล้ว**

รัน SQL:

```sql
select
  (select count(*) from public.expense_category_types) as category_types,
  (select count(*) from public.expenses where cost_type = 'variable') as expenses_defaulted,
  (select value from public.settings where key = 'monthly_target') as target;
```

Expected: `category_types = 8` · `expenses_defaulted = 169` · `target = 400000`

---

## Task 5: Backfill ประเภทต้นทุน แล้วให้เจ้าของร้านตรวจ

หมวด HR/payroll ปนทั้งค่ามือหมอและเงินเดือน reception ต้องแยกตามชื่อรายการ

**Files:**
- ใช้ Supabase MCP `apply_migration`

- [ ] **Step 1: ใช้ migration ชื่อ `backfill_expense_cost_type`**

```sql
-- ชั้นที่ 1: ตามหมวดหมู่
update public.expenses e
set cost_type = t.cost_type
from public.expense_category_types t
where t.category = e.category;

-- ชั้นที่ 2: หมวด HR แยกตามชื่อรายการ
-- เงินเดือน reception และค่าทำบัญชี = ต้นทุนคงที่ จ่ายแม้ไม่มีลูกค้า
update public.expenses
set cost_type = 'fixed'
where category like 'HR / payroll%'
  and (
    item ilike '%reception%' or
    item ilike '%รีเซฟชั่น%' or
    item ilike '%รีเซพชั่น%' or
    item ilike '%บัญชี%'
  );
```

- [ ] **Step 2: ตรวจว่ายอด มิ.ย. ตรงกับ spec**

รัน SQL:

```sql
select cost_type, round(sum(amount)) as total
from public.expenses
where expense_date between '2026-06-01' and '2026-06-30'
group by cost_type order by cost_type;
```

Expected: `fixed = 104648` · `onetime = 28320` · `variable = 125059`

ถ้าไม่ตรง **หยุด** แล้วดูรายการในหมวด HR ว่ามีชื่อรูปแบบอื่นที่กฎยังไม่ครอบคลุม

- [ ] **Step 3: ออกรายงานให้เจ้าของร้านตรวจ**

รัน SQL แล้วเอาผลไปให้เจ้าของร้านยืนยัน:

```sql
select expense_date, item, round(amount) as amount, cost_type
from public.expenses
where category like 'HR / payroll%'
order by expense_date;
```

ถามว่า: รายการไหนที่ระบบจัดเป็น `variable` แต่จริงๆ เป็นเงินเดือนประจำบ้าง
(กระทบจุดคุ้มทุนโดยตรง — ห้ามข้ามขั้นนี้)

- [ ] **Step 4: แก้ตามที่เจ้าของร้านบอก (ถ้ามี)**

ถ้ามีรายการที่จัดผิด ใช้ migration ชื่อ `fix_expense_cost_type_manual` แล้ว update ทีละ id

---

## Task 6: Backfill เวลาขาย ~1,589 รายการ

**Files:**
- Create: `scripts/gen-sale-time-backfill.py`

- [ ] **Step 1: เขียนสคริปต์สร้าง SQL**

สร้าง `scripts/gen-sale-time-backfill.py`:

```python
"""อ่านเวลาขายจาก Excel เดิม แล้วสร้าง SQL อัปเดต sales.sale_time
จับคู่ด้วย receipt_no ซึ่ง unique และเก็บเลขเดิมไว้ตอน import"""
import openpyxl, re, pathlib
from collections import Counter

XLSX = "/Users/jw/Downloads/Final_SOOKKAYA_บันทึกรับจ่าย_v15_Latest 3_5_69.xlsx"
OUT = pathlib.Path(__file__).parent / "sale-time-backfill.sql"

def parse_excel_time(v):
    """ตรรกะเดียวกับ src/lib/excel-time.ts — ถ้าแก้ที่นี่ต้องแก้ที่นั่นด้วย"""
    if v is None or v == "":
        return None
    if isinstance(v, str):
        m = re.match(r"^(\d{1,2})[.:](\d{1,2})\s*(am|pm)?$", v.strip().lower())
        if not m:
            return None
        h, mi, mer = int(m.group(1)), int(m.group(2).ljust(2, "0")[:2]), m.group(3)
        if mer == "pm" and h < 12: h += 12
        if mer == "am" and h == 12: h = 0
        return f"{h:02d}:{mi:02d}" if 0 <= h <= 23 and 0 <= mi <= 59 else None
    if not isinstance(v, (int, float)) or v < 0:
        return None
    if 0 < v < 1:
        total = round(v * 1440)
        return f"{total // 60:02d}:{total % 60:02d}"
    if v >= 100:
        h, mi = int(v // 100), round(v % 100)
        return f"{h:02d}:{mi:02d}" if 0 <= h <= 23 and 0 <= mi <= 59 else None
    whole, _, frac = str(v).partition(".")
    h = int(whole)
    mi = int(frac.ljust(2, "0")[:2]) if frac else 0
    return f"{h:02d}:{mi:02d}" if 0 <= h <= 23 and 0 <= mi <= 59 else None

wb = openpyxl.load_workbook(XLSX, data_only=True)
ws = wb["บันทึกขาย"]

seen, pairs, stats = Counter(), [], Counter()
for r in range(3, ws.max_row + 1):
    row = [ws.cell(r, c).value for c in range(1, 8)]
    if row[0] is None and row[3] is None and row[6] is None:
        continue
    receipt = str(row[2]).strip() if row[2] else None
    if not receipt:
        stats["ไม่มีเลขใบเสร็จ"] += 1
        continue
    seen[receipt] += 1
    if seen[receipt] > 1:                      # ตอน import เลขซ้ำถูกต่อท้าย -2
        receipt = f"{receipt}-{seen[receipt]}"
    t = parse_excel_time(row[1])
    if t is None:
        stats["แปลงไม่ได้"] += 1
        continue
    pairs.append((receipt, t))
    stats["แปลงได้"] += 1

values = ",\n".join(f"('{r}','{t}')" for r, t in pairs)
OUT.write_text(f"""update public.sales s
set sale_time = v.t::time
from (values
{values}
) as v(receipt_no, t)
where s.receipt_no = v.receipt_no
  and s.sale_time is null;
""")

print(dict(stats))
print(f"เขียน {len(pairs)} แถวไปที่ {OUT}")
```

- [ ] **Step 2: รันสคริปต์**

Run: `python3 scripts/gen-sale-time-backfill.py`
Expected: `แปลงได้` ประมาณ **1,589** · `แปลงไม่ได้` ประมาณ **664** (ส่วนใหญ่คือช่องว่าง)

ถ้า `แปลงได้` ต่ำกว่า 1,500 มาก **หยุด** — แปลว่ากฎการแปลงเพี้ยน

- [ ] **Step 3: นับจำนวนก่อนอัปเดต**

รัน SQL:

```sql
select count(sale_time) as before_count from public.sales;
```

Expected: `6`

- [ ] **Step 4: รัน SQL ที่สร้างไว้**

อ่านไฟล์ `scripts/sale-time-backfill.sql` แล้วรันผ่าน MCP `apply_migration`
ชื่อ migration: `backfill_sale_time`

- [ ] **Step 5: ยืนยันผล**

รัน SQL:

```sql
select
  count(sale_time)                                            as with_time,
  min(sale_time)                                              as earliest,
  max(sale_time)                                              as latest,
  count(*) filter (where sale_time < '08:00' or sale_time > '23:59') as outside_hours
from public.sales;
```

Expected: `with_time` ประมาณ **1,595** (1,589 + 6 เดิม) · `earliest` ไม่ควรก่อน 09:00
· `outside_hours = 0` (ร้านเปิด 10:00–22:00 ถ้ามีนอกช่วงมากแปลว่าแปลงผิด)

- [ ] **Step 6: Commit สคริปต์**

```bash
git add scripts/gen-sale-time-backfill.py
git commit -m "feat: สคริปต์กู้เวลาขายจาก Excel"
```

---

## Task 7: Backfill ต้นทุนวัสดุต่อเมนู

ต้องอ่านค่าจากชีท `ต้นทุน` โดยตรง **ห้ามพิมพ์ตัวเลขเอง** เพราะตัวเลขผิดที่ดูเหมือนถูก
จะไปโผล่เป็นกำไรต่อเมนูที่ผิดในเฟส 3 โดยไม่มีอะไรเตือน

**Files:**
- Create: `scripts/gen-material-cost.py`

- [ ] **Step 1: เขียนสคริปต์**

สร้าง `scripts/gen-material-cost.py`:

```python
"""อ่านต้นทุนวัสดุต่อเมนูจากชีท 'ต้นทุน' แล้วสร้าง SQL
ชื่อเมนูใน Excel เว้นวรรคต่างจากในฐานข้อมูล จึงต้อง normalize ก่อนจับคู่
เมนูที่ระบุ 2 ค่า (เช่น '135.9/178.2') ใช้ค่าเฉลี่ยตาม spec"""
import openpyxl, re, unicodedata, pathlib

XLSX = "/Users/jw/Downloads/Final_SOOKKAYA_บันทึกรับจ่าย_v15_Latest 3_5_69.xlsx"
OUT = pathlib.Path(__file__).parent / "material-cost.sql"

def norm(s):
    return re.sub(r"\s+", "", unicodedata.normalize("NFC", str(s)).strip()).lower()

# ชื่อในไฟล์เก่า -> ชื่อในฐานข้อมูล (เฉพาะที่สะกดต่างกัน)
ALIAS = {
    norm("ทรีตเมนต์ขัดผิว และนวดน้ำมันหอมระเหย 90 นาที"): "ทรีตเมนต์ขัดผิว + นวดน้ำมัน 90 นาที",
    norm("ทรีตเมนต์ขัดผิว และนวดน้ำมันหอมระเหย 120 นาที"): "ทรีตเมนต์ขัดผิว + นวดน้ำมัน 120 นาที",
}

def to_cost(v):
    """คืนค่าเฉลี่ยถ้าเป็นรูปแบบ 'a/b' มิฉะนั้นคืนตัวเลขตรงๆ"""
    if isinstance(v, (int, float)):
        return round(float(v), 2)
    if isinstance(v, str) and "/" in v:
        parts = [float(p) for p in v.split("/") if p.strip()]
        return round(sum(parts) / len(parts), 2)
    return None

wb = openpyxl.load_workbook(XLSX, data_only=True)
ws = wb["ต้นทุน"]

pairs, skipped = [], []
for r in range(2, ws.max_row + 1):
    name = ws.cell(r, 1).value
    if not name:
        continue
    cost = to_cost(ws.cell(r, 4).value)
    if cost is None:
        skipped.append(str(name).strip())
        continue
    pairs.append((str(name).strip(), norm(name), cost))

values = ",\n".join(
    f"({cost}, '{ALIAS.get(n, orig)}')" for orig, n, cost in pairs
)
OUT.write_text(f"""update public.services s
set material_cost = v.cost
from (values
{values}
) as v(cost, name)
where s.name = v.name;
""")

print(f"อ่านได้ {len(pairs)} เมนู · ข้าม {len(skipped)}: {skipped}")
print(f"เขียนไปที่ {OUT}")
```

- [ ] **Step 2: รันสคริปต์**

Run: `python3 scripts/gen-material-cost.py`
Expected: `อ่านได้ 34 เมนู · ข้าม 0`

- [ ] **Step 3: รัน SQL ที่สร้างไว้**

อ่าน `scripts/material-cost.sql` แล้วรันผ่าน MCP `apply_migration`
ชื่อ migration: `backfill_service_material_cost`

- [ ] **Step 4: ยืนยันว่าครบทุกเมนู**

รัน SQL:

```sql
select count(*) filter (where material_cost is null) as missing,
       count(*) filter (where material_cost is not null) as filled,
       round(min(material_cost),1) as lowest,
       round(max(material_cost),1) as highest
from public.services;
```

Expected: `missing = 0` · `filled = 34` · `lowest` ประมาณ 112.4 · `highest` ประมาณ 188

ถ้า `missing > 0` แปลว่าชื่อเมนูจับคู่ไม่ตรง — ดูว่าเมนูไหนแล้วเพิ่มลง `ALIAS` ในสคริปต์

- [ ] **Step 5: Commit สคริปต์**

```bash
git add scripts/gen-material-cost.py
git commit -m "feat: สคริปต์ดึงต้นทุนวัสดุต่อเมนูจาก Excel"
```

---

## Task 8: สร้าง SQL Views

หัวใจของแผนนี้ — สูตรทั้งหมดมาอยู่ที่เดียว และแก้บั๊กประกันมือ "วันทำงานผี" ไปพร้อมกัน

**Files:**
- ใช้ Supabase MCP `apply_migration`

- [ ] **Step 1: ใช้ migration ชื่อ `create_analytics_views`**

```sql
-- ค่ามือรายวันต่อหมอ 1 คน — แหล่งความจริงเดียวของตรรกะประกันมือ
--
-- กฎสำคัญ 2 ข้อที่ฝังไว้ที่นี่ที่เดียว:
--   1. ประกันใช้เฉพาะวันที่หมอเข้างานจริง (มีอย่างน้อย 1 เซสชัน)
--   2. รายการที่ไม่ได้ระบุหมอ ไม่นับเป็น "วันทำงาน" จึงไม่ได้ประกัน
--      (ก่อนหน้านี้หน้ารายงานให้ประกันกับรายการพวกนี้ รวมค่ามือปลอม 3,500 บาท)
create view public.v_therapist_daily
with (security_invoker = true) as
select
  s.sale_date                                   as work_date,
  s.therapist_id,
  count(*)                                      as sessions,
  sum(coalesce(s.commission, 0))                as total_commission,
  sum(s.request_fee)                            as request_fee,
  g.guarantee                                   as guarantee_amount,
  greatest(sum(coalesce(s.commission, 0)), g.guarantee)               as net_commission,
  greatest(sum(coalesce(s.commission, 0)), g.guarantee)
    + sum(s.request_fee)                                              as total_income,
  case when sum(coalesce(s.commission, 0)) < g.guarantee
       then 'ใช้ประกัน' else 'ค่ามือจริง' end                          as status,
  coalesce(d.is_paid, false)                    as is_paid
from public.sales s
cross join lateral (
  select coalesce((select value::numeric from public.settings
                   where key = 'min_commission_guarantee'), 500) as guarantee
) g
left join public.therapist_daily_commission d
  on d.work_date = s.sale_date and d.therapist_id = s.therapist_id
where s.therapist_id is not null
group by s.sale_date, s.therapist_id, g.guarantee, d.is_paid;

-- ยอดขายรายวัน
--   net_revenue = รายได้ที่รับรู้ (ตัดส่วนโบนัสสมาชิกที่ไม่ใช่เงินจริงออกแล้ว)
--   cash_in     = เงินสดเข้าจริง = ยอดที่ไม่ใช่ Member Credit + เงินเติมสมาชิกวันนั้น
create view public.v_daily_summary
with (security_invoker = true) as
with sales_day as (
  select
    sale_date,
    count(*)                                                          as sessions,
    sum(net_amount)                                                   as gross_sales,
    sum(coalesce(revenue_recognize, net_amount))                      as net_revenue,
    sum(discount)                                                     as discount_total,
    sum(case when payment_method = 'Member Credit' then 0
             else net_amount end)                                     as sales_cash
  from public.sales
  group by sale_date
),
topup_day as (
  select topup_date, sum(cash_received) as topup_cash
  from public.member_topups
  group by topup_date
)
select
  coalesce(s.sale_date, t.topup_date)          as sale_date,
  coalesce(s.sessions, 0)                      as sessions,
  coalesce(s.gross_sales, 0)                   as gross_sales,
  coalesce(s.net_revenue, 0)                   as net_revenue,
  coalesce(s.discount_total, 0)                as discount_total,
  coalesce(s.sales_cash, 0) + coalesce(t.topup_cash, 0)  as cash_in
from sales_day s
full outer join topup_day t on t.topup_date = s.sale_date;
```

- [ ] **Step 2: ยืนยันว่า view แก้บั๊กประกันมือแล้ว**

รัน SQL:

```sql
select round(sum(total_income)) as june_commission
from public.v_therapist_daily
where work_date between '2026-06-01' and '2026-06-30';
```

Expected: **140415** (ไม่ใช่ 141,415 — ส่วนต่าง 1,000 คือประกันปลอมที่หายไป)

- [ ] **Step 3: ยืนยัน v_daily_summary**

รัน SQL:

```sql
select round(sum(net_revenue)) as net_revenue, round(sum(cash_in)) as cash_in
from public.v_daily_summary
where sale_date between '2026-06-01' and '2026-06-30';
```

Expected: `net_revenue = 347018` (ตรงกับ Excel) · `cash_in` มากกว่า 0

- [ ] **Step 4: ตรวจ security advisor**

ใช้ MCP `get_advisors` type `security`
Expected: ไม่มีคำเตือนใหม่เกี่ยวกับ view (ต้องไม่มี `security_definer_view`)

---

## Task 9: ชุดตรวจตัวเลขกับ Excel

**Files:**
- Create: `supabase/reconciliation.sql`

- [ ] **Step 1: เขียนชุดตรวจ**

สร้าง `supabase/reconciliation.sql`:

```sql
-- ตรวจตัวเลขในฐานข้อมูลกับ Excel เดิม — ต้องผ่านทุกข้อก่อนปิดงาน
-- รันแล้วดูคอลัมน์ result ต้องเป็น PASS ทั้งหมด
with expected(check_name, expected_value) as (values
  ('net_revenue_2026_03', 174842),
  ('net_revenue_2026_04', 316123),
  ('net_revenue_2026_05', 286158),
  ('net_revenue_2026_06', 347018),
  ('net_revenue_2026_07', 231947),
  ('member_credit_used',  209410),
  ('commission_2026_06',  140415),
  ('expenses_fixed_06',   104648),
  ('expenses_variable_06',125059),
  ('expenses_onetime_06',  28320)
),
actual(check_name, actual_value) as (
  select 'net_revenue_' || replace(to_char(sale_date,'YYYY-MM'),'-','_'),
         round(sum(net_revenue))
  from public.v_daily_summary
  where sale_date between '2026-03-01' and '2026-07-31'
  group by to_char(sale_date,'YYYY-MM')

  union all
  select 'member_credit_used', round(sum(credit_used)) from public.sales

  union all
  select 'commission_2026_06', round(sum(total_income))
  from public.v_therapist_daily
  where work_date between '2026-06-01' and '2026-06-30'

  union all
  select 'expenses_' || cost_type || '_06', round(sum(amount))
  from public.expenses
  where expense_date between '2026-06-01' and '2026-06-30'
  group by cost_type
)
select
  e.check_name,
  e.expected_value,
  a.actual_value,
  case when a.actual_value = e.expected_value then 'PASS'
       else 'FAIL (ต่าง ' || (a.actual_value - e.expected_value) || ')' end as result
from expected e
left join actual a on a.check_name = e.check_name
order by result desc, e.check_name;
```

- [ ] **Step 2: รันชุดตรวจ**

อ่านไฟล์แล้วรันผ่าน MCP `execute_sql`
Expected: **ทุกแถวเป็น PASS**

ถ้ามี FAIL แม้แถวเดียว **หยุดและแก้ก่อนไปต่อ** — อย่าปิดงานทั้งที่ตัวเลขไม่ตรง

> `expenses_fixed_06` จะยังไม่ PASS ถ้า Task 5 Step 4 มีการแก้ตามที่เจ้าของร้านบอก
> กรณีนั้นให้อัปเดตค่า expected ในไฟล์นี้พร้อมคอมเมนต์อธิบายว่าแก้เพราะอะไร

- [ ] **Step 3: Commit**

```bash
git add supabase/reconciliation.sql
git commit -m "test: ชุดตรวจตัวเลขกับ Excel เดิม"
```

---

## Task 10: คอมโพเนนต์เลือกช่วงเวลา

**Files:**
- Create: `src/components/date-range-picker.tsx`

- [ ] **Step 1: เขียนคอมโพเนนต์**

สร้าง `src/components/date-range-picker.tsx`:

```tsx
"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"

import {
  PRESET_LABELS,
  type DateRange,
  type RangePreset,
  rangeFromPreset,
} from "@/lib/date-range"
import { formatThaiDate } from "@/lib/datetime"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const PRESETS: RangePreset[] = ["today", "last7", "thisMonth", "lastMonth"]

export function DateRangePicker({
  range,
  today,
}: {
  range: DateRange
  today: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [custom, setCustom] = useState(false)

  function apply(next: DateRange) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("from", next.from)
    params.set("to", next.to)
    router.push(`${pathname}?${params.toString()}`)
  }

  function isActive(preset: RangePreset): boolean {
    const p = rangeFromPreset(preset, today)
    return p.from === range.from && p.to === range.to
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant={isActive(preset) ? "default" : "outline"}
            onClick={() => {
              setCustom(false)
              apply(rangeFromPreset(preset, today))
            }}
          >
            {PRESET_LABELS[preset]}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant={custom ? "default" : "outline"}
          onClick={() => setCustom((v) => !v)}
        >
          กำหนดเอง
        </Button>
        <span className="ml-auto text-sm text-slate-600">
          {range.from === range.to
            ? formatThaiDate(range.from)
            : `${formatThaiDate(range.from)} – ${formatThaiDate(range.to)}`}
        </span>
      </div>

      {custom && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const form = new FormData(e.currentTarget)
            const from = String(form.get("from") ?? "")
            const to = String(form.get("to") ?? "")
            if (from && to) apply(from <= to ? { from, to } : { from: to, to: from })
          }}
        >
          <Input type="date" name="from" defaultValue={range.from} className="h-10 w-auto" aria-label="ตั้งแต่วันที่" />
          <Input type="date" name="to" defaultValue={range.to} className="h-10 w-auto" aria-label="ถึงวันที่" />
          <Button type="submit" size="sm" className="h-10">ดูข้อมูล</Button>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 2: ตรวจว่า build ผ่าน**

Run: `npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add src/components/date-range-picker.tsx
git commit -m "feat: คอมโพเนนต์เลือกช่วงเวลา"
```

---

## Task 11: หน้ายอดขายย้อนหลัง

**Files:**
- Create: `src/app/(app)/sales/page.tsx`
- Modify: `src/components/app-nav.tsx`
- Modify: `src/app/(app)/more/page.tsx`

- [ ] **Step 1: เขียนหน้า**

สร้าง `src/app/(app)/sales/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server"
import { todayInShopTz } from "@/lib/datetime"
import { formatBaht } from "@/lib/constants"
import {
  type DateRange,
  previousRange,
  rangeFromPreset,
  rangeLengthDays,
} from "@/lib/date-range"
import { DateRangePicker } from "@/components/date-range-picker"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = { title: "ยอดขายย้อนหลัง · สุขกายา POS" }

type Totals = { sessions: number; gross: number; net: number; cash: number }

function sum(rows: { sessions: number; gross_sales: number; net_revenue: number; cash_in: number }[]): Totals {
  return rows.reduce<Totals>(
    (acc, r) => ({
      sessions: acc.sessions + Number(r.sessions),
      gross: acc.gross + Number(r.gross_sales),
      net: acc.net + Number(r.net_revenue),
      cash: acc.cash + Number(r.cash_in),
    }),
    { sessions: 0, gross: 0, net: 0, cash: 0 }
  )
}

function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0) return null
  const pct = Math.round(((now - before) / before) * 100)
  const up = pct >= 0
  return (
    <span className={up ? "text-sm text-emerald-700" : "text-sm text-red-700"}>
      {up ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  )
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const supabase = await createClient()
  const today = todayInShopTz()
  const params = await searchParams

  const range: DateRange =
    params.from && params.to
      ? { from: params.from, to: params.to }
      : rangeFromPreset("today", today)
  const prev = previousRange(range)

  const [{ data: current }, { data: previous }] = await Promise.all([
    supabase
      .from("v_daily_summary")
      .select("sale_date, sessions, gross_sales, net_revenue, cash_in")
      .gte("sale_date", range.from)
      .lte("sale_date", range.to)
      .order("sale_date", { ascending: false }),
    supabase
      .from("v_daily_summary")
      .select("sale_date, sessions, gross_sales, net_revenue, cash_in")
      .gte("sale_date", prev.from)
      .lte("sale_date", prev.to),
  ])

  const rows = current ?? []
  const now = sum(rows)
  const before = sum(previous ?? [])
  const days = rangeLengthDays(range)
  const avgPerSession = now.sessions > 0 ? Math.round(now.net / now.sessions) : 0

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">ยอดขายย้อนหลัง</h1>

      <DateRangePicker range={range} today={today} />

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          ไม่มีข้อมูลในช่วงที่เลือก
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="py-4">
                <p className="text-sm text-slate-600">รายได้ที่รับรู้</p>
                <p className="text-2xl font-bold text-emerald-800">
                  {formatBaht(now.net)}
                </p>
                <Delta now={now.net} before={before.net} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-sm text-slate-600">เงินสดเข้าจริง</p>
                <p className="text-2xl font-bold">{formatBaht(now.cash)}</p>
                <p className="text-xs text-slate-500">รวมเงินเติมสมาชิก</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-sm text-slate-600">จำนวนเซสชัน</p>
                <p className="text-2xl font-bold">{now.sessions}</p>
                <Delta now={now.sessions} before={before.sessions} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-sm text-slate-600">เฉลี่ยต่อเซสชัน</p>
                <p className="text-2xl font-bold">{formatBaht(avgPerSession)}</p>
                <p className="text-xs text-slate-500">
                  {days} วัน · เฉลี่ย {Math.round(now.sessions / days)} เซสชัน/วัน
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">รายวัน</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <ul className="divide-y">
                {rows.map((r) => (
                  <li
                    key={r.sale_date}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6"
                  >
                    <span className="text-sm">{r.sale_date}</span>
                    <span className="text-sm text-slate-500">
                      {r.sessions} เซสชัน
                    </span>
                    <span className="text-sm font-semibold">
                      {formatBaht(Number(r.net_revenue))} ฿
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: เพิ่มลิงก์ในหน้า "เพิ่มเติม"**

ใน `src/app/(app)/more/page.tsx` เพิ่ม import `TrendingUp` จาก `lucide-react`
แล้วเพิ่มรายการนี้เป็นตัวแรกของ `ITEMS`:

```tsx
  {
    href: "/sales",
    label: "ยอดขายย้อนหลัง",
    description: "เลือกช่วงเวลาเอง เทียบกับช่วงก่อนหน้า",
    icon: TrendingUp,
  },
```

- [ ] **Step 3: ตรวจว่า build และ lint ผ่าน**

Run: `npm run build && npx eslint src`
Expected: `✓ Compiled successfully` และ lint ไม่มี error

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/sales/page.tsx" "src/app/(app)/more/page.tsx"
git commit -m "feat: หน้ายอดขายย้อนหลังตามช่วงเวลา"
```

---

## Task 12: คอมโพเนนต์ตาราง หมอ × วัน

สร้างคอมโพเนนต์ก่อนหน้าที่จะใช้มัน เพื่อให้ทุก task จบลงในสภาพที่ build ผ่าน

**Files:**
- Create: `src/app/(app)/commission/summary/matrix-view.tsx`

- [ ] **Step 1: เขียนคอมโพเนนต์**

สร้าง `src/app/(app)/commission/summary/matrix-view.tsx`:

```tsx
import { formatBaht } from "@/lib/constants"

type Row = {
  work_date: string
  therapist_id: string
  total_income: number
  status: string
}

export function MatrixView({
  rows,
  nameOf,
}: {
  rows: Row[]
  nameOf: Record<string, string>
}) {
  const dates = [...new Set(rows.map((r) => r.work_date))].sort()
  const therapistIds = [...new Set(rows.map((r) => r.therapist_id))]

  const cell = new Map<string, Row>()
  for (const r of rows) cell.set(`${r.therapist_id}|${r.work_date}`, r)

  const therapistTotal = (id: string) =>
    rows.filter((r) => r.therapist_id === id)
        .reduce((sum, r) => sum + Number(r.total_income), 0)

  const dayTotal = (date: string) =>
    rows.filter((r) => r.work_date === date)
        .reduce((sum, r) => sum + Number(r.total_income), 0)

  const sortedIds = therapistIds.sort((a, b) => therapistTotal(b) - therapistTotal(a))
  const grandTotal = rows.reduce((sum, r) => sum + Number(r.total_income), 0)

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border">
        <table className="text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left">หมอ</th>
              {dates.map((d) => (
                <th key={d} className="px-2 py-2 text-center whitespace-nowrap">
                  {Number(d.slice(8, 10))}
                </th>
              ))}
              <th className="px-3 py-2 text-right">รวม</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortedIds.map((id) => (
              <tr key={id}>
                <td className="sticky left-0 bg-white px-3 py-2 font-medium whitespace-nowrap">
                  {nameOf[id] ?? "ไม่ระบุ"}
                </td>
                {dates.map((d) => {
                  const c = cell.get(`${id}|${d}`)
                  if (!c) {
                    return (
                      <td key={d} className="px-2 py-2 text-center text-slate-300">
                        –
                      </td>
                    )
                  }
                  const usedGuarantee = c.status === "ใช้ประกัน"
                  return (
                    <td
                      key={d}
                      className={`px-2 py-2 text-center whitespace-nowrap ${
                        usedGuarantee ? "bg-amber-100 font-medium text-amber-900" : ""
                      }`}
                    >
                      {formatBaht(Number(c.total_income))}
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                  {formatBaht(therapistTotal(id))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 bg-slate-50 font-semibold">
            <tr>
              <td className="sticky left-0 bg-slate-50 px-3 py-2">รวม/วัน</td>
              {dates.map((d) => (
                <td key={d} className="px-2 py-2 text-center whitespace-nowrap">
                  {formatBaht(dayTotal(d))}
                </td>
              ))}
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {formatBaht(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">สีเหลือง</span>{" "}
        = วันที่ใช้ประกัน · <span className="text-slate-300">–</span> = ไม่เข้างาน ·
        เลื่อนตารางซ้ายขวาได้
      </p>
    </div>
  )
}
```

- [ ] **Step 2: ตรวจว่า build ผ่าน**

Run: `npm run build`
Expected: `✓ Compiled successfully` (คอมโพเนนต์ยังไม่ถูกใช้ที่ไหน แต่ต้อง compile ผ่าน)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/commission/summary/matrix-view.tsx"
git commit -m "feat: คอมโพเนนต์ตารางค่ามือ หมอ x วัน"
```

---

## Task 13: หน้าสรุปค่ามือข้ามวัน

**Files:**
- Create: `src/app/(app)/commission/summary/page.tsx`
- Modify: `src/app/(app)/commission/page.tsx`

- [ ] **Step 1: เขียนหน้า**

สร้าง `src/app/(app)/commission/summary/page.tsx`:

```tsx
import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { todayInShopTz } from "@/lib/datetime"
import { formatBaht } from "@/lib/constants"
import { type DateRange, rangeFromPreset } from "@/lib/date-range"
import { DateRangePicker } from "@/components/date-range-picker"
import { MatrixView } from "./matrix-view"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export const metadata = { title: "สรุปค่ามือ · สุขกายา POS" }

type Row = {
  work_date: string
  therapist_id: string
  sessions: number
  total_commission: number
  net_commission: number
  request_fee: number
  total_income: number
  status: string
}

export default async function CommissionSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; view?: string }>
}) {
  const supabase = await createClient()
  const today = todayInShopTz()
  const params = await searchParams

  const { data: profile } = await supabase.from("profiles").select("role").single()
  const role = profile?.role ?? "staff"

  if (role !== "admin" && role !== "manager") {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-bold">สรุปค่ามือ</h1>
        <p className="text-sm text-slate-600">
          หน้านี้แสดงรายได้ของหมอนวดทุกคนพร้อมกัน จึงเปิดให้เฉพาะผู้จัดการขึ้นไป
        </p>
        <Button asChild variant="outline">
          <Link href="/commission">ไปหน้าค่ามือรายวัน</Link>
        </Button>
      </div>
    )
  }

  const range: DateRange =
    params.from && params.to
      ? { from: params.from, to: params.to }
      : rangeFromPreset("thisMonth", today)

  const [{ data: daily }, { data: therapists }] = await Promise.all([
    supabase
      .from("v_therapist_daily")
      .select("work_date, therapist_id, sessions, total_commission, net_commission, request_fee, total_income, status")
      .gte("work_date", range.from)
      .lte("work_date", range.to)
      .order("work_date"),
    supabase.from("therapists").select("id, name"),
  ])

  const rows = (daily ?? []) as Row[]
  const nameOf = new Map((therapists ?? []).map((t) => [t.id, t.name]))

  const byTherapist = new Map<
    string,
    { days: number; sessions: number; commission: number; guaranteeDays: number; requestFee: number; income: number }
  >()

  for (const r of rows) {
    const agg = byTherapist.get(r.therapist_id) ?? {
      days: 0, sessions: 0, commission: 0, guaranteeDays: 0, requestFee: 0, income: 0,
    }
    agg.days += 1
    agg.sessions += Number(r.sessions)
    agg.commission += Number(r.total_commission)
    agg.requestFee += Number(r.request_fee)
    agg.income += Number(r.total_income)
    if (r.status === "ใช้ประกัน") agg.guaranteeDays += 1
    byTherapist.set(r.therapist_id, agg)
  }

  const summary = [...byTherapist.entries()]
    .map(([id, v]) => ({ id, name: nameOf.get(id) ?? "ไม่ระบุ", ...v }))
    .sort((a, b) => b.income - a.income)

  const grand = summary.reduce(
    (acc, s) => ({
      sessions: acc.sessions + s.sessions,
      commission: acc.commission + s.commission,
      guaranteeDays: acc.guaranteeDays + s.guaranteeDays,
      income: acc.income + s.income,
    }),
    { sessions: 0, commission: 0, guaranteeDays: 0, income: 0 }
  )

  const showMatrix = params.view === "matrix"
  const linkParams = new URLSearchParams({ from: range.from, to: range.to })

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">สรุปค่ามือ</h1>

      <DateRangePicker range={range} today={today} />

      <div className="flex gap-2">
        <Button asChild size="sm" variant={showMatrix ? "outline" : "default"}>
          <Link href={`/commission/summary?${linkParams.toString()}`}>สรุปรายหมอ</Link>
        </Button>
        <Button asChild size="sm" variant={showMatrix ? "default" : "outline"}>
          <Link href={`/commission/summary?${linkParams.toString()}&view=matrix`}>
            ตารางรายวัน
          </Link>
        </Button>
      </div>

      {summary.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          ไม่มีข้อมูลในช่วงที่เลือก
        </p>
      ) : showMatrix ? (
        <MatrixView rows={rows} nameOf={Object.fromEntries(nameOf)} />
      ) : (
        <>
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="flex items-baseline justify-between py-4">
              <span className="font-medium">รวมต้องจ่าย</span>
              <span className="text-2xl font-bold text-emerald-800">
                {formatBaht(grand.income)} ฿
              </span>
            </CardContent>
          </Card>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">หมอ</th>
                  <th className="px-2 py-2 text-right">วัน</th>
                  <th className="px-2 py-2 text-right">งาน</th>
                  <th className="px-2 py-2 text-right">ค่ามือจริง</th>
                  <th className="px-2 py-2 text-right">ใช้ประกัน</th>
                  <th className="px-3 py-2 text-right">รวมจ่าย</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {summary.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2 font-medium">{s.name}</td>
                    <td className="px-2 py-2 text-right">{s.days}</td>
                    <td className="px-2 py-2 text-right">{s.sessions}</td>
                    <td className="px-2 py-2 text-right">{formatBaht(s.commission)}</td>
                    <td className={`px-2 py-2 text-right ${s.guaranteeDays > 0 ? "text-amber-700" : ""}`}>
                      {s.guaranteeDays > 0 ? `${s.guaranteeDays} วัน` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatBaht(s.income)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 bg-slate-50 font-semibold">
                <tr>
                  <td className="px-3 py-2">รวม</td>
                  <td className="px-2 py-2 text-right">—</td>
                  <td className="px-2 py-2 text-right">{grand.sessions}</td>
                  <td className="px-2 py-2 text-right">{formatBaht(grand.commission)}</td>
                  <td className="px-2 py-2 text-right">{grand.guaranteeDays} วัน</td>
                  <td className="px-3 py-2 text-right">{formatBaht(grand.income)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {grand.guaranteeDays > 0 && (
            <p className="text-xs text-amber-700">
              จ่ายเกินค่ามือจริงเพราะประกัน{" "}
              {formatBaht(grand.income - grand.commission)} บาท ในช่วงนี้
            </p>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: ตรวจว่า build ผ่าน**

Run: `npm run build && npx eslint src`
Expected: `✓ Compiled successfully` และเห็น route `/commission/summary`

- [ ] **Step 3: เพิ่มลิงก์จากหน้าค่ามือรายวัน**

ใน `src/app/(app)/commission/page.tsx` เพิ่ม `Button` ใต้หัวข้อ (หลัง `<h1>`)
โดยวางไว้ในกลุ่มปุ่มเดียวกับปุ่มเลื่อนวัน:

```tsx
        <Button asChild size="sm" variant="outline">
          <Link href="/commission/summary">ดูสรุปข้ามวัน</Link>
        </Button>
```

ต้องเพิ่ม `import { Button } from "@/components/ui/button"` ถ้ายังไม่มี

- [ ] **Step 4: ตรวจอีกครั้งแล้ว commit**

Run: `npm run build && npx eslint src`
Expected: ผ่านทั้งคู่

```bash
git add "src/app/(app)/commission"
git commit -m "feat: หน้าสรุปค่ามือข้ามวัน สองมุมมอง"
```

---

## Task 14: ย้ายหน้าเดิมมาใช้ view (แก้บั๊กประกันมือ)

**Files:**
- Modify: `src/app/(app)/commission/page.tsx`
- Modify: `src/app/(app)/reports/page.tsx`

- [ ] **Step 1: บันทึกตัวเลขก่อนแก้ไว้เทียบ**

รัน SQL:

```sql
select round(sum(total_income)) as correct_june
from public.v_therapist_daily
where work_date between '2026-06-01' and '2026-06-30';
```

Expected: `140415` — หลังแก้โค้ด หน้ารายงานเดือน มิ.ย. ต้องแสดงค่ามือเท่านี้

- [ ] **Step 2: แก้หน้าค่ามือรายวันให้ดึงจาก view**

ใน `src/app/(app)/commission/page.tsx` แทนที่การ query `sales` + `settings` +
การคำนวณ `summary` ด้วยการ query view:

```tsx
  const [{ data: therapists }, { data: daily }, { data: records }] = await Promise.all([
    supabase.from("therapists").select("id, name").eq("status", "active").order("name"),
    supabase
      .from("v_therapist_daily")
      .select("therapist_id, sessions, total_commission, request_fee, net_commission, total_income, status, guarantee_amount")
      .eq("work_date", workDate),
    supabase
      .from("therapist_daily_commission")
      .select("therapist_id, is_paid")
      .eq("work_date", workDate),
  ])

  const dailyByTherapist = new Map((daily ?? []).map((d) => [d.therapist_id, d]))
  const paidMap = new Map((records ?? []).map((r) => [r.therapist_id, r.is_paid]))
  const guarantee = Number((daily ?? [])[0]?.guarantee_amount) || DEFAULT_MIN_COMMISSION

  const summary = (therapists ?? []).map((t) => {
    const d = dailyByTherapist.get(t.id)
    return {
      therapistId: t.id,
      name: t.name,
      sessions: Number(d?.sessions ?? 0),
      worked: Boolean(d),
      totalCommission: Number(d?.total_commission ?? 0),
      requestFee: Number(d?.request_fee ?? 0),
      netCommission: Number(d?.net_commission ?? 0),
      totalIncome: Number(d?.total_income ?? 0),
      status: d ? String(d.status) : "ไม่ได้เข้างาน",
      usedGuarantee: d?.status === "ใช้ประกัน",
      paid: paidMap.get(t.id) ?? false,
    }
  })
```

ส่วนที่เหลือของไฟล์ (การแสดงผล) ใช้ตัวแปรชื่อเดิมทั้งหมด จึงไม่ต้องแก้

- [ ] **Step 3: แก้หน้ารายงานให้ดึงค่ามือจาก view**

ใน `src/app/(app)/reports/page.tsx` ลบการคำนวณ `perDayTherapist` / `commissionCost` /
`guaranteeTopUp` / `byTherapist` ทั้งหมด แล้วแทนด้วย:

```tsx
  const { data: therapistDaily } = await supabase
    .from("v_therapist_daily")
    .select("work_date, therapist_id, sessions, total_commission, net_commission, request_fee, total_income")
    .gte("work_date", from)
    .lte("work_date", to)

  const commissionCost = (therapistDaily ?? []).reduce(
    (sum, d) => sum + Number(d.total_income), 0
  )
  const guaranteeTopUp = (therapistDaily ?? []).reduce(
    (sum, d) => sum + (Number(d.net_commission) - Number(d.total_commission)), 0
  )

  const byTherapist = new Map<string, { income: number; days: number; sessions: number }>()
  for (const d of therapistDaily ?? []) {
    const agg = byTherapist.get(d.therapist_id) ?? { income: 0, days: 0, sessions: 0 }
    agg.income += Number(d.total_income)
    agg.days += 1
    agg.sessions += Number(d.sessions)
    byTherapist.set(d.therapist_id, agg)
  }
```

การ query `sales` เดิมยังต้องคงไว้สำหรับ `revenue`, `byPayment`, `byService`
แต่ **ต้องเปลี่ยน `revenue` ให้ใช้รายได้ที่รับรู้** ตามที่ตกลงใน spec:

```tsx
  const revenue = rows.reduce(
    (sum, s) => sum + Number(s.revenue_recognize ?? s.net_amount), 0
  )
```

และเพิ่ม `revenue_recognize` ในรายการ `.select()` ของ query `sales`

- [ ] **Step 4: ตรวจว่า build และ lint ผ่าน**

Run: `npm run build && npx eslint src`
Expected: ผ่านทั้งคู่

- [ ] **Step 5: รันชุดตรวจตัวเลขอีกครั้ง**

รัน `supabase/reconciliation.sql` ผ่าน MCP `execute_sql`
Expected: PASS ทุกแถว

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/commission/page.tsx" "src/app/(app)/reports/page.tsx"
git commit -m "fix: ให้หน้าค่ามือและรายงานดึงจาก view เดียวกัน

แก้บั๊กประกันมือ 'วันทำงานผี' — รายการขายที่ไม่ได้ระบุหมอนวดเคยได้ประกัน
500 บาท/วัน รวมค่ามือปลอม 3,500 บาท ตอนนี้ v_therapist_daily กรองออกให้แล้ว
และเปลี่ยนรายได้ในหน้ารายงานเป็นยอดที่รับรู้ตาม spec"
```

---

## Task 15: ตรวจสอบปลายทางและ deploy

**Files:** ไม่มีการแก้ไขโค้ด

- [ ] **Step 1: รันเทสทั้งหมด**

Run: `npm test`
Expected: PASS ทุกไฟล์

- [ ] **Step 2: build และ lint**

Run: `npm run build && npx eslint src`
Expected: ผ่านทั้งคู่ และเห็น route `/sales` กับ `/commission/summary`

- [ ] **Step 3: รันชุดตรวจตัวเลขครั้งสุดท้าย**

รัน `supabase/reconciliation.sql`
Expected: PASS ทุกแถว

- [ ] **Step 4: ตรวจ security advisor**

ใช้ MCP `get_advisors` type `security`
Expected: ไม่มีคำเตือนใหม่นอกจาก 2 อันเดิม (`app_role` และ leaked password protection)

- [ ] **Step 5: ทดสอบด้วยตาบนเครื่อง**

```bash
npm run dev
```

เปิดแล้วตรวจ:
- `/sales` — เปลี่ยน preset แล้วตัวเลขเปลี่ยนตาม · เลือกช่วงกำหนดเองได้
- `/sales?from=2026-06-01&to=2026-06-30` — รายได้ที่รับรู้ต้องเป็น **347,018**
- `/commission/summary?from=2026-06-01&to=2026-06-30` — รวมต้องจ่าย **140,415**
- สลับไปมุมมองตารางแล้วเลื่อนซ้ายขวาได้บนจอแคบ
- `/commission/summary` ในบัญชี staff ต้องเห็นข้อความว่าไม่มีสิทธิ์

- [ ] **Step 6: Deploy**

```bash
npx vercel deploy --prod
```

- [ ] **Step 7: ตรวจบน production**

เปิด `https://sookkaya-pos.vercel.app/sales` แล้วยืนยันว่าหน้าโหลดได้และตัวเลขตรงกับบนเครื่อง

- [ ] **Step 8: อัปเดต README**

ใน `README.md` เพิ่มสองบรรทัดนี้ในตารางหน้าที่มีแล้ว:

```markdown
| `/sales`         | ยอดขายย้อนหลัง เลือกช่วงเวลาเอง เทียบช่วงก่อนหน้า          |
| `/commission/summary` | สรุปค่ามือข้ามวัน สองมุมมอง (manager+)                |
```

และเปลี่ยนบรรทัดสถานะเป็น:

```markdown
- [x] **เฟส 1 Analytics** — กู้เวลาขาย · แยกประเภทต้นทุน · SQL views · ดูย้อนหลัง
```

- [ ] **Step 9: Commit**

```bash
git add README.md
git commit -m "docs: อัปเดต README สำหรับเฟส 1 analytics"
```

---

## เสร็จแล้วได้อะไร

- เลือกช่วงเวลาเองแล้วดูยอดขายย้อนหลังได้ พร้อมเทียบช่วงก่อนหน้า
- สรุปค่ามือหมอข้ามวันสองมุมมอง (จ่ายเงิน / วางแผน)
- สูตรการเงินอยู่ใน view ที่เดียว — บั๊กประกันมือ "วันทำงานผี" หายทั้งระบบ
- เวลาขาย ~1,589 รายการกลับมา (พร้อมสำหรับ heatmap ในเฟส 3)
- ต้นทุนแยก fixed/variable/onetime และต้นทุนวัสดุต่อเมนู (พร้อมสำหรับเฟส 2–3)
- ชุดตรวจตัวเลขกับ Excel ที่รันซ้ำได้ทุกครั้งที่แก้สูตร

## ยังไม่ได้ทำ (เฟสถัดไป)

P&L รายเดือน · จุดคุ้มทุน · heatmap · กำไรต่อเมนู · ROI ส่วนลด · LTV สมาชิก
