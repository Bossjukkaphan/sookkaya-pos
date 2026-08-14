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
import { addBillPayment, updateBillPaymentMethod } from "./payment-actions"

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
 *   3) bill_payments  update บรรทัดนั้น (.select .maybeSingle)
 *   4) bill_payments  select บรรทัดทั้งหมดของบิล (await ตรง ๆ) — ใช้หาวิธีหลักใหม่
 *   5) sales          update ทุกแถวของบิล (.or)
 * ใช้ตัวนับครั้งที่เรียกแยกพฤติกรรม แทนการเดาจาก field ที่ eq() กรอง
 */
function fakeMethodSupabase(cfg: {
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
    const fake = fakeMethodSupabase({
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
    const fake = fakeMethodSupabase({
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
    const fake = fakeMethodSupabase({
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
    const fake = fakeMethodSupabase({
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
    const fake = fakeMethodSupabase({
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
    const fake = fakeMethodSupabase({ line: LINE, saleDate: "2026-08-14", linesAfter: [] })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentMethod("line-1", "Gowabi")

    expect(r.ok).toBe(false)
    expect(fake.client.from).not.toHaveBeenCalled()
  })

  it("ไม่พบบรรทัดชำระ — คืน error ไม่เขียนอะไร", async () => {
    const fake = fakeMethodSupabase({ line: null, saleDate: "2026-08-14", linesAfter: [] })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentMethod("ไม่มีจริง", "เงินสด")

    expect(r).toEqual({ ok: false, error: "ไม่พบบรรทัดชำระนี้" })
    expect(fake.patches).toHaveLength(0)
  })

  it("บิลของสองเดือนก่อน — ปิดงบแล้ว แก้ไม่ได้", async () => {
    // วันนี้ตรึงไว้ 2026-08-14 · บิลเดือน มิ.ย. ห่างสองเดือน
    const fake = fakeMethodSupabase({ line: LINE, saleDate: "2026-06-20", linesAfter: [] })
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const r = await updateBillPaymentMethod("line-1", "เงินสด")

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("2026-06")
    expect(fake.patches).toHaveLength(0)
  })

  it("บิลของเดือนก่อนหน้า แม้พ้นวันที่ 3 ไปแล้วก็ยังแก้ได้", async () => {
    // วันนี้ 14 ส.ค. — ถ้าเผลอไปเรียก canEditExpenseOn เทสต์ข้อนี้จะแดงทันที
    const fake = fakeMethodSupabase({
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
