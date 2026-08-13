import { beforeEach, describe, expect, it, vi } from "vitest"

// mock ทุกอย่างที่แตะ Next/Supabase/เวลา — เทสต์เฉพาะลอจิกด่านเครดิตของ action
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth", () => ({ getMyProfile: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
// "วันนี้" ตรึงไว้ที่ 2026-08-11 (หลังวันหมดอายุที่ใช้ในเทสต์ทุกเคส) เพื่อพิสูจน์ว่าด่านเครดิต
// เทียบกับวันที่ของบิลจริง ไม่ใช่วันนี้ — ถ้าโค้ดสลับไปใช้ todayInShopTz() แทน เทสต์กลุ่มนี้ต้องล้ม
vi.mock("@/lib/datetime", () => ({
  todayInShopTz: vi.fn(() => "2026-08-11"),
  nowTimeInShopTz: vi.fn(() => "10:00"),
}))

import { getMyProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { MEMBER_CREDIT_METHOD } from "@/lib/constants"
import { createSale, updateSale } from "./sale-actions"

const CUST = "22222222-2222-2222-2222-222222222222"
const CUST_OLD = "33333333-3333-3333-3333-333333333333"
const CUST_NEW = "44444444-4444-4444-4444-444444444444"
const QUEUE = "55555555-5555-5555-5555-555555555555"
const SALE = "66666666-6666-6666-6666-666666666666"

type Result = { data: unknown; error?: { message: string } | null }

/** โต๊ะปลอมแบบ sequence — เรียก from(table) ครั้งที่ N ได้ผลลัพธ์ตัวที่ N (ค้างตัวสุดท้ายถ้าเรียกเกิน)
 * รองรับทุกเมธอดที่ action เหล่านี้ใช้: select/eq/or/order/limit/gt/not/insert/update/delete
 * แล้วจบด้วย .single()/.maybeSingle() หรือ await ตรงๆ (แบบ thenable) ก็ได้ทั้งคู่ */
function seqTable(results: Result[], capture?: { insert?: unknown[]; update?: unknown[] }) {
  let i = 0
  return () => {
    const result = results[Math.min(i, results.length - 1)]
    i++
    const q: Record<string, unknown> = {}
    q.select = vi.fn(() => q)
    q.eq = vi.fn(() => q)
    q.or = vi.fn(() => q)
    q.order = vi.fn(() => q)
    q.limit = vi.fn(() => q)
    q.gt = vi.fn(() => q)
    q.not = vi.fn(() => q)
    q.insert = vi.fn((row: unknown) => {
      capture?.insert?.push(row)
      return q
    })
    q.update = vi.fn((row: unknown) => {
      capture?.update?.push(row)
      return q
    })
    q.delete = vi.fn(() => q)
    q.single = vi.fn(async () => result)
    q.maybeSingle = vi.fn(async () => result)
    q.then = (resolve: (r: Result) => void) => resolve(result)
    return q
  }
}

function fakeSupabase(tables: Record<string, () => unknown>) {
  const from = vi.fn((table: string) => {
    const factory = tables[table]
    if (!factory) throw new Error(`unexpected table: ${table}`)
    return factory()
  })
  return {
    from,
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "u1", email: "boss@test.com" } } })) },
  }
}

function baseFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getMyProfile).mockResolvedValue({
    id: "u1", email: "boss@test.com", full_name: "Boss", role: "manager",
  } as never)
})

describe("createSale — ด่านเครดิตหมดอายุ", () => {
  it("เทียบวันหมดอายุกับวันที่ของบิล (คิวที่ผูก) ไม่ใช่วันนี้ — บิลที่ให้บริการก่อนหมดอายุต้องบันทึกได้แม้วันนี้เลยวันหมดอายุไปแล้ว", async () => {
    // คิวถูกจองไว้วันที่ 2026-07-01 (ก่อนหมดอายุ 2026-07-15) แต่พนักงานเพิ่งมาคีย์บิลวันนี้ (ตรึงไว้ 2026-08-11
    // ซึ่งเลยวันหมดอายุไปแล้ว) — ถ้าด่านเครดิตใช้ "วันนี้" แทนวันที่บิล จะบล็อกบิลนี้ผิด ๆ
    const tables = {
      services: seqTable([{ data: { name: "นวดไทย", price: 500, commission: 100, duration_min: 60 } }]),
      queue_entries: seqTable([
        { data: { queue_date: "2026-07-01" } }, // select saleDate จากคิว
        { data: null }, // update ปิดคิวเป็น paid ท้ายฟังก์ชัน
      ]),
      member_balances: seqTable([
        { data: { credit_balance: 1000, credit_granted: 1000, cash_paid: 1000, next_expiry: "2026-07-15" } },
      ]),
      profiles: seqTable([{ data: { full_name: "Boss" } }]),
      sales: seqTable([{ data: { id: SALE, receipt_no: "R0001" } }]),
      point_transactions: seqTable([{ data: null }]),
    }
    vi.mocked(createClient).mockResolvedValue(fakeSupabase(tables) as never)

    const fd = baseFormData({
      therapist_id: "th1",
      service_id: "svc1",
      payment_method: MEMBER_CREDIT_METHOD,
      customer_id: CUST,
      discount: "0",
      queue_entry_id: QUEUE,
    })

    const r = await createSale(fd)

    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.creditAfter).toBe(500) // 1000 - 500 (ราคาบริการเต็มบิล)
    }
  })

  it("เครดิตหมดอายุก่อนวันที่ของบิล ต้องปฏิเสธ แม้ยอดคงเหลือจะพอเหลือเฟือ", async () => {
    const written: { insert: unknown[] } = { insert: [] }
    // หมุดของด่านเครดิตฝั่ง createSale: ยอด 5,000 พอจ่ายบิล 500 สบาย ๆ แต่หมดอายุไปตั้งแต่ 2026-06-30
    // ก่อนวันที่ของบิล (คิว 2026-07-01) — ยอดที่ยังอยู่ในกระปุกคือเครดิต "แช่แข็ง" ใช้ไม่ได้จนกว่าจะเติมใหม่
    //
    // เทสต์นี้ล้มทันทีถ้าใครถอด checkCreditSpend กลับไปเป็นเงื่อนไขเดิม `if (credit < wanted)`
    // (เช่นตอนแก้ merge conflict) ซึ่งเป็นทางเดียวที่เครดิตแช่แข็งทั้งก้อนจะถูกใช้ฟรีอีกครั้ง
    const tables = {
      services: seqTable([{ data: { name: "นวดไทย", price: 500, commission: 100, duration_min: 60 } }]),
      queue_entries: seqTable([{ data: { queue_date: "2026-07-01" } }]),
      member_balances: seqTable([
        { data: { credit_balance: 5000, credit_granted: 5000, cash_paid: 5000, next_expiry: "2026-06-30" } },
      ]),
      profiles: seqTable([{ data: { full_name: "Boss" } }]),
      sales: seqTable([{ data: { id: SALE, receipt_no: "R0002" } }], written),
      point_transactions: seqTable([{ data: null }]),
    }
    vi.mocked(createClient).mockResolvedValue(fakeSupabase(tables) as never)

    const fd = baseFormData({
      therapist_id: "th1",
      service_id: "svc1",
      payment_method: MEMBER_CREDIT_METHOD,
      customer_id: CUST,
      discount: "0",
      queue_entry_id: QUEUE,
    })

    const r = await createSale(fd)

    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain("เครดิตหมดอายุเมื่อ 2026-06-30")
      // ข้อความต้องบอกยอดที่ยังอยู่ครบ เพื่อให้พนักงานชวนลูกค้าเติมแพ็กเกจใหม่ ไม่ใช่บอกว่าเงินหาย
      expect(r.error).toContain("5000")
    }
    // ด่านต้องกันก่อนเขียน — ไม่ใช่ปฏิเสธหลังบิลลงตารางไปแล้ว
    expect(written.insert).toHaveLength(0)
  })

  it("ตัดเครดิตแบ่งชำระ (credit_requested) ก็ต้องผ่านด่านเดียวกัน ไม่ใช่เฉพาะช่องทาง Member Credit", async () => {
    // ทางเข้าที่สองของการตัดเครดิต: จ่ายเงินสดแล้วตัดเครดิตบางส่วน — ถ้าด่านครอบเฉพาะ
    // paymentMethod === "Member Credit" เครดิตแช่แข็งจะไหลออกทางนี้แทนแบบเงียบ ๆ
    const tables = {
      services: seqTable([{ data: { name: "นวดไทย", price: 500, commission: 100, duration_min: 60 } }]),
      queue_entries: seqTable([{ data: { queue_date: "2026-07-01" } }]),
      member_balances: seqTable([
        { data: { credit_balance: 5000, credit_granted: 5000, cash_paid: 5000, next_expiry: "2026-06-30" } },
      ]),
      profiles: seqTable([{ data: { full_name: "Boss" } }]),
      sales: seqTable([{ data: { id: SALE, receipt_no: "R0003" } }]),
      point_transactions: seqTable([{ data: null }]),
    }
    vi.mocked(createClient).mockResolvedValue(fakeSupabase(tables) as never)

    const fd = baseFormData({
      therapist_id: "th1",
      service_id: "svc1",
      payment_method: "เงินสด",
      customer_id: CUST,
      discount: "0",
      credit_requested: "200",
      queue_entry_id: QUEUE,
    })

    const r = await createSale(fd)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("เครดิตหมดอายุเมื่อ 2026-06-30")
  })
})

describe("updateSale — ด่านเครดิตหมดอายุ", () => {
  // wanted = service.price - discount + roomFee(0) — ราคาบริการมาจากตาราง services ที่ mock ไว้ต่อเคส
  // (ไม่ใช่จาก formData) ฟังก์ชันนี้จึงรับแค่ customerId
  function editFormData(customerId: string): FormData {
    return baseFormData({
      updated_at: "v1",
      therapist_id: "th1",
      service_id: "svc1",
      payment_method: MEMBER_CREDIT_METHOD,
      customer_id: customerId,
      discount: "0",
    })
  }

  it("เทียบวันหมดอายุกับ sale_date เดิมของบิล ไม่ใช่วันนี้ — แก้บิลเก่าที่คีย์ก่อนหมดอายุต้องทำได้แม้วันนี้เลยหมดอายุไปแล้ว", async () => {
    const tables = {
      sales: seqTable([
        { data: { sale_date: "2026-08-01", credit_used: 0, customer_id: CUST, updated_at: "v1" } }, // existing
        { data: [{ id: SALE }] }, // update สำเร็จ
      ]),
      services: seqTable([{ data: { name: "นวดไทย", price: 500, commission: 100, duration_min: 60 } }]),
      member_balances: seqTable([
        { data: { credit_balance: 1000, credit_granted: 1000, cash_paid: 1000, next_expiry: "2026-08-05" } },
      ]),
      queue_entries: seqTable([{ data: null }]), // sync มิเรอร์การ์ดคิว (ไม่มีการ์ดผูกก็ไม่เป็นไร)
      point_transactions: seqTable([{ data: null }]),
      v_point_balances: seqTable([{ data: { balance: 0 } }]),
    }
    vi.mocked(createClient).mockResolvedValue(fakeSupabase(tables) as never)

    const r = await updateSale(SALE, editFormData(CUST))

    expect(r.ok).toBe(true)
  })

  it("แก้บิลเดิมของลูกค้าคนเดิม ตัดเท่าเดิมหลังหมดอายุ — previouslyUsed ต้องยังให้แก้ได้", async () => {
    // บิลเดิมวันที่ 2026-08-10 ตัดเครดิตไป 300 อยู่แล้ว วันหมดอายุ 2026-08-05 (หมดอายุไปแล้วตอนบิลนี้เกิดขึ้นจริง)
    // แก้บิล (ตัดเท่าเดิม 300) ต้องยังทำได้ ไม่ใช่การ "ใช้เครดิตใหม่" หลังหมดอายุ
    const tables = {
      sales: seqTable([
        { data: { sale_date: "2026-08-10", credit_used: 300, customer_id: CUST, updated_at: "v1" } },
        { data: [{ id: SALE }] },
      ]),
      services: seqTable([{ data: { name: "นวดไทย", price: 300, commission: 100, duration_min: 60 } }]),
      member_balances: seqTable([
        { data: { credit_balance: 500, credit_granted: 500, cash_paid: 500, next_expiry: "2026-08-05" } },
      ]),
      queue_entries: seqTable([{ data: null }]),
      point_transactions: seqTable([{ data: null }]),
      v_point_balances: seqTable([{ data: { balance: 0 } }]),
    }
    vi.mocked(createClient).mockResolvedValue(fakeSupabase(tables) as never)

    const r = await updateSale(SALE, editFormData(CUST))

    expect(r.ok).toBe(true)
  })

  it("สลับลูกค้าในบิลตอนแก้ — เครดิตที่เคยตัดของลูกค้าเดิมต้องไม่ตามมาด้วย ถ้าลูกค้าใหม่เครดิตหมดอายุต้องบล็อก", async () => {
    // บิลเดิมเป็นของ CUST_OLD ตัดเครดิตไป 300 · พนักงานแก้บิลสลับไปเป็น CUST_NEW ที่เครดิตหมดอายุไปแล้ว
    // (หมดอายุ 2026-08-05 ก่อนวันที่บิล 2026-08-10) — previouslyUsed ของ CUST_OLD ต้องไม่ใช้เป็นข้ออ้างปลดล็อก
    // ให้ CUST_NEW เพราะเป็นคนละคน ต้องถูกบล็อกเหมือนลูกค้าใหม่ที่ไม่เคยตัดอะไรมาก่อนเลย
    const tables = {
      sales: seqTable([
        { data: { sale_date: "2026-08-10", credit_used: 300, customer_id: CUST_OLD, updated_at: "v1" } },
      ]),
      services: seqTable([{ data: { name: "นวดไทย", price: 300, commission: 100, duration_min: 60 } }]),
      member_balances: seqTable([
        { data: { credit_balance: 150, credit_granted: 150, cash_paid: 150, next_expiry: "2026-08-05" } },
      ]),
    }
    vi.mocked(createClient).mockResolvedValue(fakeSupabase(tables) as never)

    const r = await updateSale(SALE, editFormData(CUST_NEW))

    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain("เครดิตหมดอายุเมื่อ 2026-08-05")
    }
  })

  it("ข้อความหมดอายุต้องบอกยอดจริงในกระปุกลูกค้า ไม่ใช่ headroom ที่บวก previouslyUsed ของบิลนี้เข้าไปด้วย", async () => {
    // ลูกค้าคนเดิม เครดิตเหลือจริง 150 บาท เคยตัดบิลนี้ไปแล้ว 300 (headroom = 150+300 = 450)
    // แก้บิลนี้ให้ตัดเพิ่มเป็น 400 (มากกว่าที่เคยตัดไว้ 300) บนบิลที่หมดอายุไปแล้ว → ต้องถูกบล็อก
    // และข้อความต้องพูดถึง 150 (ยอดจริงที่ลูกค้ามี) ไม่ใช่ 450 (headroom) — พนักงานอ่านให้ลูกค้าฟังหน้าเคาน์เตอร์
    const tables = {
      sales: seqTable([
        { data: { sale_date: "2026-08-10", credit_used: 300, customer_id: CUST, updated_at: "v1" } },
      ]),
      services: seqTable([{ data: { name: "นวดไทย", price: 400, commission: 100, duration_min: 60 } }]),
      member_balances: seqTable([
        { data: { credit_balance: 150, credit_granted: 150, cash_paid: 150, next_expiry: "2026-08-05" } },
      ]),
    }
    vi.mocked(createClient).mockResolvedValue(fakeSupabase(tables) as never)

    const r = await updateSale(SALE, editFormData(CUST))

    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain("ยอด 150 ฿")
      expect(r.error).not.toContain("450")
    }
  })
})

describe("createSale — วันเงินเข้าของบรรทัดชำระ", () => {
  // "วันนี้" ถูกตรึงไว้ที่ 2026-08-11 ในไฟล์นี้ (ดู vi.mock ด้านบนสุด) เทสต์กลุ่มนี้จึงพิสูจน์ได้ว่า
  // โค้ดใช้วันของบิล ไม่ใช่วันที่กดคีย์ โดยไม่ต้องพึ่งวันจริงของเครื่องที่รันเทสต์
  function tablesFor(queueDate: string | null, capture: { insert: unknown[] }) {
    return {
      services: seqTable([{ data: { name: "นวดแผนไทย", price: 550, commission: 225, duration_min: 90 } }]),
      queue_entries: seqTable([
        { data: queueDate ? { queue_date: queueDate } : null },
        { data: null }, // update ปิดคิวเป็น paid ท้ายฟังก์ชัน
      ]),
      profiles: seqTable([{ data: { full_name: "Boss" } }]),
      sales: seqTable([{ data: { id: SALE, receipt_no: "R0100" } }]),
      bill_payments: seqTable([{ data: null }], capture),
      point_transactions: seqTable([{ data: null }]),
    }
  }

  function saleForm(extra: Record<string, string>): FormData {
    return baseFormData({
      therapist_id: "th1",
      service_id: "svc1",
      payment_method: "QR Code",
      discount: "0",
      payments: JSON.stringify([{ method: "QR Code", amount: 550 }]),
      ...extra,
    })
  }

  /** บรรทัดชำระถูก insert เป็นอาร์เรย์ก้อนเดียว — คืนแถวแรกออกมาตรวจ */
  function firstLine(capture: { insert: unknown[] }) {
    expect(capture.insert).toHaveLength(1)
    const rows = capture.insert[0] as { received_date: string; amount: number }[]
    expect(rows).toHaveLength(1)
    return rows[0]
  }

  it("บิลที่ผูกคิวย้อนหลัง วันเงินเข้าต้องเป็นวันที่ให้บริการ ไม่ใช่วันที่กดคีย์", async () => {
    // เคสจริง 2026-08-13: บิลนิกกี้เป็นงานของวันที่ 2 ส.ค. แต่พนักงานเพิ่งมาคีย์วันที่ 13
    // เดิมระบบประทับวันที่กด เงิน 550 บาทเลยไปโผล่ในยอดเงินเข้าของวันที่ 13 จนไม่ตรงกับ ThaiHand
    const lines = { insert: [] as unknown[] }
    vi.mocked(createClient).mockResolvedValue(
      fakeSupabase(tablesFor("2026-08-02", lines)) as never
    )

    const r = await createSale(saleForm({ queue_entry_id: QUEUE }))

    expect(r.ok).toBe(true)
    expect(firstLine(lines).received_date).toBe("2026-08-02")
  })

  it("บิลของวันนี้ วันเงินเข้ายังเป็นวันนี้เหมือนเดิม", async () => {
    // กันการแก้เกินขอบเขต: บิลปกติ (ไม่ผูกคิวย้อนหลัง) พฤติกรรมต้องไม่เปลี่ยนเลย
    const lines = { insert: [] as unknown[] }
    vi.mocked(createClient).mockResolvedValue(fakeSupabase(tablesFor(null, lines)) as never)

    const r = await createSale(saleForm({}))

    expect(r.ok).toBe(true)
    expect(firstLine(lines).received_date).toBe("2026-08-11")
  })
})
