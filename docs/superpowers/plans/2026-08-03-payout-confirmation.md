# ยืนยันการจ่ายค่ามือหมอและเงินเดือนพนักงาน — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทุกงวดจ่าย (ค่ามือ 3 งวด + เงินเดือน 1 งวดต่อเดือน) ถูกติ๊กยืนยันสองขั้นบนหน้า `/commission` พร้อมแช่แข็งตัวเลข ณ วันติ๊ก

**Architecture:** นิยามงวดเป็น pure function ใน `lib/payout-periods.ts` (ที่เดียว) · การคำนวณยอดสองฝั่งอยู่ใน server helper ตัวเดียวที่ทั้งหน้าเว็บและ action ใช้ร่วมกัน (กันเลขบนจอกับเลขที่แช่แข็งเพี้ยนจากกัน) · การยืนยันเก็บในตาราง `payout_confirmations` แถวละงวด

**Tech Stack:** Next.js 16 App Router (server components + server actions) · Supabase · vitest

## Global Constraints

- `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"` ก่อนรัน node/npx ทุกครั้ง
- อ่าน `AGENTS.md`: Next.js เวอร์ชันนี้ API ต่างจาก training data — เปิด `node_modules/next/dist/docs/` ก่อนแตะ API ของ Next
- คอมเมนต์ภาษาไทย อธิบาย "ทำไม" ไม่ใช่ "ทำอะไร"
- ห้ามใส่ `"use client"` ในไฟล์ `src/lib/`
- ทุก view/ตารางใหม่บน Supabase: ตรวจ `views_without_security_invoker = 0` หลังรัน migration
- ด่านก่อน commit: `npx tsc --noEmit && npx eslint src/ && npx vitest run` (ถ้า tsc ฟ้อง `LayoutRoutes`/`validator.ts` ให้ `rm -rf .next` ก่อน)
- ห้าม push ห้าม deploy จนกว่า Task 6
- project_id Supabase: `jrioyrmicioqammeevgh` · โหลด MCP tools ด้วย ToolSearch `select:mcp__a4f4495c-332a-4143-9f8a-5da731df7599__apply_migration,mcp__a4f4495c-332a-4143-9f8a-5da731df7599__execute_sql,mcp__a4f4495c-332a-4143-9f8a-5da731df7599__generate_typescript_types`

---

## โครงไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `supabase/migrations/20260803160000_payout_confirmations.sql` | ตาราง + RLS + `staff_members.base_salary` |
| `src/lib/payout-periods.ts` + `.test.ts` | นิยามงวด 4 งวด/เดือน · เกณฑ์ต้องมีเหตุผล · สถานะ · ติ๊กได้เมื่อไหร่ (pure, TDD) |
| `src/app/(app)/commission/payout-amounts.ts` | server helper คำนวณยอดสองฝั่งของงวด — หน้าเว็บและ action ใช้ตัวเดียวกัน |
| `src/app/(app)/commission/payout-actions.ts` | markPayoutPaid / cancelPayoutPaid / endorsePayout |
| `src/app/(app)/commission/payout-card.tsx` | กล่องยืนยัน (client) |
| `src/app/(app)/commission/page.tsx` | ดึง role + งวด + ยอด แล้ววางกล่อง (เฉพาะ admin/manager) |
| `src/app/(app)/team/staff-salary-card.tsx` + `staff-actions.ts` | แก้เงินเดือนตั้งต้น + สถานะยังทำงาน (หน้าทีมงานเดิมเป็นหน้าดูอย่างเดียว ไม่มีที่แก้ — สร้างใหม่) |
| `supabase/reconciliation.sql` | ด่าน `endorsed_payout_drift` |

---

## Task 1: Migration + types

**Files:**
- Create: `supabase/migrations/20260803160000_payout_confirmations.sql`
- Modify: `src/types/database.ts` (generate ทับ ห้ามเขียนมือ)

**Interfaces:**
- Produces: ตาราง `payout_confirmations` และคอลัมน์ `staff_members.base_salary` ให้ทุก task ถัดไป

- [ ] **Step 1: เขียนไฟล์ migration**

```sql
-- ยืนยันการจ่ายรายงวด — แถวหนึ่งคือหนึ่งงวดของเดือน มีแถว = ติ๊ก "จ่ายแล้ว" แล้ว
--
-- ที่มา: 3/8/2569 เจอค่ามือหมอ ก.ค. ถูกคีย์ซ้ำ 92,025 และส่วนต่างจ่ายจริง 180 บาท
-- ที่สืบไม่ได้เพราะไม่มีบันทึกว่าตอนจ่ายเงินระบบคำนวณได้เท่าไหร่
-- ตารางนี้แช่แข็งตัวเลขทั้งสองฝั่ง ณ วินาทีติ๊ก เป็นหลักฐานตรวจย้อนหลัง
--
-- สองขั้น: คนจ่ายติ๊ก (มีแถว) → เจ้าของร้านรับรอง (endorsed_at ไม่ null = ปิดงวดถาวร)

create table public.payout_confirmations (
  id               uuid primary key default gen_random_uuid(),
  month            text not null,                -- '2026-08'
  kind             text not null check (kind in ('commission', 'salary')),
  period_no        smallint not null default 0,  -- 1|2|3 = งวดค่ามือ · 0 = เงินเดือน
  computed_amount  numeric not null,             -- ระบบคำนวณ ณ ตอนติ๊ก (แช่แข็ง)
  recorded_amount  numeric not null,             -- รายจ่ายที่บันทึกไว้ ณ ตอนติ๊ก (แช่แข็ง)
  variance_reason  text,                         -- บังคับเมื่อสองยอดไม่เท่ากัน (บังคับใน server action)
  paid_by          text not null,                -- ชื่อจาก profiles.full_name (convention เดียวกับ sales.created_by)
  paid_at          timestamptz not null default now(),
  endorsed_by      text,
  endorsed_at      timestamptz,
  unique (month, kind, period_no)
);

alter table public.payout_confirmations enable row level security;

-- เห็นและแก้ได้เฉพาะผู้จัดการ/เจ้าของร้าน — พนักงานทั่วไปไม่เกี่ยวกับการจ่ายเงิน
-- ส่วน "รับรองได้เฉพาะ admin" บังคับใน server action เพราะ RLS แยกชนิดการ update ไม่ได้
create policy payout_confirmations_manager on public.payout_confirmations
  for all using (app_role() = any (array['admin', 'manager']))
  with check (app_role() = any (array['admin', 'manager']));

-- เงินเดือนตั้งต้นต่อคน — ยอดคาดหวังของงวดเงินเดือน = ผลรวมของคนที่ยัง is_active
-- โบนัส/คอมมิชชันที่เงื่อนไขยังไม่ชัด ไม่ทำสูตร ใช้ช่องเหตุผลตอนติ๊กแทน (เจ้าของร้านตัดสิน 3/8/2569)
alter table public.staff_members add column base_salary numeric not null default 0;
```

- [ ] **Step 2: รันด้วย MCP `apply_migration`** name = `payout_confirmations`

- [ ] **Step 3: ตรวจผลจริง**

```sql
select
  (select count(*) from information_schema.columns
    where table_name='payout_confirmations') as คอลัมน์ตารางใหม่,
  (select count(*) from information_schema.columns
    where table_name='staff_members' and column_name='base_salary') as มี_base_salary,
  (select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid
    where c.relname='payout_confirmations') as จำนวน_policy,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='v'
      and c.reloptions is distinct from array['security_invoker=true']::text[]) as view_สิทธิ์หลุด;
```
Expected: `11 · 1 · 1 · 0`

- [ ] **Step 4: generate types** ด้วย MCP `generate_typescript_types` เขียนทับ `src/types/database.ts`
(ไฟล์นี้มีคอมเมนต์ 4 บรรทัดบนสุดบอกวิธี regenerate ที่ generator ไม่ใส่กลับ — เติมคืนตามของเดิม
ดูด้วย `git show HEAD:src/types/database.ts | head -6`)
ยืนยัน: `grep -c "payout_confirmations" src/types/database.ts` ต้อง > 0 แล้วรัน `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260803160000_payout_confirmations.sql src/types/database.ts
git commit -m "feat(payout): ตาราง payout_confirmations + เงินเดือนตั้งต้นพนักงาน"
```

---

## Task 2: `src/lib/payout-periods.ts` (TDD)

**Files:**
- Create: `src/lib/payout-periods.ts`
- Test: `src/lib/payout-periods.test.ts`

**Interfaces:**
- Produces (task 3-5 ใช้ตามนี้เป๊ะ):
  - `type PayoutKind = "commission" | "salary"`
  - `type PayoutPeriod = { kind: PayoutKind; periodNo: number; label: string; from: string; to: string }`
  - `payoutPeriodsOf(month: string): PayoutPeriod[]` — 4 งวดเรียง: ค่ามือ 1,2,3 แล้วเงินเดือน
  - `needsReason(computed: number, recorded: number): boolean`
  - `canConfirmOn(period: PayoutPeriod, today: string): boolean` — วันนี้ ≥ วันสุดท้ายของงวด
  - `type ConfirmationStatus = "pending" | "paid" | "endorsed"`
  - `statusOf(row: { endorsed_at: string | null } | null): ConfirmationStatus`

- [ ] **Step 1: เขียนเทสให้แดงก่อน**

สร้าง `src/lib/payout-periods.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  canConfirmOn,
  needsReason,
  payoutPeriodsOf,
  statusOf,
} from "./payout-periods"

describe("payoutPeriodsOf", () => {
  it("เดือน 31 วัน ได้ 4 งวด ช่วงวันถูกต้อง", () => {
    const p = payoutPeriodsOf("2026-08")
    expect(p).toHaveLength(4)
    expect(p[0]).toMatchObject({ kind: "commission", periodNo: 1, from: "2026-08-01", to: "2026-08-10" })
    expect(p[1]).toMatchObject({ kind: "commission", periodNo: 2, from: "2026-08-11", to: "2026-08-20" })
    expect(p[2]).toMatchObject({ kind: "commission", periodNo: 3, from: "2026-08-21", to: "2026-08-31" })
    expect(p[3]).toMatchObject({ kind: "salary", periodNo: 0, from: "2026-08-01", to: "2026-08-31" })
  })

  it("เดือน 30 วัน งวดท้ายจบวันที่ 30", () => {
    const p = payoutPeriodsOf("2026-09")
    expect(p[2].to).toBe("2026-09-30")
    expect(p[3].to).toBe("2026-09-30")
  })

  it("ก.พ. ปกติจบ 28 · ปีอธิกสุรทินจบ 29", () => {
    expect(payoutPeriodsOf("2026-02")[2].to).toBe("2026-02-28")
    expect(payoutPeriodsOf("2028-02")[2].to).toBe("2028-02-29")
  })

  it("ป้ายชื่ออ่านรู้เรื่องเป็นภาษาไทย", () => {
    const p = payoutPeriodsOf("2026-08")
    expect(p[0].label).toContain("1-10")
    expect(p[3].label).toContain("เงินเดือน")
  })
})

describe("needsReason", () => {
  it("เท่ากันเป๊ะ = ไม่ต้อง", () => {
    expect(needsReason(49145, 49145)).toBe(false)
  })
  // เคสจริง ก.ค.: งวด 1-10 ต่าง 50 · งวด 21-31 ต่าง 130 — ต้องมีเหตุผลทั้งคู่
  it("ต่างแม้แต่บาทเดียวหรือเศษสตางค์ = ต้อง", () => {
    expect(needsReason(47830, 47880)).toBe(true)
    expect(needsReason(100, 99)).toBe(true)
    expect(needsReason(100, 100.5)).toBe(true)
  })
})

describe("canConfirmOn", () => {
  const p2 = payoutPeriodsOf("2026-08")[1] // ค่ามือ 11-20
  it("ก่อนวันสุดท้ายของงวด = ยังติ๊กไม่ได้", () => {
    expect(canConfirmOn(p2, "2026-08-15")).toBe(false)
    expect(canConfirmOn(p2, "2026-08-19")).toBe(false)
  })
  it("ตั้งแต่วันสุดท้ายของงวดเป็นต้นไป = ติ๊กได้ รวมเดือนถัดๆ ไป", () => {
    expect(canConfirmOn(p2, "2026-08-20")).toBe(true)
    expect(canConfirmOn(p2, "2026-09-01")).toBe(true)
  })
  it("เงินเดือนติ๊กได้ตั้งแต่วันสิ้นเดือน", () => {
    const salary = payoutPeriodsOf("2026-08")[3]
    expect(canConfirmOn(salary, "2026-08-30")).toBe(false)
    expect(canConfirmOn(salary, "2026-08-31")).toBe(true)
  })
})

describe("statusOf", () => {
  it("ไม่มีแถว = รอจ่าย", () => {
    expect(statusOf(null)).toBe("pending")
  })
  it("มีแถวแต่ยังไม่รับรอง = จ่ายแล้ว", () => {
    expect(statusOf({ endorsed_at: null })).toBe("paid")
  })
  it("รับรองแล้ว", () => {
    expect(statusOf({ endorsed_at: "2026-08-12T03:00:00Z" })).toBe("endorsed")
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าแดง**
`npx vitest run src/lib/payout-periods.test.ts` → FAIL (Cannot find module)

- [ ] **Step 3: เขียน implementation**

สร้าง `src/lib/payout-periods.ts`:

```ts
import { daysInMonth } from "@/lib/month"

/**
 * งวดจ่ายเงินของร้าน — ที่เดียวของความจริง
 *
 * ร้านจ่ายค่ามือหมอเดือนละ 3 งวด (1-10 · 11-20 · 21-สิ้นเดือน) และเงินเดือนพนักงาน
 * สิ้นเดือน 1 งวด ถ้าอนาคตรอบจ่ายเปลี่ยน แก้ payoutPeriodsOf ที่เดียวแล้วทุกอย่างตาม
 *
 * ห้ามใส่ "use client" — ฝั่งเรียกเป็น server component/action
 */

export type PayoutKind = "commission" | "salary"

export type PayoutPeriod = {
  kind: PayoutKind
  /** 1|2|3 = งวดค่ามือ · 0 = เงินเดือน */
  periodNo: number
  label: string
  /** ISO วันแรกของช่วง */
  from: string
  /** ISO วันสุดท้ายของช่วง */
  to: string
}

/** งวดทั้ง 4 ของเดือน เรียงตามลำดับจ่ายจริง — สิ้นเดือนคิดถูกทั้ง 28/29/30/31 */
export function payoutPeriodsOf(month: string): PayoutPeriod[] {
  const last = daysInMonth(month)
  const d = (day: number) => `${month}-${String(day).padStart(2, "0")}`
  return [
    { kind: "commission", periodNo: 1, label: "ค่ามือหมอ 1-10", from: d(1), to: d(10) },
    { kind: "commission", periodNo: 2, label: "ค่ามือหมอ 11-20", from: d(11), to: d(20) },
    { kind: "commission", periodNo: 3, label: `ค่ามือหมอ 21-${last}`, from: d(21), to: d(last) },
    { kind: "salary", periodNo: 0, label: "เงินเดือนพนักงานประจำ", from: d(1), to: d(last) },
  ]
}

/** ยอดสองฝั่งไม่เท่ากันแม้แต่สตางค์เดียว = ต้องเขียนเหตุผลก่อนติ๊ก (เจ้าของร้านเลือกเกณฑ์นี้) */
export function needsReason(computed: number, recorded: number): boolean {
  return computed !== recorded
}

/**
 * ติ๊กได้ตั้งแต่วันสุดท้ายของงวดเป็นต้นไป — งวด 1-10 ติ๊กได้ตั้งแต่วันที่ 10
 * ก่อนหน้านั้นยอดยังไม่นิ่ง (ยังมีบิลเพิ่มได้) ติ๊กไปก็ต้องยกเลิกแก้ใหม่
 */
export function canConfirmOn(period: PayoutPeriod, today: string): boolean {
  return today >= period.to
}

export type ConfirmationStatus = "pending" | "paid" | "endorsed"

/** สถานะงวดจากแถวยืนยัน — ไม่มีแถว = ยังไม่ติ๊ก */
export function statusOf(
  row: { endorsed_at: string | null } | null
): ConfirmationStatus {
  if (!row) return "pending"
  return row.endorsed_at ? "endorsed" : "paid"
}
```

- [ ] **Step 4: รันให้เขียว** — 12 เทสผ่าน แล้ว `npx tsc --noEmit && npx eslint src/`

- [ ] **Step 5: Commit**

```bash
git add src/lib/payout-periods.ts src/lib/payout-periods.test.ts
git commit -m "feat(payout): นิยามงวดจ่าย 4 งวดต่อเดือนไว้ที่เดียว + เทส"
```

---

## Task 3: server helper คำนวณยอด + server actions

**Files:**
- Create: `src/app/(app)/commission/payout-amounts.ts`
- Create: `src/app/(app)/commission/payout-actions.ts`

**Interfaces:**
- Consumes: `payoutPeriodsOf`, `needsReason`, `canConfirmOn` จาก `@/lib/payout-periods`
- Produces (task 4 ใช้ตามนี้):
  - `computePayoutAmounts(supabase, period): Promise<{ computed: number; recorded: number }>`
  - `markPayoutPaid(input: { month: string; kind: PayoutKind; periodNo: number; reason?: string }): Promise<PayoutActionResult>`
  - `cancelPayoutPaid(id: string): Promise<PayoutActionResult>`
  - `endorsePayout(id: string): Promise<PayoutActionResult>`
  - `type PayoutActionResult = { ok: true } | { ok: false; error?: string; needReason?: { computed: number; recorded: number } }`

- [ ] **Step 1: เขียน `payout-amounts.ts`**

```ts
import type { createClient } from "@/lib/supabase/server"
import type { PayoutPeriod } from "@/lib/payout-periods"

/**
 * ยอดสองฝั่งของงวด — helper ตัวเดียวที่ทั้งหน้าเว็บ (โชว์) และ action (แช่แข็ง) ใช้ร่วมกัน
 * ห้ามแยกคำนวณสองที่ ไม่งั้นเลขบนจอกับเลขที่แช่แข็งเพี้ยนจากกันได้ (บทเรียนซ้ำของโปรเจกต์นี้)
 *
 * สูตรพิสูจน์กับข้อมูล ก.ค. จริงแล้ว: งวด 11-20 สองฝั่งเท่ากันเป๊ะ 49,145
 * (เงินเบิกล่วงหน้าที่ expense_date อยู่ในงวดถูกนับรวมฝั่งจ่ายจริง — ตรงกับวิธีที่ร้านจ่าย)
 */

/** หมวดรายจ่ายที่ผูกกับงวดแต่ละชนิด — ต้องตรงกับชื่อจริงใน expense_category_types */
export const PAYOUT_EXPENSE_CATEGORY = {
  commission: "HR / payroll (ค่ามือหมอ)",
  salary: "เงินเดือนพนักงานประจำ",
} as const

type Supabase = Awaited<ReturnType<typeof createClient>>

export async function computePayoutAmounts(
  supabase: Supabase,
  period: PayoutPeriod
): Promise<{ computed: number; recorded: number }> {
  // ฝั่งจ่ายจริง: รายจ่ายในหมวดของงวด ที่ลงวันที่ในช่วงงวด
  const { data: expenses, error: expErr } = await supabase
    .from("expenses")
    .select("amount")
    .eq("category", PAYOUT_EXPENSE_CATEGORY[period.kind])
    .gte("expense_date", period.from)
    .lte("expense_date", period.to)
  if (expErr) throw new Error(`อ่านรายจ่ายไม่สำเร็จ: ${expErr.message}`)
  const recorded = (expenses ?? []).reduce((s, e) => s + (e.amount ?? 0), 0)

  if (period.kind === "commission") {
    // ฝั่งระบบคำนวณ: ค่ามือรวมจากบิลในช่วงงวด (สูตรเดียวกับหน้าค่ามือ)
    const { data: daily, error } = await supabase
      .from("v_therapist_daily")
      .select("total_income")
      .gte("work_date", period.from)
      .lte("work_date", period.to)
    if (error) throw new Error(`คำนวณค่ามือไม่สำเร็จ: ${error.message}`)
    const computed = (daily ?? []).reduce((s, d) => s + (d.total_income ?? 0), 0)
    return { computed, recorded }
  }

  // เงินเดือน: ยอดคาดหวัง = เงินเดือนตั้งต้นรวมของพนักงานที่ยังทำงานอยู่
  // คนลาออก (is_active=false) หลุดจากยอดเองโดยไม่ต้องทำอะไรเพิ่ม
  const { data: staff, error: staffErr } = await supabase
    .from("staff_members")
    .select("base_salary")
    .eq("is_active", true)
  if (staffErr) throw new Error(`อ่านเงินเดือนตั้งต้นไม่สำเร็จ: ${staffErr.message}`)
  const computed = (staff ?? []).reduce((s, m) => s + (m.base_salary ?? 0), 0)
  return { computed, recorded }
}
```

- [ ] **Step 2: เขียน `payout-actions.ts`**

```ts
"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { todayInShopTz } from "@/lib/datetime"
import {
  type PayoutKind,
  canConfirmOn,
  needsReason,
  payoutPeriodsOf,
} from "@/lib/payout-periods"
import { computePayoutAmounts } from "./payout-amounts"

export type PayoutActionResult =
  | { ok: true }
  /** needReason มีค่า = ยังไม่บันทึก ยอดสองฝั่งไม่ตรง รอกรอกเหตุผลแล้วส่งใหม่ */
  | { ok: false; error?: string; needReason?: { computed: number; recorded: number } }

/** สิทธิ์ขั้นต่ำของทุก action ในไฟล์นี้ — พนักงานทั่วไปไม่เกี่ยวกับการจ่ายเงิน */
async function requireManager() {
  const me = await getMyProfile()
  if (!me || !["admin", "manager"].includes(me.role)) return null
  return me
}

export async function markPayoutPaid(input: {
  month: string
  kind: PayoutKind
  periodNo: number
  reason?: string
}): Promise<PayoutActionResult> {
  const me = await requireManager()
  if (!me) return { ok: false, error: "เฉพาะผู้จัดการ/เจ้าของร้านเท่านั้น" }

  const period = payoutPeriodsOf(input.month).find(
    (p) => p.kind === input.kind && p.periodNo === input.periodNo
  )
  if (!period) return { ok: false, error: "ไม่รู้จักงวดนี้" }

  // กันติ๊กก่อนงวดจบ — ฝั่ง UI ซ่อนปุ่มอยู่แล้ว แต่ server ต้องกันเองด้วยเสมอ
  if (!canConfirmOn(period, todayInShopTz())) {
    return { ok: false, error: `งวดนี้ยังไม่จบ ติ๊กได้ตั้งแต่วันที่ ${period.to.slice(8)} เป็นต้นไป` }
  }

  const supabase = await createClient()
  // คำนวณสดใน action เสมอ ไม่เชื่อตัวเลขจาก client — ค่านี้คือของที่จะถูกแช่แข็ง
  const { computed, recorded } = await computePayoutAmounts(supabase, period)

  const reason = (input.reason ?? "").trim()
  if (needsReason(computed, recorded) && !reason) {
    // ไม่ใช่ error — ส่งยอดทั้งสองกลับไปให้ฟอร์มโชว์ช่องเหตุผล
    return { ok: false, needReason: { computed, recorded } }
  }

  const { data: inserted, error } = await supabase
    .from("payout_confirmations")
    .insert({
      month: input.month,
      kind: input.kind,
      period_no: input.periodNo,
      computed_amount: computed,
      recorded_amount: recorded,
      variance_reason: reason || null,
      paid_by: me.full_name ?? me.email ?? "ไม่ระบุ",
    })
    .select("id")
  if (error) {
    if (error.code === "23505") return { ok: false, error: "งวดนี้ถูกติ๊กไปแล้ว รีเฟรชหน้าดูสถานะล่าสุด" }
    return { ok: false, error: `บันทึกไม่สำเร็จ: ${error.message}` }
  }
  // RLS กรองเงียบ (0 แถว ไม่มี error) — ห้ามรายงานสำเร็จทั้งที่ไม่มีอะไรถูกเขียน
  if (!inserted || inserted.length === 0) {
    return { ok: false, error: "บันทึกไม่สำเร็จ — คุณอาจไม่มีสิทธิ์" }
  }

  revalidatePath("/commission")
  return { ok: true }
}

export async function cancelPayoutPaid(id: string): Promise<PayoutActionResult> {
  const me = await requireManager()
  if (!me) return { ok: false, error: "เฉพาะผู้จัดการ/เจ้าของร้านเท่านั้น" }

  const supabase = await createClient()
  // ยกเลิกได้เฉพาะที่ยังไม่รับรอง — งวดที่รับรองแล้วปิดถาวร
  const { data: deleted, error } = await supabase
    .from("payout_confirmations")
    .delete()
    .eq("id", id)
    .is("endorsed_at", null)
    .select("id")
  if (error) return { ok: false, error: error.message }
  if (!deleted || deleted.length === 0) {
    return { ok: false, error: "ยกเลิกไม่ได้ — งวดนี้ถูกรับรองแล้ว หรือคุณไม่มีสิทธิ์" }
  }

  revalidatePath("/commission")
  return { ok: true }
}

export async function endorsePayout(id: string): Promise<PayoutActionResult> {
  const me = await getMyProfile()
  // รับรองได้เฉพาะเจ้าของร้าน — RLS แยกชนิดการเขียนไม่ได้ จึงต้องกันที่นี่
  if (!me || me.role !== "admin") {
    return { ok: false, error: "รับรองได้เฉพาะเจ้าของร้านเท่านั้น" }
  }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from("payout_confirmations")
    .update({
      endorsed_by: me.full_name ?? me.email ?? "ไม่ระบุ",
      endorsed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("endorsed_at", null) // รับรองซ้ำไม่ได้ — เวลา/ชื่อครั้งแรกคือหลักฐาน
    .select("id")
  if (error) return { ok: false, error: error.message }
  if (!updated || updated.length === 0) {
    return { ok: false, error: "รับรองไม่สำเร็จ — อาจถูกรับรองไปแล้ว" }
  }

  revalidatePath("/commission")
  return { ok: true }
}
```

- [ ] **Step 3: ตรวจ** `npx tsc --noEmit && npx eslint src/` — ผ่าน
(หมายเหตุ: `payout-amounts.ts` ยังไม่มีใครเรียก อาจโดน eslint เตือน unused — ถ้าเตือนให้รายงาน อย่าลบ export)

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/commission/payout-amounts.ts" "src/app/(app)/commission/payout-actions.ts"
git commit -m "feat(payout): server actions ติ๊กจ่าย/ยกเลิก/รับรอง พร้อมแช่แข็งยอด ณ ตอนติ๊ก"
```

---

## Task 4: กล่องยืนยันบนหน้า `/commission`

**Files:**
- Create: `src/app/(app)/commission/payout-card.tsx`
- Modify: `src/app/(app)/commission/page.tsx`

**Interfaces:**
- Consumes: ทุกอย่างจาก Task 2-3 ตาม signature ที่ประกาศไว้
- Produces: `PayoutCard` component รับ `{ month, rows, role, today }`

- [ ] **Step 1: เขียน `payout-card.tsx`**

```tsx
"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  type PayoutActionResult,
  cancelPayoutPaid,
  endorsePayout,
  markPayoutPaid,
} from "./payout-actions"
import type { PayoutKind, PayoutPeriod } from "@/lib/payout-periods"
import { canConfirmOn, statusOf } from "@/lib/payout-periods"
import { formatBaht } from "@/lib/constants"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

/** แถวยืนยันที่ประกอบเสร็จจากฝั่ง server — client แค่แสดงกับกดปุ่ม ไม่คำนวณเอง */
export type PayoutRow = {
  period: PayoutPeriod
  computed: number
  recorded: number
  confirmation: {
    id: string
    computed_amount: number
    recorded_amount: number
    variance_reason: string | null
    paid_by: string
    paid_at: string
    endorsed_by: string | null
    endorsed_at: string | null
  } | null
}

function thaiDateTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "numeric", month: "short", timeZone: "Asia/Bangkok",
  })
}

export function PayoutCard({
  month, rows, role, today,
}: {
  month: string
  rows: PayoutRow[]
  role: string
  today: string
}) {
  const [pending, startTransition] = useTransition()
  // งวดที่กำลังรอกรอกเหตุผล (ยอดไม่ตรง) — เก็บยอดที่ server ส่งกลับมาโชว์
  const [reasonFor, setReasonFor] = useState<{
    key: string; computed: number; recorded: number
  } | null>(null)
  const [reason, setReason] = useState("")

  function handle(result: PayoutActionResult, rowKey?: string) {
    if (result.ok) {
      toast.success("บันทึกแล้ว")
      setReasonFor(null)
      setReason("")
    } else if (result.needReason && rowKey) {
      // ยอดไม่ตรง — เปิดช่องเหตุผลของแถวนั้น พร้อมยอดที่ server คำนวณสดส่งกลับมา
      setReasonFor({ key: rowKey, ...result.needReason })
    } else {
      toast.error(result.error ?? "ไม่สำเร็จ")
    }
  }

  function tick(row: PayoutRow, withReason?: string) {
    startTransition(async () => {
      const result = await markPayoutPaid({
        month,
        kind: row.period.kind as PayoutKind,
        periodNo: row.period.periodNo,
        reason: withReason,
      })
      handle(result, `${row.period.kind}-${row.period.periodNo}`)
    })
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <p className="font-semibold">ยืนยันการจ่าย</p>
        <ul className="divide-y">
          {rows.map((row) => {
            const key = `${row.period.kind}-${row.period.periodNo}`
            const status = statusOf(row.confirmation)
            const confirmable = canConfirmOn(row.period, today)
            // งวดที่ติ๊กแล้วโชว์ยอดที่แช่แข็ง · ยังไม่ติ๊กโชว์ยอดสด
            const computed = row.confirmation?.computed_amount ?? row.computed
            const recorded = row.confirmation?.recorded_amount ?? row.recorded
            const diff = recorded - computed
            return (
              <li key={key} className={`space-y-1 py-2 ${!confirmable && status === "pending" ? "opacity-50" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{row.period.label}</span>
                  {status === "pending" && !confirmable && (
                    <Badge variant="outline" className="text-slate-400">ยังไม่ถึงงวด</Badge>
                  )}
                  {status === "pending" && confirmable && (
                    <Button size="sm" disabled={pending} onClick={() => tick(row)}>
                      ติ๊กจ่ายแล้ว
                    </Button>
                  )}
                  {status === "paid" && (
                    <span className="flex items-center gap-2">
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                        จ่ายแล้ว รอรับรอง
                      </Badge>
                      {role === "admin" && row.confirmation && (
                        <Button size="sm" disabled={pending}
                          onClick={() => startTransition(async () => handle(await endorsePayout(row.confirmation!.id)))}>
                          รับรอง
                        </Button>
                      )}
                      {row.confirmation && (
                        <Button size="sm" variant="ghost" disabled={pending}
                          onClick={() => startTransition(async () => handle(await cancelPayoutPaid(row.confirmation!.id)))}>
                          ยกเลิก
                        </Button>
                      )}
                    </span>
                  )}
                  {status === "endorsed" && row.confirmation && (
                    <Badge variant="outline" className="border-green-300 bg-green-50 text-green-700">
                      รับรองแล้ว ✓
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-slate-600">
                  ระบบคำนวณ {formatBaht(computed)} ฿ · จ่ายจริง {formatBaht(recorded)} ฿
                  {diff !== 0 && (
                    <span className={diff > 0 ? "text-amber-600" : "text-red-600"}>
                      {" "}· ต่าง {diff > 0 ? "+" : ""}{formatBaht(diff)} ฿
                    </span>
                  )}
                </p>
                {row.confirmation?.variance_reason && (
                  <p className="text-xs text-slate-500">เหตุผล: {row.confirmation.variance_reason}</p>
                )}
                {row.confirmation && (
                  <p className="text-xs text-slate-400">
                    ติ๊กโดย {row.confirmation.paid_by} · {thaiDateTime(row.confirmation.paid_at)}
                    {row.confirmation.endorsed_at &&
                      ` · รับรองโดย ${row.confirmation.endorsed_by} · ${thaiDateTime(row.confirmation.endorsed_at)}`}
                  </p>
                )}
                {reasonFor?.key === key && (
                  <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm">
                    <p className="text-amber-900">
                      ยอดไม่ตรงกัน (ระบบ {formatBaht(reasonFor.computed)} · จ่ายจริง {formatBaht(reasonFor.recorded)})
                      — เขียนเหตุผลก่อนติ๊ก เช่น ปัดเศษเงินสด หรือโบนัสพิเศษ
                    </p>
                    <div className="flex gap-2">
                      <Input value={reason} onChange={(e) => setReason(e.target.value)}
                        placeholder="เหตุผลที่ยอดต่างกัน" className="h-10" />
                      <Button size="sm" disabled={pending || !reason.trim()}
                        onClick={() => tick(row, reason)}>
                        ยืนยัน
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: ต่อสายใน `page.tsx`**

อ่านไฟล์เดิมทั้งไฟล์ก่อน แล้วเพิ่มโดย**ไม่แตะเนื้อหาเดิม**:

1. import เพิ่ม: `getMyProfile` จาก `@/lib/auth` · `payoutPeriodsOf` จาก `@/lib/payout-periods` · `computePayoutAmounts` จาก `./payout-amounts` · `PayoutCard, type PayoutRow` จาก `./payout-card`
2. ใน `CommissionPage` หลังได้ `workDate`:

```tsx
  const me = await getMyProfile()
  const canConfirmPayouts = !!me && ["admin", "manager"].includes(me.role)

  // กล่องยืนยันตามเดือนของวันที่กำลังดู — เปลี่ยนวันข้ามเดือนกล่องตามเอง
  const month = workDate.slice(0, 7)
  let payoutRows: PayoutRow[] = []
  if (canConfirmPayouts) {
    const periods = payoutPeriodsOf(month)
    const { data: confirmations } = await supabase
      .from("payout_confirmations")
      .select("*")
      .eq("month", month)
    payoutRows = await Promise.all(
      periods.map(async (period) => {
        const confirmation =
          (confirmations ?? []).find(
            (c) => c.kind === period.kind && c.period_no === period.periodNo
          ) ?? null
        // งวดที่ติ๊กแล้วใช้ยอดแช่แข็ง ไม่ต้องคำนวณสดให้เปลืองเวลา DB
        const amounts = confirmation
          ? { computed: confirmation.computed_amount, recorded: confirmation.recorded_amount }
          : await computePayoutAmounts(supabase, period)
        return { period, ...amounts, confirmation }
      })
    )
  }
```

3. ใน JSX วาง `{canConfirmPayouts && <PayoutCard month={month} rows={payoutRows} role={me!.role} today={todayInShopTz()} />}` ไว้**บนสุดของเนื้อหา** (ใต้หัวข้อหน้า ก่อนตารางรายวันเดิม)

- [ ] **Step 3: ด่าน** `npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build` — ผ่านหมด

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/commission/payout-card.tsx" "src/app/(app)/commission/page.tsx"
git commit -m "feat(payout): กล่องยืนยันการจ่ายบนหน้าค่ามือ เฉพาะผู้จัดการ/เจ้าของร้าน"
```

---

## Task 5: เงินเดือนตั้งต้น + สถานะยังทำงาน บนหน้าทีมงาน

**Files:**
- Create: `src/app/(app)/team/staff-actions.ts`
- Create: `src/app/(app)/team/staff-salary-card.tsx`
- Modify: `src/app/(app)/team/page.tsx`

**Interfaces:**
- Consumes: `staff_members.base_salary` จาก Task 1
- Produces: `updateStaffMember(id, input: { baseSalary: number; isActive: boolean }): Promise<{ ok: true } | { ok: false; error: string }>`

**บริบทสำคัญ:** หน้าทีมงานเดิมเป็นหน้าดูอย่างเดียว (สรุป HR) ไม่มีที่แก้ข้อมูลพนักงานเลย
การ์ดนี้คือที่แรกที่แก้ `staff_members` ได้จาก UI

- [ ] **Step 1: เขียน `staff-actions.ts`**

```ts
"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"

/**
 * แก้เงินเดือนตั้งต้น + สถานะยังทำงานของพนักงานประจำ
 *
 * base_salary ใช้เป็นยอดคาดหวังตอนยืนยันการจ่ายเงินเดือน (ดู payout-amounts.ts)
 * ปิด is_active = ลาออก → หลุดจากยอดคาดหวังเดือนถัดไปเอง งวดเก่าไม่กระทบเพราะยอดถูกแช่แข็งแล้ว
 *
 * ตาราง staff_members RLS เปิดกว้างให้ authenticated (จำเป็นสำหรับหน้าเช็คอิน)
 * จึงต้องกันสิทธิ์ใน action นี้แทน — เฉพาะผู้จัดการ/เจ้าของร้าน
 */
export async function updateStaffMember(
  id: string,
  input: { baseSalary: number; isActive: boolean }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getMyProfile()
  if (!me || !["admin", "manager"].includes(me.role)) {
    return { ok: false, error: "เฉพาะผู้จัดการ/เจ้าของร้านเท่านั้น" }
  }
  if (!Number.isFinite(input.baseSalary) || input.baseSalary < 0) {
    return { ok: false, error: "เงินเดือนต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป" }
  }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from("staff_members")
    .update({ base_salary: input.baseSalary, is_active: input.isActive })
    .eq("id", id)
    .select("id")
  if (error) return { ok: false, error: error.message }
  if (!updated || updated.length === 0) return { ok: false, error: "ไม่พบพนักงานคนนี้" }

  revalidatePath("/team")
  revalidatePath("/commission") // ยอดคาดหวังงวดเงินเดือนเปลี่ยนตาม
  return { ok: true }
}
```

- [ ] **Step 2: เขียน `staff-salary-card.tsx`**

```tsx
"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { updateStaffMember } from "./staff-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type StaffRow = { id: string; name: string; role: string | null; base_salary: number; is_active: boolean }

/** แก้เงินเดือนตั้งต้น + สถานะยังทำงาน — ยอดนี้ใช้เทียบตอนยืนยันการจ่ายเงินเดือนบนหน้าค่ามือ */
export function StaffSalaryCard({ staff }: { staff: StaffRow[] }) {
  const [pending, startTransition] = useTransition()
  // ค่าที่กำลังแก้ค้างไว้ต่อคน — บันทึกทีละคน ไม่มีฟอร์มรวม
  const [draft, setDraft] = useState<Record<string, { salary: string; active: boolean }>>(
    Object.fromEntries(staff.map((s) => [s.id, { salary: String(s.base_salary), active: s.is_active }]))
  )

  function save(id: string) {
    const d = draft[id]
    startTransition(async () => {
      const result = await updateStaffMember(id, {
        baseSalary: Number(d.salary),
        isActive: d.active,
      })
      if (result.ok) toast.success("บันทึกแล้ว")
      else toast.error(result.error)
    })
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div>
          <p className="font-semibold">เงินเดือนตั้งต้นพนักงานประจำ</p>
          <p className="text-xs text-slate-500">
            ใช้เทียบตอนยืนยันการจ่ายเงินเดือนในหน้าค่ามือ · โบนัส/เงินพิเศษไม่ต้องใส่ตรงนี้
            เขียนเป็นเหตุผลตอนติ๊กแทน · คนลาออกให้ปิด &quot;ยังทำงาน&quot; แล้วจะหลุดจากยอดคาดหวังเอง
          </p>
        </div>
        <ul className="space-y-2">
          {staff.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2">
              <span className={`min-w-32 ${draft[s.id]?.active ? "" : "text-slate-400 line-through"}`}>
                {s.name}
                {s.role && <span className="ml-1 text-xs text-slate-400">({s.role})</span>}
              </span>
              <Input
                type="number" inputMode="numeric" className="h-10 w-32"
                value={draft[s.id]?.salary ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [s.id]: { ...d[s.id], salary: e.target.value } }))}
              />
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={draft[s.id]?.active ?? true}
                  onChange={(e) => setDraft((d) => ({ ...d, [s.id]: { ...d[s.id], active: e.target.checked } }))} />
                ยังทำงาน
              </label>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => save(s.id)}>
                บันทึก
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: ต่อสายใน `team/page.tsx`**

อ่านไฟล์เดิมทั้งไฟล์ก่อน แล้วแก้สามจุด (ห้ามแตะเนื้อหาอื่น):

```tsx
// 1. import เพิ่ม
import { getMyProfile } from "@/lib/auth"
import { StaffSalaryCard } from "./staff-salary-card"

// 2. ขยาย query เดิม (บรรทัด ~67) — เพิ่มสองคอลัมน์ และห้ามกรอง is_active ทิ้ง
//    (การ์ดต้องเห็นคนลาออกด้วย เผื่อกดเปิดสถานะกลับ)
supabase.from("staff_members").select("id, name, role, base_salary, is_active").order("sort").order("name"),

// 3. ใน component: ดึง role แล้ววางการ์ดท้ายหน้า
const me = await getMyProfile()
// ...ท้าย JSX:
{me && ["admin", "manager"].includes(me.role) && staffMembers && (
  <StaffSalaryCard staff={staffMembers} />
)}
```
(ชื่อตัวแปร `staffMembers` ให้ใช้ตามชื่อจริงที่ไฟล์เดิม destructure ไว้ — ถ้าที่อื่นในหน้าใช้
ข้อมูลชุดนี้อยู่แล้ว ตรวจว่าคอลัมน์ที่เพิ่มไม่ทำให้ type ของโค้ดเดิมพัง)

- [ ] **Step 4: ด่าน** `npx tsc --noEmit && npx eslint src/ && npx vitest run` — ผ่าน

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/team/staff-actions.ts" "src/app/(app)/team/staff-salary-card.tsx" "src/app/(app)/team/page.tsx"
git commit -m "feat(payout): แก้เงินเดือนตั้งต้น+สถานะยังทำงานได้จากหน้าทีมงาน"
```

---

## Task 6: reconciliation + ตรวจรวม + deploy + ยืนยันกับข้อมูลจริง

**Files:**
- Modify: `supabase/reconciliation.sql`

- [ ] **Step 1: เพิ่มด่านใน reconciliation.sql**

เพิ่มใน expected (ก่อนวงเล็บปิดชุด values):

```sql
  -- งวดที่เจ้าของร้านรับรองแล้ว ตัวเลขฝั่ง "จ่ายจริง" ต้องนิ่งตลอดกาล
  -- ถ้าคำนวณใหม่จากรายจ่ายปัจจุบันแล้วไม่ตรงกับที่แช่แข็งไว้ = มีคนแก้รายจ่ายหลังปิดงวด
  ('endorsed_payout_drift', 0)
```

เพิ่มใน actual:

```sql
  union all
  select 'endorsed_payout_drift', count(*)
  from public.payout_confirmations pc
  where pc.endorsed_at is not null
    and pc.recorded_amount is distinct from (
      select coalesce(sum(e.amount), 0)
      from public.expenses e
      where e.category = case pc.kind
              when 'commission' then 'HR / payroll (ค่ามือหมอ)'
              else 'เงินเดือนพนักงานประจำ' end
        and e.expense_date >= case pc.period_no
              when 0 then (pc.month || '-01')::date
              when 1 then (pc.month || '-01')::date
              when 2 then (pc.month || '-11')::date
              else (pc.month || '-21')::date end
        and e.expense_date <= case pc.period_no
              when 1 then (pc.month || '-10')::date
              when 2 then (pc.month || '-20')::date
              else (date_trunc('month', (pc.month || '-01')::date) + interval '1 month - 1 day')::date end
    )
```

- [ ] **Step 2: รันชุดตรวจทั้งไฟล์ผ่าน MCP** — ต้อง PASS 30/30 (29 เดิม + 1 ใหม่)

- [ ] **Step 3: ด่านครบชุด**

```bash
npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```
Expected: เทส ≥ 432 (420 เดิม + 12 ใหม่) · build ผ่าน

- [ ] **Step 4: Deploy + push**

```bash
npx vercel deploy --prod --yes && git add -A && git commit -m "feat(payout): ด่าน endorsed_payout_drift" && git push origin main
```

- [ ] **Step 5: ยืนยันกับข้อมูลจริงบน production**

- เปิด `https://sookkaya-pos.vercel.app/commission` (บัญชีเจ้าของ) → เห็นกล่อง "ยืนยันการจ่าย" เดือน ส.ค.
- เปลี่ยน `?date=2026-07-15` → กล่องโชว์งวดเดือน ก.ค. และยอดต้องตรงที่สืบไว้:
  งวด 1-10 ระบบ 47,830 / จ่าย 47,880 · งวด 11-20 **เท่ากันเป๊ะ 49,145** · งวด 21-31 ระบบ 54,065 / จ่าย 54,195
- ตรวจ Vercel `get_runtime_errors` (projectId `prj_aIjCLSIX6A5MoonNtjzMiRno5Md3`, teamId `team_aIZvGjaXuArkv1Vku7KHeW9C`) → ไม่มี error
- **ห้ามติ๊กจริงบน production** — การติ๊กครั้งแรกให้เจ้าของร้านเป็นคนทำเอง
