# แก้ช่องทางชำระเงินของบิลขาย — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้พนักงานแก้ช่องทางชำระเงินของบิลขายได้เองจากหน้ายอดวันนี้ โดยไม่ต้องลบบรรทัดชำระทิ้งแล้วเก็บเงินใหม่

**Architecture:** แก้ที่ `bill_payments.method` ซึ่งเป็นที่เก็บความจริงของช่องทาง แล้ว sync `sales.payment_method` (ป้ายสรุปของบิล) ให้เป็นวิธีของบรรทัดที่ยอดสูงสุดด้วย `primaryMethod()` ที่มีอยู่แล้ว · จำกัดช่วงเวลาที่แก้ได้ด้วยหน้าต่างใหม่ใน `accounting-window.ts` (เดือนปัจจุบัน + เดือนก่อนหน้า ไม่มีวันตัด) · หน้าจอเพิ่มปุ่มที่แต่ละบรรทัดในกล่องบรรทัดชำระที่มีอยู่แล้ว

**Tech Stack:** Next.js 16 (App Router, Server Actions) · TypeScript · Supabase Postgres · vitest · Tailwind + shadcn/ui

**สเปก:** `docs/superpowers/specs/2026-08-14-edit-bill-payment-method-design.md`

## Global Constraints

- ยอดเงินทุกตัวห้ามขยับ — งานนี้เปลี่ยนเฉพาะ "ป้ายช่องทาง" ของเงินที่รับมาแล้ว
- ช่องทางที่เลือกได้คือ `REAL_MONEY_METHODS` จาก `@/lib/constants` เท่านั้น (`เงินสด · QR Code · บัตรเครดิต · E-Wallet`) ห้ามพิมพ์ชื่อช่องทางด้วยมือที่ไหนทั้งสิ้น
- วิธีหลักของบิลคำนวณด้วย `primaryMethod()` จาก `@/lib/payments` **ห้ามเขียนสูตรใหม่**
- กติกาเรื่องเดือนอยู่ที่ `src/lib/accounting-window.ts` ที่เดียว **ห้ามเขียนเงื่อนไขเดือนซ้ำที่อื่น**
- วันที่ใช้เวลาไทยผ่าน `todayInShopTz()` เสมอ ห้ามใช้ `new Date()` ดิบ
- คอมเมนต์และข้อความบนหน้าจอเป็นภาษาไทย · ชื่อตัวแปรเป็นภาษาอังกฤษเสมอ
- migration ใช้ MCP `apply_migration` (project `jrioyrmicioqammeevgh`) แล้ว**เก็บสำเนาไฟล์ลง `supabase/migrations/` ด้วยทุกครั้ง** ห้ามรัน `supabase db push` หรือ `supabase db reset`
- ทุกครั้งที่ generate `src/types/database.ts` ใหม่ ต้องใส่คอมเมนต์หัวไฟล์สี่บรรทัดนี้กลับเข้าไปก่อน `export type Json =` เสมอ (generator ไม่ใส่ให้ และนี่คือที่เดียวที่บอกวิธี generate):
  ```ts
  /**
   * Types สร้างจาก Supabase schema
   * อัปเดตใหม่ด้วย: npx supabase gen types typescript --project-id jrioyrmicioqammeevgh
   */
  ```
- ห้ามแก้ข้อมูลจริงในฐานข้อมูล — งานนี้ไม่มีขั้นตอนแก้ข้อมูล
- ขึ้น production: `git fetch && git rebase origin/main && git push` แล้วสั่ง `vercel deploy --prod` เอง — การ push เข้า main **ไม่ได้** deploy อัตโนมัติ

## แผนผังไฟล์

| ไฟล์ | หน้าที่ | สถานะ |
|---|---|---|
| `src/lib/accounting-window.ts` | กติกาว่าเดือนไหนยังแก้ได้ — ที่เดียวในระบบ | แก้ (Task 1) |
| `src/lib/accounting-window.test.ts` | เทสต์กติกาเดือน | แก้ (Task 1) |
| `supabase/migrations/20260814100000_bill_payments_edit_audit.sql` | `bill_payments` += `edited_by`/`edited_at` | สร้าง (Task 2) |
| `src/types/database.ts` | type ที่ generate จากฐานข้อมูล | regenerate (Task 2) |
| `src/app/(app)/payment-actions.ts` | server action ของบรรทัดชำระ | แก้ (Task 3) |
| `src/app/(app)/payment-actions.test.ts` | เทสต์ server action | แก้ (Task 3) |
| `src/app/(app)/today/edit-sale-dialog.tsx` | กล่องแก้บิลในหน้ายอดวันนี้ | แก้ (Task 4) |

---

## Task 1: หน้าต่างเวลาของการแก้ช่องทาง

**Files:**
- Modify: `src/lib/accounting-window.ts`
- Test: `src/lib/accounting-window.test.ts`

**Interfaces:**
- Produces: `canEditPaymentMethodOn(recordDate: string, today: string): boolean` export จาก `@/lib/accounting-window` — Task 3 ใช้ตัวนี้

**บริบท:** ไฟล์นี้มีกติกาของ**รายจ่าย**อยู่แล้ว (`canEditExpenseOn` — เดือนก่อนแก้ได้ถึงวันที่ 3 ของเดือนถัดไป) งานนี้เพิ่มหน้าต่างที่**ผ่อนกว่า** สำหรับการแก้ช่องทางชำระเงิน: เดือนปัจจุบันและเดือนก่อนหน้าแก้ได้ **ไม่มีวันตัด**

เหตุผลที่ผ่อนกว่า: การแก้ช่องทางไม่ทำให้ยอดรวมของเดือนขยับสักบาท มันย้ายแค่ป้ายว่าเงินก้อนเดิมเข้ามาทางไหน งบที่ส่งออกไปแล้วจึงไม่เปลี่ยน ต่างจากรายจ่ายที่การแก้ทำให้ยอดเดือนขยับจริง

ไฟล์นี้มี helper ส่วนตัวอยู่แล้วสองตัวคือ `monthOf(isoDate)` และ `monthsBetween(a, b)` — **ใช้สองตัวนี้ ห้ามเขียนสูตรนับเดือนใหม่** (สูตรลบเดือนแบบง่าย ๆ พังตอนข้ามปี ซึ่งเทสต์เดิมมีดักไว้แล้ว)

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

ต่อท้าย `src/lib/accounting-window.test.ts` (อย่าแก้ `describe("canEditExpenseOn")` เดิมแม้แต่ตัวอักษรเดียว):

```ts
describe("canEditPaymentMethodOn (ผ่อนกว่ารายจ่าย — ไม่มีวันตัด)", () => {
  it("เดือนปัจจุบันแก้ได้ทุกวัน", () => {
    expect(canEditPaymentMethodOn("2026-08-01", "2026-08-14")).toBe(true)
    expect(canEditPaymentMethodOn("2026-08-31", "2026-08-31")).toBe(true)
  })

  // จุดที่ต่างจากรายจ่ายชัดที่สุด — วันเดียวกันนี้ canEditExpenseOn ตอบ false ไปแล้ว
  it("เดือนก่อนหน้าแก้ได้ตลอด แม้พ้นวันที่ 3 ไปแล้ว", () => {
    expect(canEditPaymentMethodOn("2026-07-31", "2026-08-04")).toBe(true)
    expect(canEditPaymentMethodOn("2026-07-01", "2026-08-31")).toBe(true)
    expect(canEditExpenseOn("2026-07-01", "2026-08-31")).toBe(false)
  })

  it("สองเดือนก่อนขึ้นไปปิดถาวร", () => {
    expect(canEditPaymentMethodOn("2026-06-30", "2026-08-01")).toBe(false)
    expect(canEditPaymentMethodOn("2026-01-15", "2026-08-14")).toBe(false)
  })

  // ข้ามปีเป็นจุดที่สูตรลบเดือนแบบง่ายๆ พังบ่อย
  it("ข้ามปีต้องนับถูก — ธ.ค. ยังแก้ได้ตลอดเดือน ม.ค.", () => {
    expect(canEditPaymentMethodOn("2026-12-31", "2027-01-31")).toBe(true)
    expect(canEditPaymentMethodOn("2026-11-30", "2027-01-01")).toBe(false)
  })

  it("เดือนอนาคตแก้ไม่ได้ กันคีย์ปีผิดแล้วไปโผล่งบเดือนหน้า", () => {
    expect(canEditPaymentMethodOn("2026-09-01", "2026-08-31")).toBe(false)
  })
})
```

แก้บรรทัด import บนสุดของไฟล์เป็น:

```ts
import { CLOSE_GRACE_DAYS, canEditExpenseOn, canEditPaymentMethodOn } from "./accounting-window"
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run src/lib/accounting-window.test.ts`
Expected: FAIL — ไม่มี export ชื่อ `canEditPaymentMethodOn`

- [ ] **Step 3: เพิ่มฟังก์ชันใน `src/lib/accounting-window.ts`**

ต่อท้ายไฟล์ (หลัง `canEditExpenseOn`):

```ts
/**
 * แก้ "ช่องทางชำระเงิน" ของบิลวันที่ `recordDate` ได้ไหม ถ้าวันนี้คือ `today`
 * (ทั้งคู่เป็น ISO "YYYY-MM-DD" ตามเวลาไทย)
 *
 * ผ่อนกว่ารายจ่าย: เดือนปัจจุบันและเดือนก่อนหน้าแก้ได้ตลอด **ไม่มีวันตัด**
 * เพราะการเปลี่ยนช่องทางไม่ทำให้ยอดรวมของเดือนขยับสักบาท มันย้ายแค่ป้ายว่าเงินก้อนเดิม
 * เข้ามาทางไหน งบที่ส่งออกไปแล้วจึงไม่เปลี่ยน ต่างจากรายจ่ายที่การแก้ทำให้ยอดเดือนขยับจริง
 *
 * ที่ยังปิดสองเดือนขึ้นไป เพราะพ้นจากนั้นไม่มีใครจำได้แล้วว่าลูกค้าจ่ายด้วยอะไร
 * การแก้จึงเป็นการเดา ไม่ใช่การแก้ให้ถูก
 */
export function canEditPaymentMethodOn(recordDate: string, today: string): boolean {
  const gap = monthsBetween(monthOf(today), monthOf(recordDate))
  // เดือนเดียวกัน (0) หรือเดือนก่อนหน้าพอดี (1) — ติดลบคืออนาคต ห้ามเสมอ
  return gap === 0 || gap === 1
}
```

- [ ] **Step 4: แก้คอมเมนต์หัวไฟล์ให้ตรงความจริง**

บล็อกคอมเมนต์บนสุดของ `src/lib/accounting-window.ts` ปัจจุบันปิดท้ายด้วยบรรทัดนี้:

```
 * หมายเหตุ: บิลขายกับใบเติมเงินสมาชิกยังใช้กติกาเดิม (เฉพาะเดือนปัจจุบัน)
 * เพราะเป็นเงินที่รับจากลูกค้าหน้าร้าน ไม่ได้รอใบเสร็จเหมือนรายจ่าย
```

แทนที่สองบรรทัดนั้นด้วย:

```
 * ไฟล์นี้มีสองหน้าต่าง อย่าสลับกันใช้:
 *   canEditExpenseOn        — รายจ่าย · เดือนก่อนถึงวันที่ 3 ของเดือนถัดไป (ยอดเดือนขยับจริง)
 *   canEditPaymentMethodOn  — ช่องทางชำระของบิลขาย · เดือนก่อนตลอดเดือน ไม่มีวันตัด
 *                             (ย้ายแค่ป้ายช่องทาง ยอดรวมไม่ขยับ จึงผ่อนได้)
 *
 * ส่วนที่ไม่ได้ใช้ไฟล์นี้: การแก้/ลบบิลขายเรื่องอื่น (updateSale/deleteSale) จำกัดเฉพาะ
 * เดือนปัจจุบัน · ใบเติมเงินสมาชิกแก้ช่องทางย้อนหลังได้ไม่จำกัดเดือน (Boss ตัดสิน 14 ส.ค. 2026
 * — เติมเงินมีน้อยและมักเจอที่ผิดตอนกระทบยอดข้ามเดือน ถ้าล็อกจะแก้ไม่ได้เลย)
```

- [ ] **Step 5: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/lib/accounting-window.test.ts`
Expected: PASS ทุกข้อ รวมเทสต์เดิมของ `canEditExpenseOn` ทั้ง 7 ข้อ

- [ ] **Step 6: Commit**

```bash
git add src/lib/accounting-window.ts src/lib/accounting-window.test.ts
git commit -m "feat: หน้าต่างเวลาสำหรับแก้ช่องทางชำระเงิน (เดือนก่อนหน้าตลอดเดือน)"
```

---

## Task 2: คอลัมน์บันทึกผู้แก้ใน `bill_payments`

**Files:**
- Create: `supabase/migrations/20260814100000_bill_payments_edit_audit.sql`
- Modify: `src/types/database.ts` (regenerate)

**Interfaces:**
- Produces: `bill_payments.edited_by (text, null ได้)` และ `bill_payments.edited_at (timestamptz, null ได้)` — Task 3 เขียนสองคอลัมน์นี้

**บริบท:** ตาราง `bill_payments` มี `created_by` อยู่แล้วแต่ไม่มีช่องบอกผู้แก้ไข พอเปิดให้พนักงานทุกคนแก้ช่องทางได้ (ไม่จำกัด role) จึงต้องตามรอยได้ว่าใครเปลี่ยนอะไรเมื่อไหร่ — แนวเดียวกับที่ `member_topups` เพิ่งเพิ่มไปเมื่อ 13 ส.ค. 2026

ตารางนี้มี 198 แถวจาก 193 บิล การเพิ่มคอลัมน์ nullable ล้วนไม่กระทบแถวเดิม

- [ ] **Step 1: เขียนไฟล์ migration**

สร้าง `supabase/migrations/20260814100000_bill_payments_edit_audit.sql`:

```sql
-- บันทึกว่าใครแก้ช่องทางชำระเงินของบรรทัดชำระเมื่อไหร่
--
-- เปิดให้พนักงานทุกคนแก้ช่องทางได้ (ไม่จำกัด role เหมือนการลบบรรทัด) เพราะการแก้ช่องทาง
-- ไม่ขยับยอดเงินสักบาท แต่ต้องตามรอยได้ว่าใครเปลี่ยน — คอลัมน์คู่นี้คือสิ่งที่ทำให้ตามรอยได้
-- แนวเดียวกับ member_topups.edited_by/edited_at ที่เพิ่มไปเมื่อ 13 ส.ค. 2026
--
-- nullable ล้วน แถวเดิมทั้ง 198 แถวไม่กระทบ

alter table public.bill_payments add column if not exists edited_by text;
alter table public.bill_payments add column if not exists edited_at timestamptz;

comment on column public.bill_payments.edited_by is
  'ชื่อพนักงานที่แก้ช่องทางชำระเงินล่าสุด — null = ยังไม่เคยถูกแก้';
comment on column public.bill_payments.edited_at is
  'เวลาที่แก้ช่องทางชำระเงินล่าสุด';
```

- [ ] **Step 2: apply migration ผ่าน MCP**

ใช้ MCP tool `apply_migration` กับ project `jrioyrmicioqammeevgh`
ชื่อ migration: `bill_payments_edit_audit`
เนื้อ: SQL จาก Step 1

ห้ามรัน `supabase db push` หรือ `supabase db reset`

- [ ] **Step 3: ตรวจว่าคอลัมน์ขึ้นจริงและข้อมูลเดิมไม่กระทบ**

รันผ่าน MCP `execute_sql`:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'bill_payments' and column_name in ('edited_by','edited_at')
order by column_name;
```

Expected: 2 แถว · `edited_at` เป็น `timestamp with time zone` · `edited_by` เป็น `text` · ทั้งคู่ `is_nullable = YES`

```sql
select count(*) as แถวทั้งหมด,
       count(*) filter (where edited_by is null and edited_at is null) as ยังไม่เคยแก้
from public.bill_payments;
```

Expected: สองตัวเลขเท่ากัน (198 = 198) — ยืนยันว่าไม่มีแถวเดิมถูกเขียนทับ

- [ ] **Step 4: regenerate types**

ใช้ MCP `generate_typescript_types` กับ project `jrioyrmicioqammeevgh` แล้วเขียนทับ `src/types/database.ts` ทั้งไฟล์ **แล้วใส่คอมเมนต์หัวไฟล์สี่บรรทัดกลับเข้าไป** ก่อน `export type Json =` (ดู Global Constraints)

Run: `npx tsc --noEmit`
Expected: ไม่มี error

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260814100000_bill_payments_edit_audit.sql src/types/database.ts
git commit -m "feat(db): เพิ่ม edited_by/edited_at ใน bill_payments"
```

---

## Task 3: Server action `updateBillPaymentMethod`

**Files:**
- Modify: `src/app/(app)/payment-actions.ts`
- Test: `src/app/(app)/payment-actions.test.ts`

**Interfaces:**
- Consumes: `canEditPaymentMethodOn` จาก `@/lib/accounting-window` (Task 1) · คอลัมน์ `edited_by`/`edited_at` (Task 2)
- Produces: `updateBillPaymentMethod(paymentId: string, method: string): Promise<{ ok: true } | { ok: false; error: string }>` export จาก `../payment-actions` — Task 4 เรียกตัวนี้

**บริบทสำคัญ — ทำไมต้องเขียนสองตาราง:** ช่องทางจริงของบิลอยู่ที่ `bill_payments` ส่วน `sales.payment_method` เป็นป้ายสรุป ถ้าแก้แค่ที่เดียวข้อตรวจ `tracked_bill_method_mismatch` ใน `supabase/reconciliation.sql` จะ FAIL ทันที ข้อตรวจนั้นเทียบ `sales.payment_method` กับวิธีของบรรทัดที่ยอดสูงสุดในบิลเดียวกัน

**และบิลหนึ่งใบมีได้หลายแถวใน `sales`** (บิลชุด — หลายรายการรวมบิลเดียว ผูกกันด้วย `bill_id`) จึงต้องอัปเดต `payment_method` ให้ครบทุกแถวของบิล ไม่ใช่แถวเดียว ปัจจุบันมีบิลชุดอยู่ในระบบจริง

`bill_key` ของบิลคือ `coalesce(sales.bill_id, sales.id)` — ฝั่ง PostgREST เลือกทุกแถวของบิลด้วย `.or("bill_id.eq.<key>,id.eq.<key>")` แบบเดียวกับที่ `deleteSale` ทำใน `sale-actions.ts:605`

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

ไฟล์ `src/app/(app)/payment-actions.test.ts` มีอยู่แล้ว มี mock ของ `next/cache` · `@/lib/auth` · `@/lib/supabase/server` · `@/lib/datetime` (ตรึง `todayInShopTz` ไว้ที่ `"2026-08-13"`) และมี `describe("addBillPayment — วันเงินเข้า")` อยู่

แก้ mock ของ datetime ให้ตรึงเป็น `"2026-08-14"` (วันที่ของงานนี้ — เดือน ก.ค. จึงเป็น "เดือนก่อนหน้า" และ มิ.ย. เป็น "สองเดือนก่อน") แล้วตรวจว่าเทสต์ `addBillPayment` เดิมยังผ่าน (มันตรวจ `received_date` เท่ากับค่าที่ตรึงไว้ ต้องแก้ค่าที่คาดหวังตามด้วย):

```ts
vi.mock("@/lib/datetime", () => ({ todayInShopTz: vi.fn(() => "2026-08-14") }))
```

และในเทสต์ `"เก็บเงินบิลค้างรับของวันก่อน วันเงินเข้าต้องเป็นวันนี้ ไม่ใช่วันที่ของบิล"` แก้บรรทัดสุดท้ายเป็น:

```ts
    expect(fake.inserted[0].received_date).toBe("2026-08-14")
```

เพิ่ม import:

```ts
import { addBillPayment, updateBillPaymentMethod } from "./payment-actions"
```

แล้วต่อท้ายไฟล์:

```ts
type PaymentRow = { id: string; bill_key: string; method: string; amount: number }

/**
 * supabase ปลอมสำหรับ updateBillPaymentMethod — ลำดับการเรียกคงที่:
 *   1) bill_payments  select บรรทัดตาม id (.maybeSingle)
 *   2) sales          select บิลของ bill_key เพื่อเอา sale_date (.limit .maybeSingle)
 *   3) bill_payments  update บรรทัดนั้น (.select .maybeSingle)
 *   4) bill_payments  select บรรทัดทั้งหมดของบิล (await ตรง ๆ) — ใช้หาวิธีหลักใหม่
 *   5) sales          update ทุกแถวของบิล (.or)
 * ใช้ตัวนับครั้งที่เรียกแยกพฤติกรรม แทนการเดาจาก field ที่ eq() กรอง
 */
function fakeSupabase(cfg: {
  line: PaymentRow | null
  saleDate: string | null
  /** บรรทัดทั้งหมดของบิล "หลังแก้แล้ว" ที่ขั้นที่ 4 จะคืนกลับมา */
  linesAfter: { method: string; amount: number }[]
}) {
  const patches: Record<string, unknown>[] = []
  const salePatches: Record<string, unknown>[] = []
  const saleFilters: string[] = []
  let billPaymentsCalls = 0
  let salesCalls = 0

  const from = vi.fn((table: string) => {
    if (table === "bill_payments") {
      billPaymentsCalls++
      const n = billPaymentsCalls
      if (n === 1) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: cfg.line })) })),
          })),
        }
      }
      if (n === 2) {
        return {
          update: vi.fn((patch: Record<string, unknown>) => {
            patches.push(patch)
            return {
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: cfg.line ? { id: cfg.line.id } : null,
                    error: null,
                  })),
                })),
              })),
            }
          }),
        }
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: cfg.linesAfter, error: null })),
        })),
      }
    }
    if (table === "sales") {
      salesCalls++
      if (salesCalls === 1) {
        return {
          select: vi.fn(() => ({
            or: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: cfg.saleDate ? { sale_date: cfg.saleDate } : null,
                })),
              })),
            })),
          })),
        }
      }
      return {
        update: vi.fn((patch: Record<string, unknown>) => {
          salePatches.push(patch)
          return {
            or: vi.fn(async (filter: string) => {
              saleFilters.push(filter)
              return { error: null }
            }),
          }
        }),
      }
    }
    throw new Error(`ตารางที่ไม่คาดคิด: ${table}`)
  })

  return { client: { from }, patches, salePatches, saleFilters }
}

const LINE = { id: "line-1", bill_key: BILL, method: "บัตรเครดิต", amount: 1290 }

describe("updateBillPaymentMethod", () => {
  beforeEach(() => vi.clearAllMocks())

  it("แก้บิลบรรทัดเดียว — เปลี่ยนทั้งบรรทัดชำระและวิธีหลักของบิล", async () => {
    const fake = fakeSupabase({
      line: LINE,
      saleDate: "2026-08-14",
      linesAfter: [{ method: "E-Wallet", amount: 1290 }],
    })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentMethod("line-1", "E-Wallet")

    expect(r).toEqual({ ok: true })
    expect(fake.patches[0].method).toBe("E-Wallet")
    expect(fake.salePatches[0].payment_method).toBe("E-Wallet")
  })

  it("เขียนลงบรรทัดชำระเฉพาะ 3 คีย์ ห้ามแตะยอดเงินหรือวันเงินเข้า", async () => {
    const fake = fakeSupabase({
      line: LINE,
      saleDate: "2026-08-14",
      linesAfter: [{ method: "เงินสด", amount: 1290 }],
    })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    await updateBillPaymentMethod("line-1", "เงินสด")

    // whitelist ชุดคีย์ ไม่ใช่ blacklist — คอลัมน์ใหม่ที่ยังไม่มีในลิสต์ต้องทำให้เทสต์แดง
    expect(Object.keys(fake.patches[0]).sort()).toEqual([
      "edited_at",
      "edited_by",
      "method",
    ])
  })

  it("บิลชุดหลายแถว — ต้องอัปเดต payment_method ครบทุกแถวของบิล ไม่ใช่แถวเดียว", async () => {
    // บิลชุดคือหลายรายการรวมบิลเดียว ผูกกันด้วย sales.bill_id
    // ถ้าอัปเดตแค่แถวเดียว ข้อตรวจ tracked_bill_method_mismatch จะ FAIL
    // ตัวกรองต้องครอบทั้ง bill_id และ id เพราะแถวแรกของบิลใช้ id ตัวเองเป็น bill_key
    const fake = fakeSupabase({
      line: LINE,
      saleDate: "2026-08-14",
      linesAfter: [{ method: "E-Wallet", amount: 1290 }],
    })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    await updateBillPaymentMethod("line-1", "E-Wallet")

    expect(fake.saleFilters).toHaveLength(1)
    expect(fake.saleFilters[0]).toBe(`bill_id.eq.${BILL},id.eq.${BILL}`)
  })

  it("บิลแบ่งจ่าย 2 บรรทัด แก้บรรทัดเล็ก วิธีหลักของบิลต้องไม่เปลี่ยน", async () => {
    // บิลจริง: บัตร 650 + QR 240 — แก้บรรทัด 240 เป็นเงินสด วิธีหลักยังต้องเป็นบัตร
    const fake = fakeSupabase({
      line: { id: "line-small", bill_key: BILL, method: "QR Code", amount: 240 },
      saleDate: "2026-08-14",
      linesAfter: [
        { method: "บัตรเครดิต", amount: 650 },
        { method: "เงินสด", amount: 240 },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    await updateBillPaymentMethod("line-small", "เงินสด")

    expect(fake.patches[0].method).toBe("เงินสด")
    expect(fake.salePatches[0].payment_method).toBe("บัตรเครดิต")
  })

  it("บิลแบ่งจ่าย 2 บรรทัด แก้บรรทัดใหญ่ วิธีหลักของบิลต้องเปลี่ยนตาม", async () => {
    const fake = fakeSupabase({
      line: { id: "line-big", bill_key: BILL, method: "บัตรเครดิต", amount: 650 },
      saleDate: "2026-08-14",
      linesAfter: [
        { method: "E-Wallet", amount: 650 },
        { method: "QR Code", amount: 240 },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    await updateBillPaymentMethod("line-big", "E-Wallet")

    expect(fake.salePatches[0].payment_method).toBe("E-Wallet")
  })

  it("ช่องทางที่ไม่รู้จักถูกปฏิเสธก่อนแตะฐานข้อมูล", async () => {
    const fake = fakeSupabase({ line: LINE, saleDate: "2026-08-14", linesAfter: [] })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentMethod("line-1", "Gowabi")

    expect(r.ok).toBe(false)
    expect(fake.client.from).not.toHaveBeenCalled()
  })

  it("ไม่พบบรรทัดชำระ — คืน error ไม่เขียนอะไร", async () => {
    const fake = fakeSupabase({ line: null, saleDate: "2026-08-14", linesAfter: [] })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentMethod("ไม่มีจริง", "เงินสด")

    expect(r).toEqual({ ok: false, error: "ไม่พบบรรทัดชำระนี้" })
    expect(fake.patches).toHaveLength(0)
  })

  it("บิลของสองเดือนก่อน — ปิดงบแล้ว แก้ไม่ได้", async () => {
    // วันนี้ตรึงไว้ 2026-08-14 · บิลเดือน มิ.ย. ห่างสองเดือน
    const fake = fakeSupabase({ line: LINE, saleDate: "2026-06-20", linesAfter: [] })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentMethod("line-1", "เงินสด")

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("2026-06")
    expect(fake.patches).toHaveLength(0)
  })

  it("บิลของเดือนก่อนหน้า แม้พ้นวันที่ 3 ไปแล้วก็ยังแก้ได้", async () => {
    // วันนี้ 14 ส.ค. — ถ้าเผลอไปเรียก canEditExpenseOn เทสต์ข้อนี้จะแดงทันที
    const fake = fakeSupabase({
      line: LINE,
      saleDate: "2026-07-20",
      linesAfter: [{ method: "เงินสด", amount: 1290 }],
    })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentMethod("line-1", "เงินสด")

    expect(r).toEqual({ ok: true })
    expect(fake.patches).toHaveLength(1)
  })
})
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run "src/app/(app)/payment-actions.test.ts"`
Expected: FAIL — ไม่มี export ชื่อ `updateBillPaymentMethod`

- [ ] **Step 3: เขียนฟังก์ชันใน `src/app/(app)/payment-actions.ts`**

เพิ่ม import ที่หัวไฟล์:

```ts
import { REAL_MONEY_METHODS } from "@/lib/constants"
import { primaryMethod } from "@/lib/payments"
import { canEditPaymentMethodOn } from "@/lib/accounting-window"
```

แล้วเพิ่มฟังก์ชันต่อท้ายไฟล์:

```ts
/**
 * แก้ช่องทางชำระเงินของบรรทัดชำระหนึ่งบรรทัด แล้วอัปเดตวิธีหลักของบิลตาม
 *
 * ช่องทางจริงอยู่ที่ bill_payments ส่วน sales.payment_method เป็นป้ายสรุปของบิล
 * ถ้าเขียนแค่ที่เดียว ข้อตรวจ tracked_bill_method_mismatch ใน reconciliation.sql จะ FAIL
 * และบิลชุดมีได้หลายแถวใน sales จึงต้องอัปเดตครบทุกแถวของบิล ไม่ใช่แถวเดียว
 *
 * ไม่ตรวจ role — พนักงานทุกคนแก้ได้ ต่างจาก deleteBillPayment ที่จำกัด admin/manager
 * เพราะการลบทำให้บิลกลายเป็นค้างรับ (เงินหายจากยอดเงินเข้า) แต่การแก้ช่องทางไม่ขยับยอดใดเลย
 * ตัวที่ทำให้ตามรอยได้คือ edited_by / edited_at
 *
 * ห้ามแตะ amount / received_date / received_at / bill_key — เงินไม่ขยับ วันไม่ขยับ
 */
export async function updateBillPaymentMethod(
  paymentId: string,
  method: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(REAL_MONEY_METHODS as readonly string[]).includes(method))
    return { ok: false, error: `ช่องทางต้องเป็น ${REAL_MONEY_METHODS.join(" / ")}` }

  const supabase = await createClient()

  const { data: line } = await supabase
    .from("bill_payments")
    .select("id, bill_key")
    .eq("id", paymentId)
    .maybeSingle()
  if (!line) return { ok: false, error: "ไม่พบบรรทัดชำระนี้" }

  const billKey = String(line.bill_key)

  // วันที่ของบิลใช้ตัดสินหน้าต่างเวลา — บิลชุดทุกแถวมี sale_date เดียวกัน หยิบแถวไหนก็ได้
  const { data: bill } = await supabase
    .from("sales")
    .select("sale_date")
    .or(`bill_id.eq.${billKey},id.eq.${billKey}`)
    .limit(1)
    .maybeSingle()
  if (!bill) return { ok: false, error: "ไม่พบบิลของบรรทัดชำระนี้" }

  const saleDate = String(bill.sale_date)
  if (!canEditPaymentMethodOn(saleDate, todayInShopTz())) {
    return {
      ok: false,
      error: `บิลเดือน ${saleDate.slice(0, 7)} ปิดงบแล้ว — แก้ช่องทางได้เฉพาะเดือนปัจจุบันและเดือนก่อนหน้าเท่านั้น`,
    }
  }

  const staff = await getMyProfile()
  const editedBy = staff?.full_name ?? null
  const editedAt = new Date().toISOString()

  const { data: updated, error } = await supabase
    .from("bill_payments")
    .update({ method, edited_by: editedBy, edited_at: editedAt })
    .eq("id", paymentId)
    .select("id")
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  // อัปเดต 0 แถวแต่ไม่มี error = RLS ปฏิเสธเงียบ ถ้าไม่ดักตรงนี้หน้าจอจะขึ้นว่าสำเร็จทั้งที่ไม่มีอะไรเปลี่ยน
  if (!updated) return { ok: false, error: "แก้ไม่สำเร็จ — สิทธิ์ไม่พอหรือบรรทัดนี้ถูกลบไปแล้ว" }

  // วิธีหลักของบิล = วิธีของบรรทัดที่ยอดสูงสุด — อ่านสดหลังแก้แล้วให้ primaryMethod ตัดสิน
  // (ห้ามเดาจากบรรทัดที่เพิ่งแก้ บิลแบ่งจ่ายอาจมีบรรทัดอื่นที่ใหญ่กว่า)
  const { data: allLines } = await supabase
    .from("bill_payments")
    .select("method, amount")
    .eq("bill_key", billKey)
  const lines = (allLines ?? []).map((l) => ({
    method: String(l.method),
    amount: Number(l.amount),
  }))
  const primary = primaryMethod(lines)

  if (primary) {
    await supabase
      .from("sales")
      .update({ payment_method: primary, edited_by: editedBy })
      .or(`bill_id.eq.${billKey},id.eq.${billKey}`)
  }

  revalidatePath("/today")
  revalidatePath("/reports")
  revalidatePath("/history")
  revalidatePath("/queue")
  revalidatePath("/overview")
  return { ok: true }
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run "src/app/(app)/payment-actions.test.ts"`
Expected: PASS ทุกข้อ รวมเทสต์ `addBillPayment` เดิม

- [ ] **Step 5: พิสูจน์ว่าเทสต์หน้าต่างเวลาจับได้จริง**

เปลี่ยน `canEditPaymentMethodOn` ในโค้ดเป็น `canEditExpenseOn` ชั่วคราว (แก้ import ด้วย) แล้วรันเทสต์

Run: `npx vitest run "src/app/(app)/payment-actions.test.ts"`
Expected: FAIL ที่เทสต์ `"บิลของเดือนก่อนหน้า แม้พ้นวันที่ 3 ไปแล้วก็ยังแก้ได้"`

แล้ว**คืนโค้ดกลับเป็น `canEditPaymentMethodOn`** และรันซ้ำให้ผ่าน — ถ้าไม่ล้มแปลว่าเทสต์ข้อนั้นไม่ได้ทดสอบอะไรเลย ต้องแก้เทสต์ก่อนไปต่อ

- [ ] **Step 6: type check และเทสต์ทั้งชุด**

Run: `npx tsc --noEmit && npm test`
Expected: PASS ทั้งหมด

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/payment-actions.ts" "src/app/(app)/payment-actions.test.ts"
git commit -m "feat: แก้ช่องทางชำระเงินของบรรทัดชำระได้ พร้อม sync วิธีหลักของบิล"
```

---

## Task 4: ปุ่มแก้ช่องทางในกล่องแก้บิล

**Files:**
- Modify: `src/app/(app)/today/edit-sale-dialog.tsx`

**Interfaces:**
- Consumes: `updateBillPaymentMethod(paymentId, method)` จาก `../payment-actions` (Task 3) · `REAL_MONEY_METHODS` จาก `@/lib/constants`

**บริบท:** กล่อง "บรรทัดชำระของบิล" อยู่ที่บรรทัด 663-717 แสดงรายการบรรทัดชำระพร้อมปุ่มลบ (เฉพาะ admin/manager) `BillPaymentLine` มีฟิลด์ `id` อยู่แล้ว จึงไม่ต้องแก้ฝั่ง `today/page.tsx` หรือ `history/page.tsx`

ปุ่มลบในหน้านี้ยืนยันด้วย `window.confirm` (บรรทัด 196) ไม่ได้ถือสถานะยืนยันค้างไว้ระหว่างเรนเดอร์ จึง**ไม่มี**ปัญหาสถานะค้างแบบที่เจอในหน้าประวัติเติมเงิน — ใช้ `paymentPending` ร่วมกันพอ

- [ ] **Step 1: เพิ่ม import และ state**

เพิ่ม `updateBillPaymentMethod` เข้าบรรทัด import เดิม (บรรทัด 9):

```ts
import { deleteBillPayment, updateBillPaymentMethod } from "../payment-actions"
```

เพิ่ม `REAL_MONEY_METHODS` เข้าบล็อก import จาก `@/lib/constants` (บรรทัด 15-21) โดยเรียงตามลำดับตัวอักษรเดิมของบล็อกนั้น

เพิ่ม state ถัดจาก `const [deletingPaymentId, ...]` (บรรทัด 192):

```ts
  // แผงเลือกช่องทางกางทีละบรรทัด — เก็บ id เดียว การกางบรรทัดใหม่จึงปิดบรรทัดเก่าเอง
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null)
```

- [ ] **Step 2: เพิ่ม handler ถัดจาก `handleDeletePayment`**

```ts
  function handleChangePaymentMethod(p: BillPaymentLine, method: string) {
    // เลือกช่องทางเดิมซ้ำ = ปิดแผงเฉย ๆ ไม่ต้องยิง action ให้เปลืองรอบ
    if (method === p.method) {
      setEditingPaymentId(null)
      return
    }
    startPaymentTransition(async () => {
      const r = await updateBillPaymentMethod(p.id, method)
      if (r.ok) {
        toast.success(`เปลี่ยนช่องทางเป็น ${method} แล้ว`)
        setEditingPaymentId(null)
        router.refresh()
      } else {
        // ล้มเหลวให้เปิดแผงค้างไว้ พนักงานจะได้เห็นว่ายังไม่สำเร็จและลองใหม่ได้ทันที
        toast.error(r.error)
      }
    })
  }
```

- [ ] **Step 3: เพิ่มปุ่มและแผงในรายการบรรทัดชำระ**

แทนที่บล็อก `<li>` ทั้งก้อน (บรรทัด 684-706 ของไฟล์เดิม) ด้วย:

```tsx
              {payments.map((p, idx) => (
                <li key={p.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">
                      แบ่งจ่ายครั้งที่ {idx + 1} ({p.method}) · {formatBaht(p.amount)} ฿ ·{" "}
                      {p.received_date}
                      {p.received_at
                        ? ` (${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(p.received_at))})`
                        : ""}
                    </span>
                    <span className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-slate-500"
                        disabled={paymentPending}
                        onClick={() =>
                          setEditingPaymentId(editingPaymentId === p.id ? null : p.id)
                        }
                      >
                        {editingPaymentId === p.id ? "ปิด" : "แก้ช่องทาง"}
                      </Button>
                      {canDeletePayments && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          disabled={paymentPending && deletingPaymentId === p.id}
                          onClick={() => handleDeletePayment(p)}
                        >
                          {paymentPending && deletingPaymentId === p.id ? "กำลังลบ..." : "ลบ"}
                        </Button>
                      )}
                    </span>
                  </div>
                  {editingPaymentId === p.id && (
                    <div className="flex flex-wrap gap-1.5 border-t pt-1.5">
                      {REAL_MONEY_METHODS.map((m) => (
                        <Button
                          key={m}
                          type="button"
                          size="sm"
                          variant={p.method === m ? "default" : "outline"}
                          disabled={paymentPending}
                          className="h-8 text-xs"
                          onClick={() => handleChangePaymentMethod(p, m)}
                        >
                          {m}
                        </Button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
```

- [ ] **Step 4: แก้ข้อความแนะนำที่ล้าสมัย**

แทนที่บล็อกบรรทัด 712-717 (ข้อความ `"ชำระเงินครบแล้ว — หากต้องการเปลี่ยนช่องทางการชำระเงิน กรุณาลบบรรทัดแบ่งจ่ายก่อน (เฉพาะหัวหน้า)"`) ด้วย:

```tsx
          {payments.length > 0 && due <= 0.001 && (
            <p className="text-xs text-slate-500">
              ชำระเงินครบแล้ว — คีย์ช่องทางผิดกด &quot;แก้ช่องทาง&quot; ที่บรรทัดได้เลย
              ไม่ต้องลบ (ยอดเงินและวันที่รับเงินไม่เปลี่ยน)
            </p>
          )}
```

คำแนะนำเดิมต้องหายไป เพราะการลบแล้วเก็บเงินใหม่จะทำให้ `received_date` กลายเป็นวันที่กด ซึ่งย้ายเงินไปผิดวัน

- [ ] **Step 5: type check และ build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS ทั้งคู่

- [ ] **Step 6: เทสต์ทั้งชุด**

Run: `npm test`
Expected: PASS ทั้งหมด (ไม่มีเทสต์ของไฟล์นี้โดยตรง แต่ต้องไม่ทำของเดิมพัง)

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/today/edit-sale-dialog.tsx"
git commit -m "feat: ปุ่มแก้ช่องทางชำระเงินที่บรรทัดชำระในกล่องแก้บิล"
```

---

## Task 5: ตรวจรับและขึ้น production

**Files:** ไม่มีไฟล์ใหม่ — งานตรวจรับและ deploy

**Interfaces:**
- Consumes: ทุกอย่างจาก Task 1-4

- [ ] **Step 1: รันชุดตรวจทั้งหมด**

Run: `npm test`
Expected: PASS ทั้งหมด และจำนวนเทสต์มากกว่าเดิม (ก่อนเริ่มงานนี้ 695 ตัว)

Run: `npx tsc --noEmit`
Expected: ไม่มี error

Run: `npm run lint`
Expected: 0 error (มี warning เดิม 1 ตัวเรื่อง `MAX_PAYMENT_LINES` ใน `src/lib/payments.test.ts` ซึ่งมีอยู่ก่อนงานนี้ ไม่ต้องแก้)

Run: `npm run build`
Expected: build ผ่าน

- [ ] **Step 2: รัน reconciliation ทั้งไฟล์**

รันเนื้อ `supabase/reconciliation.sql` ผ่าน MCP `execute_sql`

Expected: ทุกแถว `result = PASS` **ยกเว้น `bed_double_booked` ที่ FAIL อยู่ก่อนเริ่มงานนี้แล้ว**

> `bed_double_booked` — คาด 0 ได้ 1 · คิวสองรายการจองเก้าอี้ 3 ทับเวลากันเมื่อ 9 ส.ค. 2026
> รอ Boss เปิดดูใน ThaiHand ว่าใครอยู่ตรงไหน **ห้ามแก้เอง**

ถ้ามี FAIL ข้ออื่น โดยเฉพาะ `tracked_bill_method_mismatch` = มีบั๊กจากงานนี้ **ห้าม deploy**

- [ ] **Step 3: ตรวจว่ายอดเงินไม่ขยับจากงานนี้**

```sql
select sum(volume) as volume, sum(net_revenue) as revenue, sum(cash_in) as cash_in
from public.v_daily_summary
where sale_date between '2026-08-01' and '2026-08-13';
```

Expected (ค่าที่วัดจริงจากฐานข้อมูลเมื่อ 14 ส.ค. 2026 ก่อนเริ่มงานนี้):

| ตัวเลข | ค่าที่ต้องได้ |
|---|---|
| `volume` | `186974` |
| `revenue` | `177529.03` |
| `cash_in` | `211324` |

งานนี้ไม่มีขั้นตอนแก้ข้อมูลเลย ถ้าตัวเลขขยับแปลว่ามีอะไรผิดพลาด **ห้าม deploy**

*(ถ้าระหว่างทำมีพนักงานคีย์บิลใหม่เข้ามา ตัวเลขจะสูงขึ้นได้ตามปกติ — ที่ต้องตกใจคือกรณีตัวเลข **ลดลง** หรือ `cash_in` ขยับโดยที่ `volume` ไม่ขยับ)*

- [ ] **Step 4: push แล้ว deploy**

```bash
git fetch && git rebase origin/main
```

ถ้ามี conflict ให้แก้ก่อน แล้ว merge เข้า main รันเทสต์บนผลลัพธ์ที่ merge แล้ว จากนั้น:

```bash
git push origin main
```

การ push **ไม่ได้** สั่ง deploy อัตโนมัติ ต้องสั่งเอง:

```bash
npx vercel deploy --prod --yes
```

- [ ] **Step 5: ตรวจ production**

Run: `npx vercel inspect sookkaya-pos.vercel.app`
Expected: `status ● Ready` และ `created` เป็นเวลาไม่กี่นาทีที่ผ่านมา

Run: `curl -s -o /dev/null -w "%{http_code}" -L https://sookkaya-pos.vercel.app/login`
Expected: `200`

- [ ] **Step 6: รายงาน Boss**

แจ้งว่าใช้งานได้แล้ว พร้อมบอกวิธีใช้: หน้ายอดวันนี้ → กดแก้บิล → เลื่อนลงถึงกล่อง "บรรทัดชำระของบิล" → กด "แก้ช่องทาง" ที่บรรทัด → เลือกช่องทางใหม่

และแจ้งข้อจำกัดให้ชัด: **แก้ได้เฉพาะบิลของเดือนปัจจุบันและเดือนก่อนหน้า** เก่ากว่านั้นระบบจะปฏิเสธพร้อมบอกเหตุผล ถ้ามีบิลเก่ากว่านั้นที่รู้ว่าผิด ต้องให้แก้ทางฐานข้อมูลให้

- [ ] **Step 7: อัปเดตความจำโปรเจกต์**

เพิ่มลง `sookkaya-money-formula-one-place.md` ว่าช่องทางชำระเงินของบิลขายแก้ได้จากบรรทัดชำระผ่าน `updateBillPaymentMethod` ซึ่ง sync `sales.payment_method` ให้ด้วย และหน้าต่างเวลาของแต่ละอย่างต่างกัน: รายจ่ายถึงวันที่ 3 · ช่องทางบิลขายเดือนก่อนตลอดเดือน · ใบเติมเงินไม่จำกัด
