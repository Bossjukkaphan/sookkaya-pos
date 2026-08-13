# ช่องทาง E-Wallet และการแยกรายรับค่าห้องสปา — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มช่องทางชำระเงิน `E-Wallet` ให้ครบทุกจุดของระบบ · แยกรายรับค่าห้องสปาออกจากค่าบริการนวดในการ์ดรายรับ · ให้พนักงานเห็นและแก้ช่องทางชำระเงินของใบเติมเงินสมาชิกได้โดยไม่กระทบเครดิต

**Architecture:** รวมรายชื่อ "ช่องทางเงินจริง" ที่ตอนนี้ถูกก๊อปไว้ 3 ชุดให้เหลือชุดเดียวชื่อ `REAL_MONEY_METHODS` แล้วเพิ่ม `E-Wallet` ที่เดียว · ดึงสูตร waterfall ของการ์ดรายรับที่ตอนนี้เขียนซ้ำอยู่ในสองหน้าออกมาเป็นฟังก์ชันบริสุทธิ์ `revenueWaterfall()` ที่มีเทสต์ แล้วให้ทั้งสองหน้าเรียกใช้ · เพิ่ม `room_fee_total` เข้า `v_daily_summary` เพื่อให้หน้ารายงานอ่านยอดรวมจาก view ตามกฎของโปรเจกต์ · เพิ่ม server action ที่เขียนคอลัมน์ `payment_method` คอลัมน์เดียว

**Tech Stack:** Next.js 16 (App Router, Server Components) · TypeScript · Supabase Postgres · vitest · Tailwind + shadcn/ui

**สเปก:** `docs/superpowers/specs/2026-08-13-ewallet-and-room-fee-design.md`

## Global Constraints

- ชื่อช่องทางใหม่สะกดว่า `E-Wallet` เป๊ะ ๆ ทุกที่ (ตัว E ใหญ่ ขีดกลาง W ใหญ่) — ตรงกับที่ ThaiHand ใช้
- ยอด `ยอดรับจริง (Volume)` และ `รายรับที่รับรู้` ห้ามเปลี่ยนแม้แต่บาทเดียวจากงานนี้
- ยอดรวมในหน้ารายงานต้องมาจาก view เท่านั้น ห้ามบวกจากแถวดิบ (เพดาน 1,000 แถวของ PostgREST)
- `create or replace view` ต้องระบุ `with (security_invoker = true)` ซ้ำทุกครั้ง และต้องเขียนนิยามเดิมทั้งก้อนใหม่
- วันที่ทุกที่ใช้เขตเวลากรุงเทพ `(now() at time zone 'Asia/Bangkok')::date` ห้ามใช้ `current_date`
- สูตรเงินของบิลอยู่ที่ `src/lib/sale-math.ts` ที่เดียว ห้ามคำนวณซ้ำที่อื่น
- ข้อความ error ที่ไล่ชื่อช่องทางห้ามพิมพ์ชื่อด้วยมือ ต้องประกอบจาก `REAL_MONEY_METHODS.join(" / ")`
- ห้ามแก้ข้อมูลจริงสองรายการที่ค้างอยู่ (บิลอาลี · เติมเงินโบว36) — งานนั้นรอ Boss ตัดสินใจหลังทำเสร็จ
- migration ใช้ MCP `apply_migration` แล้ว **เก็บสำเนาไฟล์ลง `supabase/migrations/` ด้วยทุกครั้ง** ห้ามรัน `supabase db push`
- ทุกครั้งที่ generate `src/types/database.ts` ใหม่ ต้องใส่คอมเมนต์หัวไฟล์สี่บรรทัดนี้กลับเข้าไปก่อน `export type Json =` เสมอ (ตัว generator ไม่ได้ใส่มาให้ และนี่คือที่เดียวที่บอกวิธี generate):
  ```ts
  /**
   * Types สร้างจาก Supabase schema
   * อัปเดตใหม่ด้วย: npx supabase gen types typescript --project-id jrioyrmicioqammeevgh
   */
  ```
- คอมเมนต์และข้อความบนหน้าจอเป็นภาษาไทย ตามที่โค้ดเดิมทำอยู่
- ชื่อตัวแปรเป็นภาษาอังกฤษเสมอ ห้ามตั้งชื่อตัวแปรเป็นภาษาไทย

## แผนผังไฟล์

| ไฟล์ | หน้าที่ | สถานะ |
|---|---|---|
| `src/lib/constants.ts` | รายชื่อช่องทางทั้งหมด + `REAL_MONEY_METHODS` | แก้ (Task 1) |
| `src/lib/payments.ts` | บรรทัดแบ่งจ่ายของบิล | แก้ (Task 1) |
| `src/lib/points.ts` | กติกาแต้มสะสม | แก้ (Task 1) |
| `src/lib/payment-colors.ts` | สีประจำช่องทาง 3 ชุด | แก้ (Task 1) |
| `src/lib/payment-methods.test.ts` | เทสต์ความสอดคล้องของรายชื่อช่องทางกับสี | สร้าง (Task 1) |
| `supabase/migrations/20260813100000_ewallet_payment_method.sql` | ปลด check constraint 3 ตาราง | สร้าง (Task 2) |
| `src/app/(app)/members/topup-form.tsx` | ฟอร์มเติมเงินสมาชิก | แก้ (Task 3) |
| `src/app/(app)/members/member-actions.ts` | server action ของสมาชิก | แก้ (Task 3, 7) |
| `src/app/(app)/payment-actions.ts` | เก็บเงินบิลค้างรับ | แก้ (Task 3) |
| `src/app/book/points-actions.ts` | ป้ายชื่อช่องทางฝั่งลูกค้า | แก้ (Task 3) |
| `src/lib/revenue-waterfall.ts` | สูตร waterfall ของการ์ดรายรับ | สร้าง (Task 4) |
| `src/lib/revenue-waterfall.test.ts` | เทสต์สูตร waterfall | สร้าง (Task 4) |
| `supabase/migrations/20260813110000_v_daily_summary_room_fee.sql` | `v_daily_summary` += `room_fee_total` | สร้าง (Task 5) |
| `supabase/reconciliation.sql` | ข้อตรวจ `room_fee_total` | แก้ (Task 5) |
| `src/lib/money-info.ts` | ข้อความอธิบายตัวเลขเงิน | แก้ (Task 6) |
| `src/app/(app)/today/page.tsx` | หน้ายอดวันนี้ | แก้ (Task 6) |
| `src/app/(app)/reports/page.tsx` | หน้ารายงาน | แก้ (Task 6) |
| `supabase/migrations/20260813120000_member_topups_edit_audit.sql` | `member_topups` += `edited_by`/`edited_at` | สร้าง (Task 7) |
| `src/app/(app)/members/topup-history-list.tsx` | รายการประวัติเติมเงิน | แก้ (Task 8) |
| `src/app/(app)/members/page.tsx` | ส่ง `payment_method` ให้รายการประวัติ | แก้ (Task 8) |
| `src/types/database.ts` | type ที่ generate จากฐานข้อมูล | regenerate (Task 2, 5, 7) |

---

## Task 1: ชุดกลาง `REAL_MONEY_METHODS` และสีของ E-Wallet

**Files:**
- Modify: `src/lib/constants.ts:1-10`
- Modify: `src/lib/payments.ts:1-4,30-31`
- Modify: `src/lib/points.ts:12-16`
- Modify: `src/lib/payment-colors.ts`
- Create: `src/lib/payment-methods.test.ts`
- Test: `src/lib/points.test.ts` · `src/lib/payments.test.ts`

**Interfaces:**
- Produces: `REAL_MONEY_METHODS: readonly ["เงินสด", "QR Code", "บัตรเครดิต", "E-Wallet"]` export จาก `@/lib/constants` — Task 3, 7, 8 ใช้ตัวนี้
- Produces: `PAYMENT_METHODS` มีสมาชิกเพิ่มเป็น 7 ตัว โดย `"E-Wallet"` อยู่ index 3
- Produces: `PAY_COLOR["E-Wallet"]`, `PAY_DOT["E-Wallet"]`, `PAY_SELECTED["E-Wallet"]` — Task 8 ใช้ `PAY_COLOR`

**บริบท:** ตอนนี้รายชื่อ "ช่องทางเงินจริงที่ลูกค้าจ่ายตรงกับร้าน" ถูกเขียนซ้ำ 3 ที่ด้วยเนื้อเหมือนกันเป๊ะ (`PAYMENT_LINE_METHODS`, `POINT_EARNING_METHODS`, และ `TOPUP_PAYMENTS` ใน topup-form) นี่คือเหตุผลที่การเพิ่มช่องทางใหม่มีโอกาสลืมบางจุด งานนี้ยุบให้เหลือชุดเดียว

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน — ไฟล์ใหม่ `src/lib/payment-methods.test.ts`**

```ts
import { describe, expect, it } from "vitest"

import { PAYMENT_METHODS, REAL_MONEY_METHODS } from "./constants"
import { PAY_COLOR, PAY_DOT, PAY_SELECTED } from "./payment-colors"
import { PAYMENT_LINE_METHODS } from "./payments"
import { POINT_EARNING_METHODS } from "./points"

/**
 * เทสต์ชุดนี้มีไว้กันความผิดพลาดเดิมซ้ำ: ก่อนหน้านี้รายชื่อช่องทางถูกก๊อปไว้ 3 ที่
 * พอเพิ่มช่องทางใหม่แล้วลืมบางจุด ระบบจะพังเงียบ ๆ คนละที่กัน
 */
describe("รายชื่อช่องทางชำระเงิน", () => {
  it("ช่องทางเงินจริงทุกตัวต้องอยู่ในรายชื่อช่องทางทั้งหมดด้วย", () => {
    for (const m of REAL_MONEY_METHODS) {
      expect(PAYMENT_METHODS as readonly string[]).toContain(m)
    }
  })

  it("E-Wallet อยู่ในทั้งสองรายชื่อ", () => {
    expect(REAL_MONEY_METHODS as readonly string[]).toContain("E-Wallet")
    expect(PAYMENT_METHODS as readonly string[]).toContain("E-Wallet")
  })

  it("ลำดับของชุดกลางคงที่ — ตัวแรกเป็นค่าตั้งต้นของกล่องเก็บเงินค้าง", () => {
    expect(REAL_MONEY_METHODS).toEqual([
      "เงินสด",
      "QR Code",
      "บัตรเครดิต",
      "E-Wallet",
    ])
  })

  it("บรรทัดแบ่งจ่ายและช่องทางได้แต้มใช้ชุดเดียวกับชุดกลาง", () => {
    expect(PAYMENT_LINE_METHODS).toEqual(REAL_MONEY_METHODS)
    expect(POINT_EARNING_METHODS).toEqual(REAL_MONEY_METHODS)
  })

  it("Gowabi / KOL / Member Credit ไม่ใช่เงินจริงจากลูกค้า", () => {
    for (const m of ["Gowabi", "KOL", "Member Credit"]) {
      expect(REAL_MONEY_METHODS as readonly string[]).not.toContain(m)
    }
  })
})

describe("สีประจำช่องทาง", () => {
  it("ช่องทางเงินจริงทุกตัวต้องมีสีครบทั้งสามชุด", () => {
    for (const m of REAL_MONEY_METHODS) {
      expect(PAY_COLOR[m], `PAY_COLOR ขาด ${m}`).toBeDefined()
      expect(PAY_DOT[m], `PAY_DOT ขาด ${m}`).toBeDefined()
      expect(PAY_SELECTED[m], `PAY_SELECTED ขาด ${m}`).toBeDefined()
    }
  })

  it("Member Credit ต้องมีสีด้วย — ไม่ใช่เงินจริงแต่โผล่ในการ์ดช่องทางชำระเงิน", () => {
    expect(PAY_COLOR["Member Credit"]).toBeDefined()
    expect(PAY_DOT["Member Credit"]).toBeDefined()
  })

  it("สีของ E-Wallet ต้องไม่ซ้ำกับช่องทางอื่น", () => {
    const used = Object.entries(PAY_COLOR).filter(([k]) => k !== "E-Wallet")
    expect(used.map(([, v]) => v)).not.toContain(PAY_COLOR["E-Wallet"])
  })
})
```

- [ ] **Step 2: เพิ่มเทสต์ลงไฟล์เดิมสองไฟล์**

ต่อท้าย `describe("earnsPoints ...")` ใน `src/lib/points.test.ts` (ในบล็อกเดิม ก่อนวงเล็บปิด):

```ts
  it("E-Wallet = ได้แต้ม (เงินจริงจากลูกค้าเหมือน QR/บัตร)", () => {
    expect(earnsPoints("E-Wallet")).toBe(true)
  })
```

ต่อท้าย `describe("pointsForSale ...")` ในไฟล์เดียวกัน (ถ้ายังไม่มี describe นี้ ให้สร้างใหม่ท้ายไฟล์):

```ts
describe("pointsForSale — บิลที่จ่ายด้วย E-Wallet", () => {
  it("บิล E-Wallet ได้แต้มตามยอดที่จ่ายจริง", () => {
    expect(
      pointsForSale({ paymentMethod: "E-Wallet", netAmount: 1290, creditUsed: 0 })
    ).toBe(12)
  })
  it("ส่วนที่จ่ายด้วยเครดิตไม่นับแต้มซ้ำ", () => {
    expect(
      pointsForSale({ paymentMethod: "E-Wallet", netAmount: 1290, creditUsed: 290 })
    ).toBe(10)
  })
})
```

> **หมายเหตุสำหรับผู้ตรวจ:** `createSale` / `updateSale` ไม่ต้องแก้โค้ดเลย เพราะทั้งคู่ตรวจ
> ช่องทางด้วย `PAYMENT_METHODS.includes(...)` (`sale-actions.ts:126` และ `:671`) ซึ่ง Task นี้
> ขยายให้แล้ว และมีเทสต์ใน `payment-methods.test.ts` ล็อกไว้ว่า `E-Wallet` ต้องอยู่ในอาร์เรย์นั้น
> ส่วนแต้มมาจาก `pointsForSale` ที่เทสต์ข้างบนคุมอยู่ จึงไม่เขียนเทสต์ integration ของ
> `createSale` เพิ่ม (ต้องประกอบ fake supabase ทั้งชุดเพื่อพิสูจน์สิ่งที่สองเทสต์ข้างบนพิสูจน์แล้ว)

ต่อท้าย `describe("parsePaymentLines")` ใน `src/lib/payments.test.ts`:

```ts
  it("รับช่องทาง E-Wallet (เคสจริง: บิลอาลี 9 ส.ค. จ่าย WeChat 1,290)", () => {
    const r = parsePaymentLines(
      JSON.stringify([{ method: "E-Wallet", amount: 1290 }]), 1290)
    expect(r).toEqual({ ok: true, lines: [{ method: "E-Wallet", amount: 1290 }] })
  })
  it("ข้อความ error ไล่ชื่อช่องทางจากชุดกลาง ไม่ได้พิมพ์ด้วยมือ", () => {
    const r = parsePaymentLines(
      JSON.stringify([{ method: "โอนวอลเล็ต", amount: 100 }]), 100)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      for (const m of PAYMENT_LINE_METHODS) expect(r.error).toContain(m)
    }
  })
```

- [ ] **Step 3: รันเทสต์ให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run src/lib/payment-methods.test.ts src/lib/points.test.ts src/lib/payments.test.ts`
Expected: FAIL — `payment-methods.test.ts` ล้มเพราะยังไม่มี export `REAL_MONEY_METHODS`

- [ ] **Step 4: แก้ `src/lib/constants.ts` บรรทัด 1-10**

แทนที่บล็อก `PAYMENT_METHODS` และ `PaymentMethod` เดิมด้วย:

```ts
export const PAYMENT_METHODS = [
  "QR Code",
  "เงินสด",
  "บัตรเครดิต",
  "E-Wallet",
  "Gowabi",
  "KOL",
  "Member Credit",
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

/**
 * ช่องทางเงินจริงที่ลูกค้าจ่ายตรงกับร้าน — ได้แต้ม · แบ่งจ่ายได้ · เติมเงินสมาชิกได้
 * ต่างจาก Gowabi/KOL (เงินผ่านคนกลาง) และ Member Credit (จ่ายไปแล้วตอนเติมเงิน)
 *
 * เคยก๊อปรายชื่อนี้ไว้ 3 ที่ (บรรทัดแบ่งจ่าย · แต้มสะสม · ฟอร์มเติมเงิน) แล้วเพิ่ม
 * ช่องทางใหม่ทีไรก็ลืมบางจุด — รวมมาไว้ที่เดียวแล้ว ห้ามก๊อปกลับไปอีก
 *
 * ลำดับนี้คือลำดับปุ่มบนหน้าจอ และตัวแรกเป็นค่าตั้งต้นของกล่องเก็บเงินค้าง
 * (collect-due-dialog.tsx) — สลับลำดับแล้วพฤติกรรมหน้าจอเปลี่ยนตาม
 *
 * `satisfies` บังคับตอน compile ว่าทุกตัวต้องอยู่ใน PAYMENT_METHODS ด้วย
 */
export const REAL_MONEY_METHODS = [
  "เงินสด",
  "QR Code",
  "บัตรเครดิต",
  "E-Wallet",
] as const satisfies readonly PaymentMethod[]
```

- [ ] **Step 5: แก้ `src/lib/payments.ts`**

บรรทัด 1-5 เปลี่ยนเป็น:

```ts
import { REAL_MONEY_METHODS } from "@/lib/constants"

/** บรรทัดชำระของบิล — เงินจริงเท่านั้น เครดิตเมมเบอร์อยู่ที่ credit_used ไม่ใช่บรรทัด (สเปก 2026-08-01) */
export type PaymentLine = { method: string; amount: number }

export const PAYMENT_LINE_METHODS = REAL_MONEY_METHODS
export const MAX_PAYMENT_LINES = 3
```

บรรทัด 30-31 (ข้อความ error) เปลี่ยนเป็น:

```ts
    if (!(PAYMENT_LINE_METHODS as readonly string[]).includes(method))
      return {
        ok: false,
        error: `ช่องทางแบ่งจ่ายต้องเป็น ${PAYMENT_LINE_METHODS.join(" / ")}`,
      }
```

- [ ] **Step 6: แก้ `src/lib/points.ts` บรรทัด 12-16**

เพิ่ม import ที่หัวไฟล์ (ใต้บล็อกคอมเมนต์บนสุด):

```ts
import { REAL_MONEY_METHODS } from "@/lib/constants"
```

แล้วแทนที่บล็อก `POINT_EARNING_METHODS` เดิมด้วย:

```ts
/**
 * วิธีจ่ายที่ได้แต้มสะสม — เงินจริงที่ลูกค้าจ่ายตรงกับร้านเท่านั้น
 * Gowabi/KOL ไม่ได้ (ไม่ใช่เงินตรงจากลูกค้า) · เครดิตสมาชิกไม่ได้ (ได้ไปแล้วตอนเติมเงิน)
 */
export const POINT_EARNING_METHODS = REAL_MONEY_METHODS
```

- [ ] **Step 7: แก้ `src/lib/payment-colors.ts` — เพิ่ม E-Wallet ทั้งสามชุด**

เพิ่มบรรทัดในแต่ละ object (fuchsia ไม่ชนกับ sky/violet/amber/emerald ที่ใช้อยู่ และไม่ชน rose ที่ระบบใช้สื่อตัวเลขติดลบ):

```ts
// ใน PAY_COLOR
  "E-Wallet": "bg-fuchsia-100 text-fuchsia-700",
// ใน PAY_DOT
  "E-Wallet": "bg-fuchsia-500",
// ใน PAY_SELECTED
  "E-Wallet": "border-fuchsia-600 bg-fuchsia-600 text-white hover:bg-fuchsia-600",
```

- [ ] **Step 8: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/lib/payment-methods.test.ts src/lib/points.test.ts src/lib/payments.test.ts`
Expected: PASS ทั้งหมด

(`PAYMENT_LINE_METHODS` และ `pointsForSale` ถูก import อยู่แล้วในไฟล์เทสต์ทั้งสอง ไม่ต้องเพิ่ม import)

- [ ] **Step 9: รันเทสต์ทั้งชุดกับ type check**

Run: `npm test && npx tsc --noEmit`
Expected: PASS ทั้งหมด — ถ้าที่ไหนพังแปลว่ามีโค้ดที่สมมติว่า `PAYMENT_METHODS` มี 6 ตัว ต้องแก้ให้ไม่ผูกกับจำนวน

- [ ] **Step 10: Commit**

```bash
git add src/lib/constants.ts src/lib/payments.ts src/lib/points.ts src/lib/payment-colors.ts src/lib/payment-methods.test.ts src/lib/points.test.ts src/lib/payments.test.ts
git commit -m "feat: รวมรายชื่อช่องทางเงินจริงเป็นชุดเดียวและเพิ่ม E-Wallet"
```

---

## Task 2: ปลด check constraint ของฐานข้อมูล

**Files:**
- Create: `supabase/migrations/20260813100000_ewallet_payment_method.sql`
- Modify: `src/types/database.ts` (regenerate)

**Interfaces:**
- Consumes: ชื่อ `E-Wallet` จาก Task 1
- Produces: ฐานข้อมูลรับค่า `E-Wallet` ในคอลัมน์ `sales.payment_method`, `bill_payments.method`, `member_topups.payment_method` — Task 3 ต้องมีอันนี้ก่อนถึงจะบันทึกจริงได้

**บริบท:** ค่าเดิมทุกค่าต้องคงอยู่ครบ ห้ามตัดออกแม้แต่ตัวเดียว โดยเฉพาะ `'ไม่ระบุ'` ในตาราง `sales` ซึ่งเป็นค่าของข้อมูลนำเข้ารุ่นเก่า ถ้าตัดออก migration จะล้มทันทีเพราะมีแถวเดิมใช้ค่านั้นอยู่

- [ ] **Step 1: เขียนไฟล์ migration**

สร้าง `supabase/migrations/20260813100000_ewallet_payment_method.sql`:

```sql
-- เพิ่มช่องทางชำระเงิน E-Wallet ให้ทั้งสามตารางที่เก็บช่องทาง
--
-- ที่มา: เทียบยอด 1-10 ส.ค. 2026 กับ ThaiHand แล้วพบว่าบิลลูกค้า "อาลี" 9 ส.ค. 1,290 บาท
-- ลูกค้าจ่ายด้วย WeChat แต่ระบบไม่มีช่องทางนี้ให้เลือก พนักงานจึงต้องคีย์เป็นบัตรเครดิต
-- ทำให้ยอดบัตรเครดิตของสองระบบไม่ตรงกัน
--
-- ค่าเดิมทุกค่าคงไว้ครบ — โดยเฉพาะ 'ไม่ระบุ' ในตาราง sales ซึ่งเป็นค่าของข้อมูลนำเข้ารุ่นเก่า
-- ถ้าตัดออกจะล้มทันทีเพราะมีแถวเดิมใช้อยู่

alter table public.sales drop constraint sales_payment_method_check;
alter table public.sales add constraint sales_payment_method_check
  check (payment_method in
    ('QR Code','บัตรเครดิต','E-Wallet','Gowabi','KOL','Member Credit','เงินสด','ไม่ระบุ'));

alter table public.bill_payments drop constraint bill_payments_method_check;
alter table public.bill_payments add constraint bill_payments_method_check
  check (method in ('เงินสด','QR Code','บัตรเครดิต','E-Wallet'));

alter table public.member_topups drop constraint member_topups_payment_method_check;
alter table public.member_topups add constraint member_topups_payment_method_check
  check (payment_method in ('QR Code','เงินสด','บัตรเครดิต','E-Wallet'));
```

- [ ] **Step 2: apply migration ผ่าน MCP**

ใช้ MCP tool `apply_migration` กับ project `jrioyrmicioqammeevgh`
ชื่อ migration: `ewallet_payment_method`
เนื้อ: SQL จาก Step 1

ห้ามรัน `supabase db push` หรือ `supabase db reset` ใส่ environment จริง

- [ ] **Step 3: ตรวจว่า constraint ทั้งสามรับ E-Wallet แล้ว**

รันผ่าน MCP `execute_sql`:

```sql
select rel.relname as table_name,
       pg_get_constraintdef(con.oid) like '%E-Wallet%' as has_ewallet
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public'
  and con.conname in ('sales_payment_method_check',
                      'bill_payments_method_check',
                      'member_topups_payment_method_check')
order by rel.relname;
```

Expected: 3 แถว `has_ewallet = true` ทุกแถว

- [ ] **Step 4: ตรวจว่าข้อมูลเดิมยังผ่าน constraint (ไม่มีแถวไหนหลุด)**

```sql
select count(*) as sales_rows_ok from public.sales
where payment_method in
  ('QR Code','บัตรเครดิต','E-Wallet','Gowabi','KOL','Member Credit','เงินสด','ไม่ระบุ');
select count(*) as all_sales_rows from public.sales;
```

Expected: สองตัวเลขเท่ากัน

- [ ] **Step 5: regenerate types**

ใช้ MCP `generate_typescript_types` กับ project `jrioyrmicioqammeevgh` แล้วเขียนทับ `src/types/database.ts`

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260813100000_ewallet_payment_method.sql src/types/database.ts
git commit -m "feat(db): รับช่องทาง E-Wallet ใน sales, bill_payments, member_topups"
```

---

## Task 3: ต่อสาย E-Wallet ให้ครบทุกจุดที่เหลือ

**Files:**
- Modify: `src/app/(app)/members/topup-form.tsx:19,185-198`
- Modify: `src/app/(app)/members/member-actions.ts:24-26`
- Modify: `src/app/(app)/payment-actions.ts:13-14`
- Modify: `src/app/book/points-actions.ts:278-284`
- Modify: `src/app/(app)/collect-due-dialog.tsx:83`
- Modify: `src/app/(app)/pos/group-pos-form.tsx:657`
- Test: `src/app/(app)/members/member-actions.test.ts`

**Interfaces:**
- Consumes: `REAL_MONEY_METHODS` จาก `@/lib/constants` (Task 1) · constraint ที่ปลดแล้ว (Task 2)
- Produces: `createTopup` รับ `payment_method` เป็น `E-Wallet` ได้

**บริบท:** หน้าจออื่นทั้งหมด (ฟอร์ม POS, ฟอร์มกลุ่ม, กล่องแก้บิล, ตัวกรองหน้าประวัติบิล, กล่องเก็บเงินค้าง) เรนเดอร์**ตัวปุ่ม**จาก `PAYMENT_METHODS`/`PAYMENT_LINE_METHODS` อยู่แล้ว จึงได้ E-Wallet มาฟรีจาก Task 1

แต่ **จำนวนคอลัมน์ของ grid เป็นค่าตายตัวในแต่ละหน้า** พอมีช่องทางที่ 4 บางหน้าจะเหลือปุ่มโดดอยู่แถวสุดท้าย ต้องแก้ 3 หน้า (topup-form ใน Step 4 · อีกสองหน้าใน Step 4b) ส่วน `pos-form.tsx:715` และ `edit-sale-dialog.tsx:414` ที่ไล่จาก `PAYMENT_METHODS` 7 ตัวใน `grid-cols-3` **ไม่ต้องแก้** เพราะได้ 3/3/1 โดยแถวสุดท้ายคือ `Member Credit` ซึ่งเป็นปุ่มสลับใช้เครดิตแบบพิเศษอยู่แล้ว การอยู่เดี่ยวจึงอ่านได้ดี

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน — ต่อท้าย `src/app/(app)/members/member-actions.test.ts`**

เพิ่ม `createTopup` เข้าบรรทัด import เดิม:

```ts
import { createTopup, deleteTopup } from "./member-actions"
```

แล้วต่อท้ายไฟล์:

```ts
/**
 * supabase ปลอมสำหรับ createTopup — ลำดับการเรียกคือ
 *   member_topups.insert().select().single()  →  point_transactions.insert()  →  customers.update().eq()
 * เก็บแถวที่ insert ไว้เพื่อยืนยันว่า payment_method ถูกเขียนลงไปจริง
 */
function fakeSupabaseForCreate() {
  const insertedTopups: Record<string, unknown>[] = []

  const from = vi.fn((table: string) => {
    if (table === "member_topups") {
      return {
        insert: vi.fn((row: Record<string, unknown>) => {
          insertedTopups.push(row)
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: "topup-1" }, error: null })),
            })),
          }
        }),
      }
    }
    if (table === "point_transactions") {
      return { insert: vi.fn(async () => ({ error: null })) }
    }
    if (table === "customers") {
      return { update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) }
    }
    throw new Error(`ตารางที่ไม่คาดคิด: ${table}`)
  })

  return { client: { from }, insertedTopups }
}

function topupFormData(paymentMethod: string): FormData {
  const fd = new FormData()
  fd.set("customer_id", CUST)
  fd.set("tier", "Silver")
  fd.set("payment_method", paymentMethod)
  return fd
}

describe("createTopup — ช่องทางชำระเงิน", () => {
  beforeEach(() => vi.clearAllMocks())

  it("รับ E-Wallet และเขียนลงคอลัมน์ payment_method ตามที่ส่งมา", async () => {
    const fake = fakeSupabaseForCreate()
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const result = await createTopup(topupFormData("E-Wallet"))

    expect(result).toEqual({ ok: true })
    expect(fake.insertedTopups).toHaveLength(1)
    expect(fake.insertedTopups[0].payment_method).toBe("E-Wallet")
  })

  it("ช่องทางที่ไม่รู้จักถูกปฏิเสธ ไม่มีอะไรถูกเขียนลงฐานข้อมูล", async () => {
    const fake = fakeSupabaseForCreate()
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const result = await createTopup(topupFormData("โอนวอลเล็ต"))

    expect(result.ok).toBe(false)
    expect(fake.insertedTopups).toHaveLength(0)
  })
})
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run "src/app/(app)/members/member-actions.test.ts"`
Expected: FAIL — เทสต์ E-Wallet ล้มที่ `กรุณาเลือกช่องทางชำระเงิน` เพราะ validation ยังเป็นอาร์เรย์ 3 ตัวที่เขียนสด

- [ ] **Step 3: แก้ `src/app/(app)/members/member-actions.ts`**

เพิ่ม `REAL_MONEY_METHODS` เข้า import จาก `@/lib/constants` บรรทัด 7:

```ts
import { MEMBER_TIERS, REAL_MONEY_METHODS } from "@/lib/constants"
```

แทนที่บรรทัด 24-26:

```ts
  if (!(REAL_MONEY_METHODS as readonly string[]).includes(paymentMethod)) {
    return { ok: false, error: "กรุณาเลือกช่องทางชำระเงิน" }
  }
```

- [ ] **Step 4: แก้ `src/app/(app)/members/topup-form.tsx`**

ลบบรรทัด 19 (`const TOPUP_PAYMENTS = ...`) ทิ้ง แล้วเพิ่ม `REAL_MONEY_METHODS` เข้า import บรรทัด 9:

```ts
import { MEMBER_TIERS, REAL_MONEY_METHODS, formatBaht } from "@/lib/constants"
```

แก้บล็อกปุ่มช่องทางบรรทัด 185-198 — **เปลี่ยน `grid-cols-3` เป็น `grid-cols-2`** เพราะมี 4 ปุ่มแล้ว ถ้าคง 3 คอลัมน์ไว้แถวสองจะเหลือปุ่มเดียวโดด:

```tsx
        <div className="grid grid-cols-2 gap-2">
          {REAL_MONEY_METHODS.map((m) => (
            <Button
              key={m}
              type="button"
              variant={paymentMethod === m ? "default" : "outline"}
              className="h-12"
              onClick={() => setPaymentMethod(m)}
              aria-pressed={paymentMethod === m}
            >
              {m}
            </Button>
          ))}
        </div>
```

- [ ] **Step 4b: แก้จำนวนคอลัมน์ของ grid อีกสองหน้า**

`src/app/(app)/collect-due-dialog.tsx` บรรทัด 83 — ไล่จาก `PAYMENT_LINE_METHODS` ซึ่งเดิม 3 ปุ่มพอดี 3 คอลัมน์ ตอนนี้ 4 ปุ่มจะเหลือปุ่มโดดแถวสุดท้าย:

```tsx
              <div className="grid grid-cols-2 gap-2">
```

`src/app/(app)/pos/group-pos-form.tsx` บรรทัด 657 — ไล่จาก `PAYMENT_LINE_METHODS` (4 ปุ่ม) แล้วต่อท้ายด้วยปุ่มเครดิตอีก 1 ปุ่มเมื่อ `canUseCredit` เป็นจริง รวมเป็น 5 หรือ 4 ปุ่ม:

```tsx
        <div className={canUseCredit ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>
```

(ได้ 3+2 เมื่อใช้เครดิตได้ และ 2+2 เมื่อใช้ไม่ได้ — ไม่มีปุ่มโดดทั้งสองกรณี)

- [ ] **Step 5: แก้ `src/app/(app)/payment-actions.ts` บรรทัด 13-14**

```ts
  if (!(PAYMENT_LINE_METHODS as readonly string[]).includes(method))
    return {
      ok: false,
      error: `ช่องทางต้องเป็น ${PAYMENT_LINE_METHODS.join(" / ")}`,
    }
```

- [ ] **Step 6: แก้ `src/app/book/points-actions.ts` — เพิ่มป้ายของ E-Wallet**

ในอ็อบเจกต์ `PAY_LABEL` เพิ่มบรรทัดต่อจาก `บัตรเครดิต`:

```ts
  "E-Wallet": "E-Wallet",
```

- [ ] **Step 7: รันเทสต์ให้ผ่าน**

Run: `npx vitest run "src/app/(app)/members/member-actions.test.ts"`
Expected: PASS ทั้งหมด รวมเทสต์ `deleteTopup` เดิม

- [ ] **Step 8: รันเทสต์ทั้งชุด + type check + build**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: PASS ทั้งหมด

- [ ] **Step 9: Commit**

```bash
git add "src/app/(app)/members/topup-form.tsx" "src/app/(app)/members/member-actions.ts" "src/app/(app)/members/member-actions.test.ts" "src/app/(app)/payment-actions.ts" "src/app/(app)/collect-due-dialog.tsx" "src/app/(app)/pos/group-pos-form.tsx" src/app/book/points-actions.ts
git commit -m "feat: ให้เลือก E-Wallet ได้ในฟอร์มเติมเงินและการเก็บเงินค้าง"
```

---

## Task 4: ฟังก์ชัน `revenueWaterfall`

**Files:**
- Create: `src/lib/revenue-waterfall.ts`
- Create: `src/lib/revenue-waterfall.test.ts`

**Interfaces:**
- Produces: `revenueWaterfall(input: RevenueWaterfallInput): RevenueWaterfall` export จาก `@/lib/revenue-waterfall` — Task 6 ใช้ในทั้งสองหน้า
- Produces: `type RevenueWaterfallInput = { volume: number; discount: number; roomFee: number }`
- Produces: `type RevenueWaterfall = { gross: number; roomFee: number; discount: number; volume: number }`

**บริบท:** ตอนนี้สูตร `gross = volume + discount` ถูกเขียนซ้ำอยู่ในสองหน้า (`today/page.tsx:293` และ `reports/page.tsx:192`) และไม่มีเทสต์ งานนี้ดึงออกมาเป็นฟังก์ชันบริสุทธิ์ก่อน แล้ว Task 6 ค่อยเอาไปใช้ — ทำแยกกันเพื่อให้สูตรมีเทสต์คุมก่อนแตะหน้าจอ

ค่าห้องสปาอยู่ใน `net_amount` (จึงอยู่ใน `volume`) อยู่แล้ว และส่วนลดไม่เคยแตะค่าห้อง (ดู `src/lib/sale-math.ts:44-51`) การถอดค่าห้องออกจาก `gross` จึงทำให้บรรทัด "มูลค่าเต็มตามเมนู" เป็นราคาเมนูล้วน ๆ จริง

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน — `src/lib/revenue-waterfall.test.ts`**

```ts
import { describe, expect, it } from "vitest"

import { revenueWaterfall } from "./revenue-waterfall"

const round2 = (n: number) => Math.round(n * 100) / 100

describe("revenueWaterfall", () => {
  it("ไม่มีค่าห้องสปา — ให้ผลเท่าสูตรเดิมเป๊ะ (gross = volume + ส่วนลด)", () => {
    expect(revenueWaterfall({ volume: 135112, discount: 5618, roomFee: 0 })).toEqual({
      gross: 140730,
      roomFee: 0,
      discount: 5618,
      volume: 135112,
    })
  })

  it("มีค่าห้องสปา — ถอดออกจากมูลค่าเต็มตามเมนู ไม่ให้กลืนอยู่ข้างใน", () => {
    // เคสจริงช่วง 1-10 ส.ค. 2026: ค่าห้อง 100 บาทหนึ่งใบ
    // สูตรเดิมให้ gross = 140,830 ซึ่งกลืนค่าห้องไว้เงียบ ๆ
    expect(revenueWaterfall({ volume: 135212, discount: 5618, roomFee: 100 })).toEqual({
      gross: 140730,
      roomFee: 100,
      discount: 5618,
      volume: 135212,
    })
  })

  it("สมการต้องลงตัวเสมอ: gross + ค่าห้อง − ส่วนลด = ยอดรับจริง", () => {
    const cases = [
      { volume: 0, discount: 0, roomFee: 0 },
      { volume: 590, discount: 0, roomFee: 100 },
      { volume: 20880, discount: 1200, roomFee: 300 },
      { volume: 128932.02, discount: 5618, roomFee: 100 },
      { volume: 135212, discount: 0, roomFee: 0 },
    ]
    for (const c of cases) {
      const w = revenueWaterfall(c)
      expect(round2(w.gross + w.roomFee - w.discount)).toBe(w.volume)
    }
  })

  it("ยอดที่มีเศษสตางค์ไม่เพี้ยนจาก floating point", () => {
    const w = revenueWaterfall({ volume: 128932.02, discount: 5618, roomFee: 100 })
    expect(w.gross).toBe(134450.02)
    expect(w.volume).toBe(128932.02)
  })

  it("ค่าห้องติดลบถือเป็นศูนย์ — ข้อมูลเพี้ยนต้องไม่ทำให้มูลค่าเมนูบวมขึ้น", () => {
    expect(revenueWaterfall({ volume: 500, discount: 0, roomFee: -100 })).toEqual({
      gross: 500,
      roomFee: 0,
      discount: 0,
      volume: 500,
    })
  })

  it("วันที่ไม่มีบิลขายเลย (มีแต่เติมเงิน) — ทุกยอดเป็นศูนย์ ไม่ใช่ NaN", () => {
    expect(revenueWaterfall({ volume: 0, discount: 0, roomFee: 0 })).toEqual({
      gross: 0,
      roomFee: 0,
      discount: 0,
      volume: 0,
    })
  })
})
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run src/lib/revenue-waterfall.test.ts`
Expected: FAIL — หาโมดูล `./revenue-waterfall` ไม่เจอ

- [ ] **Step 3: เขียน `src/lib/revenue-waterfall.ts`**

```ts
/**
 * แยกยอดรับจริงออกเป็นบรรทัดของการ์ดรายรับ — สูตรชุดเดียวใช้ทั้งหน้ายอดวันนี้และหน้ารายงาน
 *
 * ค่าห้องสปาเป็นรายรับคนละก้อนกับค่าบริการนวด: ลูกค้าจ่ายเพิ่มจากราคาเมนู และส่วนลด
 * ไม่เคยแตะยอดนี้ (ดู sale-math.ts) แต่มันถูกบวกรวมอยู่ใน net_amount จึงอยู่ใน volume ด้วย
 * ถ้าไม่ถอดออก บรรทัด "มูลค่าเต็มตามเมนู" จะกลืนค่าห้องเข้าไปเงียบ ๆ แล้วแจกแจงไม่ได้
 * ว่ารายได้มาจากอะไร (เคสจริง 1-10 ส.ค. 2026: โชว์ 140,830 ทั้งที่ราคาเมนูจริง 140,730)
 *
 * ค่าห้องยังนับเป็นรายรับทางบัญชีเหมือนเดิมทุกประการ — งานนี้แค่แยกให้เห็นว่ามาจากไหน
 */

export type RevenueWaterfallInput = {
  /** sum(net_amount) — รวมค่าห้องสปาอยู่ในนี้แล้ว */
  volume: number
  /** sum(discount) */
  discount: number
  /** sum(room_fee) */
  roomFee: number
}

export type RevenueWaterfall = {
  /** มูลค่าเต็มตามเมนูล้วน ๆ ก่อนหักส่วนลด ไม่รวมค่าห้องสปา */
  gross: number
  roomFee: number
  discount: number
  /** เท่ากับ volume ที่รับเข้ามาเสมอ — มีไว้ให้ผู้เรียกอ่านครบทั้ง waterfall จากที่เดียว */
  volume: number
}

const round2 = (n: number) => {
  const result = Math.round(n * 100) / 100
  return Object.is(result, -0) ? 0 : result
}

export function revenueWaterfall(input: RevenueWaterfallInput): RevenueWaterfall {
  // ค่าห้องติดลบเป็นข้อมูลเพี้ยน ถ้าปล่อยผ่านจะไปบวกใส่ gross ทำให้มูลค่าเมนูบวมเกินจริง
  const roomFee = round2(Math.max(0, input.roomFee))
  const discount = round2(input.discount)
  const volume = round2(input.volume)

  return { gross: round2(volume + discount - roomFee), roomFee, discount, volume }
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/lib/revenue-waterfall.test.ts`
Expected: PASS ทั้ง 6 เคส

- [ ] **Step 5: Commit**

```bash
git add src/lib/revenue-waterfall.ts src/lib/revenue-waterfall.test.ts
git commit -m "feat: ฟังก์ชัน revenueWaterfall แยกค่าห้องสปาออกจากมูลค่าเมนู"
```

---

## Task 5: เพิ่ม `room_fee_total` เข้า `v_daily_summary`

**Files:**
- Create: `supabase/migrations/20260813110000_v_daily_summary_room_fee.sql`
- Modify: `supabase/reconciliation.sql`
- Modify: `src/types/database.ts` (regenerate)

**Interfaces:**
- Produces: `v_daily_summary.room_fee_total` (numeric, ไม่เป็น null) — Task 6 ใช้

**บริบท:** หน้ารายงานห้ามบวกยอดรวมจากแถวดิบเพราะเพดาน 1,000 แถวของ PostgREST (เคยทำให้รายได้ขาดไป 83,631 บาทมาแล้ว) ยอดค่าห้องรวมจึงต้องมาจาก view

`create or replace view` ต้องเขียนนิยามทั้งก้อนใหม่ ข้างล่างคือนิยามปัจจุบันที่เติมสองบรรทัดแล้ว คอลัมน์เดิมทั้งหกตัวอยู่ครบและเรียงลำดับเดิม

- [ ] **Step 1: เขียนไฟล์ migration**

สร้าง `supabase/migrations/20260813110000_v_daily_summary_room_fee.sql`:

```sql
-- เพิ่ม room_fee_total เข้า v_daily_summary เพื่อให้การ์ดรายรับแยกค่าห้องสปา
-- ออกจากมูลค่าเต็มตามเมนูได้ โดยยังอ่านยอดรวมจาก view (ห้ามบวกจากแถวดิบ — เพดาน 1,000 แถว)
--
-- คอลัมน์เดิมหกตัวอยู่ครบและเรียงลำดับเดิม เพิ่มตัวที่เจ็ดต่อท้าย
-- ยอด volume / net_revenue / cash_in ไม่ขยับ เพราะค่าห้องรวมอยู่ใน net_amount อยู่แล้ว

create or replace view public.v_daily_summary
with (security_invoker = true) as
with sales_day as (
  select
    sales.sale_date,
    count(*) as sessions,
    sum(sales.net_amount) as volume,
    sum(coalesce(sales.revenue_recognize, sales.net_amount)) as net_revenue,
    sum(sales.discount) as discount_total,
    sum(coalesce(sales.room_fee, 0)) as room_fee_total
  from sales
  group by sales.sale_date
), topup_day as (
  select
    member_topups.topup_date,
    sum(member_topups.cash_received) as topup_cash
  from member_topups
  group by member_topups.topup_date
), pay_day as (
  select
    v_bill_payments.received_date as sale_date,
    sum(v_bill_payments.amount) as sales_cash
  from v_bill_payments
  group by v_bill_payments.received_date
)
select
  coalesce(s.sale_date, t.topup_date, p.sale_date) as sale_date,
  coalesce(s.sessions, 0::bigint) as sessions,
  coalesce(s.volume, 0::numeric) as volume,
  coalesce(s.net_revenue, 0::numeric) as net_revenue,
  coalesce(s.discount_total, 0::numeric) as discount_total,
  (coalesce(p.sales_cash, 0::numeric) + coalesce(t.topup_cash, 0::numeric)) as cash_in,
  -- วันที่มีแต่รายการเติมเงินไม่มีบิลขาย s จะเป็น null ทั้งแถว ต้อง coalesce เป็น 0
  coalesce(s.room_fee_total, 0::numeric) as room_fee_total
from sales_day s
  full join topup_day t on t.topup_date = s.sale_date
  full join pay_day p on p.sale_date = coalesce(s.sale_date, t.topup_date);
```

- [ ] **Step 2: apply migration ผ่าน MCP**

ใช้ MCP `apply_migration` ชื่อ `v_daily_summary_room_fee` กับ project `jrioyrmicioqammeevgh`

- [ ] **Step 3: ตรวจว่ายอดเดิมไม่ขยับแม้แต่บาทเดียว**

รันผ่าน MCP `execute_sql` — เทียบยอดจาก view กับยอดที่บวกจากตารางดิบตรง ๆ:

```sql
select
  (select sum(volume) from public.v_daily_summary)        as view_volume,
  (select sum(net_amount) from public.sales)              as raw_volume,
  (select sum(net_revenue) from public.v_daily_summary)   as view_revenue,
  (select sum(coalesce(revenue_recognize, net_amount)) from public.sales) as raw_revenue,
  (select sum(room_fee_total) from public.v_daily_summary) as view_room_fee,
  (select sum(coalesce(room_fee, 0)) from public.sales)   as raw_room_fee;
```

Expected: `view_volume = raw_volume` · `view_revenue = raw_revenue` · `view_room_fee = raw_room_fee`

- [ ] **Step 4: ตรวจวันที่มีแต่เติมเงินไม่มีบิลขาย ต้องได้ 0 ไม่ใช่ null**

```sql
select count(*) as null_room_fee_rows
from public.v_daily_summary where room_fee_total is null;
```

Expected: `0`

- [ ] **Step 5: เพิ่มข้อตรวจใน `supabase/reconciliation.sql`**

ในบล็อก `expected(check_name, expected_value)` เพิ่มบรรทัดต่อจาก `('topup_missing_expiry', 0),`:

```sql
  -- room_fee_total ใน view ต้องตรงกับผลรวมในตาราง sales ทุกวัน ถ้าไม่ตรงแปลว่า
  -- นิยาม view หลุดจากข้อมูลจริง แล้วบรรทัด "ค่าห้องสปา" ในการ์ดรายรับจะโกหก
  ('room_fee_total_mismatch', 0),
```

ในบล็อก `actual` เพิ่ม `union all` ต่อท้ายข้อสุดท้าย (`tracked_bill_method_mismatch`) ก่อนวงเล็บปิดของ CTE:

```sql
  union all
  select 'room_fee_total_mismatch', count(*)
  from (
    select d.sale_date
    from public.v_daily_summary d
    join (
      select sale_date, sum(coalesce(room_fee, 0)) as raw_room_fee
      from public.sales group by sale_date
    ) s on s.sale_date = d.sale_date
    where d.room_fee_total <> s.raw_room_fee
  ) bad
```

- [ ] **Step 6: รัน `reconciliation.sql` ทั้งไฟล์ ตรวจว่าไม่มี FAIL**

รันเนื้อไฟล์ `supabase/reconciliation.sql` ผ่าน MCP `execute_sql`
Expected: ทุกแถวคอลัมน์ `result` เป็น `PASS` โดยเฉพาะ `room_fee_total_mismatch`

- [ ] **Step 7: regenerate types**

ใช้ MCP `generate_typescript_types` แล้วเขียนทับ `src/types/database.ts`

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260813110000_v_daily_summary_room_fee.sql supabase/reconciliation.sql src/types/database.ts
git commit -m "feat(db): เพิ่ม room_fee_total เข้า v_daily_summary"
```

---

## Task 6: แสดงบรรทัดค่าห้องสปาในหน้ายอดวันนี้และหน้ารายงาน

**Files:**
- Modify: `src/lib/money-info.ts`
- Modify: `src/app/(app)/today/page.tsx:86,288-293,378-384`
- Modify: `src/app/(app)/reports/page.tsx:122,191-192,456-462`

**Interfaces:**
- Consumes: `revenueWaterfall` จาก `@/lib/revenue-waterfall` (Task 4) · `v_daily_summary.room_fee_total` (Task 5)
- Produces: `MONEY_INFO.gross` และ `MONEY_INFO.roomFee` — ข้อความอธิบายที่ทั้งสองหน้าใช้ร่วมกัน

**บริบท:** ข้อความ InfoDot ของบรรทัด "มูลค่าเต็มตามเมนู" ตอนนี้เขียนซ้ำเป็นสตริงตรง ๆ ในทั้งสองหน้า ต้องแก้ทั้งคู่อยู่แล้วจึงย้ายไปไว้ที่ `money-info.ts` ตามแบบที่ `MONEY_INFO.volume` และ `MONEY_INFO.thaihandTotal` ทำอยู่

- [ ] **Step 1: เพิ่มข้อความสองตัวใน `src/lib/money-info.ts`**

เพิ่มต่อจาก `volume` (ก่อน `thaihandTotal`):

```ts
  /** มูลค่าเต็มตามเมนู — ต้นทางของ waterfall รายรับ */
  gross:
    "ยอดถ้าทุกบิลจ่ายราคาเต็มตามเมนู ไม่หักส่วนลดใดๆ และไม่รวมค่าห้องสปาซึ่งแยกอีกบรรทัด · ใช้ดูว่าร้านให้ส่วนลดไปกี่ % ของมูลค่างาน",
  /** ค่าห้องสปาส่วนตัว */
  roomFee:
    "ค่าห้องสปาส่วนตัว 100 บาทต่อครั้ง ลูกค้าจ่ายเพิ่มจากค่าบริการนวด ส่วนลดไม่แตะยอดนี้ · รวมเป็นรายรับทางบัญชีเหมือนกัน แยกบรรทัดไว้ให้เห็นว่ารายได้มาจากอะไร",
```

- [ ] **Step 2: แก้ `src/app/(app)/today/page.tsx` — ดึงคอลัมน์ใหม่**

บรรทัด 86:

```ts
      .select("sale_date, sessions, volume, net_revenue, cash_in, discount_total, room_fee_total")
```

- [ ] **Step 3: แก้ `src/app/(app)/today/page.tsx` — คำนวณ waterfall**

เพิ่ม import ที่หัวไฟล์:

```ts
import { revenueWaterfall } from "@/lib/revenue-waterfall"
```

แทนที่บรรทัด 288-293 (บล็อก `totalDiscount` และ `totalGross`):

```ts
  const totalDiscount = summaryRows.reduce(
    (sum, d) => sum + Number(d.discount_total ?? 0),
    0
  )
  const totalRoomFee = summaryRows.reduce(
    (sum, d) => sum + Number(d.room_fee_total ?? 0),
    0
  )
  // ต่อยอด waterfall ขึ้นไปถึงมูลค่าเต็มตามเมนู — สูตรเดียวกับหน้ารายงาน
  // ค่าห้องสปาอยู่ใน net_amount อยู่แล้ว ต้องถอดออกไม่งั้นบรรทัดมูลค่าเมนูจะกลืนไว้เงียบ ๆ
  const waterfall = revenueWaterfall({
    volume: totalVolume,
    discount: totalDiscount,
    roomFee: totalRoomFee,
  })
```

- [ ] **Step 4: แก้ `src/app/(app)/today/page.tsx` — การ์ดรายรับ**

แทนที่บล็อกบรรทัด 377-384 ด้วย (คอมเมนต์ waterfall อัปเดตตาม และเพิ่มบรรทัดค่าห้อง):

```tsx
            {/* waterfall เต็ม: มูลค่าเมนู + ค่าห้องสปา − ส่วนลด = Volume − เครดิตแถม = รายรับที่รับรู้ */}
            <div className="flex justify-between">
              <span className="flex items-center gap-1 text-slate-600">
                มูลค่าเต็มตามเมนู <InfoDot text={MONEY_INFO.gross} />
              </span>
              <span className="font-medium">{formatBaht(waterfall.gross)}</span>
            </div>
            {waterfall.roomFee > 0 && (
              <div className="flex justify-between">
                <span className="flex items-center gap-1 text-slate-600">
                  + ค่าห้องสปา <InfoDot text={MONEY_INFO.roomFee} />
                </span>
                <span className="font-medium">{formatBaht(waterfall.roomFee)}</span>
              </div>
            )}
```

- [ ] **Step 5: แก้ `src/app/(app)/reports/page.tsx` — ดึงคอลัมน์ใหม่**

บรรทัด 122:

```ts
        .select("sale_date, sessions, volume, net_revenue, discount_total, cash_in, room_fee_total")
```

- [ ] **Step 6: แก้ `src/app/(app)/reports/page.tsx` — คำนวณ waterfall**

เพิ่ม import ที่หัวไฟล์:

```ts
import { revenueWaterfall } from "@/lib/revenue-waterfall"
```

แทนที่บรรทัด 191-192:

```ts
  const roomFeeTotal = summaryRows.reduce(
    (sum, d) => sum + Number(d.room_fee_total ?? 0),
    0
  )
  // มูลค่าเต็มตามเมนูก่อนหักส่วนลด — จุดตั้งต้นของ waterfall รายรับ
  // ค่าห้องสปาแยกบรรทัดของตัวเอง สูตรอยู่ที่ revenue-waterfall.ts ที่เดียวกับหน้ายอดวันนี้
  const waterfall = revenueWaterfall({
    volume: volumeTotal,
    discount: discountTotal,
    roomFee: roomFeeTotal,
  })
```

`grossTotal` ถูกใช้อีกที่เดียวคือบรรทัด 461 (ในการ์ด) ซึ่ง Step 7 แก้ให้แล้ว
หลังแก้ทั้งสอง step ให้ยืนยันว่าไม่เหลือชื่อเดิม:

Run: `grep -n "grossTotal" "src/app/(app)/reports/page.tsx"`
Expected: ไม่มีผลลัพธ์

- [ ] **Step 7: แก้ `src/app/(app)/reports/page.tsx` — การ์ดรายรับ**

แทนที่บล็อกบรรทัด 455-462:

```tsx
            {/* waterfall เต็ม: มูลค่าเมนู + ค่าห้องสปา − ส่วนลด = Volume − เครดิตแถม = รายรับที่รับรู้ */}
            <div className="flex justify-between">
              <span className="flex items-center gap-1 text-slate-600">
                มูลค่าเต็มตามเมนู <InfoDot text={MONEY_INFO.gross} />
              </span>
              <span className="font-medium">{formatBaht(waterfall.gross)}</span>
            </div>
            {waterfall.roomFee > 0 && (
              <div className="flex justify-between">
                <span className="flex items-center gap-1 text-slate-600">
                  + ค่าห้องสปา <InfoDot text={MONEY_INFO.roomFee} />
                </span>
                <span className="font-medium">{formatBaht(waterfall.roomFee)}</span>
              </div>
            )}
```

ตรวจว่าไฟล์ import `MONEY_INFO` อยู่แล้ว (บรรทัด 449 ใช้ `MONEY_INFO.netRevenue`) ถ้าใช่ไม่ต้องเพิ่ม import

- [ ] **Step 8: type check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS — ถ้า `room_fee_total` หา type ไม่เจอ แปลว่า Task 5 Step 7 ยังไม่ได้ regenerate types

- [ ] **Step 9: ตรวจด้วยตาบนเซิร์ฟเวอร์จริง**

เปิด dev server แล้วดูสองหน้า:

Run: ใช้ preview tool เปิด `/reports` เลือกช่วง 1–10 ส.ค. 2026
Expected: การ์ดรายรับแสดง `มูลค่าเต็มตามเมนู` · `+ ค่าห้องสปา` · `− ส่วนลดที่ให้` · `= ยอดรับจริง (Volume)`
และ **ยอดรับจริงต้องเท่ากับ 135,212 + 550 = 135,762** (บิลนิกกี้ที่พนักงานคีย์เพิ่มเมื่อ 13 ส.ค. รวมอยู่แล้ว)
ค่า `มูลค่าเต็มตามเมนู` + `ค่าห้องสปา` − `ส่วนลด` ต้องเท่ากับ `ยอดรับจริง` พอดี

Run: เปิด `/today` แล้วเลือกวันที่ 9 ส.ค. 2026 (วันเดียวที่มีค่าห้องสปาในช่วงนี้)
Expected: บรรทัด `+ ค่าห้องสปา 100` ปรากฏ

Run: เปิด `/today` วันที่ไม่มีค่าห้อง (เช่น 1 ส.ค. 2026)
Expected: **ไม่มี**บรรทัดค่าห้องสปา และการ์ดหน้าตาเหมือนเดิมทุกประการ

- [ ] **Step 10: Commit**

```bash
git add src/lib/money-info.ts "src/app/(app)/today/page.tsx" "src/app/(app)/reports/page.tsx"
git commit -m "feat: แยกบรรทัดค่าห้องสปาในการ์ดรายรับหน้ายอดวันนี้และรายงาน"
```

---

## Task 7: `updateTopupPaymentMethod` และคอลัมน์บันทึกผู้แก้

**Files:**
- Create: `supabase/migrations/20260813120000_member_topups_edit_audit.sql`
- Modify: `src/app/(app)/members/member-actions.ts`
- Modify: `src/app/(app)/members/member-actions.test.ts`
- Modify: `src/types/database.ts` (regenerate)

**Interfaces:**
- Consumes: `REAL_MONEY_METHODS` (Task 1) · constraint ที่ปลดแล้ว (Task 2)
- Produces: `updateTopupPaymentMethod(id: string, method: string): Promise<TopupResult>` export จาก `./member-actions` — Task 8 ใช้
- Produces: `member_topups.edited_by (text, null ได้)` และ `member_topups.edited_at (timestamptz, null ได้)`

**บริบท:** ห้ามเปิดให้แก้จำนวนเงิน เพราะ `cash_received` ผูกกับแต้มใน `point_transactions` · `credit_added` ผูกกับยอดเครดิตในกระปุก · `tier` ผูกกับ `expiry_date` ซึ่งเป็นวันหมดอายุของทั้งกระปุก (คิดจาก MAX) ทางแก้จำนวนเงินคือลบใบเดิมแล้วเติมใหม่ ซึ่ง `deleteTopup` มีกันชน 3 ชั้นคุมอยู่แล้ว

ฟังก์ชันนี้**ไม่ล็อกเดือน** ต่างจาก `deleteTopup` เพราะช่องทางไม่ทำให้ยอดรวมขยับสักบาท

- [ ] **Step 1: เขียนไฟล์ migration**

สร้าง `supabase/migrations/20260813120000_member_topups_edit_audit.sql`:

```sql
-- บันทึกว่าใครแก้ใบเติมเงินเมื่อไหร่
--
-- ตาราง member_topups ไม่เคยมีคอลัมน์บอกผู้แก้ไขเลย พอเปิดให้แก้ช่องทางชำระเงินได้
-- (ซึ่งแก้ข้ามเดือนได้ด้วย ต่างจากการลบที่ล็อกเฉพาะเดือนปัจจุบัน) จึงต้องตามรอยได้
-- ว่าใครเปลี่ยนอะไร ตามแบบเดียวกับ sales.edited_by

alter table public.member_topups add column if not exists edited_by text;
alter table public.member_topups add column if not exists edited_at timestamptz;

comment on column public.member_topups.edited_by is
  'ชื่อพนักงานที่แก้ช่องทางชำระเงินล่าสุด — null = ยังไม่เคยถูกแก้';
comment on column public.member_topups.edited_at is
  'เวลาที่แก้ช่องทางชำระเงินล่าสุด';
```

- [ ] **Step 2: apply migration + regenerate types**

ใช้ MCP `apply_migration` ชื่อ `member_topups_edit_audit`
แล้วใช้ MCP `generate_typescript_types` เขียนทับ `src/types/database.ts`

ตรวจด้วย MCP `execute_sql`:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'member_topups' and column_name in ('edited_by', 'edited_at');
```

Expected: 2 แถว `is_nullable = YES`

- [ ] **Step 3: เขียนเทสต์ที่ยังไม่ผ่าน — ต่อท้าย `src/app/(app)/members/member-actions.test.ts`**

เพิ่ม mock ของ `@/lib/auth` ไว้ข้าง ๆ mock ตัวอื่นที่หัวไฟล์:

```ts
vi.mock("@/lib/auth", () => ({
  getMyProfile: vi.fn(async () => ({ full_name: "ผู้จัดการ" })),
}))
```

เพิ่ม `updateTopupPaymentMethod` เข้าบรรทัด import:

```ts
import { createTopup, deleteTopup, updateTopupPaymentMethod } from "./member-actions"
```

แล้วต่อท้ายไฟล์:

```ts
/**
 * supabase ปลอมสำหรับ updateTopupPaymentMethod — ลำดับการเรียกคือ
 *   1) select ใบเติมตาม id (.maybeSingle)
 *   2) update ใบเติม (.eq)
 * เก็บ patch ที่ส่งเข้า update ไว้เพื่อพิสูจน์ว่าไม่มีคอลัมน์เงินถูกแตะ
 */
function fakeSupabaseForUpdate(topup: Row | null) {
  const patches: Record<string, unknown>[] = []
  let calls = 0

  const from = vi.fn((table: string) => {
    if (table !== "member_topups") throw new Error(`ตารางที่ไม่คาดคิด: ${table}`)
    calls++
    if (calls === 1) {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: topup })) })),
        })),
      }
    }
    return {
      update: vi.fn((patch: Record<string, unknown>) => {
        patches.push(patch)
        return { eq: vi.fn(async () => ({ error: null })) }
      }),
    }
  })

  return { client: { from }, patches }
}

const TOPUP_ROW = { id: "topup-9", customer_id: CUST }

describe("updateTopupPaymentMethod", () => {
  beforeEach(() => vi.clearAllMocks())

  it("เขียนเฉพาะ payment_method กับคอลัมน์ผู้แก้ ไม่แตะยอดเงินหรือวันหมดอายุเลย", async () => {
    const fake = fakeSupabaseForUpdate(TOPUP_ROW)
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const result = await updateTopupPaymentMethod("topup-9", "บัตรเครดิต")

    expect(result).toEqual({ ok: true })
    expect(fake.patches).toHaveLength(1)
    const patch = fake.patches[0]
    expect(patch.payment_method).toBe("บัตรเครดิต")
    expect(patch.edited_by).toBe("ผู้จัดการ")
    expect(patch.edited_at).toEqual(expect.any(String))
    // คอลัมน์เงินและวันหมดอายุห้ามโผล่ใน patch แม้แต่ตัวเดียว
    for (const forbidden of [
      "cash_received", "credit_added", "bonus_added",
      "expiry_date", "tier", "topup_date", "customer_id",
    ]) {
      expect(Object.keys(patch)).not.toContain(forbidden)
    }
  })

  it("รับ E-Wallet ได้", async () => {
    const fake = fakeSupabaseForUpdate(TOPUP_ROW)
    vi.mocked(createClient).mockResolvedValue(fake.client as never)
    const result = await updateTopupPaymentMethod("topup-9", "E-Wallet")
    expect(result).toEqual({ ok: true })
    expect(fake.patches[0].payment_method).toBe("E-Wallet")
  })

  it("ช่องทางที่ไม่รู้จักถูกปฏิเสธก่อนแตะฐานข้อมูล", async () => {
    const fake = fakeSupabaseForUpdate(TOPUP_ROW)
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const result = await updateTopupPaymentMethod("topup-9", "Gowabi")

    expect(result.ok).toBe(false)
    expect(fake.patches).toHaveLength(0)
    expect(fake.client.from).not.toHaveBeenCalled()
  })

  it("ไม่พบใบเติมเงิน — คืน error ไม่เขียนอะไร", async () => {
    const fake = fakeSupabaseForUpdate(null)
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const result = await updateTopupPaymentMethod("ไม่มีจริง", "เงินสด")

    expect(result).toEqual({ ok: false, error: "ไม่พบใบเติมเงินนี้" })
    expect(fake.patches).toHaveLength(0)
  })

  it("แก้ใบของเดือนก่อนได้ — ไม่ล็อกเดือนแบบการลบ", async () => {
    // todayInShopTz ถูก mock เป็น 2026-08-11 ใบนี้เป็นของเดือนกรกฎาคม
    const fake = fakeSupabaseForUpdate({ id: "topup-old", customer_id: CUST })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const result = await updateTopupPaymentMethod("topup-old", "บัตรเครดิต")

    expect(result).toEqual({ ok: true })
    expect(fake.patches).toHaveLength(1)
  })
})
```

- [ ] **Step 4: รันเทสต์ให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run "src/app/(app)/members/member-actions.test.ts"`
Expected: FAIL — ยังไม่มี export `updateTopupPaymentMethod`

- [ ] **Step 5: เขียนฟังก์ชันใน `src/app/(app)/members/member-actions.ts`**

เพิ่ม import `getMyProfile` ที่หัวไฟล์:

```ts
import { getMyProfile } from "@/lib/auth"
```

แล้วเพิ่มฟังก์ชันต่อท้ายไฟล์:

```ts
/**
 * แก้ช่องทางชำระเงินของใบเติมเงิน — เขียนคอลัมน์เดียว ไม่แตะยอดเงินหรือวันหมดอายุ
 *
 * ปลอดภัยเพราะไม่มีสูตรไหนในระบบอ่าน payment_method ไปคำนวณเครดิต
 * ยอดคงเหลือของลูกค้าจึงนิ่งสนิทหลังแก้
 *
 * **ไม่ล็อกเดือน** ต่างจาก deleteTopup เพราะช่องทางไม่ทำให้ยอดรวมขยับสักบาท
 * มีแต่ทำให้เดือนที่ปิดไปแล้วถูกต้องขึ้น (เคสจริง: ใบของ "โบว36" 10 ส.ค. 2026 คีย์เป็น
 * QR Code ทั้งที่ลูกค้ารูดบัตร กว่าจะรู้ตัวคือตอนเอาไปเทียบกับ ThaiHand)
 * ที่ตามรอยได้คือ edited_by / edited_at
 *
 * ถ้าจำนวนเงินผิด ห้ามแก้ที่นี่ — ให้ลบใบเดิมแล้วเติมใหม่ผ่าน deleteTopup
 * ซึ่งมีกันชนเรื่องเดือนปิดงบ เครดิตที่ถูกใช้ไปแล้ว และวันหมดอายุที่จะถอยหลัง
 */
export async function updateTopupPaymentMethod(
  id: string,
  method: string
): Promise<TopupResult> {
  if (!(REAL_MONEY_METHODS as readonly string[]).includes(method)) {
    return { ok: false, error: `ช่องทางต้องเป็น ${REAL_MONEY_METHODS.join(" / ")}` }
  }

  const supabase = await createClient()

  const { data: topup } = await supabase
    .from("member_topups")
    .select("id, customer_id")
    .eq("id", id)
    .maybeSingle()
  if (!topup) return { ok: false, error: "ไม่พบใบเติมเงินนี้" }

  const staff = await getMyProfile()
  const { error } = await supabase
    .from("member_topups")
    .update({
      payment_method: method,
      edited_by: staff?.full_name ?? null,
      edited_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  revalidatePath("/members")
  revalidatePath("/today")
  revalidatePath("/reports")
  revalidatePath(`/customers/${topup.customer_id}`)
  return { ok: true }
}
```

- [ ] **Step 6: รันเทสต์ให้ผ่าน**

Run: `npx vitest run "src/app/(app)/members/member-actions.test.ts"`
Expected: PASS ทั้งหมด (รวมเทสต์ `deleteTopup` และ `createTopup` เดิม)

- [ ] **Step 7: type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260813120000_member_topups_edit_audit.sql src/types/database.ts "src/app/(app)/members/member-actions.ts" "src/app/(app)/members/member-actions.test.ts"
git commit -m "feat: แก้ช่องทางชำระเงินของใบเติมเงินได้โดยไม่กระทบเครดิต"
```

---

## Task 8: หน้าประวัติเติมเงิน — แสดงช่องทางและปุ่มแก้

**Files:**
- Modify: `src/app/(app)/members/page.tsx:31,112-120`
- Modify: `src/app/(app)/members/topup-history-list.tsx`

**Interfaces:**
- Consumes: `updateTopupPaymentMethod` จาก `./member-actions` (Task 7) · `REAL_MONEY_METHODS` (Task 1) · `PAY_COLOR`/`PAY_COLOR_DEFAULT` จาก `@/lib/payment-colors` (Task 1)
- Produces: `TopupRow` มีฟิลด์เพิ่ม `paymentMethod: string`

**บริบท:** นี่คือรากของเคสโบว36 — พนักงานกดช่องทางผิดแล้วมองไม่เห็นเลยว่าตัวเองกดอะไรไป เพราะรายการประวัติไม่เคยแสดงช่องทาง

- [ ] **Step 1: แก้ `src/app/(app)/members/page.tsx` — ดึงคอลัมน์และส่งต่อ**

บรรทัด 31 เพิ่ม `payment_method`:

```ts
      .select("id, topup_date, tier, cash_received, credit_added, bonus_added, expiry_date, customer_id, payment_method")
```

บรรทัด 112-120 เพิ่มฟิลด์ใน `topupRows`:

```ts
  const topupRows: TopupRow[] = (topups ?? []).map((t) => ({
    id: t.id,
    customerName: customerName.get(t.customer_id) ?? "ไม่ระบุ",
    tier: t.tier,
    topupDate: t.topup_date,
    expiryDate: t.expiry_date,
    creditAdded: t.credit_added,
    cashReceived: t.cash_received,
    paymentMethod: t.payment_method,
  }))
```

- [ ] **Step 2: แก้ `src/app/(app)/members/topup-history-list.tsx` — import และ type**

เพิ่ม/แก้ import:

```ts
import { deleteTopup, updateTopupPaymentMethod } from "./member-actions"
import { REAL_MONEY_METHODS, formatBaht } from "@/lib/constants"
import { PAY_COLOR, PAY_COLOR_DEFAULT } from "@/lib/payment-colors"
```

เพิ่มฟิลด์ใน `TopupRow`:

```ts
export type TopupRow = {
  id: string
  customerName: string
  tier: string
  topupDate: string
  expiryDate: string
  creditAdded: number
  cashReceived: number
  paymentMethod: string
}
```

- [ ] **Step 3: เพิ่ม state และ handler**

ใต้ `const [confirmState, ...]` และ `const [pending, startTransition] = useTransition()`:

```ts
  // แผงเลือกช่องทางกางทีละแถว — ไม่ต้องยืนยันสองจังหวะเหมือนปุ่มลบ
  // เพราะกดผิดแล้วกดใหม่ได้ ไม่มีข้อมูลไหนเสียหาย
  const [editingId, setEditingId] = useState<string | null>(null)

  function handleChangeMethod(row: TopupRow, method: string) {
    if (method === row.paymentMethod) {
      setEditingId(null)
      return
    }
    startTransition(async () => {
      const r = await updateTopupPaymentMethod(row.id, method)
      if (r.ok) {
        toast.success(`เปลี่ยนช่องทางของ ${row.customerName} เป็น ${method} แล้ว`)
        setEditingId(null)
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }
```

- [ ] **Step 4: แก้โครงของ `<li>` ให้รองรับแผงที่กางออกมา**

แทนที่บล็อก `<li>` ทั้งก้อน (บรรทัด 77-111 ของไฟล์เดิม) ด้วย:

```tsx
            <li key={t.id} className="px-1 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {t.customerName}{" "}
                    <Badge variant="outline" className={TIER_COLOR[t.tier] ?? TIER_COLOR_DEFAULT}>
                      {tierLabel(t.tier)}
                    </Badge>
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatThaiDate(t.topupDate)} · หมดอายุ {formatThaiDate(t.expiryDate)}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={PAY_COLOR[t.paymentMethod] ?? PAY_COLOR_DEFAULT}
                    >
                      {t.paymentMethod}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      className="h-6 px-2 text-xs text-slate-500"
                      onClick={() => setEditingId(editingId === t.id ? null : t.id)}
                    >
                      {editingId === t.id ? "ปิด" : "แก้ช่องทาง"}
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right whitespace-nowrap">
                    <p className="font-semibold">+{formatBaht(t.creditAdded)} ฿</p>
                    <p className="text-xs text-slate-500">รับ {formatBaht(t.cashReceived)} ฿</p>
                  </div>
                  <Button
                    variant={confirmState?.id === t.id ? "destructive" : "ghost"}
                    size="sm"
                    disabled={pending}
                    className={confirmState?.id === t.id ? "" : "text-red-600"}
                    onClick={() => handleDelete(t)}
                  >
                    {confirmState?.id === t.id
                      ? confirmState.shorten
                        ? "ยืนยันอีกครั้ง (วันหมดอายุจะถอย)"
                        : "ยืนยันลบ?"
                      : "ลบ"}
                  </Button>
                </div>
              </div>

              {editingId === t.id && (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t pt-2">
                  {REAL_MONEY_METHODS.map((m) => (
                    <Button
                      key={m}
                      type="button"
                      size="sm"
                      variant={t.paymentMethod === m ? "default" : "outline"}
                      disabled={pending}
                      className="h-9 text-xs"
                      onClick={() => handleChangeMethod(t, m)}
                    >
                      {m}
                    </Button>
                  ))}
                </div>
              )}
            </li>
```

- [ ] **Step 5: แก้ข้อความท้ายรายการ**

แทนที่ `<p className="text-xs text-slate-400">` ท้ายไฟล์:

```tsx
      <p className="text-xs text-slate-400">
        ช่องทางชำระเงินแก้ได้เลยโดยไม่ต้องลบใบ ยอดเครดิตของลูกค้าไม่กระทบ ·
        คีย์ยอดผิดหรือลูกค้าเปลี่ยนแพ็กเกจ (เช่น 5,000 → 10,000): ลบใบเดิมแล้วเติมใหม่ ·
        ลบได้เฉพาะเดือนนี้และเฉพาะใบที่เครดิตยังไม่ถูกใช้
      </p>
```

- [ ] **Step 6: type check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS

- [ ] **Step 7: ตรวจด้วยตาบนเซิร์ฟเวอร์จริง**

Run: เปิด `/members` แล้วไปแท็บ "ประวัติ"
Expected: ทุกแถวมีป้ายช่องทางชำระเงินพร้อมสี · แถวของ "โบว36" 10 ส.ค. แสดง `QR Code`

Run: กด "แก้ช่องทาง" บนแถวใดแถวหนึ่ง
Expected: กางปุ่ม 4 ปุ่ม `เงินสด · QR Code · บัตรเครดิต · E-Wallet` โดยช่องทางปัจจุบันเป็นปุ่มทึบ

Run: เปิดแท็บ "เติมเงิน"
Expected: ปุ่มช่องทางเป็น 4 ปุ่มเรียง 2 คอลัมน์ 2 แถว ไม่มีปุ่มโดดเดี่ยว

**ห้ามกดเปลี่ยนช่องทางของข้อมูลจริงในขั้นนี้** — งานนั้นรอ Boss ตัดสินใจใน Task 9

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/members/page.tsx" "src/app/(app)/members/topup-history-list.tsx"
git commit -m "feat: แสดงและแก้ช่องทางชำระเงินในประวัติเติมเงินสมาชิก"
```

---

## Task 9: ตรวจรับทั้งชุดและขึ้น production

**Files:** ไม่มีไฟล์ใหม่ — งานตรวจรับและ deploy

**Interfaces:**
- Consumes: ทุกอย่างจาก Task 1-8

- [ ] **Step 1: รันชุดตรวจทั้งหมด**

Run: `npm test`
Expected: PASS ทั้งหมด และจำนวนเทสต์ต้องมากกว่าเดิม (ก่อนเริ่มงานนี้ 662 ตัว)

Run: `npx tsc --noEmit`
Expected: ไม่มี error

Run: `npm run lint`
Expected: ไม่มี error

Run: `npm run build`
Expected: build ผ่าน

- [ ] **Step 2: รัน reconciliation ทั้งไฟล์**

รันเนื้อ `supabase/reconciliation.sql` ผ่าน MCP `execute_sql`
Expected: ทุกแถว `result = PASS` ไม่มี FAIL แม้ข้อเดียว

- [ ] **Step 3: ตรวจว่ายอดเงินไม่ขยับจากงานนี้**

```sql
select
  sum(volume)      as volume_total,
  sum(net_revenue) as revenue_total,
  sum(cash_in)     as cash_in_total
from public.v_daily_summary
where sale_date between '2026-08-01' and '2026-08-10';
```

Expected (ค่าที่วัดจริงจากฐานข้อมูลเมื่อ 13 ส.ค. 2026 ก่อนเริ่มงานนี้):

| ตัวเลข | ค่าที่ต้องได้ |
|---|---|
| `volume_total` | `135762` |
| `revenue_total` | `129482.02` |
| `cash_in_total` | `143552` |

ถ้าตัวเลขไม่ตรง **ห้าม deploy** ให้กลับไปหาสาเหตุก่อน — งานนี้ไม่ควรทำให้ยอดใดขยับเลย

> **อย่าตกใจที่ `cash_in` ไม่ได้บวก 550 ตามบิลนิกกี้** บิลนั้นถูกคีย์ย้อนหลังเมื่อ 13 ส.ค.
> ระบบจึงบันทึก `bill_payments.received_date = 2026-08-13` ตามวันที่คีย์ เงิน 550 บาท
> จึงไปโผล่ในยอดเงินเข้าของวันที่ 13 ส.ค. แทนที่จะเป็นวันที่ 2 ส.ค.
> เป็นพฤติกรรมเดิมของระบบ ไม่ได้เกิดจากงานนี้ และ**อยู่นอกขอบเขตของแผนนี้**

- [ ] **Step 4: push แล้ว deploy**

```bash
git fetch && git rebase origin/main
```

ถ้ามี conflict ให้แก้ก่อน แล้ว:

```bash
git push -u origin feat/ewallet-room-fee
```

รอให้ Vercel deploy จาก branch เสร็จ แล้วตรวจ preview URL ก่อนค่อย merge เข้า main

> **สำคัญ:** ห้าม `vercel deploy --prod` ก่อน push — เคยมีเซสชันอื่น push แล้วแย่ง alias
> ทำให้ของที่ deploy ไปหายไปเฉย ๆ

- [ ] **Step 5: ตรวจ production หลัง merge**

Run: เปิด `/reports` ช่วง 1–10 ส.ค. 2026 บน production
Expected: การ์ดรายรับมีบรรทัด `+ ค่าห้องสปา 100` และ `ยอดรับจริง` = 135,762

Run: เปิด `/members` แท็บประวัติ
Expected: ทุกแถวมีป้ายช่องทาง

- [ ] **Step 6: รายงาน Boss เรื่องข้อมูลค้าง 2 รายการ — ห้ามแก้เอง**

รายงานเป็นข้อความ ให้ Boss ตัดสินใจว่าจะให้แก้หรือไม่:

| รายการ | ตอนนี้ | ควรเป็น |
|---|---|---|
| บิล อาลี 9 ส.ค. `SK-20260809-014` 1,290 ฿ | บัตรเครดิต | E-Wallet |
| เติมเงิน โบว36 10 ส.ค. 5,000 ฿ | QR Code | บัตรเครดิต |

แจ้งด้วยว่าแก้ทั้งสองใบแล้วยอดบัตรเครดิตช่วง 1–10 ส.ค. จะเป็น 35,540 บาท เท่ากับ ThaiHand พอดี
และตอนนี้พนักงานแก้ใบเติมเงินเองได้แล้วผ่านหน้า `/members` แท็บประวัติ ส่วนบิลขายแก้ได้ที่หน้ายอดวันนี้

- [ ] **Step 7: อัปเดตความจำโปรเจกต์**

เพิ่มบันทึกลง `sookkaya-money-formula-one-place.md` ว่าสูตร waterfall ของการ์ดรายรับ
ย้ายไปอยู่ที่ `src/lib/revenue-waterfall.ts` แล้ว และรายชื่อช่องทางเงินจริงรวมอยู่ที่
`REAL_MONEY_METHODS` ใน `src/lib/constants.ts` ที่เดียว
