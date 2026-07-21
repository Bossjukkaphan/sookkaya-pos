# SOOKKAYA หน้ายอดขายเลือกวันได้ + แก้ไขรายการ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: ใช้ superpowers:subagent-driven-development
> หรือ superpowers:executing-plans ลงมือทีละ Task · ทุก step เป็น checkbox ให้ติ๊กตามจริง

**Goal:** ดูยอดขายวันไหนก็ได้ เห็นรายละเอียดครบ และแก้รายการที่บันทึกผิดได้โดยที่ตัวเลขเงินไม่เพี้ยน

**Architecture:** ดึงสูตรคำนวณเงินออกจาก `createSale` มาเป็นฟังก์ชันบริสุทธิ์ `src/lib/sale-math.ts`
ที่มีเทส แล้วให้ทั้ง `createSale` และ `updateSale` เรียกตัวเดียวกัน — ถ้าเขียนสูตรสองที่
วันหนึ่ง "บันทึกใหม่" กับ "แก้ของเดิม" จะให้ตัวเลขไม่ตรงกัน

**Tech Stack:** Next.js 16 · Supabase Postgres · TypeScript · Tailwind + shadcn/ui · vitest

**Spec:** `docs/superpowers/specs/2026-07-21-today-filter-edit-design.md`

**ก่อนรันทุกคำสั่ง:** `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"`
**Supabase project ref:** `jrioyrmicioqammeevgh`
**ก่อนเขียนโค้ด:** อ่าน `AGENTS.md` — Next.js 16, `searchParams` เป็น Promise

**เทสตอนนี้ 77 ข้อ · reconciliation 21 ข้อ**

---

## File Structure

| ไฟล์ | หน้าที่ |
| ---- | ------- |
| `src/lib/sale-math.ts` | สูตร: ยอดสุทธิ · ส่วนลด · ค่ามือ · เครดิต · รายได้รับรู้ |
| `src/lib/sale-math.test.ts` | เทสของข้างบน |
| `src/app/(app)/sale-actions.ts` | *(แก้)* `createSale` ใช้สูตรกลาง · เพิ่ม `updateSale` |
| `src/app/(app)/today/page.tsx` | *(แก้)* เลือกวัน/ช่วงวัน · รายละเอียดเต็ม |
| `src/app/(app)/today/date-filter.tsx` | ตัวเลือกวันและปุ่มลัด |
| `src/app/(app)/today/sale-row-actions.tsx` | *(แก้)* เพิ่มปุ่มแก้ไข |
| `src/app/(app)/today/edit-sale-dialog.tsx` | ฟอร์มแก้ไข |

---

## Task 1: `src/lib/sale-math.ts` + เทส (TDD)

**Files:** Create `src/lib/sale-math.ts` · Test `src/lib/sale-math.test.ts`

- [ ] **Step 1: อ่าน `src/app/(app)/sale-actions.ts` ทั้งไฟล์ก่อน**

สูตรที่ต้องย้ายอยู่ในนั้น อย่าเดา — คัดลอกพฤติกรรมเดิมให้ตรงทุกบรรทัด
โดยเฉพาะการปัดทศนิยมของ `revenueRecognize` และ `bonusUsed`

- [ ] **Step 2: เขียนเทสก่อน** — สร้าง `src/lib/sale-math.test.ts`

```ts
import { describe, expect, it } from "vitest"
import { computeSaleAmounts } from "./sale-math"

const base = {
  priceNormal: 650,
  discount: 0,
  paymentMethod: "QR Code",
  gowabiNet: null,
  isRequest: false,
  requestFee: 0,
  serviceCommission: 240,
  memberRatio: null,
}

describe("computeSaleAmounts", () => {
  it("ขายปกติ — ยอดสุทธิคือราคาลบส่วนลด", () => {
    const a = computeSaleAmounts({ ...base, discount: 160 })
    expect(a.netAmount).toBe(490)
    expect(a.discount).toBe(160)
    expect(a.commission).toBe(240)
    expect(a.revenueRecognize).toBe(490)
    expect(a.creditUsed).toBe(0)
  })

  it("Gowabi — กรอกยอดที่ได้จริง ส่วนลดคือส่วนต่างจากราคาปกติ", () => {
    const a = computeSaleAmounts({
      ...base,
      paymentMethod: "Gowabi",
      gowabiNet: 390,
    })
    expect(a.netAmount).toBe(390)
    expect(a.discount).toBe(260)
    expect(a.revenueRecognize).toBe(390)
  })

  it("Gowabi ไม่กรอกยอด — ใช้ราคาปกติ ไม่ใช่ศูนย์", () => {
    const a = computeSaleAmounts({ ...base, paymentMethod: "Gowabi", gowabiNet: null })
    expect(a.netAmount).toBe(650)
    expect(a.discount).toBe(0)
  })

  it("Member Credit — ตัดเครดิตเต็มยอด แยกของแถมออกจากรายได้", () => {
    // Silver จ่ายจริง 5,000 ได้เครดิต 6,000 → สัดส่วนรับรู้ 5/6
    const a = computeSaleAmounts({
      ...base,
      priceNormal: 690,
      paymentMethod: "Member Credit",
      serviceCommission: 255,
      memberRatio: 5000 / 6000,
    })
    expect(a.creditUsed).toBe(690)
    expect(a.revenueRecognize).toBe(575)
    expect(a.bonusUsed).toBe(115)
    expect(a.creditUsed).toBe(a.revenueRecognize + a.bonusUsed)
  })

  it("Member Credit ที่ไม่มีของแถม — รับรู้เต็มจำนวน", () => {
    const a = computeSaleAmounts({
      ...base,
      paymentMethod: "Member Credit",
      memberRatio: 1,
    })
    expect(a.creditUsed).toBe(650)
    expect(a.revenueRecognize).toBe(650)
    expect(a.bonusUsed).toBe(0)
  })

  it("ค่ารีเควสไม่นับเป็นยอดขาย แต่ติดไปกับรายการเพื่อจ่ายหมอ", () => {
    const a = computeSaleAmounts({ ...base, isRequest: true, requestFee: 40 })
    expect(a.netAmount).toBe(650)
    expect(a.requestFee).toBe(40)
  })

  it("ไม่ติ๊กรีเควส ค่ารีเควสต้องเป็นศูนย์แม้จะมีค่าค้างในฟอร์ม", () => {
    const a = computeSaleAmounts({ ...base, isRequest: false, requestFee: 40 })
    expect(a.requestFee).toBe(0)
  })

  it("ส่วนลดมากกว่าราคา — คืนยอดติดลบให้ผู้เรียกปฏิเสธ ไม่ปัดเป็นศูนย์เงียบๆ", () => {
    const a = computeSaleAmounts({ ...base, discount: 800 })
    expect(a.netAmount).toBeLessThan(0)
  })
})
```

- [ ] **Step 3: `npm test`** → FAIL `Failed to resolve import "./sale-math"`

- [ ] **Step 4: เขียน `src/lib/sale-math.ts`**

```ts
import { GOWABI_METHOD, MEMBER_CREDIT_METHOD } from "@/lib/constants"

export type SaleInput = {
  priceNormal: number
  discount: number
  paymentMethod: string
  /** ยอดที่ Gowabi จ่ายจริง · null = ใช้ราคาปกติ */
  gowabiNet: number | null
  isRequest: boolean
  requestFee: number
  serviceCommission: number
  /** cash_paid / credit_granted ของสมาชิก · null = ไม่ได้จ่ายด้วยเครดิต */
  memberRatio: number | null
}

export type SaleAmounts = {
  netAmount: number
  discount: number
  commission: number
  requestFee: number
  creditUsed: number
  bonusUsed: number
  revenueRecognize: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * สูตรเงินของการขายหนึ่งรายการ — ที่เดียวในระบบ
 *
 * ทั้งตอนบันทึกใหม่และตอนแก้ของเดิมต้องเรียกฟังก์ชันนี้ ห้ามคำนวณเอง
 * ถ้าสองเส้นทางคำนวณแยกกัน วันหนึ่งมันจะให้ตัวเลขต่างกันโดยไม่มีใครรู้
 * (กฎบัญชีข้อ 3 ใน README — บั๊กเรื่องเงิน 4 จุดที่ผ่านมาเกิดจากคำนวณซ้ำหลายที่)
 */
export function computeSaleAmounts(input: SaleInput): SaleAmounts {
  const isGowabi = input.paymentMethod === GOWABI_METHOD
  const isMemberCredit = input.paymentMethod === MEMBER_CREDIT_METHOD

  // Gowabi จ่ายตามดีลของเขา ยอดรับจริงจึงกรอกเอง และส่วนลดคือส่วนต่างจากราคาปกติ
  const netAmount = isGowabi
    ? Math.max(0, input.gowabiNet ?? input.priceNormal)
    : input.priceNormal - input.discount

  const discount = isGowabi ? input.priceNormal - netAmount : input.discount
  const requestFee = input.isRequest ? Math.max(0, input.requestFee) : 0

  if (!isMemberCredit) {
    return {
      netAmount,
      discount,
      commission: input.serviceCommission,
      requestFee,
      creditUsed: 0,
      bonusUsed: 0,
      revenueRecognize: netAmount,
    }
  }

  // เครดิตถูกตัดเต็มยอด แต่ส่วนที่เป็นของแถมไม่ใช่รายได้
  // เช่น Silver จ่าย 5,000 ได้เครดิต 6,000 → ใช้ 690 รับรู้ 575 ที่เหลือ 115 คือของแถม
  const ratio = input.memberRatio ?? 1
  const revenueRecognize = round2(netAmount * ratio)

  return {
    netAmount,
    discount,
    commission: input.serviceCommission,
    requestFee,
    creditUsed: netAmount,
    bonusUsed: round2(netAmount - revenueRecognize),
    revenueRecognize,
  }
}
```

- [ ] **Step 5: `npm test`** → ผ่านทั้งหมด **85 ข้อ** (77 + 8 ใหม่)

- [ ] **Step 6: `npx eslint src`** → สะอาด

- [ ] **Step 7: Commit**

```bash
git add src/lib/sale-math.ts src/lib/sale-math.test.ts
git commit -m "feat: สูตรคำนวณเงินของรายการขายพร้อมเทส"
```

---

## Task 2: ให้ `createSale` ใช้สูตรกลาง

Task นี้เสี่ยงที่สุดในแผน เพราะแก้โค้ดที่ใช้บันทึกเงินจริงอยู่ทุกวัน
ตัวเลขที่ออกมาต้องเท่าเดิมทุกบาท

**Files:** Modify `src/app/(app)/sale-actions.ts`

- [ ] **Step 1: แทนที่ส่วนคำนวณใน `createSale`**

เดิมคำนวณ `netAmount`, `discount`, `requestFee`, `creditUsed`, `bonusUsed`, `revenueRecognize`
กระจายอยู่หลายจุด เปลี่ยนเป็น:

```ts
  const isRequest = formData.get("is_request") === "on"

  // สัดส่วนรับรู้รายได้ของสมาชิก — อ่านก่อนคำนวณ เพราะสูตรต้องใช้
  let memberRatio: number | null = null
  if (paymentMethod === MEMBER_CREDIT_METHOD) {
    if (!customerId) {
      return { ok: false, error: "ชำระด้วย Member Credit ต้องเลือกลูกค้าที่เป็นสมาชิก" }
    }

    const { data: balance } = await supabase
      .from("member_balances")
      .select("credit_balance, credit_granted, cash_paid")
      .eq("customer_id", customerId)
      .single()

    const granted = balance?.credit_granted ?? 0
    memberRatio = granted > 0 ? (balance?.cash_paid ?? 0) / granted : 1

    const credit = balance?.credit_balance ?? 0
    const wanted = priceNormal - Math.max(0, toNumber(formData.get("discount")))
    if (credit < wanted) {
      return {
        ok: false,
        error: `เครดิตคงเหลือไม่พอ (มี ${credit} บาท ต้องใช้ ${wanted} บาท)`,
      }
    }
  }

  const amounts = computeSaleAmounts({
    priceNormal,
    discount: Math.max(0, toNumber(formData.get("discount"))),
    paymentMethod,
    gowabiNet:
      paymentMethod === GOWABI_METHOD
        ? toNumber(formData.get("net_amount"), priceNormal)
        : null,
    isRequest,
    requestFee: toNumber(formData.get("request_fee")),
    serviceCommission: service.commission,
    memberRatio,
  })

  if (amounts.netAmount < 0) {
    return { ok: false, error: "ยอดรับจริงติดลบ กรุณาตรวจสอบส่วนลด" }
  }
```

แล้วใน `.insert({...})` เปลี่ยนช่องที่เกี่ยวกับเงินให้อ่านจาก `amounts`:

```ts
      price_normal: priceNormal,
      discount: amounts.discount,
      net_amount: amounts.netAmount,
      commission: amounts.commission,
      request_fee: amounts.requestFee,
      credit_used: amounts.creditUsed,
      bonus_used: amounts.bonusUsed,
      revenue_recognize: amounts.revenueRecognize,
```

เพิ่ม import:

```ts
import { computeSaleAmounts } from "@/lib/sale-math"
```

- [ ] **Step 2: `npm run build && npx eslint src && npm test`** → build ผ่าน · lint สะอาด · 85 เทส

- [ ] **Step 3: พิสูจน์ว่าตัวเลขเดิมไม่ขยับ**

รัน `supabase/reconciliation.sql` ทั้งไฟล์ → **21 ข้อ PASS**
ชุดตรวจนี้ผูกกับข้อมูลที่บันทึกไปแล้ว ถ้ายัง PASS แปลว่าการ refactor ไม่ได้แตะข้อมูลเดิม

- [ ] **Step 4: ทดสอบบันทึกขายจริง 1 รายการแล้วเทียบ**

บันทึกขายผ่านหน้า `/pos` 1 รายการ (เงินสด ไม่มีส่วนลด) แล้วตรวจด้วย `execute_sql`:

```sql
select receipt_no, price_normal, discount, net_amount, commission,
       request_fee, credit_used, bonus_used, revenue_recognize
from public.sales order by created_at desc limit 1;
```

ต้องได้ `discount = 0` · `net_amount = price_normal` · `credit_used = 0` ·
`revenue_recognize = net_amount` — เหมือนรายการเดิมทุกช่อง จากนั้น**ลบรายการทดสอบทิ้ง**

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/sale-actions.ts"
git commit -m "refactor: createSale ใช้สูตรเงินกลางแทนคำนวณเอง"
```

---

## Task 3: server action `updateSale`

**Files:** Modify `src/app/(app)/sale-actions.ts` (ต่อท้าย)

- [ ] **Step 1: เพิ่ม `updateSale`**

```ts
export type UpdateResult = { ok: true } | { ok: false; error: string }

/** แก้ได้เฉพาะเดือนปัจจุบัน — เดือนที่ปิดงบไปแล้วห้ามขยับ ไม่งั้นรายงานที่ส่งไปแล้วจะไม่ตรง */
function isCurrentMonth(saleDate: string): boolean {
  return saleDate.slice(0, 7) === todayInShopTz().slice(0, 7)
}

export async function updateSale(
  id: string,
  formData: FormData
): Promise<UpdateResult> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("sales")
    .select("sale_date, credit_used, customer_id")
    .eq("id", id)
    .single()

  if (!existing) return { ok: false, error: "ไม่พบรายการขายนี้" }
  if (!isCurrentMonth(existing.sale_date)) {
    return { ok: false, error: "แก้ได้เฉพาะรายการของเดือนปัจจุบัน" }
  }

  const therapistId = String(formData.get("therapist_id") ?? "")
  const serviceId = String(formData.get("service_id") ?? "")
  const paymentMethod = String(formData.get("payment_method") ?? "")

  if (!therapistId) return { ok: false, error: "กรุณาเลือกหมอนวด" }
  if (!serviceId) return { ok: false, error: "กรุณาเลือกเมนูบริการ" }
  if (!PAYMENT_METHODS.includes(paymentMethod as never)) {
    return { ok: false, error: "กรุณาเลือกช่องทางชำระเงิน" }
  }

  // อ่านราคา/ค่ามือจากฐานข้อมูล ไม่เชื่อค่าที่ส่งมาจากฟอร์ม
  const { data: service } = await supabase
    .from("services")
    .select("name, price, commission")
    .eq("id", serviceId)
    .single()

  if (!service) return { ok: false, error: "ไม่พบเมนูบริการที่เลือก" }

  const rawCustomerId = String(formData.get("customer_id") ?? "").trim()
  const customerId = rawCustomerId === "" ? null : rawCustomerId

  let memberRatio: number | null = null
  if (paymentMethod === MEMBER_CREDIT_METHOD) {
    if (!customerId) {
      return { ok: false, error: "ชำระด้วย Member Credit ต้องเลือกลูกค้าที่เป็นสมาชิก" }
    }

    const { data: balance } = await supabase
      .from("member_balances")
      .select("credit_balance, credit_granted, cash_paid")
      .eq("customer_id", customerId)
      .single()

    const granted = balance?.credit_granted ?? 0
    memberRatio = granted > 0 ? (balance?.cash_paid ?? 0) / granted : 1

    // ยอดคงเหลือปัจจุบันหักรายการนี้ไปแล้ว การแก้จะคืนของเดิมก่อนตัดใหม่
    // เพดานจึงเป็นคงเหลือ + ที่รายการนี้เคยตัดไป — แต่คืนได้เฉพาะเมื่อยังเป็นลูกค้าคนเดิม
    const sameCustomer = existing.customer_id === customerId
    const headroom =
      Number(balance?.credit_balance ?? 0) +
      (sameCustomer ? Number(existing.credit_used ?? 0) : 0)

    const wanted = service.price - Math.max(0, toNumber(formData.get("discount")))
    if (headroom < wanted) {
      return {
        ok: false,
        error: `เครดิตคงเหลือไม่พอ (แก้เป็นได้สูงสุด ${headroom} บาท ต้องใช้ ${wanted} บาท)`,
      }
    }
  }

  const amounts = computeSaleAmounts({
    priceNormal: service.price,
    discount: Math.max(0, toNumber(formData.get("discount"))),
    paymentMethod,
    gowabiNet:
      paymentMethod === GOWABI_METHOD
        ? toNumber(formData.get("net_amount"), service.price)
        : null,
    isRequest: formData.get("is_request") === "on",
    requestFee: toNumber(formData.get("request_fee")),
    serviceCommission: service.commission,
    memberRatio,
  })

  if (amounts.netAmount < 0) {
    return { ok: false, error: "ยอดรับจริงติดลบ กรุณาตรวจสอบส่วนลด" }
  }

  const { error } = await supabase
    .from("sales")
    .update({
      customer_id: customerId,
      customer_name: String(formData.get("customer_name") ?? "").trim() || null,
      customer_phone: String(formData.get("customer_phone") ?? "").trim() || null,
      therapist_id: therapistId,
      service_id: serviceId,
      service_name: service.name,
      price_normal: service.price,
      coupon_promo: String(formData.get("coupon_promo") ?? "").trim() || null,
      discount: amounts.discount,
      net_amount: amounts.netAmount,
      commission: amounts.commission,
      payment_method: paymentMethod,
      is_request: formData.get("is_request") === "on",
      request_fee: amounts.requestFee,
      member_status: paymentMethod === MEMBER_CREDIT_METHOD ? "💳 Member" : null,
      credit_used: amounts.creditUsed,
      bonus_used: amounts.bonusUsed,
      revenue_recognize: amounts.revenueRecognize,
    })
    .eq("id", id)

  if (error) return { ok: false, error: `แก้ไขไม่สำเร็จ: ${error.message}` }

  revalidatePath("/today")
  revalidatePath("/")
  revalidatePath("/commission")
  revalidatePath("/overview")
  return { ok: true }
}
```

- [ ] **Step 2: `deleteSale` ต้องกันเดือนเก่าด้วย**

ตอนนี้ `deleteSale` ลบได้ทุกวัน เพิ่มการกันแบบเดียวกัน ก่อนบรรทัด `.delete()`:

```ts
  const { data: existing } = await supabase
    .from("sales")
    .select("sale_date")
    .eq("id", id)
    .single()

  if (!existing) return { ok: false, error: "ไม่พบรายการขายนี้" }
  if (!isCurrentMonth(existing.sale_date)) {
    return { ok: false, error: "ลบได้เฉพาะรายการของเดือนปัจจุบัน" }
  }
```

และเพิ่ม `revalidatePath("/today")` กับ `revalidatePath("/overview")` ต่อจากที่มีอยู่

- [ ] **Step 3: `npm run build && npx eslint src && npm test`** → ผ่านทั้งหมด

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/sale-actions.ts"
git commit -m "feat: แก้ไขรายการขายได้ จำกัดเฉพาะเดือนปัจจุบัน"
```

---

## Task 4: ตัวเลือกวันในหน้า `/today`

**Files:** Create `src/app/(app)/today/date-filter.tsx` · Modify `src/app/(app)/today/page.tsx`

- [ ] **Step 1: สร้าง `src/app/(app)/today/date-filter.tsx`**

```tsx
"use client"

import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

function shiftDay(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
}

export function DateFilter({
  from,
  to,
  today,
}: {
  from: string
  to: string
  today: string
}) {
  const router = useRouter()

  function go(nextFrom: string, nextTo: string) {
    router.push(`/today?from=${nextFrom}&to=${nextTo}`)
  }

  // เลื่อนทั้งหน้าต่างพร้อมกัน เพื่อให้โหมดช่วงวันยังกว้างเท่าเดิม
  function shiftWindow(delta: number) {
    go(shiftDay(from, delta), shiftDay(to, delta))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => shiftWindow(-1)}>
          ←
        </Button>
        <Input
          type="date"
          value={from}
          max={to}
          onChange={(e) => go(e.target.value, to)}
          className="h-9"
          aria-label="ตั้งแต่วันที่"
        />
        <span className="text-sm text-slate-400">ถึง</span>
        <Input
          type="date"
          value={to}
          min={from}
          onChange={(e) => go(from, e.target.value)}
          className="h-9"
          aria-label="ถึงวันที่"
        />
        <Button variant="outline" size="sm" onClick={() => shiftWindow(1)}>
          →
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => go(today, today)}>
          วันนี้
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => go(shiftDay(today, -6), today)}
        >
          7 วันล่าสุด
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => go(`${today.slice(0, 7)}-01`, today)}
        >
          เดือนนี้
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: แก้ `src/app/(app)/today/page.tsx`**

เปลี่ยน signature ให้รับ `searchParams` และ query ตามช่วง:

```tsx
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const supabase = await createClient()
  const today = todayInShopTz()
  const params = await searchParams

  // ค่าเริ่มต้นคือวันนี้ทั้งคู่ · ถ้าใส่กลับด้าน ให้สลับให้ถูก แทนที่จะคืนรายการว่าง
  const rawFrom = params.from ?? today
  const rawTo = params.to ?? rawFrom
  const from = rawFrom <= rawTo ? rawFrom : rawTo
  const to = rawFrom <= rawTo ? rawTo : rawFrom
  const isSingleDay = from === to

  const [{ data: sales }, { data: therapists }] = await Promise.all([
    supabase
      .from("sales")
      .select("*")
      .gte("sale_date", from)
      .lte("sale_date", to)
      .order("sale_date", { ascending: false })
      .order("sale_time", { ascending: false })
      .limit(500),
    supabase.from("therapists").select("id, name"),
  ])
```

> **ทำไมต้อง `.limit(500)`:** `supabase-js` คืนสูงสุด 1,000 แถวโดยไม่บอก
> ถ้าเลือกช่วงกว้างแล้วเกิน รายการจะหายเงียบๆ · จำกัดไว้ 500 แล้วบอกผู้ใช้เมื่อชนเพดาน
> ดีกว่าปล่อยให้ตัดทิ้งโดยไม่รู้ตัว

เพิ่มการเช็คว่าแก้ได้ไหม และตัวแปรสรุป:

```tsx
  const rows = sales ?? []
  const editable = to.slice(0, 7) === today.slice(0, 7) && from.slice(0, 7) === today.slice(0, 7)
  const truncated = rows.length === 500
```

จัดกลุ่มตามวันเมื่อเป็นโหมดช่วง:

```tsx
  const byDay = new Map<string, typeof rows>()
  for (const s of rows) {
    const list = byDay.get(s.sale_date) ?? []
    list.push(s)
    byDay.set(s.sale_date, list)
  }
```

หัวข้อหน้าเปลี่ยนตามโหมด และวาง `<DateFilter from={from} to={to} today={today} />` ใต้หัวข้อ

เมื่อ `truncated` เป็นจริง แสดงแถบเตือน:

```tsx
      {truncated && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3 text-sm text-amber-900">
            ช่วงวันที่เลือกมีรายการเกิน 500 รายการ แสดงเฉพาะ 500 รายการล่าสุด
            — เลือกช่วงให้แคบลงเพื่อดูให้ครบ
          </CardContent>
        </Card>
      )}
```

เมื่อ `!editable` แสดงหมายเหตุว่าเป็นข้อมูลเดือนก่อน แก้ไม่ได้

- [ ] **Step 3: แสดงรายละเอียดให้ครบในแต่ละรายการ**

แต่ละแถวต้องเห็น: เวลา · เลขใบเสร็จ · เมนู · หมอ · ลูกค้า · ราคาปกติ · ส่วนลด + ชื่อโปรฯ ·
ยอดสุทธิ · ค่ามือ · ค่ารีเควส · ช่องทางชำระ · ป้ายสมาชิก

ให้ยึดโครงเดิมของไฟล์ (ลิสต์ `divide-y`) แล้วเพิ่มบรรทัดรายละเอียดที่ยังไม่มี
อย่าเปลี่ยนเป็นตาราง — พนักงานใช้บนแท็บเล็ตแนวตั้ง

โหมดช่วงวัน: วนตาม `byDay` ใส่หัววันด้วย `formatThaiDate` และยอดรวมของวันนั้น

- [ ] **Step 4: `npm run build && npx eslint src && npm test`** → ผ่านทั้งหมด

- [ ] **Step 5: ตรวจบนหน้าจริง**

- `/today` → วันนี้ · `/today?from=2026-07-20&to=2026-07-20` → **16 รายการ รวม ฿10,460**
- `/today?from=2026-07-01&to=2026-07-20` → หลายวัน มีหัววันคั่น
- `/today?from=2026-06-01&to=2026-06-30` → ต้องขึ้นว่าแก้ไม่ได้ (เดือนก่อน)

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/today"
git commit -m "feat: เลือกวันและช่วงวันในหน้ายอดขาย พร้อมรายละเอียดเต็ม"
```

---

## Task 5: ฟอร์มแก้ไขรายการ

**Files:** Create `src/app/(app)/today/edit-sale-dialog.tsx` · Modify `sale-row-actions.tsx` · `page.tsx`

- [ ] **Step 1: หน้า `page.tsx` ต้องส่งข้อมูลที่ฟอร์มต้องใช้**

เพิ่มใน `Promise.all`: `therapists` (มีแล้ว แต่ต้องกรอง `status = 'active'`), `services`
(`id, name, price, commission` เฉพาะ `is_active`), `promotions` (`id, name` เฉพาะ `is_active`
และ `kind <> 'internal'` — เหมือนหน้า `/pos`)

- [ ] **Step 2: สร้าง `edit-sale-dialog.tsx`**

ใช้ `Dialog` จาก `@/components/ui/dialog` · ฟอร์มมีช่องเดียวกับหน้า `/pos`
(หมอ · เมนู · ลูกค้า · ช่องทางชำระ · โปรฯ · ส่วนลด หรือยอด Gowabi · รีเควส + ค่ารีเควส)
ค่าเริ่มต้นเป็นค่าปัจจุบันของรายการนั้น

เมื่อช่องทางชำระเป็น Member Credit ต้องแสดงกล่องข้อมูลเครดิต:

```tsx
        {isMemberCredit && credit && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs">
            <p>
              เครดิตคงเหลือตอนนี้ <strong>{formatBaht(credit.balance)} ฿</strong> ·
              รายการนี้ตัดไป <strong>{formatBaht(sale.credit_used)} ฿</strong>
            </p>
            <p className="font-medium text-emerald-900">
              แก้เป็นได้สูงสุด {formatBaht(credit.balance + sale.credit_used)} ฿
            </p>
            {credit.ratio < 1 && (
              <p className="mt-1 text-amber-700">
                สัดส่วนรับรู้รายได้ตอนนี้คือ {Math.round(credit.ratio * 100)}% —
                ถ้าลูกค้าเติมเงินหลังวันที่ขาย ตัวเลขรายได้รับรู้ของรายการนี้จะเปลี่ยนหลังกดบันทึก
              </p>
            )}
          </div>
        )}
```

ข้อมูลเครดิต (`balance`, `ratio`) ให้ `page.tsx` query จาก `member_balances`
เฉพาะลูกค้าที่ปรากฏในรายการที่แสดงอยู่ แล้วส่งเป็น prop — อย่า query ในฝั่ง client

- [ ] **Step 3: เพิ่มปุ่มแก้ไขใน `sale-row-actions.tsx`**

วางคู่ปุ่มลบ · ซ่อนทั้งสองปุ่มเมื่อ `editable` เป็นเท็จ

- [ ] **Step 4: `npm run build && npx eslint src && npm test`** → ผ่านทั้งหมด

- [ ] **Step 5: ทดสอบบนหน้าจริง — เคสที่ต้องลอง**

1. แก้ส่วนลดของรายการเงินสด → ยอดสุทธิเปลี่ยนตาม ค่ามือไม่เปลี่ยน
2. เปลี่ยนเมนู → ราคาและค่ามือเปลี่ยนตามเมนูใหม่
3. แก้รายการ Member Credit ให้ยอดสูงขึ้นเกินเพดาน → ต้องถูกปฏิเสธพร้อมบอกเพดาน
4. เปลี่ยนรายการ Member Credit เป็นเงินสด → `credit_used` ต้องกลับเป็น 0 และเครดิตลูกค้าคืน
5. เปิด `/today?from=2026-06-01&to=2026-06-30` → ต้องไม่มีปุ่มแก้/ลบ

ตรวจข้อ 4 ด้วย SQL:

```sql
select credit_balance from public.member_balances where customer_id = '<id>';
```

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/today"
git commit -m "feat: ฟอร์มแก้ไขรายการขายพร้อมข้อมูลเครดิตสมาชิก"
```

---

## Task 6: ตรวจทั้งระบบ

- [ ] **Step 1: `npm test && npm run build && npx eslint src`** → 85 เทส · build ผ่าน · lint สะอาด

- [ ] **Step 2: รัน `supabase/reconciliation.sql`** → **21 ข้อ PASS**

- [ ] **Step 3: `get_advisors` type `security`** → ไม่มี ERROR ใหม่

- [ ] **Step 4: ตรวจสิทธิ์** — `updateSale` และ `deleteSale` พึ่ง RLS ของตาราง `sales`
ซึ่งอนุญาต admin/manager/staff ทั้งหมด ยืนยันว่านี่คือสิ่งที่ต้องการ:
พนักงานแก้รายการที่ตัวเองบันทึกผิดได้ ถ้าไม่ต้องการให้รายงานไว้ อย่าเปลี่ยนเอง

- [ ] **Step 5: อัปเดต `README.md`** — ตารางหน้า `/today` บอกว่าเลือกช่วงวันและแก้ไขได้
เพิ่มกฎข้อ 8: *สูตรเงินของการขายอยู่ที่ `src/lib/sale-math.ts` ที่เดียว
ทั้ง `createSale` และ `updateSale` ต้องเรียกตัวนี้ ห้ามคำนวณเอง*

- [ ] **Step 6: Commit แล้วหยุด รอเจ้าของโปรเจกต์ตรวจก่อน merge และ deploy**

---

## เสร็จแล้วได้อะไร

- ดูยอดขายวันไหนก็ได้ ไม่ต้องเป็นวันนี้เท่านั้น
- เห็นครบว่าแต่ละรายการ หมอคนไหน เมนูอะไร ลดเท่าไหร่ ด้วยโปรฯ ตัวไหน
- แก้รายการที่บันทึกผิดได้ โดยเครดิตสมาชิกและรายได้รับรู้ถูกคำนวณใหม่ให้อัตโนมัติ
- สูตรเงินอยู่ที่เดียว มีเทสคุม ทั้งตอนบันทึกใหม่และตอนแก้
- เดือนที่ปิดงบไปแล้วแก้ไม่ได้ รายงานที่ส่งไปแล้วจะไม่เปลี่ยนย้อนหลัง
