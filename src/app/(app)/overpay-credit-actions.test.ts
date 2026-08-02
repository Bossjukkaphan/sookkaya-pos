import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth", () => ({ getMyProfile: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { getMyProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { keepOverpayAsCredit } from "./overpay-credit-actions"

const BILL = "11111111-1111-1111-1111-111111111111"
const CUST = "22222222-2222-2222-2222-222222222222"

type Opts = {
  due?: number
  creditTotal?: number
  customerIds?: (string | null)[]
  lines?: { id: string; amount: number; method: string; received_date: string }[]
}

/** supabase ปลอมเท่าที่ action ใช้ — จับ insert ใบเครดิต + การแก้/ลบบรรทัดชำระ */
function fakeSupabase(o: Opts = {}) {
  const calls = {
    topup: null as Record<string, unknown> | null,
    updates: [] as { id: string; amount: number }[],
    deletes: [] as string[],
  }
  const bill = {
    bill_key: BILL,
    due: o.due ?? -520,
    credit_total: o.creditTotal ?? 0,
  }
  const salesRows = (o.customerIds ?? [CUST, CUST]).map((id) => ({ customer_id: id }))
  const lines =
    o.lines ??
    [
      { id: "p1", amount: 490, method: "QR Code", received_date: "2026-08-02" },
      { id: "p2", amount: 520, method: "QR Code", received_date: "2026-08-02" },
    ]

  const from = vi.fn((table: string) => {
    if (table === "v_bill_due") {
      const c: Record<string, unknown> = {}
      c.select = vi.fn(() => c)
      c.eq = vi.fn(() => c)
      c.maybeSingle = vi.fn(async () => ({ data: bill }))
      return c
    }
    if (table === "sales") {
      const c: Record<string, unknown> = {}
      c.select = vi.fn(() => c)
      c.or = vi.fn(async () => ({ data: salesRows }))
      return c
    }
    if (table === "bill_payments") {
      const c: Record<string, unknown> = {}
      c.select = vi.fn(() => c)
      c.eq = vi.fn(() => c)
      c.order = vi.fn(async () => ({ data: lines }))
      c.update = vi.fn((patch: { amount: number }) => ({
        eq: vi.fn(async (_col: string, id: string) => {
          calls.updates.push({ id, amount: patch.amount })
          return { error: null }
        }),
      }))
      c.delete = vi.fn(() => ({
        eq: vi.fn(async (_col: string, id: string) => {
          calls.deletes.push(id)
          return { error: null }
        }),
      }))
      return c
    }
    if (table === "member_topups") {
      return {
        insert: vi.fn(async (row: Record<string, unknown>) => {
          calls.topup = row
          return { error: null }
        }),
      }
    }
    throw new Error(`unexpected table ${table}`)
  })
  return { client: { from }, calls }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getMyProfile).mockResolvedValue({
    id: "u1", email: "boss@test.com", full_name: "Boss", role: "manager",
  } as never)
})

describe("keepOverpayAsCredit", () => {
  it("พนักงานทั่วไปกดไม่ได้", async () => {
    vi.mocked(getMyProfile).mockResolvedValue({ id: "u", role: "staff" } as never)
    const r = await keepOverpayAsCredit(BILL)
    expect(r.ok).toBe(false)
  })

  it("บิลไม่ได้รับเกิน → ปฏิเสธ ไม่ออกใบเครดิต", async () => {
    const { client, calls } = fakeSupabase({ due: 0 })
    vi.mocked(createClient).mockResolvedValue(client as never)
    const r = await keepOverpayAsCredit(BILL)
    expect(r.ok).toBe(false)
    expect(calls.topup).toBeNull()
  })

  it("เกินรับต่ำกว่าขั้นต่ำ 100 → ปฏิเสธ", async () => {
    const { client, calls } = fakeSupabase({ due: -60 })
    vi.mocked(createClient).mockResolvedValue(client as never)
    const r = await keepOverpayAsCredit(BILL)
    expect(r.ok).toBe(false)
    expect(calls.topup).toBeNull()
  })

  it("บิลจ่ายด้วยเครดิตอยู่แล้ว → ปฏิเสธ (กันนับเงินซ้ำ)", async () => {
    const { client, calls } = fakeSupabase({ creditTotal: 300 })
    vi.mocked(createClient).mockResolvedValue(client as never)
    const r = await keepOverpayAsCredit(BILL)
    expect(r.ok).toBe(false)
    expect(calls.topup).toBeNull()
  })

  it("บิลไม่ผูกลูกค้า → ปฏิเสธ", async () => {
    const { client, calls } = fakeSupabase({ customerIds: [null, null] })
    vi.mocked(createClient).mockResolvedValue(client as never)
    const r = await keepOverpayAsCredit(BILL)
    expect(r.ok).toBe(false)
    expect(calls.topup).toBeNull()
  })

  it("บิลมีลูกค้าหลายคน → ปฏิเสธ (ไม่รู้จะให้เครดิตใคร)", async () => {
    const { client, calls } = fakeSupabase({ customerIds: [CUST, "other-id"] })
    vi.mocked(createClient).mockResolvedValue(client as never)
    const r = await keepOverpayAsCredit(BILL)
    expect(r.ok).toBe(false)
    expect(calls.topup).toBeNull()
  })

  it("สำเร็จ: ลดบรรทัดล่าสุดจนหมด + ออกใบเครดิตไม่มีโบนัส วันที่ = วันรับเงินจริง", async () => {
    const { client, calls } = fakeSupabase()
    vi.mocked(createClient).mockResolvedValue(client as never)
    const r = await keepOverpayAsCredit(BILL)

    expect(r).toEqual({ ok: true, amount: 520 })
    expect(calls.deletes).toEqual(["p2"]) // บรรทัดล่าสุด 520 ถูกลดจนเหลือ 0
    expect(calls.updates).toEqual([])
    expect(calls.topup).toMatchObject({
      topup_date: "2026-08-02",
      customer_id: CUST,
      tier: "เครดิตคงเหลือ",
      cash_received: 520,
      credit_added: 520,
      bonus_added: 0,
      expiry_date: "2027-08-02",
    })
  })

  it("สำเร็จ: เกินน้อยกว่าบรรทัดล่าสุด → แก้ยอดบรรทัด ไม่ลบ", async () => {
    const { client, calls } = fakeSupabase({
      due: -200,
      lines: [{ id: "p1", amount: 690, method: "เงินสด", received_date: "2026-08-01" }],
    })
    vi.mocked(createClient).mockResolvedValue(client as never)
    const r = await keepOverpayAsCredit(BILL)

    expect(r).toEqual({ ok: true, amount: 200 })
    expect(calls.updates).toEqual([{ id: "p1", amount: 490 }])
    expect(calls.deletes).toEqual([])
    expect(calls.topup).toMatchObject({
      topup_date: "2026-08-01",
      payment_method: "เงินสด",
      cash_received: 200,
      expiry_date: "2027-08-01",
    })
  })
})
