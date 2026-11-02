import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth", () => ({ getMyProfile: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
// "วันนี้" ตรึงไว้ที่ 2026-08-14 (วันของงานนี้) — เดือน ก.ค. จึงเป็น "เดือนก่อนหน้า"
// และ มิ.ย. เป็น "สองเดือนก่อน" ส่วนบิลในเทสต์ addBillPayment เป็นของวันที่ 2026-08-02
// สองวันนี้ต้องต่างกัน ไม่งั้นเทสต์จะผ่านทั้งที่โค้ดหยิบวันผิด
vi.mock("@/lib/datetime", () => ({ todayInShopTz: vi.fn(() => "2026-08-14") }))

import { getMyProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { addBillPayment, updateBillPaymentAmount, updateBillPaymentMethod } from "./payment-actions"

const BILL = "ba0e5178-002d-47f8-97ae-fd3dd1fc7b23"

/**
 * supabase ปลอมสำหรับ addBillPayment — ลำดับการเรียกคือ
 *   1) v_bill_due select ยอดค้าง (.maybeSingle)
 *   2) bill_payments insert บรรทัดใหม่
 * เก็บแถวที่ insert ไว้เพื่อตรวจว่า received_date เป็นวันไหน
 */
function fakeSupabase(due: number | null) {
  const inserted: Record<string, unknown>[] = []

  const from = vi.fn((table: string) => {
    if (table === "v_bill_due") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: due === null ? null : { due } })),
          })),
        })),
      }
    }
    if (table === "bill_payments") {
      return {
        insert: vi.fn(async (row: Record<string, unknown>) => {
          inserted.push(row)
          return { error: null }
        }),
      }
    }
    throw new Error(`ตารางที่ไม่คาดคิด: ${table}`)
  })

  return { client: { from }, inserted }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getMyProfile).mockResolvedValue({ full_name: "Boss" } as never)
})

describe("addBillPayment — วันเงินเข้า", () => {
  it("เก็บเงินบิลค้างรับของวันก่อน วันเงินเข้าต้องเป็นวันนี้ ไม่ใช่วันที่ของบิล", async () => {
    // นี่คือความหมายของ action นี้: ลูกค้าค้างเงินไว้แล้วกลับมาจ่ายทีหลัง เงินเข้าจริงวันที่กด
    //
    // เทสต์นี้มีไว้กันคนที่เห็นว่า createSale ใช้ saleDate แล้วมา "แก้ให้เหมือนกัน" ที่นี่ด้วย
    // ซึ่งจะทำให้เงินที่เพิ่งได้รับวันนี้ย้อนไปโผล่ในวันที่นวด แล้วดูสภาพคล่องรายวันไม่ได้
    const fake = fakeSupabase(550)
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await addBillPayment(BILL, "QR Code", 550)

    expect(r).toEqual({ ok: true, due: 0 })
    expect(fake.inserted).toHaveLength(1)
    expect(fake.inserted[0].received_date).toBe("2026-08-14")
  })

  it("รับช่องทาง E-Wallet ได้", async () => {
    const fake = fakeSupabase(1290)
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await addBillPayment(BILL, "E-Wallet", 1290)

    expect(r.ok).toBe(true)
    expect(fake.inserted[0].method).toBe("E-Wallet")
  })

  it("ช่องทางที่ไม่รู้จักถูกปฏิเสธก่อนแตะฐานข้อมูล", async () => {
    const fake = fakeSupabase(500)
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await addBillPayment(BILL, "Gowabi", 500)

    expect(r.ok).toBe(false)
    expect(fake.inserted).toHaveLength(0)
    expect(fake.client.from).not.toHaveBeenCalled()
  })

  it("ยอดเกินที่ค้างรับถูกปฏิเสธ ไม่มีบรรทัดถูกเขียน", async () => {
    const fake = fakeSupabase(300)
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await addBillPayment(BILL, "QR Code", 500)

    expect(r.ok).toBe(false)
    expect(fake.inserted).toHaveLength(0)
  })
})

type PaymentRow = { id: string; bill_key: string; method: string; amount: number }

/**
 * supabase ปลอมสำหรับ updateBillPaymentMethod — ลำดับการเรียกคงที่:
 *   1) bill_payments  select บรรทัดตาม id (.maybeSingle)
 *   2) sales          select บิลของ bill_key เพื่อเอา sale_date (.limit .maybeSingle)
 *   3) rpc("update_bill_payment_method") — ทรานแซกชันเดียว: แก้บรรทัด + sync ป้ายหัวบิล
 * กติกาวิธีหลัก (บรรทัดยอดสูงสุด) และการอัปเดตครบทุกแถวของบิลชุด ย้ายไปอยู่ใน SQL
 * ของ RPC แล้ว (migration 20261014060000) — เทสต์ฝั่งนี้คุมแค่ด่านก่อนเรียกกับการแปล error
 */
function fakeMethodSupabase(cfg: {
  line: PaymentRow | null
  saleDate: string | null
  /** error ที่ rpc คืน — ไม่ใส่ = สำเร็จ */
  rpcError?: { message: string }
}) {
  const rpc = vi.fn(async () => ({ error: cfg.rpcError ?? null }))

  const from = vi.fn((table: string) => {
    if (table === "bill_payments") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: cfg.line })) })),
        })),
      }
    }
    if (table === "sales") {
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
    throw new Error(`ตารางที่ไม่คาดคิด: ${table}`)
  })

  return { client: { from, rpc }, rpc }
}

const LINE = { id: "line-1", bill_key: BILL, method: "บัตรเครดิต", amount: 1290 }

describe("updateBillPaymentMethod", () => {
  it("ส่งงานทั้งหมดเข้า RPC ก้อนเดียว พร้อมชื่อคนแก้", async () => {
    const fake = fakeMethodSupabase({ line: LINE, saleDate: "2026-08-14" })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentMethod("line-1", "E-Wallet")

    expect(r).toEqual({ ok: true })
    expect(fake.rpc).toHaveBeenCalledWith("update_bill_payment_method", {
      p_payment_id: "line-1",
      p_method: "E-Wallet",
      p_edited_by: "Boss",
    })
  })

  it("RPC ล้ม — ต้องบอกชัดว่ายังไม่มีอะไรถูกเปลี่ยน (ทรานแซกชันย้อนกลับทั้งก้อน)", async () => {
    // ต่างจากโค้ดเดิมที่เขียนสองจังหวะ: จังหวะสองล้มแล้วบรรทัดค้างเปลี่ยนไปแล้ว ต้องสั่ง "กดซ้ำ"
    const fake = fakeMethodSupabase({
      line: LINE,
      saleDate: "2026-08-14",
      rpcError: { message: "network error" },
    })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentMethod("line-1", "E-Wallet")

    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain("ยังไม่มีอะไรถูกเปลี่ยน")
      expect(r.error).toContain("network error")
    }
  })

  it("RLS ปฏิเสธเงียบที่บรรทัดชำระ (LINE_NOT_UPDATED) — ข้อความอ่านรู้เรื่อง", async () => {
    const fake = fakeMethodSupabase({
      line: LINE,
      saleDate: "2026-08-14",
      rpcError: { message: "LINE_NOT_UPDATED" },
    })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentMethod("line-1", "เงินสด")

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("สิทธิ์ไม่พอหรือบรรทัดนี้ถูกลบไปแล้ว")
  })

  it("อัปเดตแถวบิลไม่โดน (SALE_NOT_UPDATED) — บรรทัดต้องถูกย้อนกลับด้วย ไม่ใช่ค้างครึ่งเดียว", async () => {
    const fake = fakeMethodSupabase({
      line: LINE,
      saleDate: "2026-08-14",
      rpcError: { message: "SALE_NOT_UPDATED" },
    })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentMethod("line-1", "เงินสด")

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("ยังไม่มีอะไรถูกเปลี่ยน")
  })

  it("ช่องทางที่ไม่รู้จักถูกปฏิเสธก่อนแตะฐานข้อมูล", async () => {
    const fake = fakeMethodSupabase({ line: LINE, saleDate: "2026-08-14" })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentMethod("line-1", "Gowabi")

    expect(r.ok).toBe(false)
    expect(fake.client.from).not.toHaveBeenCalled()
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it("ไม่พบบรรทัดชำระ — คืน error ไม่เรียก RPC", async () => {
    const fake = fakeMethodSupabase({ line: null, saleDate: "2026-08-14" })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentMethod("ไม่มีจริง", "เงินสด")

    expect(r).toEqual({ ok: false, error: "ไม่พบบรรทัดชำระนี้" })
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it("บิลของสองเดือนก่อน — ปิดงบแล้ว แก้ไม่ได้ และไม่เรียก RPC", async () => {
    // วันนี้ตรึงไว้ 2026-08-14 · บิลเดือน มิ.ย. ห่างสองเดือน
    const fake = fakeMethodSupabase({ line: LINE, saleDate: "2026-06-20" })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentMethod("line-1", "เงินสด")

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("2026-06")
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it("บิลของเดือนก่อนหน้า แม้พ้นวันที่ 3 ไปแล้วก็ยังแก้ได้", async () => {
    // วันนี้ 14 ส.ค. — ถ้าเผลอไปเรียก canEditExpenseOn เทสต์ข้อนี้จะแดงทันที
    const fake = fakeMethodSupabase({ line: LINE, saleDate: "2026-07-20" })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentMethod("line-1", "เงินสด")

    expect(r).toEqual({ ok: true })
    expect(fake.rpc).toHaveBeenCalledTimes(1)
  })
})

/**
 * supabase ปลอมสำหรับ updateBillPaymentAmount — ลำดับการเรียกคงที่:
 *   1) bill_payments select บรรทัดตาม id (.maybeSingle)
 *   2) v_bill_due    select ยอดค้างสดของบิล (.maybeSingle)
 *   3) rpc("update_bill_payment_amount") — แก้ยอด + ต่อ note + sync ป้ายหัวบิล
 */
function fakeAmountSupabase(cfg: {
  line: { id: string; bill_key: string; amount: number; received_date: string } | null
  due: number | null
  rpcError?: { message: string }
}) {
  const rpc = vi.fn(async () => ({ error: cfg.rpcError ?? null }))
  const single = (data: unknown) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data })) })),
    })),
  })
  const from = vi.fn((table: string) => {
    if (table === "bill_payments") return single(cfg.line)
    if (table === "v_bill_due") return single(cfg.due === null ? null : { due: cfg.due })
    throw new Error(`ตารางที่ไม่คาดคิด: ${table}`)
  })
  return { client: { from, rpc }, rpc }
}

// บิลแบบ SK-20261018-005: บิล 650 รับ QR 990 → เกินรับ 340 (due = -340)
const OVERPAID_LINE = { id: "line-9", bill_key: BILL, amount: 990, received_date: "2026-08-02" }

describe("updateBillPaymentAmount", () => {
  beforeEach(() => {
    vi.mocked(getMyProfile).mockResolvedValue({ full_name: "Boss", role: "manager" } as never)
  })

  it("โอนคืนลูกค้าแล้ว — ตัดยอดลงให้บิลรับครบ ส่งสาเหตุเป็นข้อความไปต่อท้าย note", async () => {
    const fake = fakeAmountSupabase({ line: OVERPAID_LINE, due: -340 })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentAmount("line-9", 650, "refunded")

    expect(r).toEqual({ ok: true, due: 0 })
    expect(fake.rpc).toHaveBeenCalledWith("update_bill_payment_amount", {
      p_payment_id: "line-9",
      p_amount: 650,
      p_reason: "โอนคืนลูกค้าแล้ว",
      p_edited_by: "Boss",
    })
  })

  it("พนักงานทั่วไปแก้ยอดไม่ได้ ไม่แตะฐานข้อมูล", async () => {
    vi.mocked(getMyProfile).mockResolvedValue({ full_name: "น้อง", role: "staff" } as never)
    const fake = fakeAmountSupabase({ line: OVERPAID_LINE, due: -340 })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentAmount("line-9", 650, "typo")

    expect(r.ok).toBe(false)
    expect(fake.client.from).not.toHaveBeenCalled()
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it("สาเหตุที่ไม่รู้จักถูกปฏิเสธ — เคสลูกค้าเก็บไว้ใช้ต้องไปออกใบเครดิต", async () => {
    const fake = fakeAmountSupabase({ line: OVERPAID_LINE, due: -340 })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentAmount("line-9", 650, "prepaid" as never)

    expect(r.ok).toBe(false)
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it("ยอด 0 หรือติดลบถูกปฏิเสธ — เงินไม่เข้าเลยต้องลบบรรทัด", async () => {
    const fake = fakeAmountSupabase({ line: OVERPAID_LINE, due: -340 })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    expect((await updateBillPaymentAmount("line-9", 0, "typo")).ok).toBe(false)
    expect((await updateBillPaymentAmount("line-9", -10, "typo")).ok).toBe(false)
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it("เงินเข้าเดือนก่อนแต่พ้นวันที่ 3 แล้ว — ปิดงบ แก้ยอดไม่ได้ (ต่างจากแก้ช่องทาง)", async () => {
    // วันนี้ตรึง 14 ส.ค. · เงินเข้า 20 ก.ค. → ยอดเงินเข้า ก.ค. ห้ามขยับแล้ว
    const fake = fakeAmountSupabase({
      line: { ...OVERPAID_LINE, received_date: "2026-07-20" },
      due: -340,
    })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentAmount("line-9", 650, "typo")

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("2026-07")
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it("แก้ขึ้นจนบิลเกินรับ — ปฏิเสธ บอกยอดสูงสุดที่ใส่ได้", async () => {
    // บิล 650 บรรทัด 500 ค้างรับ 150 → ใส่ได้ไม่เกิน 650
    const fake = fakeAmountSupabase({ line: { ...OVERPAID_LINE, amount: 500 }, due: 150 })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentAmount("line-9", 700, "typo")

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("650")
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it("แก้ลงแล้วบิลยังเกินรับอยู่บ้างก็ยอม — สะท้อนเงินที่เข้าจริง", async () => {
    // ลูกค้าโอน 990 บิล 650 ร้านคืนให้แค่ 200 → เงินเข้าจริง 790 ยังเกิน 140 (ไปเก็บเป็นเครดิตต่อได้)
    const fake = fakeAmountSupabase({ line: OVERPAID_LINE, due: -340 })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentAmount("line-9", 790, "refunded")

    expect(r).toEqual({ ok: true, due: -140 })
  })

  it("RPC ล้ม — บอกชัดว่ายังไม่มีอะไรถูกเปลี่ยน", async () => {
    const fake = fakeAmountSupabase({
      line: OVERPAID_LINE,
      due: -340,
      rpcError: { message: "network error" },
    })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentAmount("line-9", 650, "typo")

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("ยังไม่มีอะไรถูกเปลี่ยน")
  })
})
