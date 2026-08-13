import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth", () => ({ getMyProfile: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
// "วันนี้" ตรึงไว้ที่ 2026-08-13 ส่วนบิลในเทสต์เป็นของวันที่ 2026-08-02 — สองวันนี้ต้องต่างกัน
// ไม่งั้นเทสต์จะผ่านทั้งที่โค้ดหยิบวันผิด
vi.mock("@/lib/datetime", () => ({ todayInShopTz: vi.fn(() => "2026-08-13") }))

import { getMyProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { addBillPayment } from "./payment-actions"

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
    expect(fake.inserted[0].received_date).toBe("2026-08-13")
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
