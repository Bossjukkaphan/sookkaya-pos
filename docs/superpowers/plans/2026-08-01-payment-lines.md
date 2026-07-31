# รายการชำระหลายวิธีต่อบิล + ค้างรับ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** บิลเดียวรับเงินได้หลายวิธี (บัตร+โอน ฯลฯ สูงสุด 3 บรรทัด) + เพิ่มการชำระทีหลังได้ + สถานะ "ค้างรับ" + เครดิตเมมเบอร์เริ่ม 0

**Architecture:** ตารางใหม่ `bill_payments` เป็นความจริงเรื่องเงินจริงที่รับ (ต่อ `bill_key` = `coalesce(bill_id, sale_id)`) · เครดิตคงกลไก `credit_used` เดิมไม่แตะ · บิลเก่าไม่ migrate — view `v_bill_payments` สังเคราะห์เป็นบรรทัดเดียว · `sales.payments_tracked` แยกบิลระบบใหม่จากบิลสังเคราะห์

**Tech Stack:** Next.js 16 server actions · Supabase (RLS + views security_invoker) · vitest

**สเปก:** `docs/superpowers/specs/2026-08-01-payment-lines-design.md`

## Global Constraints

- ทุกคำสั่ง node/npm/npx ต้อง `export PATH="$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node | tail -1)/bin:$PATH"` ก่อน
- **ห้ามแตะ `computeSaleAmounts`** (`src/lib/sale-math.ts`) แม้บรรทัดเดียว — สเปกสั่งชัด
- บรรทัดชำระ: method ∈ {เงินสด, QR Code, บัตรเครดิต} · amount > 0 · ≤ 3 บรรทัด/บิล · sum ≤ net − credit
- `create or replace view` ต้องมี `with (security_invoker = true)` ทุกครั้ง
- บิลเก่าเลขต้องไม่ขยับ: parity check `sum(cash_in)` + byPayment ก่อน/หลังบน production · reconciliation เดิม 31 ข้อค่าเดิม
- เครดิตเมมเบอร์เริ่ม 0 + ปุ่ม "ใช้เครดิต (เหลือ X ฿)" — ทุกฟอร์ม (pos-form · group-pos-form) · edit-sale-dialog คง prefill จาก `sale.credit_used` (กำลังแก้ของเดิม ไม่ใช่เริ่มใหม่)
- Gowabi/KOL/เครดิตเต็มบิล: ช่องทางเดียวเหมือนเดิม `payments_tracked=false` ไม่มีบรรทัด
- commit ภาษาไทยตามสไตล์ `git log --oneline` + trailer Claude ตามธรรมเนียมโปรเจกต์

## โครงไฟล์

| ไฟล์ | ทำอะไร |
|---|---|
| `supabase/migrations/20260801100000_bill_payments.sql` | ตาราง + `payments_tracked` + views + RLS |
| `src/lib/payments.ts` (ใหม่) | logic ล้วน: validate/parse บรรทัด · วิธีหลัก · ยอดค้างรับ |
| `src/lib/payments.test.ts` (ใหม่) | เทส TDD ของ lib |
| `src/app/(app)/sale-actions.ts` | createSale รับ `payments` JSON · deleteSale ลบบรรทัดของบิลแถวสุดท้าย |
| `src/app/(app)/payment-actions.ts` (ใหม่) | `addBillPayment` · `deleteBillPayment` |
| `src/app/(app)/pos/pos-form.tsx` | เครดิตเริ่ม 0 + ปุ่มลัด · ตัวแบ่งบรรทัด · ยืนยันค้างรับ |
| `src/app/(app)/pos/group-pos-form.tsx` | เครดิตเริ่ม 0 + ปุ่มลัด · บิลชุดใช้ตัวแบ่งบรรทัด · กลุ่มหลายคน = บรรทัดเดียว/บิล |
| `src/app/(app)/today/edit-sale-dialog.tsx` + `src/app/(app)/collect-due-dialog.tsx` (ใหม่) | แสดงบรรทัด+due · กล่อง "เก็บเพิ่ม" ใช้ร่วมทุกหน้า |
| `src/app/(app)/today/page.tsx` · `src/app/(app)/history/bill-row.tsx` · `src/app/(app)/queue/queue-card.tsx` | ป้ายแดง "ค้างรับ X ฿" + การ์ดเตือนรวมบน /today |
| `src/app/(app)/reports/page.tsx` · `src/app/api/export/route.ts` | byPayment จาก `v_bill_payments` · export คอลัมน์บรรทัดชำระ |
| `supabase/reconciliation.sql` | +3 ด่าน |

---

### Task 1: migration — ตาราง bill_payments + views

**Files:**
- Create: `supabase/migrations/20260801100000_bill_payments.sql`

**Interfaces:**
- Produces: ตาราง `public.bill_payments(id, bill_key, method, amount, received_date, received_at, note, created_by, created_at)` · คอลัมน์ `sales.payments_tracked boolean not null default false` · view `v_bill_payments(bill_key, method, amount, received_date)` · view `v_bill_due(bill_key, sale_date, net_total, credit_total, paid_total, due)`
- Controller (คนคุมแผน) เป็นผู้ apply บน production — task นี้เขียนไฟล์อย่างเดียว

- [ ] **Step 1: เขียนไฟล์ migration** — เนื้อหาตามสเปกส่วน "1. ข้อมูล" ทั้งก้อน (copy SQL จากสเปกได้ตรงๆ) บวก:

```sql
alter table public.sales add column payments_tracked boolean not null default false;

alter table public.bill_payments enable row level security;
create policy "authenticated read bill_payments" on public.bill_payments
  for select to authenticated using (true);
create policy "authenticated insert bill_payments" on public.bill_payments
  for insert to authenticated with check (true);
-- ลบได้เฉพาะหัวหน้า — แนวเดียวกับสิทธิ์ลบบิล (app_role() มาจาก migration สิทธิ์เดิม)
create policy "manager delete bill_payments" on public.bill_payments
  for delete to authenticated using (public.app_role() in ('admin','manager'));
```

หมายเหตุ: ตรวจชื่อฟังก์ชัน role จริงด้วย `grep -rn "app_role" supabase/migrations | head -3` — ถ้าชื่อ/ลายเซ็นต่างให้ใช้ตามของจริง

- [ ] **Step 2: ตรวจ SQL แห้ง** — `grep -c "security_invoker = true" supabase/migrations/20260801100000_bill_payments.sql` ต้องได้ ≥ 2 (สอง view)

- [ ] **Step 3: Commit** — `git add supabase/migrations/20260801100000_bill_payments.sql && git commit -m "feat(db): ตาราง bill_payments + สถานะค้างรับ (ยังไม่ apply)"`

---

### Task 2: lib logic ล้วน — `src/lib/payments.ts` (TDD)

**Files:**
- Create: `src/lib/payments.ts` · Test: `src/lib/payments.test.ts`

**Interfaces (Produces — Task 3/4/5/6 ใช้ชื่อเหล่านี้เป๊ะ):**

```ts
export type PaymentLine = { method: string; amount: number }
export const PAYMENT_LINE_METHODS = ["เงินสด", "QR Code", "บัตรเครดิต"] as const
export const MAX_PAYMENT_LINES = 3
/** แปลง+ตรวจ JSON จาก FormData → บรรทัดที่ใช้ได้ หรือ error ภาษาไทย */
export function parsePaymentLines(raw: string, maxTotal: number):
  { ok: true; lines: PaymentLine[] } | { ok: false; error: string }
/** วิธีหลักของบิล = บรรทัดยอดมากสุด (เท่ากันเอาบรรทัดแรก) · ไม่มีบรรทัด = null */
export function primaryMethod(lines: PaymentLine[]): string | null
/** ยอดค้างรับ = ต้องเก็บ − รับแล้ว (ปัด 2 ตำแหน่ง กันเศษ float) */
export function dueAmount(mustCollect: number, lines: PaymentLine[]): number
```

- [ ] **Step 1: เทสแดงก่อน** — `src/lib/payments.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  MAX_PAYMENT_LINES, PAYMENT_LINE_METHODS,
  dueAmount, parsePaymentLines, primaryMethod,
} from "./payments"

describe("parsePaymentLines", () => {
  it("เคสจริง: บัตร 650 + โอน 240 บนบิล 890", () => {
    const r = parsePaymentLines(
      JSON.stringify([
        { method: "บัตรเครดิต", amount: 650 },
        { method: "QR Code", amount: 240 },
      ]), 890)
    expect(r).toEqual({ ok: true, lines: [
      { method: "บัตรเครดิต", amount: 650 }, { method: "QR Code", amount: 240 },
    ]})
  })
  it("ว่าง/ไม่ส่ง = บรรทัดว่าง (บิลค้างรับเต็มยอด หรือโค้ดเก่า)", () => {
    expect(parsePaymentLines("", 500)).toEqual({ ok: true, lines: [] })
    expect(parsePaymentLines("[]", 500)).toEqual({ ok: true, lines: [] })
  })
  it("วิธีนอกลิสต์ (Member Credit/Gowabi) → error", () => {
    expect(parsePaymentLines(JSON.stringify([{ method: "Member Credit", amount: 100 }]), 500).ok).toBe(false)
    expect(parsePaymentLines(JSON.stringify([{ method: "Gowabi", amount: 100 }]), 500).ok).toBe(false)
  })
  it("จำนวน ≤ 0 · เกิน 3 บรรทัด · รวมเกินยอดต้องเก็บ → error", () => {
    expect(parsePaymentLines(JSON.stringify([{ method: "เงินสด", amount: 0 }]), 500).ok).toBe(false)
    expect(parsePaymentLines(JSON.stringify(Array(4).fill({ method: "เงินสด", amount: 10 })), 500).ok).toBe(false)
    expect(parsePaymentLines(JSON.stringify([
      { method: "เงินสด", amount: 300 }, { method: "QR Code", amount: 300 },
    ]), 500).ok).toBe(false)
  })
  it("JSON เสีย → error ไม่ throw", () => {
    expect(parsePaymentLines("{บึ้ม", 500).ok).toBe(false)
  })
})

describe("primaryMethod", () => {
  it("บรรทัดยอดมากสุดชนะ · เท่ากันเอาบรรทัดแรก · ว่าง = null", () => {
    expect(primaryMethod([
      { method: "บัตรเครดิต", amount: 650 }, { method: "QR Code", amount: 240 },
    ])).toBe("บัตรเครดิต")
    expect(primaryMethod([
      { method: "เงินสด", amount: 250 }, { method: "QR Code", amount: 250 },
    ])).toBe("เงินสด")
    expect(primaryMethod([])).toBeNull()
  })
})

describe("dueAmount", () => {
  it("จ่ายครบ = 0 · ขาด = ค้างรับ · เศษสตางค์ไม่หลอน", () => {
    expect(dueAmount(890, [{ method: "บัตรเครดิต", amount: 650 }, { method: "QR Code", amount: 240 }])).toBe(0)
    expect(dueAmount(890, [{ method: "บัตรเครดิต", amount: 650 }])).toBe(240)
    expect(dueAmount(0.3, [{ method: "เงินสด", amount: 0.1 }, { method: "เงินสด", amount: 0.2 }])).toBe(0)
  })
})
```

- [ ] **Step 2: รันให้แดง** — `npx vitest run src/lib/payments.test.ts` → FAIL (module not found)

- [ ] **Step 3: implement `src/lib/payments.ts`**

```ts
/** บรรทัดชำระของบิล — เงินจริงเท่านั้น เครดิตเมมเบอร์อยู่ที่ credit_used ไม่ใช่บรรทัด (สเปก 2026-08-01) */
export type PaymentLine = { method: string; amount: number }

export const PAYMENT_LINE_METHODS = ["เงินสด", "QR Code", "บัตรเครดิต"] as const
export const MAX_PAYMENT_LINES = 3

const round2 = (n: number) => Math.round(n * 100) / 100

export function parsePaymentLines(
  raw: string,
  maxTotal: number
): { ok: true; lines: PaymentLine[] } | { ok: false; error: string } {
  if (!raw.trim()) return { ok: true, lines: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: "ข้อมูลการชำระเงินไม่ถูกต้อง ลองใหม่อีกครั้ง" }
  }
  if (!Array.isArray(parsed)) return { ok: false, error: "ข้อมูลการชำระเงินไม่ถูกต้อง ลองใหม่อีกครั้ง" }
  if (parsed.length > MAX_PAYMENT_LINES)
    return { ok: false, error: `แบ่งจ่ายได้ไม่เกิน ${MAX_PAYMENT_LINES} วิธีต่อบิล` }
  const lines: PaymentLine[] = []
  for (const item of parsed) {
    const method = String((item as PaymentLine)?.method ?? "")
    const amount = Number((item as PaymentLine)?.amount)
    if (!(PAYMENT_LINE_METHODS as readonly string[]).includes(method))
      return { ok: false, error: "ช่องทางแบ่งจ่ายต้องเป็น เงินสด / QR Code / บัตรเครดิต" }
    if (!Number.isFinite(amount) || amount <= 0)
      return { ok: false, error: "ยอดแต่ละบรรทัดต้องมากกว่า 0" }
    lines.push({ method, amount: round2(amount) })
  }
  const total = round2(lines.reduce((s, l) => s + l.amount, 0))
  if (total > round2(maxTotal))
    return { ok: false, error: `ยอดรับรวม ${total} เกินยอดที่ต้องเก็บ ${round2(maxTotal)}` }
  return { ok: true, lines }
}

export function primaryMethod(lines: PaymentLine[]): string | null {
  if (lines.length === 0) return null
  return lines.reduce((best, l) => (l.amount > best.amount ? l : best), lines[0]).method
}

export function dueAmount(mustCollect: number, lines: PaymentLine[]): number {
  return round2(mustCollect - lines.reduce((s, l) => s + l.amount, 0))
}
```

- [ ] **Step 4: รันให้เขียว** — `npx vitest run src/lib/payments.test.ts` → PASS · `npx tsc --noEmit` → ผ่าน

- [ ] **Step 5: Commit** — `git commit -am "feat(payments): logic บรรทัดชำระ — parse/วิธีหลัก/ยอดค้างรับ"`

---

### Task 3: createSale รับ payments + deleteSale ลบบรรทัดค้าง

**Files:**
- Modify: `src/app/(app)/sale-actions.ts` (createSale ~69-350 · deleteSale ~435-487)

**Interfaces:**
- Consumes: `parsePaymentLines`, `primaryMethod` (Task 2) — import จาก `@/lib/payments`
- Produces: FormData field `payments` (JSON string) — Task 5/6 ส่งมา · บิลที่ส่ง payments (แม้ []) จะถูก set `payments_tracked = true` · แถวแรกของบิลเป็นผู้เขียนบรรทัดทั้งบิล (`bill_key = bill_id ?? saleId`)

- [ ] **Step 1: อ่าน createSale ทั้งฟังก์ชันก่อน** — โครงปัจจุบัน: parse form → ด่านเครดิต → computeSaleAmounts → normalize MC เต็มบิล → insert → syncSalePoints → mirror คิว

- [ ] **Step 2: เพิ่มการ parse + validate** หลังบล็อกด่านเครดิต (หลังคำนวณ `amounts`):

```ts
  // บรรทัดชำระ (สเปก 2026-08-01): มี field payments = บิลระบบใหม่ (tracked)
  // ไม่มี = โค้ดเก่า/Gowabi/KOL/เครดิตเต็มบิล → พฤติกรรมเดิมทุกอย่าง
  const paymentsRaw = formData.get("payments")
  const wantsTracking = paymentsRaw !== null &&
    paymentMethod !== GOWABI_METHOD && paymentMethod !== "KOL"
  const mustCollect = amounts.netAmount - amounts.creditUsed
  const parsedLines = wantsTracking
    ? parsePaymentLines(String(paymentsRaw), mustCollect)
    : ({ ok: true, lines: [] } as const)
  if (!parsedLines.ok) return { ok: false, error: parsedLines.error }
  // วิธีหลักจากบรรทัด — บรรทัดว่าง (ค้างรับเต็มยอด/เครดิตเต็มบิล) คงวิธีที่ฟอร์มส่งมา
  const linePrimary = wantsTracking ? primaryMethod(parsedLines.lines) : null
  if (linePrimary) paymentMethod = linePrimary
```

(หมายเหตุ: `paymentMethod` เป็น `let` อยู่แล้วจากงาน normalize รอบก่อน · บล็อก normalize "เครดิตเต็มบิล → Member Credit" ต้องอยู่**หลัง**บรรทัดนี้ เพื่อให้เครดิตเต็มชนะเสมอ — ตรวจลำดับแล้วขยับถ้าจำเป็น)

- [ ] **Step 3: เขียนบรรทัดหลัง insert สำเร็จ** (จุดที่ได้ `inserted.id` แล้ว):

```ts
  // เขียนบรรทัดชำระครั้งเดียวต่อบิล — บิลชุดให้แถวแรก (ไม่มี bill_id ซ้ำใน bill_payments)
  if (wantsTracking) {
    const billKey = billId || inserted.id   // billId = ตัวแปร bill_id ที่มีอยู่แล้วในฟังก์ชัน
    const isFirstOfBill = !billId || !(await supabase
      .from("bill_payments").select("id").eq("bill_key", billKey).limit(1).maybeSingle()).data
    if (isFirstOfBill && parsedLines.lines.length > 0) {
      const staff = await getMyProfile()
      await supabase.from("bill_payments").insert(
        parsedLines.lines.map((l) => ({
          bill_key: billKey, method: l.method, amount: l.amount,
          received_date: todayInShopTz(), created_by: staff?.full_name ?? null,
        })))
    }
    await supabase.from("sales").update({ payments_tracked: true }).eq("id", inserted.id)
  }
```

ปรับตามจริง: ชื่อตัวแปร bill id / จุดอ่าน profile ที่ฟังก์ชันมีอยู่แล้ว — grep ก่อน อย่าประกาศซ้ำ · ถ้า insert แถว sales รวม field ได้ ให้ใส่ `payments_tracked: wantsTracking` ตั้งแต่ insert แทน update ซ้ำ (ดีกว่า)

- [ ] **Step 4: deleteSale ลบบรรทัดของบิลเมื่อแถวสุดท้ายถูกลบ** — ใน `deleteSale` เพิ่มการ select `bill_id` ตอนอ่าน existing แล้วหลังลบสำเร็จ:

```ts
  // แถวสุดท้ายของบิลถูกลบ → บรรทัดชำระของบิลต้องไปด้วย (กัน orphan — มีด่านตรวจซ้ำ)
  const billKey = existing.bill_id ?? id
  const { data: remain } = await supabase
    .from("sales").select("id").or(`bill_id.eq.${billKey},id.eq.${billKey}`).limit(1)
  if (!remain || remain.length === 0) {
    await supabase.from("bill_payments").delete().eq("bill_key", billKey)
  }
```

- [ ] **Step 5: ตรวจ** — `npx tsc --noEmit` + `npx vitest run` เขียวหมด (server action ไม่มี harness — ความถูกต้องพิสูจน์ผ่าน lib เทส + trace ใน report)

- [ ] **Step 6: Commit** — `git commit -am "feat(pos): createSale รับบรรทัดชำระหลายวิธี + deleteSale เก็บกวาดบรรทัด"`

---

### Task 4: actions เก็บเพิ่ม/ลบบรรทัด — `payment-actions.ts`

**Files:**
- Create: `src/app/(app)/payment-actions.ts`

**Interfaces:**
- Produces: `addBillPayment(billKey: string, method: string, amount: number, note?: string): Promise<{ ok: true; due: number } | { ok: false; error: string }>` · `deleteBillPayment(paymentId: string): Promise<{ ok: boolean; error?: string }>` — Task 6/7 เรียก

- [ ] **Step 1: เขียนไฟล์**

```ts
"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { PAYMENT_LINE_METHODS } from "@/lib/payments"
import { todayInShopTz } from "@/lib/datetime"

/** เก็บเงินเพิ่มเข้าบิล (บิลค้างรับ/ต่อเวลา) — กันเกินยอดค้างด้วยการอ่าน due สดจาก view */
export async function addBillPayment(
  billKey: string, method: string, amount: number, note?: string
): Promise<{ ok: true; due: number } | { ok: false; error: string }> {
  if (!(PAYMENT_LINE_METHODS as readonly string[]).includes(method))
    return { ok: false, error: "ช่องทางต้องเป็น เงินสด / QR Code / บัตรเครดิต" }
  if (!Number.isFinite(amount) || amount <= 0)
    return { ok: false, error: "ยอดต้องมากกว่า 0" }

  const supabase = await createClient()
  const { data: bill } = await supabase
    .from("v_bill_due").select("due").eq("bill_key", billKey).maybeSingle()
  if (!bill) return { ok: false, error: "ไม่พบบิลนี้ หรือบิลไม่ได้อยู่ในระบบบรรทัดชำระ" }
  if (amount > Number(bill.due) + 0.001)
    return { ok: false, error: `ยอดเกินที่ค้างรับ (ค้าง ${bill.due} บาท)` }

  const staff = await getMyProfile()
  const { error } = await supabase.from("bill_payments").insert({
    bill_key: billKey, method, amount,
    received_date: todayInShopTz(),
    note: note?.trim() || null,
    created_by: staff?.full_name ?? null,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath("/today"); revalidatePath("/queue"); revalidatePath("/history")
  return { ok: true, due: Math.round((Number(bill.due) - amount) * 100) / 100 }
}

/** ลบบรรทัดที่บันทึกผิด — RLS จำกัด admin/manager อยู่แล้ว แต่เช็ค role ซ้ำให้ error อ่านรู้เรื่อง */
export async function deleteBillPayment(
  paymentId: string
): Promise<{ ok: boolean; error?: string }> {
  const profile = await getMyProfile()
  if (!profile || !["admin", "manager"].includes(profile.role))
    return { ok: false, error: "เฉพาะผู้จัดการขึ้นไปลบบรรทัดชำระได้" }
  const supabase = await createClient()
  const { error } = await supabase.from("bill_payments").delete().eq("id", paymentId)
  if (error) return { ok: false, error: error.message }
  revalidatePath("/today"); revalidatePath("/queue"); revalidatePath("/history")
  return { ok: true }
}
```

ตรวจก่อนใช้: ค่า role จริงในระบบ (`grep -rn "role ===\|role)" src/lib/auth.ts src/app/(app)/settings | head`) — ถ้าชื่อ role ไม่ใช่ admin/manager ใช้ตามจริง · types ของ `v_bill_due` ต้อง generate ก่อน (`npx supabase gen types` ไม่มี — โปรเจกต์นี้ใช้ MCP generate: ให้ controller รันตอน apply migration แล้วแจ้งใน dispatch ว่า types พร้อม)

- [ ] **Step 2: ตรวจ + Commit** — `npx tsc --noEmit` ผ่าน · `git commit -am "feat(pos): action เก็บเงินเพิ่ม/ลบบรรทัดชำระ"`

---

### Task 5: pos-form — เครดิตเริ่ม 0 + ตัวแบ่งบรรทัด + ยืนยันค้างรับ

**Files:**
- Modify: `src/app/(app)/pos/pos-form.tsx` (บริเวณ credit UI ~143-267, 491-520 และ submit ~300-350, ปุ่มช่องทาง ~590)

**Interfaces:**
- Consumes: `PaymentLine`, `MAX_PAYMENT_LINES`, `dueAmount` จาก `@/lib/payments` · FormData field `payments` (Task 3)
- กติกา UI: เครดิตเริ่ม 0 — `creditUseInput` เปลี่ยน default จาก null(=cap) เป็น `"0"` + ปุ่ม "ใช้เครดิต (เหลือ X ฿)" set เป็น cap · บรรทัดแรก = ปุ่มช่องทางเดิม (ยอด default = ต้องเก็บทั้งหมด) · "+ แบ่งจ่าย" เพิ่มบรรทัด (เลือกวิธี + จำนวน) สูงสุด 3 · สรุปสด "รวมรับ / ต้องเก็บ / ค้างรับ" · ค้างรับ > 0 → dialog ยืนยันก่อนบันทึก

- [ ] **Step 1: เปลี่ยน default เครดิต** — `creditUseInput` เริ่ม `"0"` · ที่กล่องเครดิตเพิ่มปุ่ม:

```tsx
  <Button type="button" variant="outline" size="sm"
    onClick={() => setCreditUseInput(String(creditCap))}>
    ใช้เครดิต (เหลือ {formatBaht(creditBalance)} ฿)
  </Button>
```

ระวัง: ตรรกะ `creditUse` ปัจจุบันตีความ `null` = cap — เปลี่ยนเป็น: `null` ไม่มีแล้ว ใช้ค่าจาก input ตรงๆ (เริ่ม "0") · เช็คทุกจุดที่อ้าง `creditUseInput === null` (มีทั้งใน pos-form และตรรกะ reset ตอนสลับลูกค้า — สลับลูกค้าแล้ว reset เป็น "0")

- [ ] **Step 2: state บรรทัดชำระ**

```tsx
  // บรรทัดแบ่งจ่ายเพิ่มเติม (บรรทัดแรกคือปุ่มช่องทางหลักเดิม ยอด = ที่เหลือหลังหักบรรทัดเสริม)
  const [extraPayments, setExtraPayments] = useState<{ method: string; amount: string }[]>([])
  const extraTotal = extraPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const primaryAmount = Math.max(0, Math.round((cashDue - extraTotal) * 100) / 100)
```

submit สร้าง payments: `[{ method: effectivePaymentMethod, amount: primaryAmount }, ...extras]` กรอง amount > 0 · ถ้า `fullCredit` หรือ Gowabi/KOL → ไม่ส่ง field `payments` เลย (undefined ไม่ใช่ "[]") — คงพฤติกรรม untracked ตามสเปก... **ยกเว้น** บิลเงินจริงปกติต้องส่งเสมอ (แม้บรรทัดเดียว) เพื่อเข้า tracked

- [ ] **Step 3: UI บรรทัดเสริม** — ใต้ปุ่มช่องทาง:

```tsx
  {!isGowabi && !isKol && !fullCredit && (
    <div className="space-y-2">
      {extraPayments.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <select value={p.method} className="h-10 flex-1 rounded-md border px-2 text-sm"
            onChange={(e) => setExtraPayments((a) => a.map((x, j) => j === i ? { ...x, method: e.target.value } : x))}>
            {PAYMENT_LINE_METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
          <Input inputMode="numeric" className="h-10 w-28 text-right" value={p.amount}
            onChange={(e) => setExtraPayments((a) => a.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
          <Button type="button" variant="ghost" size="sm" className="text-red-600"
            onClick={() => setExtraPayments((a) => a.filter((_, j) => j !== i))}>✕</Button>
        </div>
      ))}
      {extraPayments.length < MAX_PAYMENT_LINES - 1 && (
        <Button type="button" variant="outline" size="sm"
          onClick={() => setExtraPayments((a) => [...a, { method: "QR Code", amount: "" }])}>
          + แบ่งจ่ายอีกวิธี
        </Button>
      )}
      <p className="text-sm">
        {effectivePaymentMethod || "—"} {formatBaht(primaryAmount)} ฿
        {extraPayments.filter((p) => Number(p.amount) > 0)
          .map((p) => ` + ${p.method} ${formatBaht(Number(p.amount))} ฿`).join("")}
      </p>
    </div>
  )}
```

- [ ] **Step 4: ยืนยันค้างรับ** — คำนวณ `dueNow = dueAmount(cashDue, [...tracked lines])` ก่อน submit — เกิดได้เมื่อพนักงานลบ/ลดบรรทัดจนรวม < ต้องเก็บ (primaryAmount หนีบ 0 แล้ว extras รวมน้อย) · ถ้า `dueNow > 0` เปิด `window.confirm(\`บันทึกแบบค้างรับ ${dueNow} ฿? ลูกค้าจะจ่ายส่วนนี้ทีหลัง\`)` — ไม่ผ่านไม่ส่ง (โปรเจกต์นี้ยังไม่มี confirm dialog component กลาง — `window.confirm` พอสำหรับรอบแรก ใส่คอมเมนต์ไว้)

- [ ] **Step 5: gates + commit** — `npx tsc --noEmit` · `npx eslint "src/app/(app)/pos"` · `npx vitest run` เขียว · `git commit -am "feat(pos): เครดิตเริ่มศูนย์ + แบ่งจ่ายหลายวิธี + ยืนยันค้างรับ"`

---

### Task 6: group form + edit dialog + กล่องเก็บเพิ่ม

**Files:**
- Modify: `src/app/(app)/pos/group-pos-form.tsx` — เครดิตเริ่ม 0 + ปุ่มลัด (แบบ Task 5 Step 1 เป๊ะ) · บิลชุด (mergeBill + ลูกค้าเดียว): ตัวแบ่งบรรทัดแบบ Task 5 ส่ง `payments` กับแถวแรกของบิล · กลุ่มหลายคน: ส่ง `payments = [{method: เลือกร่วม, amount: nets[i]}]` ต่อบิลของแต่ละคน (tracked บรรทัดเดียว)
- Create: `src/app/(app)/collect-due-dialog.tsx` — กล่อง "เก็บเพิ่ม" ใช้ร่วม:

```tsx
"use client"
// กล่องเก็บเงินเพิ่มของบิลค้างรับ — ใช้จากการ์ดคิว / หน้าวันนี้ / ประวัติ
// default = ยอดค้างทั้งหมด · เลือกวิธี · เรียก addBillPayment แล้วแจ้งผล
export function CollectDueDialog({ billKey, due, onDone }: {
  billKey: string; due: number; onDone: () => void
}) { /* Dialog + select วิธี (PAYMENT_LINE_METHODS) + Input จำนวน (default String(due))
       + ปุ่มยืนยัน → addBillPayment → toast + onDone · โครง Dialog ตามแบบ turn-away-button.tsx */ }
```

(โครงเต็มดูตัวอย่าง `src/app/(app)/queue/turn-away-button.tsx` — Dialog + useTransition + toast idiom เดียวกัน)
- Modify: `src/app/(app)/today/edit-sale-dialog.tsx` — ใต้ส่วนชำระ: แสดงบรรทัดของบิล (อ่านผ่าน props ใหม่ `payments: {id, method, amount, received_date}[]` + `due: number` ที่หน้า today โหลดมา) + ป้ายค้างรับ/เกินรับ + ปุ่มลบบรรทัด (เฉพาะ role หัวหน้า — prop `canDeletePayments: boolean`) + ปุ่มเปิด CollectDueDialog

**Interfaces:**
- Consumes: `addBillPayment`/`deleteBillPayment` (Task 4) · field `payments` (Task 3)
- Produces: `CollectDueDialog({ billKey, due, onDone })` — Task 7 ใช้บนการ์ดคิว/หน้า today

- [ ] **Step 1: group form** — ตามข้างบน (อ่านไฟล์ก่อน ตรรกะเครดิต/`fullCredit` มีอยู่แล้วจากงานรอบก่อน)
- [ ] **Step 2: CollectDueDialog** — เขียนไฟล์ใหม่ตามโครง turn-away-button
- [ ] **Step 3: edit-sale-dialog** — เพิ่ม props + ส่วนแสดงบรรทัด · หน้า today (ผู้เรียก dialog) โหลด `bill_payments` + `v_bill_due` ของบิลที่แก้ (แถม select เดิม)
- [ ] **Step 4: gates + commit** — tsc/eslint/vitest เขียว · `git commit -am "feat(pos): กลุ่ม+แก้บิลรองรับบรรทัดชำระ + กล่องเก็บเพิ่ม"`

---

### Task 7: ป้ายค้างรับทั่วระบบ

**Files:**
- Modify: `src/app/(app)/today/page.tsx` — โหลด `v_bill_due` ที่ due ≠ 0 ของช่วงวัน · ป้ายแดง "ค้างรับ X ฿" บนแถวบิล + การ์ดเตือนรวมหัวหน้า (`บิลค้างรับ N ใบ รวม X ฿` แสดงเมื่อ N > 0 · เกินรับแสดง "เกินรับ" สีส้ม) + ปุ่มเปิด CollectDueDialog
- Modify: `src/app/(app)/history/bill-row.tsx` — ป้าย + บรรทัดชำระใน detail (prop ใหม่จากหน้า history ที่โหลด v_bill_due/bill_payments เฉพาะบิล tracked ในหน้า)
- Modify: `src/app/(app)/queue/queue-card.tsx` + `queue/page.tsx` — การ์ดคิวที่ `sale_id` ผูกบิล tracked due > 0 → ชิพแดง "ค้างรับ" (โหลด due map ระดับหน้าแล้วส่งเป็น prop — อย่า query ต่อการ์ด)

**Interfaces:** Consumes `CollectDueDialog` (Task 6) · `v_bill_due` (Task 1)

- [ ] **Step 1-3: ทีละหน้า (today → history → queue)** ตามข้างบน — แต่ละหน้าจบด้วย tsc + eslint เฉพาะโฟลเดอร์
- [ ] **Step 4: Commit** — `git commit -am "feat(ui): ป้ายค้างรับบนคิว/วันนี้/ประวัติ + การ์ดเตือนรวม"`

---

### Task 8: รายงานอ่านจากบรรทัดชำระ + migration cash_in

**Files:**
- Modify: `src/app/(app)/today/page.tsx` (byPayment ~212-219) · `src/app/(app)/reports/page.tsx` (byPayment ~209-216 · cashByChannel ~169-173)
- Modify: `src/app/api/export/route.ts` — เพิ่มคอลัมน์ "บรรทัดชำระ" (join v_bill_payments ต่อ bill_key สรุปเป็น "เงินสด 500 + QR 300")
- Create: `supabase/migrations/20260801110000_cash_in_from_payment_lines.sql` — `v_daily_summary`: `sales_cash` เปลี่ยนเป็นอ่านจาก `v_bill_payments` group ตาม `received_date` (คง security_invoker + คอลัมน์/ลำดับเดิมทุกตัว) — **controller เป็นผู้ apply + ตรวจ parity**

- [ ] **Step 1: byPayment ทั้งสองหน้า** — แทน reducer ปัจจุบัน (สูตร net−credit ต่อแถว) ด้วยอ่านจาก `v_bill_payments` ช่วงวันเดียวกัน:

```ts
  // เงินจริงตามบรรทัดชำระ (บิลเก่า view สังเคราะห์ให้เท่าสูตรเดิมเป๊ะ) + เครดิตจาก credit_used เหมือนเดิม
  const byPayment: Record<string, number> = {}
  for (const p of paymentRows) // select bill_key, method, amount from v_bill_payments where received_date ช่วงเดียวกัน
    byPayment[p.method] = (byPayment[p.method] ?? 0) + Number(p.amount)
  const creditTotal = rows.reduce((s, r) => s + Number(r.credit_used ?? 0), 0)
  if (creditTotal > 0) byPayment["Member Credit"] = creditTotal
```

- [ ] **Step 2: migration v_daily_summary** — sales_day CTE เดิมคงทุกคอลัมน์ ยกเว้น `sales_cash` ย้ายไปอีก CTE:

```sql
pay_day as (
  select received_date as sale_date, sum(amount) as sales_cash
  from public.v_bill_payments group by received_date
)
-- แล้ว join pay_day แทนที่ค่า sales_cash เดิม (คอลัมน์ output ชื่อ/ลำดับเดิมเป๊ะ)
```

- [ ] **Step 3: gates + commit** — tsc/eslint/vitest + `npm run build` เขียว · `git commit -am "feat(reports): ยอดช่องทาง+เงินเข้าอ่านจากบรรทัดชำระ"`

---

### Task 9: ด่านตรวจ + ปิดงาน (controller ร่วม)

**Files:**
- Modify: `supabase/reconciliation.sql`

- [ ] **Step 1: เพิ่ม 3 ด่าน**

expected:
```sql
  -- บรรทัดชำระ (สเปก 2026-08-01): บรรทัดต้องมีบิลจริง · เกินรับต้องศูนย์เมื่อพัก · วิธีหลักตรงบรรทัด
  ('bill_payments_orphaned', 0),
  ('bill_overpaid', 0),
  ('tracked_bill_method_mismatch', 0),
```

actual:
```sql
  union all
  select 'bill_payments_orphaned', count(*)
  from public.bill_payments p
  where not exists (select 1 from public.sales s where coalesce(s.bill_id, s.id) = p.bill_key)

  union all
  select 'bill_overpaid', count(*)
  from public.v_bill_due where due < -0.005

  union all
  select 'tracked_bill_method_mismatch', count(*)
  from (
    select d.bill_key
    from public.v_bill_due d
    join public.sales s on coalesce(s.bill_id, s.id) = d.bill_key
    where d.paid_total > 0
    group by d.bill_key
    having min(s.payment_method) <> (
      select p.method from public.bill_payments p
      where p.bill_key = d.bill_key
      order by p.amount desc, p.created_at asc limit 1)
  ) bad
```

- [ ] **Step 2 (controller): apply migrations ทั้งสองไฟล์บน production + generate types + parity check** — `sum(cash_in)` และ `sum(net_revenue)` ทั้งตาราง ก่อน/หลัง ต้องเท่ากันเป๊ะ · reconciliation 34 ข้อ PASS
- [ ] **Step 3: gates เต็ม + deploy** — tsc/eslint/vitest/build → merge main → push → Vercel Ready → runtime errors ว่าง
- [ ] **Step 4: ตรวจของจริง** — บิลทดสอบ: บัตร+โอนแบ่งจ่าย → ดู /today ช่องทางแยกถูก → ลบบิลทดสอบ → recon ยัง PASS
- [ ] **Step 5: ติ๊กแผน + บันทึกผลปิดงาน + push**
