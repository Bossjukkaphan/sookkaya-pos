import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
// "วันนี้" ตรึงไว้ให้อยู่เดือนเดียวกับ topup_date ที่ใช้ในเทสต์ทุกเคส เพื่อผ่านด่าน "ลบได้เฉพาะเดือนปัจจุบัน"
// ไปให้ถึงด่านที่กำลังทดสอบจริง (เตือนก่อนวันหมดอายุถอยหลัง)
vi.mock("@/lib/datetime", () => ({
  todayInShopTz: vi.fn(() => "2026-08-11"),
  addMonths: vi.fn((d: string) => d),
}))

import { createClient } from "@/lib/supabase/server"
import { deleteTopup } from "./member-actions"

const CUST = "22222222-2222-2222-2222-222222222222"
const TOPUP_KEEP_FURTHEST = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" // ถือวันหมดอายุไกลสุด
const TOPUP_OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" // ไม่ได้ถือวันหมดอายุไกลสุด

type Row = Record<string, unknown>

/**
 * supabase ปลอมสำหรับ deleteTopup — member_topups ถูกเรียก 3 จังหวะตามลำดับคงที่เสมอ:
 *   1) select ใบเติมตาม id (.maybeSingle)
 *   2) select ใบเติมทั้งหมดของลูกค้าคนนี้ (awaited ตรง ๆ ไม่มี .maybeSingle — ใช้หาวันหมดอายุไกลสุด)
 *   3) delete ใบเติม (awaited ตรง ๆ)
 * ใช้ตัวนับเรียกครั้งที่ N แยกพฤติกรรมแทนการเดาจาก field ที่ eq() กรอง
 */
function fakeSupabase(cfg: {
  topup: Row | null
  creditBalance: number
  allTopups: { id: string; expiry_date: string }[]
}) {
  let memberTopupsCalls = 0
  const deletedIds: string[] = []

  const from = vi.fn((table: string) => {
    if (table === "member_topups") {
      memberTopupsCalls++
      const callN = memberTopupsCalls
      const q: Record<string, unknown> = {}
      q.select = vi.fn(() => q)
      q.eq = vi.fn((_col: string, val?: string) => {
        if (callN === 3 && typeof val === "string") deletedIds.push(val)
        return q
      })
      q.maybeSingle = vi.fn(async () => ({ data: callN === 1 ? cfg.topup : null }))
      q.delete = vi.fn(() => q)
      q.then = (resolve: (r: { data: unknown; error: unknown }) => void) => {
        if (callN === 2) return resolve({ data: cfg.allTopups, error: null })
        if (callN === 3) return resolve({ data: null, error: null })
        return resolve({ data: null, error: null })
      }
      return q
    }
    if (table === "member_balances") {
      const q: Record<string, unknown> = {}
      q.select = vi.fn(() => q)
      q.eq = vi.fn(() => q)
      q.maybeSingle = vi.fn(async () => ({ data: { credit_balance: cfg.creditBalance } }))
      return q
    }
    throw new Error(`unexpected table: ${table}`)
  })

  return { client: { from }, deletedIds }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("deleteTopup — เตือนก่อนวันหมดอายุถอยหลัง", () => {
  const topup = {
    id: TOPUP_KEEP_FURTHEST,
    topup_date: "2026-08-05",
    customer_id: CUST,
    credit_added: 500,
    cash_received: 500,
  }
  const allTopups = [
    { id: TOPUP_KEEP_FURTHEST, expiry_date: "2026-10-15" }, // ใบนี้ถือวันหมดอายุไกลสุด
    { id: TOPUP_OTHER, expiry_date: "2026-08-01" },
  ]

  it("ลบใบที่ถือวันหมดอายุไกลสุด โดยไม่ confirmShorten → ปฏิเสธพร้อมข้อความบอกวันเก่า/วันใหม่ ไม่ลบจริง", async () => {
    const { client, deletedIds } = fakeSupabase({ topup, creditBalance: 1000, allTopups })
    vi.mocked(createClient).mockResolvedValue(client as never)

    const r = await deleteTopup(TOPUP_KEEP_FURTHEST)

    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain("2026-10-15")
      expect(r.error).toContain("2026-08-01")
    }
    expect(deletedIds).toEqual([]) // ต้องไม่ยิง delete จริงตอนยังไม่ยืนยัน
  })

  it("ลบใบที่ถือวันหมดอายุไกลสุด พร้อม confirmShorten=true → ลบได้จริง", async () => {
    const { client, deletedIds } = fakeSupabase({ topup, creditBalance: 1000, allTopups })
    vi.mocked(createClient).mockResolvedValue(client as never)

    const r = await deleteTopup(TOPUP_KEEP_FURTHEST, true)

    expect(r.ok).toBe(true)
    expect(deletedIds).toEqual([TOPUP_KEEP_FURTHEST])
  })

  it("ลบใบที่ไม่ได้ถือวันหมดอายุไกลสุด → ลบได้เลยโดยไม่ต้องยืนยัน (วันหมดอายุกระปุกไม่ถอย)", async () => {
    const otherTopup = {
      id: TOPUP_OTHER,
      topup_date: "2026-08-05",
      customer_id: CUST,
      credit_added: 200,
      cash_received: 200,
    }
    const { client, deletedIds } = fakeSupabase({ topup: otherTopup, creditBalance: 1000, allTopups })
    vi.mocked(createClient).mockResolvedValue(client as never)

    const r = await deleteTopup(TOPUP_OTHER)

    expect(r.ok).toBe(true)
    expect(deletedIds).toEqual([TOPUP_OTHER])
  })
})
