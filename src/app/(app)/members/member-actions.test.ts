import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
// "วันนี้" ตรึงไว้ให้อยู่เดือนเดียวกับ topup_date ที่ใช้ในเทสต์ทุกเคส เพื่อผ่านด่าน "ลบได้เฉพาะเดือนปัจจุบัน"
// ไปให้ถึงด่านที่กำลังทดสอบจริง (เตือนก่อนวันหมดอายุถอยหลัง)
vi.mock("@/lib/datetime", () => ({
  todayInShopTz: vi.fn(() => "2026-08-11"),
  addMonths: vi.fn((d: string) => d),
}))
vi.mock("@/lib/auth", () => ({
  getMyProfile: vi.fn(async () => ({ full_name: "ผู้จัดการ" })),
}))

import { createClient } from "@/lib/supabase/server"
import { createTopup, deleteTopup, updateTopupPaymentMethod } from "./member-actions"

const CUST = "22222222-2222-2222-2222-222222222222"
const TOPUP_KEEP_FURTHEST = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" // ถือวันหมดอายุไกลสุด

type Row = Record<string, unknown>

/**
 * supabase ปลอมสำหรับ deleteTopup (โลกแยกก้อนตามใบเติม) — ลำดับการเรียกคงที่:
 *   1) member_topups select ใบตาม id (.maybeSingle)
 *   2) sale_credit_allocations select ยอดที่บิลตัดจากใบนี้ (awaited ตรง ๆ)
 *   3) member_topups delete (awaited ตรง ๆ)
 */
function fakeSupabase(cfg: { topup: Row | null; allocated: { amount: number }[] }) {
  let memberTopupsCalls = 0
  const deletedIds: string[] = []

  const from = vi.fn((table: string) => {
    if (table === "member_topups") {
      memberTopupsCalls++
      const callN = memberTopupsCalls
      const q: Record<string, unknown> = {}
      q.select = vi.fn(() => q)
      q.eq = vi.fn((_col: string, val?: string) => {
        if (callN === 2 && typeof val === "string") deletedIds.push(val)
        return q
      })
      q.maybeSingle = vi.fn(async () => ({ data: callN === 1 ? cfg.topup : null }))
      q.delete = vi.fn(() => q)
      q.then = (resolve: (r: { data: unknown; error: unknown }) => void) =>
        resolve({ data: null, error: null })
      return q
    }
    if (table === "sale_credit_allocations") {
      const q: Record<string, unknown> = {}
      q.select = vi.fn(() => q)
      q.eq = vi.fn(() => q)
      q.then = (resolve: (r: { data: unknown; error: unknown }) => void) =>
        resolve({ data: cfg.allocated, error: null })
      return q
    }
    throw new Error(`unexpected table: ${table}`)
  })

  return { client: { from }, deletedIds }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("deleteTopup — ใบใครใบมัน (ระบบแยกก้อนตามใบเติม)", () => {
  const topup = {
    id: TOPUP_KEEP_FURTHEST,
    topup_date: "2026-08-05",
    customer_id: CUST,
    credit_added: 500,
    cash_received: 500,
  }

  it("ใบที่มีบิลตัดเครดิตไปแล้ว → ลบไม่ได้ ข้อความบอกยอดที่ถูกตัด และไม่ยิง delete จริง", async () => {
    const { client, deletedIds } = fakeSupabase({
      topup,
      allocated: [{ amount: 300 }, { amount: 150 }],
    })
    vi.mocked(createClient).mockResolvedValue(client as never)

    const r = await deleteTopup(TOPUP_KEEP_FURTHEST)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("450")
    expect(deletedIds).toEqual([])
  })

  it("ใบที่ไม่มีบิลตัด → ลบได้ทันทีโดยไม่ต้องยืนยันซ้ำ (คำเตือนกระปุกถอยหลังถูกถอดแล้ว)", async () => {
    const { client, deletedIds } = fakeSupabase({ topup, allocated: [] })
    vi.mocked(createClient).mockResolvedValue(client as never)

    const r = await deleteTopup(TOPUP_KEEP_FURTHEST)

    expect(r.ok).toBe(true)
    expect(deletedIds).toEqual([TOPUP_KEEP_FURTHEST])
  })

  it("confirmShorten เป็นแค่พารามิเตอร์เก่า — ส่งมาหรือไม่ พฤติกรรมเหมือนกัน", async () => {
    const { client, deletedIds } = fakeSupabase({ topup, allocated: [] })
    vi.mocked(createClient).mockResolvedValue(client as never)

    const r = await deleteTopup(TOPUP_KEEP_FURTHEST, true)

    expect(r.ok).toBe(true)
    expect(deletedIds).toEqual([TOPUP_KEEP_FURTHEST])
  })
})

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

/**
 * supabase ปลอมสำหรับ updateTopupPaymentMethod — ลำดับการเรียกคือ
 *   1) select ใบเติมตาม id (.maybeSingle)
 *   2) update ใบเติม (.eq().select("id").maybeSingle()) — ขอแถวที่ถูกแก้กลับมาด้วย
 * เก็บ patch ที่ส่งเข้า update ไว้เพื่อพิสูจน์ว่าไม่มีคอลัมน์เงินถูกแตะ
 * updatedRow ปรับได้: แถวจริง = อัปเดตสำเร็จ, null = 0 แถว (RLS ปิดเงียบ/ใบถูกลบ)
 */
function fakeSupabaseForUpdate(
  topup: Row | null,
  updatedRow: Row | null = { id: "updated-1" }
) {
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
        return {
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: updatedRow, error: null })),
            })),
          })),
        }
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
    // ชุดคีย์ต้องตรงเป๊ะสามตัว — ถ้าวันหนึ่งมีคนเพิ่มคอลัมน์เข้า patch เทสต์นี้ต้องแดงทันที
    // (การไล่เช็คทีละคอลัมน์ต้องห้ามอย่างเดียวไม่พอ เพราะคอลัมน์ใหม่ที่ยังไม่มีในลิสต์จะหลุด)
    expect(Object.keys(patch).sort()).toEqual([
      "edited_at",
      "edited_by",
      "payment_method",
    ])
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

  it("อัปเดตได้ 0 แถว (สิทธิ์ไม่พอหรือใบถูกลบไปแล้ว) — ต้องไม่รายงานว่าสำเร็จ", async () => {
    // .update().eq() ไม่ error แต่ไม่มีแถวไหนถูกแก้จริง (เช่น RLS บล็อกเงียบ ๆ)
    const fake = fakeSupabaseForUpdate(TOPUP_ROW, null)
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const result = await updateTopupPaymentMethod("topup-9", "บัตรเครดิต")

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).not.toBe("")
    }
  })
})
