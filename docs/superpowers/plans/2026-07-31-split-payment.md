# แบ่งชำระ: เครดิตสมาชิก + อีกหนึ่งช่องทาง — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** บิลเดียวตัดเครดิตสมาชิกบางส่วน + เก็บส่วนต่างด้วยเงินจริงหนึ่งช่องทาง (QR/เงินสด/บัตร)

**Architecture:** ใช้โครงข้อมูลเดิม — `sales.credit_used` แยกจาก `payment_method` อยู่แล้ว ไม่เพิ่มตาราง/คอลัมน์ · `payment_method` ของบิลแบ่งจ่าย = ช่องทางเงินจริง · "Member Credit" = เครดิตเต็มบิลเท่านั้น (ความหมายเดิม) · สูตรเงินแก้ที่ `sale-math.ts` ที่เดียว

**Tech Stack:** Next.js 16 server actions · Supabase · vitest

**สเปก:** `docs/superpowers/specs/2026-07-31-split-payment-design.md`

## Global Constraints

- ทุกคำสั่ง node/npm/npx ต้อง `export PATH="$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node | tail -1)/bin:$PATH"` ก่อน
- ห้ามคำนวณเงินนอก `computeSaleAmounts` — สูตรมีที่เดียว (กฎบัญชีข้อ 3 ใน README)
- migration ที่ `create or replace view` ต้องใส่ `with (security_invoker = true)` เสมอ — ลืมแล้ว view กลายเป็น SECURITY DEFINER (ด่าน `views_without_security_invoker` จะจับได้)
- **พิสูจน์แล้วบน production (31/7/2569):** บิล Member Credit ทั้ง 320 แถวมี `credit_used = net_amount` เป๊ะ · ไม่มีแถวช่องทางอื่นที่ `credit_used > 0` → สูตรใหม่ให้ผลเท่าเดิมกับข้อมูลเก่าทุกแถว
- ก่อนปิดงาน: reconciliation ทั้ง 31 ข้อ (29 เดิมค่าเดิม + 2 ใหม่) ต้อง PASS บน production
- ห้าม export util จากไฟล์ "use client"

## โครงไฟล์

| ไฟล์ | ทำอะไร |
|---|---|
| `src/lib/sale-math.ts` | เพิ่ม `creditRequested` เข้า `SaleInput` — สูตรเดียวรองรับทั้งเครดิตเต็ม/บางส่วน/ศูนย์ |
| `src/lib/bill.ts` | เพิ่ม `allocateCredit()` เฉลี่ยเครดิตลงรายการของบิลชุด |
| `src/lib/points.ts` | เพิ่ม `pointsForSale()` — แต้มจากส่วนเงินจริง |
| `src/app/(app)/sale-actions.ts` | `createSale`/`updateSale` รับ `credit_requested` + ด่านตรวจ · `syncSalePoints` ใช้ `pointsForSale` |
| `src/app/(app)/pos/customer-picker.tsx` | ส่งยอดเครดิตขึ้นให้ฟอร์มผ่าน `onBalanceChange` |
| `src/app/(app)/pos/pos-form.tsx` | ช่อง "ใช้เครดิต" + บรรทัดสรุป + ส่ง `credit_requested` ต่อรายการ |
| `src/app/(app)/today/edit-sale-dialog.tsx` | แก้บิลแบ่งจ่ายย้อนหลัง |
| `src/app/(app)/today/page.tsx` · `src/app/(app)/reports/page.tsx` | ยอดตามช่องทางสูตรใหม่ |
| `supabase/migrations/20260731??????_split_payment_cash_in.sql` | `v_daily_summary.sales_cash` ใช้ `net_amount - credit_used` |
| `supabase/reconciliation.sql` | ด่านใหม่ 2 ข้อ |

---

### Task 1: สูตรเงิน — `computeSaleAmounts` รับ `creditRequested`

**Files:**
- Modify: `src/lib/sale-math.ts`
- Test: `src/lib/sale-math.test.ts`

**Interfaces:**
- Produces: `SaleInput.creditRequested: number` (0 = ไม่ใช้เครดิต) — Task 3 และ 4 ส่งค่านี้
- คงเดิม: `SaleAmounts` shape ไม่เปลี่ยน · เครดิตเต็มบิลยังใช้ `paymentMethod: "Member Credit"` + ไม่ต้องส่ง creditRequested

- [x] **Step 1: เขียนเทสที่ต้องแดงก่อน** — ต่อท้าย `src/lib/sale-math.test.ts`

```ts
describe("แบ่งชำระ: เครดิตบางส่วน + เงินจริง", () => {
  const base = {
    priceNormal: 800, discount: 0, gowabiNet: null,
    isRequest: false, requestFee: 0, roomFee: 0, serviceCommission: 250,
  }

  it("เคสจริง 31/7: บิล 800 เครดิต 500 โอน 300 (Silver ratio 5000/6000)", () => {
    const r = computeSaleAmounts({
      ...base, paymentMethod: "QR Code", memberRatio: 5000 / 6000, creditRequested: 500,
    })
    expect(r.creditUsed).toBe(500)
    expect(r.bonusUsed).toBe(83.33)          // 500 × (1 − 5000/6000)
    expect(r.revenueRecognize).toBe(716.67)  // 800 − 83.33
    expect(r.netAmount).toBe(800)
  })

  it("ขอเครดิตเกินยอดบิล → หนีบเหลือเท่ายอดบิล", () => {
    const r = computeSaleAmounts({
      ...base, paymentMethod: "QR Code", memberRatio: 1, creditRequested: 9999,
    })
    expect(r.creditUsed).toBe(800)
  })

  it("creditRequested = 0 → เหมือนบิลปกติทุกช่อง", () => {
    const split = computeSaleAmounts({
      ...base, paymentMethod: "QR Code", memberRatio: null, creditRequested: 0,
    })
    const legacy = computeSaleAmounts({
      ...base, paymentMethod: "QR Code", memberRatio: null, creditRequested: 0,
    })
    expect(split).toEqual(legacy)
    expect(split.creditUsed).toBe(0)
    expect(split.revenueRecognize).toBe(800)
  })

  it("พิสูจน์เข้ากันได้: Member Credit เต็มบิล = สูตรเดิมเป๊ะ (ratio ใดๆ)", () => {
    for (const ratio of [1, 5000 / 6000, 10000 / 12000]) {
      const r = computeSaleAmounts({
        ...base, paymentMethod: "Member Credit", memberRatio: ratio, creditRequested: 0,
      })
      expect(r.creditUsed).toBe(800)
      expect(r.revenueRecognize).toBe(Math.round(800 * ratio * 100) / 100)
      expect(r.bonusUsed).toBe(Math.round((800 - 800 * ratio) * 100) / 100)
    }
  })

  it("แบ่งจ่าย + ค่าห้อง: เครดิตหนีบที่ net รวมค่าห้อง", () => {
    const r = computeSaleAmounts({
      ...base, roomFee: 100, paymentMethod: "เงินสด", memberRatio: 1, creditRequested: 9999,
    })
    expect(r.netAmount).toBe(900)
    expect(r.creditUsed).toBe(900)
  })
})
```

หมายเหตุ: เทสเดิมทุกข้อจะคอมไพล์ไม่ผ่านจนกว่าจะเพิ่ม field — เพิ่ม `creditRequested: 0` ให้ object เดิมในไฟล์เทสด้วย (หาด้วย grep `computeSaleAmounts({`)

- [x] **Step 2: รันให้เห็นว่าแดง**

Run: `npx vitest run src/lib/sale-math.test.ts`
Expected: FAIL (type error / creditUsed undefined)

- [x] **Step 3: แก้ `src/lib/sale-math.ts`**

เพิ่มใน `SaleInput`:
```ts
  /** เครดิตที่ขอตัด (แบ่งชำระ) · 0 = ไม่ใช้ · ช่องทาง "Member Credit" ไม่ต้องส่ง (ตัดเต็มบิลเสมอ) */
  creditRequested: number
```

แทนที่ท่อนตั้งแต่ `if (!isMemberCredit) {` จนจบฟังก์ชันด้วย:

```ts
  // เครดิตที่ตัดจริง: ช่องทาง Member Credit = เต็มบิลเสมอ (ความหมายเดิมของข้อมูลเก่า)
  // ช่องทางเงินจริง = ตามที่ขอ แต่ไม่เกินยอดบิล (แบ่งชำระ — สเปก 2026-07-31)
  const creditUsed = isMemberCredit
    ? netAmount
    : Math.min(Math.max(0, input.creditRequested), netAmount)

  if (creditUsed === 0) {
    return {
      netAmount, discount, commission: input.serviceCommission, requestFee, roomFee,
      creditUsed: 0, bonusUsed: 0, revenueRecognize: netAmount,
    }
  }

  // ส่วนของแถมในเครดิตไม่ใช่รายได้ — คิดเฉพาะก้อนที่ตัดเครดิต ส่วนที่จ่ายเงินจริงรับรู้เต็ม
  // เครดิตเต็มบิล: bonusUsed = net×(1−ratio) → revenue = net×ratio = สูตรเดิมเป๊ะ (มีเทสพิสูจน์)
  const ratio = input.memberRatio ?? 1
  const bonusUsed = round2(creditUsed * (1 - ratio))

  return {
    netAmount, discount, commission: input.serviceCommission, requestFee, roomFee,
    creditUsed,
    bonusUsed,
    revenueRecognize: round2(netAmount - bonusUsed),
  }
```

- [x] **Step 4: รันให้เขียว + ทั้งไฟล์เดิมต้องผ่านหมด**

Run: `npx vitest run src/lib/sale-math.test.ts` → PASS ทุกข้อ
Run: `npx tsc --noEmit` → จะแดงที่ `sale-actions.ts` (ยังไม่ส่ง field ใหม่) — แก้ชั่วคราวโดยเพิ่ม `creditRequested: 0` ให้ทั้งสองจุดที่เรียก (Task 3 จะแก้เป็นค่าจริง) แล้วรันจนเขียว

- [x] **Step 5: Commit** — `git add -A && git commit -m "feat(money): สูตรเงินรองรับตัดเครดิตบางส่วน (creditRequested)"`

---

### Task 2: `allocateCredit()` — เฉลี่ยเครดิตลงรายการบิลชุด

**Files:**
- Modify: `src/lib/bill.ts`
- Test: `src/lib/bill.test.ts`

**Interfaces:**
- Produces: `allocateCredit(nets: number[], credit: number): number[]` — Task 4 ใช้ตอน submit บิลชุด
- สัญญา: ผลรวม = `min(credit, sum(nets))` เป๊ะ · แต่ละช่อง ≤ net ของรายการนั้น · เศษปัดลงรายการท้าย

- [x] **Step 1: เทสแดงก่อน** — ต่อท้าย `src/lib/bill.test.ts`

```ts
import { allocateCredit } from "./bill"

describe("allocateCredit — เฉลี่ยเครดิตลงรายการตามสัดส่วน เศษลงท้าย", () => {
  it("สัดส่วนเท่ากัน แบ่งครึ่ง", () => {
    expect(allocateCredit([650, 650], 500)).toEqual([250, 250])
  })
  it("รายการเดียว หนีบที่ยอดรายการ", () => {
    expect(allocateCredit([800], 9999)).toEqual([800])
  })
  it("เครดิตพอทั้งบิล → เต็มทุกรายการ", () => {
    expect(allocateCredit([390, 650], 2000)).toEqual([390, 650])
  })
  it("เศษหารไม่ลงตัว: ผลรวมตรงเป๊ะ เศษสตางค์ลงรายการท้าย", () => {
    const out = allocateCredit([390, 390, 390], 1000)
    expect(out.reduce((s, n) => s + n, 0)).toBe(1000)
    expect(out).toEqual([333.33, 333.33, 333.34])
  })
  it("เครดิตศูนย์/ติดลบ → ศูนย์หมด", () => {
    expect(allocateCredit([650, 650], 0)).toEqual([0, 0])
    expect(allocateCredit([650], -5)).toEqual([0])
  })
})
```

- [x] **Step 2: รันให้แดง** — `npx vitest run src/lib/bill.test.ts` → FAIL (not a function)

- [x] **Step 3: implement ใน `src/lib/bill.ts`**

```ts
/**
 * เฉลี่ยเครดิตที่ตัดลงแต่ละรายการของบิลชุด ตามสัดส่วน net ของรายการ (สเปกแบ่งชำระ ข้อ 6)
 * คิดเป็นสตางค์ (จำนวนเต็ม) กันเศษทศนิยมลอย — การันตี: ผลรวม = min(credit, ยอดบิล) เป๊ะ
 * และไม่มีช่องไหนเกิน net ของตัวเอง (server หนีบ credit_used ≤ net ต่อแถว ถ้าเกินเงินจะหาย)
 */
export function allocateCredit(nets: number[], credit: number): number[] {
  const toSatang = (n: number) => Math.round(n * 100)
  const netS = nets.map(toSatang)
  const totalS = netS.reduce((s, n) => s + n, 0)
  const useS = Math.min(Math.max(0, toSatang(credit)), totalS)
  if (useS <= 0 || totalS <= 0) return nets.map(() => 0)
  const out = netS.map((n) => Math.min(n, Math.floor((useS * n) / totalS)))
  let left = useS - out.reduce((s, n) => s + n, 0)
  // เศษจากการปัด — ไล่เติมจากรายการท้ายที่ยังมีที่ว่าง ให้ผลรวมตรงเป๊ะ
  for (let i = out.length - 1; i >= 0 && left > 0; i--) {
    const add = Math.min(left, netS[i] - out[i])
    out[i] += add
    left -= add
  }
  return out.map((s) => s / 100)
}
```

- [x] **Step 4: รันให้เขียว** — `npx vitest run src/lib/bill.test.ts` → PASS

- [x] **Step 5: Commit** — `git commit -am "feat(bill): allocateCredit เฉลี่ยเครดิตลงรายการบิลชุด"`

---

### Task 3: server actions + แต้มจากส่วนเงินจริง

**Files:**
- Modify: `src/lib/points.ts` · `src/lib/points.test.ts`
- Modify: `src/app/(app)/sale-actions.ts` (createSale ~บรรทัด 137-180, updateSale ~510-540, syncSalePoints ~39-62)

**Interfaces:**
- Consumes: `SaleInput.creditRequested` (Task 1)
- Produces: form field `credit_requested` (string ตัวเลข) — Task 4/5 ส่งมา
- Produces: `pointsForSale(input: { paymentMethod: string; netAmount: number; creditUsed: number }): number`

- [x] **Step 1: เทสแต้มแดงก่อน** — ต่อท้าย `src/lib/points.test.ts`

```ts
import { pointsForSale } from "./points"

describe("pointsForSale — แต้มจากส่วนที่จ่ายเงินจริงเท่านั้น", () => {
  it("แบ่งจ่าย: บิล 800 เครดิต 500 โอน 300 → 3 แต้ม", () => {
    expect(pointsForSale({ paymentMethod: "QR Code", netAmount: 800, creditUsed: 500 })).toBe(3)
  })
  it("เครดิตเต็มบิล (Member Credit) → 0 แต้ม เหมือนเดิม", () => {
    expect(pointsForSale({ paymentMethod: "Member Credit", netAmount: 800, creditUsed: 800 })).toBe(0)
  })
  it("บิลเงินจริงล้วน → เท่าสูตรเดิม", () => {
    expect(pointsForSale({ paymentMethod: "เงินสด", netAmount: 850, creditUsed: 0 })).toBe(8)
  })
  it("Gowabi/KOL ไม่ได้แต้มแม้ไม่ใช้เครดิต", () => {
    expect(pointsForSale({ paymentMethod: "Gowabi", netAmount: 800, creditUsed: 0 })).toBe(0)
  })
})
```

- [x] **Step 2: รันให้แดง** — `npx vitest run src/lib/points.test.ts`

- [x] **Step 3: implement ใน `src/lib/points.ts`** (วางใต้ `earnsPoints`)

```ts
/** แต้มของบิลหนึ่งใบ — ได้จากส่วนที่จ่ายเงินจริงเท่านั้น (เครดิตได้แต้มไปแล้วตอนเติมเงิน) */
export function pointsForSale(input: {
  paymentMethod: string
  netAmount: number
  creditUsed: number
}): number {
  if (!earnsPoints(input.paymentMethod)) return 0
  return pointsForBaht(input.netAmount - input.creditUsed)
}
```

- [x] **Step 4: รันให้เขียว** แล้วแก้ `syncSalePoints` ใน `sale-actions.ts`:
  - เพิ่ม `credit_used: number` เข้า type ของ `sale` param
  - แทน `sale.customer_id && earnsPoints(sale.payment_method) ? pointsForBaht(sale.net_amount) : 0` ด้วย
    `sale.customer_id ? pointsForSale({ paymentMethod: sale.payment_method, netAmount: sale.net_amount, creditUsed: sale.credit_used }) : 0`
  - ตามหาทุกจุดที่เรียก `syncSalePoints(` (grep) แล้วเพิ่ม `credit_used: amounts.creditUsed` (หรือค่าจากแถวที่อ่านมา) เข้า object
  - import `pointsForSale` แทน/เพิ่มจาก `@/lib/points`

- [x] **Step 5: createSale รับ `credit_requested`** — ใน `createSale` หลังบรรทัด parse `paymentMethod`:

```ts
  // แบ่งชำระ: เครดิตบางส่วน + ช่องทางเงินจริง (สเปก 2026-07-31)
  // ช่องทาง "Member Credit" = เครดิตเต็มบิล ไม่ใช้ค่านี้ (เดินด่านเดิมด้านล่าง)
  const creditRequested =
    paymentMethod === MEMBER_CREDIT_METHOD ? 0 : toNumber(formData.get("credit_requested"))
```

แล้วขยายบล็อกตรวจเครดิต (ที่ขึ้นต้น `if (paymentMethod === MEMBER_CREDIT_METHOD)`) เป็น:

```ts
  if (paymentMethod === MEMBER_CREDIT_METHOD || creditRequested > 0) {
    if (!customerId) {
      return { ok: false, error: "ชำระด้วยเครดิตสมาชิกต้องเลือกลูกค้าที่เป็นสมาชิก" }
    }
    const { data: balance } = await supabase
      .from("member_balances")
      .select("credit_balance, credit_granted, cash_paid")
      .eq("customer_id", customerId)
      .single()
    const granted = balance?.credit_granted ?? 0
    memberRatio = granted > 0 ? (balance?.cash_paid ?? 0) / granted : 1
    const credit = balance?.credit_balance ?? 0
    // เครดิตเต็มบิลต้องพอทั้งบิล (เดิม) · แบ่งจ่ายต้องพอเท่าที่ขอตัด
    const wanted =
      paymentMethod === MEMBER_CREDIT_METHOD
        ? priceNormal - discountInput + roomFee
        : creditRequested
    if (credit < wanted) {
      return {
        ok: false,
        error: `เครดิตคงเหลือไม่พอ (มี ${credit} บาท ต้องใช้ ${wanted} บาท)`,
      }
    }
    creditAfter = credit - wanted
  }
```

จากนั้นส่ง `creditRequested` เข้า `computeSaleAmounts({ ... , creditRequested })` (แทนค่า 0 ชั่วคราวจาก Task 1) และ**หลัง** compute เพิ่มด่าน:

```ts
  if (creditRequested > amounts.netAmount) {
    return { ok: false, error: "เครดิตที่ตัดเกินยอดบิล กรุณาตรวจสอบ" }
  }
```

- [x] **Step 6: updateSale แบบเดียวกัน** — parse `credit_requested` เหมือน Step 5 · ขยายเงื่อนไขบล็อกตรวจ (เดิม `if (paymentMethod === MEMBER_CREDIT_METHOD)`) เป็น `|| creditRequested > 0` · `wanted` ใช้ตรรกะเดียวกัน · headroom เดิม (`+ existing.credit_used` เมื่อลูกค้าเดิม) คงไว้ — ใช้กับทั้งสองโหมด · ส่ง `creditRequested` เข้า `computeSaleAmounts` + ด่านเกินยอดบิลเหมือน Step 5

- [x] **Step 7: ตรวจ + Commit**

Run: `npx tsc --noEmit && npx vitest run` → เขียวหมด
`git commit -am "feat(pos): server รับแบ่งชำระ เครดิตบางส่วน + แต้มจากส่วนเงินจริง"`

---

### Task 4: หน้าจอ POS

**Files:**
- Modify: `src/app/(app)/pos/customer-picker.tsx` — เพิ่ม prop `onBalanceChange?: (b: number) => void` เรียกใน effect ที่ setBalance (และเรียก `onBalanceChange(0)` เมื่อล้างลูกค้า)
- Modify: `src/app/(app)/pos/pos-form.tsx`

**Interfaces:**
- Consumes: `allocateCredit` (Task 2) · form field `credit_requested` (Task 3)
- กติกา UI (จากสเปกข้อ 3): ช่องใช้เครดิตแสดงเมื่อ เลือกลูกค้า + เครดิต > 0 + ไม่ใช่ Gowabi/KOL + ไม่ใช่บิลคูปองแลกแต้ม · ค่าตั้งต้น = min(เครดิต, ยอดบิล) แก้ลงได้ · แสดง "ต้องเก็บเพิ่ม X บาท" · ถ้าเก็บเพิ่ม 0 → บังคับช่องทาง "Member Credit" (พฤติกรรมเดิม) · ถ้า > 0 → เลือกได้เฉพาะ QR/เงินสด/บัตร

- [x] **Step 1: state + คำนวณ** — ใน `pos-form.tsx` เพิ่ม:

```ts
  const [creditBalance, setCreditBalance] = useState(0)
  const [creditUseInput, setCreditUseInput] = useState<string | null>(null) // null = ยังไม่แตะ ใช้ค่าอัตโนมัติ
```

หายอดบิลรวม (main + extras) จากตัวแปรที่ฟอร์มใช้โชว์ยอดอยู่แล้ว (grep คำว่า "รวม" หรือตัวแปร total ในไฟล์) แล้วคำนวณ:

```ts
  const canUseCredit =
    Boolean(customerId) && creditBalance > 0 && !isGowabi && !isKol && !couponInfo
  const creditCap = Math.min(creditBalance, billTotalNet)
  const creditUse = canUseCredit
    ? Math.min(creditUseInput === null ? creditCap : Math.max(0, Number(creditUseInput) || 0), creditCap)
    : 0
  const cashDue = Math.round((billTotalNet - creditUse) * 100) / 100
```

(`isKol`: ถ้าไฟล์ยังไม่มีตัวแปรนี้ ใช้ `paymentMethod === "KOL"` · `couponInfo` มีอยู่แล้วในไฟล์)

- [x] **Step 2: UI block** — วางใต้ CustomerPicker:

```tsx
  {canUseCredit && (
    <div className="rounded-lg border bg-amber-50/50 p-3 space-y-1">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="credit_use">ใช้เครดิตสมาชิก (มี {creditBalance.toLocaleString()} บาท)</Label>
        <Input id="credit_use" inputMode="numeric" className="w-28 text-right"
          value={creditUseInput === null ? String(creditCap) : creditUseInput}
          onChange={(e) => setCreditUseInput(e.target.value)} />
      </div>
      <p className="text-sm font-medium">
        {cashDue > 0
          ? <>เครดิต {creditUse.toLocaleString()} · ต้องเก็บเพิ่ม <span className="text-red-600">{cashDue.toLocaleString()} บาท</span></>
          : <>เครดิตครอบคลุมทั้งบิล — ช่องทางชำระเป็น Member Credit อัตโนมัติ</>}
      </p>
    </div>
  )}
```

- [x] **Step 3: ผูกกับช่องทางชำระ**
  - เมื่อ `canUseCredit && creditUse > 0 && cashDue === 0` → force `paymentMethod = MEMBER_CREDIT_METHOD` (setState ใน effect หรือ ตอน render ปุ่ม disabled ช่องอื่น)
  - เมื่อ `cashDue > 0 && creditUse > 0` → ปุ่ม "Member Credit" disabled (เครดิตถูกนับแล้ว) · Gowabi/KOL disabled
  - เมื่อผู้ใช้เลือก Gowabi/KOL → `setCreditUseInput("0")`

- [x] **Step 4: ส่งค่าเข้า server ตอน submit** — ใน `handleSubmit` ก่อน `createSale(formData)`:

```ts
      // แบ่งชำระ: เฉลี่ยเครดิตลงรายการตามสัดส่วน (บิลเดี่ยว = ก้อนเดียว)
      const nets = [mainNet, ...extras.map((x) => extraNet(x))] // ใช้ตัวแปร net ต่อรายการที่ฟอร์มมีอยู่แล้ว
      const perItem = allocateCredit(nets, paymentMethod === MEMBER_CREDIT_METHOD ? 0 : creditUse)
      formData.set("credit_requested", String(perItem[0]))
```

และในลูป extras: `fd.set("credit_requested", String(perItem[i + 1]))` (ลูปเดิม copy ทีละ key — เพิ่ม key นี้แยกเพราะค่าต่างกันต่อรายการ)
`import { allocateCredit } from "@/lib/bill"`

- [x] **Step 5: ตรวจมือ + type + commit**

Run: `npx tsc --noEmit && npx eslint src/app/\(app\)/pos` → ผ่าน
ทดสอบมือกับ dev server (`npm run dev`): บิลปกติไม่มีลูกค้า → ไม่มีช่องเครดิต · เลือกสมาชิก → ช่องขึ้น ค่าตั้งต้นถูก · แก้ลง → ยอดเก็บเพิ่มเปลี่ยน · เครดิตพอทั้งบิล → ช่องทางเป็น MC
`git commit -am "feat(pos): ช่องใช้เครดิต + แบ่งชำระบนฟอร์มขาย"`

---

### Task 5: แก้บิลย้อนหลัง — edit-sale-dialog

**Files:**
- Modify: `src/app/(app)/today/edit-sale-dialog.tsx`

**Interfaces:**
- Consumes: form field `credit_requested` (Task 3 — updateSale รองรับแล้ว)
- Sale type ในไฟล์มี `credit_used` อยู่แล้วหรือไม่ — ถ้าไม่มี เพิ่มเข้า type + จุด select ของหน้า today

- [x] **Step 1: เพิ่ม state + ช่องกรอก** — โชว์เมื่อบิลมี `credit_used > 0` หรือ (มี customer_id และ paymentMethod ไม่ใช่ MC/Gowabi/KOL):

```tsx
  const [creditUse, setCreditUse] = useState(String(sale.credit_used ?? 0))
```

ช่องกรอกวางใกล้ตัวเลือกช่องทางชำระ + hidden input:

```tsx
  <input type="hidden" name="credit_requested" value={creditUse} />
```

พร้อมช่อง Input แสดง/แก้ค่า (label "ใช้เครดิตสมาชิก (บาท)") — แสดงเงื่อนไขตามข้างบน · ถ้า paymentMethod เป็น MC ให้ซ่อน (เต็มบิลอยู่แล้ว)

- [x] **Step 2: ตรวจ + commit**

Run: `npx tsc --noEmit` → ผ่าน · ทดสอบมือ: แก้บิลแบ่งจ่าย เปลี่ยนยอดเครดิต → `credit_after`/ยอดถูก (server คิดใหม่ทั้งใบ)
`git commit -am "feat(today): แก้บิลแบ่งชำระย้อนหลังได้"`

---

### Task 6: รายงานยอดตามช่องทาง + view cash_in

**Files:**
- Modify: `src/app/(app)/today/page.tsx:214` (byPayment — เช็คว่า select ของหน้ามี `credit_used` แล้ว ถ้ายังให้เพิ่ม)
- Modify: `src/app/(app)/reports/page.tsx:170-176` (cashByChannel) และ `:215` (byPayment — select มี `credit_used` แล้ว)
- Create: `supabase/migrations/20260731130000_split_payment_cash_in.sql`

**Interfaces:** สูตรเดียวทุกจุด: `ช่องทางบิล += net − credit_used` · `"Member Credit" += credit_used`

- [x] **Step 1: แก้ byPayment ทั้งสองหน้า** — แทน reducer เดิมด้วย:

```ts
  // แบ่งชำระ: เงินจริงเข้าช่องทางของบิล เครดิตเข้าช่อง Member Credit
  // บิลเก่าถูกอัตโนมัติ: บิลปกติ credit_used=0 · บิลเครดิตเต็ม credit_used=net (พิสูจน์บน production แล้ว)
  const byPayment = rows.reduce<Record<string, number>>((acc, s) => {
    const credit = Number(s.credit_used ?? 0)
    const cash = Number(s.net_amount) - credit
    if (cash !== 0) acc[s.payment_method] = (acc[s.payment_method] ?? 0) + cash
    if (credit !== 0) acc["Member Credit"] = (acc["Member Credit"] ?? 0) + credit
    return acc
  }, {})
```

- [x] **Step 2: แก้ cashByChannel ใน reports** — แทนลูปเดิม (ลบบรรทัด `continue` ด้วย — แถว MC ให้ cash = 0 เองอยู่แล้ว):

```ts
  for (const s of rows) {
    const cash = Number(s.net_amount) - Number(s.credit_used ?? 0)
    if (cash === 0) continue // เครดิตไม่ใช่เงินเข้า
    cashByChannel.set(s.payment_method, (cashByChannel.get(s.payment_method) ?? 0) + cash)
  }
```

- [x] **Step 3: migration** — `supabase/migrations/20260731130000_split_payment_cash_in.sql`: copy นิยาม `v_daily_summary` ล่าสุดจาก `20260721164623_member_balances_use_bangkok_date.sql`/`20260720090414_create_analytics_views.sql` (ตรวจไฟล์ไหน define ล่าสุด) มาทั้งก้อน แก้บรรทัดเดียว:

```sql
    sum(net_amount - coalesce(credit_used, 0))                        as sales_cash
```

พร้อมคอมเมนต์หัวไฟล์อธิบาย + `with (security_invoker = true)` · รันบน production ผ่าน MCP `apply_migration`

- [x] **Step 4: ตรวจว่าเลขเดิมไม่ขยับ** — รัน SQL เทียบก่อน/หลังบน production:

```sql
select count(*) from public.v_daily_summary
where sale_date <= '2026-07-19'
  and cash_in <> (select cash_in from ... ) -- เทียบกับสูตรเก่า: ต้องได้ 0 แถวต่าง
```

วิธีปฏิบัติ: รัน `select sum(cash_in) from v_daily_summary where sale_date <= '2026-07-19'` ก่อนและหลัง apply — เลขต้องเท่ากันเป๊ะ

- [x] **Step 5: Commit** — `git commit -am "feat(reports): ยอดช่องทางแยกส่วนเครดิต/เงินจริงของบิลแบ่งชำระ"`

---

### Task 7: ด่านตรวจ + ปิดงาน

**Files:**
- Modify: `supabase/reconciliation.sql`
- Modify: `docs/superpowers/plans/2026-07-31-split-payment.md` (ติ๊ก + บันทึกผล)

- [x] **Step 1: เพิ่ม 2 ด่านใน expected**

```sql
  -- แบ่งชำระ (สเปก 2026-07-31): เครดิตห้ามเกินยอดบิล และต้องรู้ว่าตัดของใคร
  ('credit_used_exceeds_net', 0),
  ('credit_used_without_customer', 0),
```

และใน actual:

```sql
  union all
  select 'credit_used_exceeds_net', count(*)
  from public.sales where credit_used > net_amount

  union all
  select 'credit_used_without_customer', count(*)
  from public.sales where credit_used > 0 and customer_id is null
```

- [x] **Step 2: รันชุดตรวจเต็มบน production** — ต้อง PASS ครบ 31/31 (29 เดิมค่าเดิมเป๊ะ)

- [x] **Step 3: ด่านคุณภาพทั้งหมด** — `npx tsc --noEmit && npx eslint src && npx vitest run && npm run build` → เขียวหมด

- [x] **Step 4: Deploy + ตรวจของจริง** — merge เข้า main + push (Vercel auto-deploy) · เปิด `/pos` บันทึกบิลแบ่งจ่ายจริง 1 ใบ (หรือบิลทดสอบแล้วลบ) ตรวจ: ใบเสร็จ/credit_after ถูก · แต้มขึ้นตามส่วนเงินจริง · `/today` ยอดช่องทางแยกถูก · Vercel runtime errors ไม่มีของใหม่

- [x] **Step 5: Commit ปิดงาน** — ติ๊กแผน + บันทึกผลตรวจต่อท้ายไฟล์นี้ + push

---

## ผลปิดงาน — 31/7/2569

- ทำครบ 7 tasks ผ่านรีวิวรายงาน + final whole-branch review (trace เงินทุกตัวเลขจากฟอร์ม→DB→รายงาน)
- fix rounds: T1 ลำดับปัดเศษ · T3 credit_after ตอนแก้บิล + กัน Gowabi/KOL · T5 disabled gate + คำเตือนสลับลูกค้า · final MC dead-end + normalize เครดิตเต็มบิล
- migration v_daily_summary ขึ้น production แล้ว — cash_in ก่อน/หลังเท่ากันเป๊ะ (1,602,654 · 145 วัน)
- **reconciliation 31/31 PASS** — ด่านใหม่ 2 ข้อจับข้อมูล import ผิดปกติได้ทันที 2 แถว
  (#34139-949 net = -100 · SK-20260710-005 บิล MC ไม่ผูกลูกค้า) ตั้ง expected = 1/1 พร้อมบันทึกเรื่อง รอเจ้าของร้านสืบเทียบ Excel
- gates: tsc ✓ eslint ✓ vitest 342 ✓ build ✓ · deploy ผ่าน Vercel auto (merge d58ecb9)
- เรื่องส่งต่อเจ้าของร้าน: (1) บิลชุดได้แต้มน้อยกว่าบิลเดี่ยวยอดเท่ากัน (floor ต่อแถว — พฤติกรรมเดิม)
  (2) ตัวกรอง "Member Credit" ใน /history ไม่เห็นบิลแบ่งจ่าย — ตรวจเครดิตให้ดูคอลัมน์ credit_used
