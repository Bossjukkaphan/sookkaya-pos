# ป้ายบอกปัญหาข้อมูลลูกค้า + ตารางรายชื่อ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้หน้า `/customers` บอกได้ทันทีว่าลูกค้าคนไหนมีข้อมูลที่ทำให้ระบบทำงานผิด กรองดูทีละกลุ่มได้ และอ่านเป็นตารางทีละแถวบนจอกว้าง

**Architecture:** ธงปัญหาทั้งห้าคำนวณใน view `v_customer_issues` ฝั่งฐานข้อมูล (ไม่ใช่ในหน้าเว็บ เพราะลูกค้า 1,046 คนเกินเพดาน 1,000 แถวของ PostgREST ไปแล้ว) · `src/lib/customer-issues.ts` เป็นที่เดียวที่นิยามชื่อป้าย สี และลำดับ · หน้าเว็บเป็น server component ล้วน กรอง/เรียง/แบ่งหน้าผ่าน query string ไม่ต้องมี JS ฝั่งไคลเอนต์

**Tech Stack:** Next.js 16 App Router (server components) · Supabase (Postgres + PostgREST) · Tailwind · vitest

**อ่านก่อนเริ่ม:** `AGENTS.md` — Next.js เวอร์ชันนี้ต่างจากที่คุณจำได้ ถ้าจะแตะ API ของ Next ให้เปิด `node_modules/next/dist/docs/` ก่อน

**คำสั่งที่ต้องรันก่อนเสมอ** (node ติดตั้งผ่าน nvm ไม่ได้อยู่ใน PATH):
```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
```

---

## โครงไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `supabase/migrations/20260728220000_v_customer_issues.sql` | view เดียวที่ตัดสินว่าอะไรคือปัญหา |
| `src/types/database.ts` | type ที่ generate จากฐานข้อมูล (ไม่เขียนมือ) |
| `src/lib/customer-issues.ts` | นิยามป้าย: คีย์ ชื่อไทย กลุ่มสี ลำดับ + ตัวช่วยแปลงแถวเป็นรายการป้าย |
| `src/lib/customer-issues.test.ts` | เทสของไฟล์บน |
| `src/app/(app)/customers/customer-table.tsx` | แสดงผล: ตารางบนจอกว้าง · การ์ดบนมือถือ |
| `src/app/(app)/customers/page.tsx` | ดึงข้อมูล นับเลขชิพ กรอง เรียง แบ่งหน้า |
| `src/app/(app)/customers/customer-search.tsx` | เพิ่ม prop `issue` ให้ช่องค้นหาพกตัวกรองไปด้วย |

---

## Task 1: View `v_customer_issues` + types

**Files:**
- Create: `supabase/migrations/20260728220000_v_customer_issues.sql`
- Modify: `src/types/database.ts` (generate ทับ)

- [x] **Step 1: เขียนไฟล์ migration**

สร้าง `supabase/migrations/20260728220000_v_customer_issues.sql`:

```sql
-- ธงบอกปัญหาข้อมูลลูกค้า — ที่เดียวที่ตัดสินว่าอะไรคือ "ปัญหา"
--
-- ทำไมต้องคำนวณใน SQL ไม่ใช่ในหน้าเว็บ: PostgREST คืนสูงสุด 1,000 แถวต่อครั้ง
-- แต่ลูกค้ามี 1,046 คนแล้ว ถ้าดึงมานับเองในหน้าเว็บ คนที่เรียงท้ายสุดจะหายเงียบ
-- แล้วเลขบนชิพจะต่ำกว่าความจริงโดยไม่มีอะไรเตือน (กับดักเดียวกับที่หน้าสมาชิกเคยเจอ)
--
-- ที่มา: ตรวจข้ามระบบ 28/7/2569 เจอลูกค้า 156 ระเบียนที่มีปัญหาโดยไม่มีอะไรในระบบบอก
-- เคสตัวอย่างคือ "กล้วย/สงกรานต์" คนเดียวกันแตกเป็นสองระเบียน แพ็กอยู่ระเบียนหนึ่ง
-- บิลไปลงอีกระเบียน เครดิตเลยติดลบ 2,380 โดยไม่มีใครรู้จนไปขุด
--
-- security_invoker = true บังคับ RLS ตามสิทธิ์ผู้เรียก — ห้ามลืม
-- ชุดตรวจ views_without_security_invoker จะ FAIL ทันทีถ้าหลุด

create view public.v_customer_issues with (security_invoker = true) as
select
  c.id                           as customer_id,
  c.name,
  c.nickname,
  c.phone,
  c.customer_type,
  coalesce(mb.credit_balance, 0) as credit_balance,
  coalesce(ltv.visits, 0)        as visits,
  ltv.last_visit,

  -- กลุ่มตัวตน: ระบบระบุตัวลูกค้าผิดคนได้
  (c.phone is not null and c.phone <> ''
     and exists (select 1 from public.customers o
                  where o.id <> c.id and o.phone = c.phone))   as dup_phone,
  (c.phone is null or c.phone = '')                            as no_phone,
  -- เบอร์ไทยที่ใช้ได้คือ 0 ตามด้วยตัวเลข 8-9 หลัก · นอกนั้นค้นไม่เจอ เท่ากับไม่มีเบอร์
  -- (เจอจริง: "611230256" ของลูกค้าชื่อโอ๋ ขาดเลข 0 หน้า)
  (c.phone is not null and c.phone <> ''
     and c.phone !~ '^0[0-9]{8,9}$')                           as bad_phone,

  -- กลุ่มเงิน: ตัวเลขไม่ตรง ต้องสืบ
  (coalesce(mb.credit_balance, 0) < 0)                         as negative_credit,
  (coalesce(pb.balance, 0) < 0)                                as negative_points
from public.customers c
left join public.member_balances  mb  on mb.customer_id  = c.id
left join public.v_customer_ltv   ltv on ltv.customer_id = c.id
left join public.v_point_balances pb  on pb.customer_id  = c.id;
```

- [x] **Step 2: รัน migration บน production**

ใช้ MCP `apply_migration` ชื่อ `v_customer_issues` เนื้อเดียวกับไฟล์ (ตัดคอมเมนต์ออกได้)

- [x] **Step 3: ตรวจว่าเลขตรงกับที่คาด**

รัน SQL นี้:

```sql
select count(*) as ทั้งหมด,
  count(*) filter (where dup_phone)       as เบอร์ซ้ำ,
  count(*) filter (where no_phone)        as ไม่มีเบอร์,
  count(*) filter (where bad_phone)       as เบอร์ผิดรูป,
  count(*) filter (where negative_credit) as เครดิตติดลบ,
  count(*) filter (where negative_points) as แต้มติดลบ
from public.v_customer_issues;
```

Expected: `1046 · 64 · 73 · 18 · 1 · 0`
(ตัวเลขอาจขยับถ้ามีลูกค้าใหม่ระหว่างวัน แต่ 1,046 ต้องเท่ากับ `select count(*) from customers` เสมอ)

- [x] **Step 4: ตรวจว่า security_invoker ไม่หลุด**

```sql
select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='v'
  and c.reloptions is distinct from array['security_invoker=true']::text[];
```

Expected: `0`

- [x] **Step 5: generate types**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
```
ใช้ MCP `generate_typescript_types` แล้วเขียนผลลัพธ์ทับ `src/types/database.ts`
จากนั้นยืนยันว่ามี view ใหม่อยู่จริง:
```bash
grep -c "v_customer_issues" src/types/database.ts
```
Expected: มากกว่า 0

- [x] **Step 6: Commit**

```bash
git add supabase/migrations/20260728220000_v_customer_issues.sql src/types/database.ts
git commit -m "feat(customers): view v_customer_issues บอกปัญหาข้อมูลลูกค้า 5 แบบ"
```

---

## Task 2: `src/lib/customer-issues.ts` (TDD)

**Files:**
- Create: `src/lib/customer-issues.ts`
- Test: `src/lib/customer-issues.test.ts`

- [x] **Step 1: เขียนเทสที่ต้องแดงก่อน**

สร้าง `src/lib/customer-issues.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { ISSUES, issueBadgeClass, issuesOf } from "./customer-issues"

describe("issuesOf", () => {
  it("ไม่มีปัญหา = ไม่มีป้าย", () => {
    expect(
      issuesOf({
        dup_phone: false,
        no_phone: false,
        bad_phone: false,
        negative_credit: false,
        negative_points: false,
      })
    ).toEqual([])
  })

  it("มีหลายปัญหาพร้อมกัน ต้องขึ้นครบทุกป้าย", () => {
    // เคสจริง: ลูกค้าชื่อ "โอ๋" เบอร์ 611230256 ซ้ำกับ "โอ" และขาดเลข 0 หน้า
    const keys = issuesOf({ dup_phone: true, bad_phone: true }).map((i) => i.key)
    expect(keys).toEqual(["dup_phone", "bad_phone"])
  })

  // ป้ายต้องเรียงเหมือนกันทุกแถว ไม่งั้นตากวาดตารางแล้วสะดุด
  it("ลำดับป้ายตาม ISSUES เสมอ ไม่ขึ้นกับลำดับคีย์ที่ส่งมา", () => {
    const a = issuesOf({ negative_credit: true, dup_phone: true }).map((i) => i.key)
    const b = issuesOf({ dup_phone: true, negative_credit: true }).map((i) => i.key)
    expect(a).toEqual(b)
    expect(a.indexOf("dup_phone")).toBeLessThan(a.indexOf("negative_credit"))
  })

  it("null ถือว่าไม่เป็นปัญหา", () => {
    expect(issuesOf({ dup_phone: null, no_phone: null })).toEqual([])
  })

  it("คีย์ที่ไม่ได้ส่งมาเลย ถือว่าไม่เป็นปัญหา", () => {
    expect(issuesOf({}).length).toBe(0)
  })
})

describe("ISSUES", () => {
  it("มีครบ 5 แบบ และคีย์ไม่ซ้ำกัน", () => {
    expect(ISSUES).toHaveLength(5)
    expect(new Set(ISSUES.map((i) => i.key)).size).toBe(5)
  })

  it("ทุกป้ายมีชื่อไทยและคำอธิบายว่าทำไมถึงเป็นปัญหา", () => {
    for (const i of ISSUES) {
      expect(i.label.length).toBeGreaterThan(0)
      expect(i.why.length).toBeGreaterThan(0)
    }
  })

  it("แบ่งเป็นกลุ่มตัวตน 3 กับกลุ่มเงิน 2", () => {
    expect(ISSUES.filter((i) => i.tone === "identity")).toHaveLength(3)
    expect(ISSUES.filter((i) => i.tone === "money")).toHaveLength(2)
  })
})

describe("issueBadgeClass", () => {
  it("กลุ่มเงินเป็นสีแดง กลุ่มตัวตนเป็นสีเหลือง", () => {
    expect(issueBadgeClass("money")).toContain("red")
    expect(issueBadgeClass("identity")).toContain("amber")
  })
})
```

- [x] **Step 2: รันให้เห็นว่าแดง**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx vitest run src/lib/customer-issues.test.ts
```
Expected: FAIL — `Failed to resolve import "./customer-issues"`

- [x] **Step 3: เขียน implementation**

สร้าง `src/lib/customer-issues.ts`:

```ts
import type { Tables } from "@/types/database"

/**
 * ป้ายบอกปัญหาข้อมูลลูกค้า — ที่เดียวของความจริงเรื่องชื่อป้าย สี และลำดับ
 *
 * เงื่อนไขว่าอะไรคือปัญหาอยู่ใน view v_customer_issues ฝั่งฐานข้อมูล (ที่เดียวเหมือนกัน)
 * ไฟล์นี้ทำหน้าที่แค่แปลงธงบูลีนจาก view เป็นป้ายที่คนอ่านรู้เรื่อง
 * ห้ามเขียนเงื่อนไขซ้ำที่นี่ — ถ้าเขียนสองที่ เดี๋ยวก็เพี้ยนออกจากกันเหมือนที่เคยเจอมาแล้ว
 *
 * ห้ามใส่ "use client" — หน้าที่เรียกใช้เป็น server component
 */

export type CustomerIssueRow = Tables<"v_customer_issues">

export type IssueKey =
  | "dup_phone"
  | "no_phone"
  | "bad_phone"
  | "negative_credit"
  | "negative_points"

/** identity = ระบบระบุตัวลูกค้าผิดคนได้ · money = ตัวเลขเงินไม่ตรง */
export type IssueTone = "identity" | "money"

export type IssueDef = {
  key: IssueKey
  label: string
  tone: IssueTone
  /** ทำไมถึงเป็นปัญหา — โชว์ตอนชี้ที่ชิพ ให้คนที่ไม่ได้อยู่ตอนคุยกันเข้าใจได้เอง */
  why: string
}

/** ลำดับในนี้คือลำดับที่แสดงทั้งบนแถวชิพและบนป้ายในตาราง — เรียงจากที่เจอบ่อยไปหายาก */
export const ISSUES: IssueDef[] = [
  {
    key: "dup_phone",
    label: "เบอร์ซ้ำ",
    tone: "identity",
    why: "มีลูกค้าคนอื่นใช้เบอร์นี้ด้วย เวลาคีย์ชื่อ+เบอร์ บิลหรือเครดิตอาจไปลงผิดคน",
  },
  {
    key: "no_phone",
    label: "ไม่มีเบอร์",
    tone: "identity",
    why: "ผูกแต้มไม่ได้ และครั้งหน้าที่มาจะกลายเป็นลูกค้าใหม่ ประวัติขาดตอน",
  },
  {
    key: "bad_phone",
    label: "เบอร์ผิดรูป",
    tone: "identity",
    why: "ไม่ใช่เบอร์ไทยที่ถูกต้อง (0 ตามด้วยตัวเลข 8-9 หลัก) ค้นหาไม่เจอ เท่ากับไม่มีเบอร์",
  },
  {
    key: "negative_credit",
    label: "เครดิตติดลบ",
    tone: "money",
    why: "ใช้เครดิตเกินที่ซื้อไว้ มักแปลว่าลูกค้าคนนี้มีอีกระเบียนที่ถือแพ็กอยู่",
  },
  {
    key: "negative_points",
    label: "แต้มติดลบ",
    tone: "money",
    why: "แลกแต้มไปเกินที่มี ต้องตรวจว่าคูปองไหนถูกใช้ผิด",
  },
]

/** แถวจาก v_customer_issues → รายการป้ายที่ต้องแสดง เรียงตาม ISSUES เสมอ */
export function issuesOf(
  row: Partial<Record<IssueKey, boolean | null>>
): IssueDef[] {
  return ISSUES.filter((issue) => row[issue.key] === true)
}

/** สีป้ายตามกลุ่ม — เหลือง = ปัญหาตัวตน · แดง = ปัญหาเงิน (ต้องรีบกว่า) */
export function issueBadgeClass(tone: IssueTone): string {
  return tone === "money"
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-amber-200 bg-amber-50 text-amber-700"
}
```

- [x] **Step 4: รันให้เขียว**

```bash
npx vitest run src/lib/customer-issues.test.ts
```
Expected: PASS ทั้ง 9 เทส

- [x] **Step 5: Commit**

```bash
git add src/lib/customer-issues.ts src/lib/customer-issues.test.ts
git commit -m "feat(customers): นิยามป้ายบอกปัญหาข้อมูลลูกค้าไว้ที่เดียว + เทส"
```

---

## Task 3: `customer-table.tsx` — ตารางบนจอกว้าง การ์ดบนมือถือ

**Files:**
- Create: `src/app/(app)/customers/customer-table.tsx`

- [x] **Step 1: เขียน component**

สร้าง `src/app/(app)/customers/customer-table.tsx`:

```tsx
import Link from "next/link"

import { formatBaht } from "@/lib/constants"
import { type CustomerIssueRow, issueBadgeClass, issuesOf } from "@/lib/customer-issues"
import { Badge } from "@/components/ui/badge"

/**
 * รายชื่อลูกค้า — ตารางบนคอม/แท็บเล็ต · การ์ดบนมือถือ
 *
 * สลับด้วย CSS ไม่ใช่ JS เพราะหน้านี้เป็น server component ล้วน
 * (ตาราง 7 คอลัมน์บนจอ 375px อ่านไม่ออก ต้องเลื่อนซ้ายขวาทุกแถว)
 */

const HEADS: { key: string; label: string; right?: boolean }[] = [
  { key: "name", label: "ชื่อ" },
  { key: "phone", label: "เบอร์โทร" },
  { key: "type", label: "ประเภท" },
  { key: "balance", label: "เครดิต", right: true },
  { key: "visits", label: "มาแล้ว", right: true },
  { key: "recent", label: "มาล่าสุด" },
]

function thaiDate(iso: string | null): string {
  if (!iso) return "—"
  const [y, m, d] = iso.slice(0, 10).split("-")
  const months = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]
  return `${Number(d)} ${months[Number(m) - 1]} ${(Number(y) + 543) % 100}`
}

function IssueBadges({ row }: { row: CustomerIssueRow }) {
  const issues = issuesOf(row)
  if (issues.length === 0) return <span className="text-slate-300">—</span>
  return (
    <span className="flex flex-wrap gap-1">
      {issues.map((i) => (
        <Badge
          key={i.key}
          variant="outline"
          title={i.why}
          className={`shrink-0 ${issueBadgeClass(i.tone)}`}
        >
          {i.label}
        </Badge>
      ))}
    </span>
  )
}

function NameCell({ row }: { row: CustomerIssueRow }) {
  return (
    <>
      {row.name}
      {row.nickname && (
        <span className="font-normal text-slate-500"> ({row.nickname})</span>
      )}
    </>
  )
}

export function CustomerTable({
  rows,
  sort,
  query,
  /** true = กำลังกรองเบอร์ซ้ำ แถวเรียงตามเบอร์แล้ว จึงแรเงาสลับกลุ่มได้มีความหมาย */
  groupByPhone,
}: {
  rows: CustomerIssueRow[]
  sort: string
  /** query string เดิมทั้งหมด (ไม่รวม sort) สำหรับทำลิงก์หัวคอลัมน์ */
  query: URLSearchParams
  groupByPhone: boolean
}) {
  // แรเงาสลับ "ทีละกลุ่มเบอร์" ไม่ใช่ทีละแถว — คู่เดียวกันจะได้พื้นหลังเดียวกัน
  // ทำเฉพาะตอนเรียงตามเบอร์ ไม่งั้นกลายเป็นลายมั่วที่ไม่มีความหมาย
  let group = -1
  let lastPhone: string | null = null
  const shade = rows.map((r) => {
    if (!groupByPhone) return false
    if (r.phone !== lastPhone) {
      group += 1
      lastPhone = r.phone
    }
    return group % 2 === 1
  })

  function sortHref(key: string) {
    const next = new URLSearchParams(query)
    next.set("sort", key)
    next.delete("page")
    return `/customers?${next.toString()}`
  }

  return (
    <>
      {/* จอกว้าง — ตาราง */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {HEADS.map((h) => (
                <th
                  key={h.key}
                  className={`border-b-2 px-2 py-2 text-xs font-semibold whitespace-nowrap text-slate-500 ${
                    h.right ? "text-right" : "text-left"
                  }`}
                >
                  <Link href={sortHref(h.key)} className="hover:text-slate-900">
                    {h.label}
                    <span className="ml-1 text-[9px] text-slate-300">
                      {sort === h.key ? "▼" : "↕"}
                    </span>
                  </Link>
                </th>
              ))}
              <th className="border-b-2 px-2 py-2 text-left text-xs font-semibold text-slate-500">
                สถานะข้อมูล
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.customer_id}
                className={`border-b hover:bg-slate-50 ${shade[i] ? "bg-amber-50/40" : ""}`}
              >
                <td className="px-2 py-2 font-medium">
                  <Link href={`/customers/${r.customer_id}`} className="hover:underline">
                    <NameCell row={r} />
                  </Link>
                </td>
                <td className="px-2 py-2 tabular-nums text-slate-600">
                  {r.phone || <span className="text-slate-300">ไม่มีเบอร์</span>}
                </td>
                <td className="px-2 py-2">
                  {r.customer_type === "สมาชิก" ? (
                    <Badge
                      variant="outline"
                      className="border-violet-200 bg-violet-100 text-violet-700"
                    >
                      สมาชิก
                    </Badge>
                  ) : (
                    <span className="text-slate-400">ทั่วไป</span>
                  )}
                </td>
                <td
                  className={`px-2 py-2 text-right font-semibold whitespace-nowrap ${
                    (r.credit_balance ?? 0) < 0
                      ? "text-red-600"
                      : (r.credit_balance ?? 0) > 0
                        ? "text-emerald-700"
                        : "text-slate-300"
                  }`}
                >
                  {(r.credit_balance ?? 0) === 0 ? "—" : formatBaht(r.credit_balance ?? 0)}
                </td>
                <td className="px-2 py-2 text-right text-slate-600">{r.visits ?? 0}</td>
                <td className="px-2 py-2 whitespace-nowrap text-slate-600">
                  {thaiDate(r.last_visit)}
                </td>
                <td className="px-2 py-2">
                  <IssueBadges row={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* มือถือ — การ์ด */}
      <ul className="grid gap-2 sm:hidden">
        {rows.map((r) => (
          <li key={r.customer_id}>
            <Link
              href={`/customers/${r.customer_id}`}
              className="flex items-start justify-between gap-3 rounded-lg border p-3 hover:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  <NameCell row={r} />
                  {r.customer_type === "สมาชิก" && (
                    <Badge
                      variant="outline"
                      className="ml-2 border-violet-200 bg-violet-100 text-violet-700"
                    >
                      สมาชิก
                    </Badge>
                  )}
                </p>
                <p className="text-sm text-slate-500">
                  {r.phone || "ไม่มีเบอร์"} · มาแล้ว {r.visits ?? 0} ครั้ง
                </p>
                <div className="mt-1">
                  <IssueBadges row={r} />
                </div>
              </div>
              {(r.credit_balance ?? 0) !== 0 && (
                <div className="shrink-0 text-right">
                  <p
                    className={`text-base font-bold whitespace-nowrap ${
                      (r.credit_balance ?? 0) < 0 ? "text-red-600" : "text-emerald-700"
                    }`}
                  >
                    {formatBaht(r.credit_balance ?? 0)} ฿
                  </p>
                  <p className="text-[10px] text-slate-400">เครดิตเหลือ</p>
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
```

- [x] **Step 2: ตรวจว่า type ผ่าน**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx tsc --noEmit
```
Expected: ไม่มี error
(ถ้าขึ้น `LayoutRoutes` mismatch ให้ `rm -rf .next/dev` แล้วรันใหม่)

- [x] **Step 3: Commit**

```bash
git add "src/app/(app)/customers/customer-table.tsx"
git commit -m "feat(customers): ตารางรายชื่อบนจอกว้าง การ์ดบนมือถือ พร้อมป้ายบอกปัญหา"
```

---

## Task 4: หน้า `/customers` — ชิพกรอง เรียง แบ่งหน้า

**Files:**
- Modify: `src/app/(app)/customers/page.tsx` (เขียนใหม่ทั้งไฟล์)
- Modify: `src/app/(app)/customers/customer-search.tsx` (เพิ่ม prop `issue`)

- [x] **Step 1: เขียนหน้าใหม่**

เขียนทับ `src/app/(app)/customers/page.tsx` ทั้งไฟล์:

```tsx
import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { formatBaht } from "@/lib/constants"
import { todayInShopTz } from "@/lib/datetime"
import { ISSUES, type IssueKey, issueBadgeClass } from "@/lib/customer-issues"
import { StatCard } from "@/components/stat-card"
import { PagerLink } from "@/components/pager-link"
import { Button } from "@/components/ui/button"
import { CustomerSearch } from "./customer-search"
import { CustomerTable } from "./customer-table"

export const metadata = { title: "ลูกค้า · สุขกายา POS" }

const PER_PAGE = 50

/** คอลัมน์ที่เรียงได้ → ชื่อคอลัมน์จริงใน view + ทิศทาง */
const SORTS: Record<string, { column: string; asc: boolean }> = {
  name: { column: "name", asc: true },
  phone: { column: "phone", asc: true },
  balance: { column: "credit_balance", asc: false },
  visits: { column: "visits", asc: false },
  recent: { column: "last_visit", asc: false },
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    type?: string
    sort?: string
    issue?: string
    page?: string
  }>
}) {
  const supabase = await createClient()
  const sp = await searchParams
  const term = sp.q?.trim() ?? ""
  const type = sp.type === "member" || sp.type === "regular" ? sp.type : ""
  const issue = ISSUES.some((i) => i.key === sp.issue)
    ? (sp.issue as IssueKey)
    : ""
  const page = Math.max(1, Number(sp.page) || 1)

  // กรองเบอร์ซ้ำต้องเรียงตามเบอร์เสมอ ไม่งั้นคู่เดียวกันอยู่คนละหน้าจนตรวจไม่ได้
  // (เช่น "แมน" กับ "พี พีรดา" ที่ใช้เบอร์เดียวกัน ถ้าเรียงตามชื่อจะห่างกันหลายหน้า)
  const forcedPhoneSort = issue === "dup_phone"
  const sort = forcedPhoneSort
    ? "phone"
    : sp.sort && sp.sort in SORTS
      ? sp.sort
      : "name"

  const today = todayInShopTz()
  const monthStartIso = `${today.slice(0, 7)}-01T00:00:00+07:00`

  let rowQuery = supabase
    .from("v_customer_issues")
    .select("*", { count: "exact" })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1)

  if (term) {
    rowQuery = rowQuery.or(
      `name.ilike.%${term}%,nickname.ilike.%${term}%,phone.ilike.%${term}%`
    )
  }
  if (type === "member") rowQuery = rowQuery.eq("customer_type", "สมาชิก")
  if (type === "regular") rowQuery = rowQuery.eq("customer_type", "ลูกค้าทั่วไป")
  if (issue) rowQuery = rowQuery.eq(issue, true)

  const s = SORTS[sort]
  rowQuery = rowQuery.order(s.column, { ascending: s.asc, nullsFirst: false })

  // นับเลขบนชิพทีละธง — head:true ไม่ดึงแถวจริง จึงเบา
  const issueCountQueries = ISSUES.map((i) =>
    supabase
      .from("v_customer_issues")
      .select("*", { count: "exact", head: true })
      .eq(i.key, true)
  )

  const [
    { data: rows, count },
    { count: totalCustomers },
    { count: totalMembers },
    { count: newThisMonth },
    { data: creditRows },
    ...issueCounts
  ] = await Promise.all([
    rowQuery,
    supabase.from("customers").select("*", { count: "exact", head: true }),
    supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("customer_type", "สมาชิก"),
    supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .gte("created_at", monthStartIso),
    supabase.from("member_balances").select("credit_balance").gt("credit_balance", 0),
    ...issueCountQueries,
  ])

  const totalOutstanding = (creditRows ?? []).reduce(
    (sum, r) => sum + (r.credit_balance ?? 0),
    0
  )

  const list = rows ?? []
  const total = count ?? list.length
  const from = total === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const to = Math.min(page * PER_PAGE, total)

  /** ทำ query string ใหม่โดยคงตัวกรองอื่นไว้ */
  function hrefWith(patch: Record<string, string | null>) {
    const next = new URLSearchParams()
    if (term) next.set("q", term)
    if (type) next.set("type", type)
    if (issue) next.set("issue", issue)
    if (sp.sort && sp.sort in SORTS) next.set("sort", sp.sort)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k)
      else next.set(k, v)
    }
    const qs = next.toString()
    return qs ? `/customers?${qs}` : "/customers"
  }

  const tableQuery = new URLSearchParams()
  if (term) tableQuery.set("q", term)
  if (type) tableQuery.set("type", type)
  if (issue) tableQuery.set("issue", issue)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">ลูกค้า</h1>
        <Button asChild size="sm">
          <Link href="/customers/new">+ เพิ่มลูกค้า</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="ลูกค้าทั้งหมด" value={`${(totalCustomers ?? 0).toLocaleString()} คน`} />
        <StatCard label="เป็นสมาชิก" value={`${(totalMembers ?? 0).toLocaleString()} คน`} />
        <StatCard
          label="เครดิตคงค้างรวม"
          value={`${formatBaht(totalOutstanding)} ฿`}
          hint="ภาระที่ร้านต้องให้บริการในอนาคต"
          tone="warn"
        />
        <StatCard label="ลูกค้าใหม่เดือนนี้" value={`${(newThisMonth ?? 0).toLocaleString()} คน`} />
      </div>

      <CustomerSearch initialTerm={term} type={type} sort={sort} />

      {/* ชิพกรองปัญหา — กดได้ทีละอัน กดซ้ำคือยกเลิก */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">สถานะข้อมูล</span>
        {ISSUES.map((def, i) => {
          const n = issueCounts[i]?.count ?? 0
          const active = issue === def.key
          return (
            <Link
              key={def.key}
              href={hrefWith({ issue: active ? null : def.key, page: null })}
              title={def.why}
              className={`inline-flex min-h-10 items-center rounded-full border px-3 text-sm ${
                active
                  ? `font-bold ${issueBadgeClass(def.tone)}`
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {def.label}
              <span className="ml-1.5 font-bold">{n}</span>
            </Link>
          )
        })}
      </div>

      {/* ประเภทลูกค้า — ฟอร์ม GET ธรรมดา ไม่ต้องมี JS ฝั่งไคลเอนต์ */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">ประเภท</span>
        {[
          { value: "", label: "ทุกประเภท" },
          { value: "member", label: "เฉพาะสมาชิก" },
          { value: "regular", label: "เฉพาะทั่วไป" },
        ].map((t) => (
          <Link
            key={t.value}
            href={hrefWith({ type: t.value || null, page: null })}
            className={`inline-flex min-h-10 items-center rounded-full border px-3 text-sm ${
              type === t.value
                ? "border-slate-800 bg-slate-800 font-semibold text-white"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <p className="text-xs text-slate-500">
        พบ {total.toLocaleString()} คน
        {total > 0 && ` · แสดง ${from.toLocaleString()}–${to.toLocaleString()}`}
        {forcedPhoneSort && " · เรียงตามเบอร์ให้คู่เดียวกันอยู่ติดกัน"}
      </p>

      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          {term || type || issue ? "ไม่พบลูกค้าตามเงื่อนไข" : "ยังไม่มีข้อมูลลูกค้า"}
        </p>
      ) : (
        <>
          <CustomerTable
            rows={list}
            sort={sort}
            query={tableQuery}
            groupByPhone={forcedPhoneSort}
          />
          {total > PER_PAGE && (
            <div className="flex items-center justify-between gap-2">
              {page > 1 ? (
                <PagerLink href={hrefWith({ page: String(page - 1) })} aria-label="หน้าก่อนหน้า">
                  ← ก่อนหน้า
                </PagerLink>
              ) : (
                <span />
              )}
              <span className="text-xs text-slate-500">
                หน้า {page} จาก {Math.ceil(total / PER_PAGE)}
              </span>
              {to < total ? (
                <PagerLink href={hrefWith({ page: String(page + 1) })} aria-label="หน้าถัดไป">
                  ถัดไป →
                </PagerLink>
              ) : (
                <span />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [x] **Step 2: ให้ช่องค้นหาพก `issue` ไปด้วย**

`CustomerSearch` พก `type` กับ `sort` ไปด้วยตอนกดค้นหาอยู่แล้ว **แต่ยังไม่รู้จัก `issue`**
ถ้าไม่แก้ พนักงานที่กำลังกรอง "เบอร์ซ้ำ" อยู่แล้วพิมพ์ค้นหา ตัวกรองจะหลุดหายทันที
(ลายเดิมที่โปรเจกต์นี้เจอมาหลายรอบ: สถานะถูกพกไว้ที่หนึ่งแต่ลืมอีกที่หนึ่ง)

แก้ `src/app/(app)/customers/customer-search.tsx` สามจุด:

จุดที่ 1 — เพิ่ม prop ในการประกาศ (บรรทัด ~34-46):
```tsx
export function CustomerSearch({
  initialTerm = "",
  // ตัวกรอง/เรียงลำดับปัจจุบัน — ต้องพกไปด้วยตอนกดค้นหา ไม่งั้นเปลี่ยนช่องค้นหาแล้วตัวกรองหลุด
  type = "",
  sort = "",
  issue = "",
  // ฉีดฟังก์ชันค้นหาได้ เพื่อพรีวิว/เทสโดยไม่ต้องต่อฐานข้อมูลจริง
  searchFn = searchCustomers,
}: {
  initialTerm?: string
  type?: string
  sort?: string
  issue?: string
  searchFn?: (term: string) => Promise<CustomerMatch[]>
}) {
```

จุดที่ 2 — ใส่ลง query string (ต่อจากบรรทัด ~100 ที่มี `if (sort) qs.set("sort", sort)`):
```tsx
    if (issue) qs.set("issue", issue)
```

จุดที่ 3 — ส่งค่าจากหน้า `page.tsx` (แก้บรรทัดที่เรียก `<CustomerSearch .../>`):
```tsx
      <CustomerSearch initialTerm={term} type={type} sort={sort} issue={issue} />
```

- [x] **Step 2b: ตรวจว่าไม่มีหน้าอื่นเรียก CustomerSearch แล้วพัง**

```bash
grep -rn "CustomerSearch" src | grep -v "customer-search.tsx"
```
Expected: เจอที่ `customers/page.tsx` ที่เดียว (prop ใหม่เป็น optional อยู่แล้ว ไม่พังแม้มีที่อื่น)

- [x] **Step 3: ตรวจ type + lint**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx tsc --noEmit && npx eslint src/
```
Expected: ไม่มี error ทั้งคู่

- [x] **Step 4: Commit**

```bash
git add "src/app/(app)/customers/page.tsx" "src/app/(app)/customers/customer-search.tsx"
git commit -m "feat(customers): ชิพกรองปัญหา + ตาราง + แบ่งหน้าพร้อมบอกจำนวนจริง"
```

---

## Task 5: ตรวจรวม + deploy + ยืนยันกับข้อมูลจริง

**Files:** ไม่มีไฟล์ใหม่

- [x] **Step 1: รันด่านทั้งหมด**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```
Expected: ผ่านหมด · vitest ต้องได้ 296 เทส (287 เดิม + 9 ใหม่)

- [x] **Step 2: Deploy**

```bash
npx vercel deploy --prod --yes && git push origin main
```

- [x] **Step 3: ตรวจหน้าจริงในเบราว์เซอร์**

เปิด `https://sookkaya-pos.vercel.app/customers` แล้วยืนยันทีละข้อ:
- เลขบนชิพเป็น `เบอร์ซ้ำ 64 · ไม่มีเบอร์ 73 · เบอร์ผิดรูป 18 · เครดิตติดลบ 1 · แต้มติดลบ 0`
- กด "เบอร์ซ้ำ" แล้ว URL เป็น `/customers?issue=dup_phone` · ขึ้น "พบ 64 คน · แสดง 1–50"
- คู่ที่เบอร์เดียวกันอยู่ติดกันจริง และแรเงาสลับทีละคู่
- กด "ถัดไป →" แล้วเห็นคนที่ 51–64
- กด "เบอร์ซ้ำ" ซ้ำอีกครั้ง = ยกเลิกกรอง กลับมาเห็นทั้ง 1,046 คน
- ย่อจอเหลือ 375px แล้วตารางต้องกลายเป็นการ์ด และหน้าไม่เลื่อนซ้ายขวา

- [x] **Step 4: ตรวจว่าไม่มี runtime error**

ใช้ MCP Vercel `get_runtime_errors` (projectId `prj_aIjCLSIX6A5MoonNtjzMiRno5Md3`, teamId `team_aIZvGjaXuArkv1Vku7KHeW9C`, since `1h`)
Expected: `No runtime errors found`

- [x] **Step 5: รันชุดตรวจบัญชี**

รัน `supabase/reconciliation.sql` ทั้งไฟล์
Expected: PASS ทุกข้อ (29 ข้อ) — ข้อสำคัญคือ `views_without_security_invoker = 0` ซึ่งจะจับได้ทันทีถ้า view ใหม่ตั้ง security_invoker ไม่ครบ

- [x] **Step 6: Commit ปิดงาน (ถ้ามีอะไรค้าง)**

```bash
git add -A && git commit -m "chore(customers): ปิดงานป้ายบอกปัญหาข้อมูลลูกค้า" || echo "ไม่มีอะไรค้าง"
git push origin main
```

---

## ผลตรวจปิดงาน — 29/7/2569 02:10

รันย้อนหลังหลังโค้ดขึ้น production แล้ว (คอมมิตล่าสุด `33a2e1d`) ผ่านทุกด่าน:

- `npx tsc --noEmit` — ผ่าน
- `npm test` — 308 เทส / 25 ไฟล์ ผ่านหมด
- `npx eslint` — โค้ดแอปสะอาด (error ที่เหลือ 9 ข้ออยู่ในสคริปต์ใต้ `.claude/skills/` ไม่ใช่โค้ดแอป)
- `supabase/reconciliation.sql` บน production — **29/29 PASS**
- Vercel runtime errors 48 ชม. — มี error group เดียวคือ `/customers` หมดเวลา 2 ครั้ง
  เวลา 00:42–00:43 บน deployment ของ `050e02b` (deploy 00:41) ซึ่งเกิด**ก่อน**ตัวแก้
  `9685300` ขึ้น (deploy 00:47) หลังจากนั้นไม่มีอีก
- ยืนยันของจริง: deployment ที่มีตัวแก้เปิดหน้า `/customers` สำเร็จ 2 ครั้งไม่ error ·
  deployment ปัจจุบันมี 77 request สถานะ 200 ทั้งหมด
