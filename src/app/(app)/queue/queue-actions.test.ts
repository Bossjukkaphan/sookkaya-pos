import { beforeEach, describe, expect, it, vi } from "vitest"

// mock ทุกอย่างที่แตะ Next/Supabase/LINE — เทสต์เฉพาะขอบวันของการ์ดคิว
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth", () => ({ getMyProfile: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/line", () => ({ pushLineMessage: vi.fn() }))
vi.mock("@/lib/line-assistant", () => ({ pushAssistantMessage: vi.fn() }))
// "วันนี้" ตรึงไว้กลางเดือน ส.ค. — ขอบที่ทดสอบคือ "เดือนที่ปิดงบแล้ว" ไม่ใช่ "เมื่อวาน"
vi.mock("@/lib/datetime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/datetime")>()
  return { ...actual, todayInShopTz: vi.fn(() => "2026-08-11"), nowTimeInShopTz: vi.fn(() => "10:00") }
})

import { createClient } from "@/lib/supabase/server"
import { createQueueEntry, createQueueGroup, updateQueueEntry } from "./queue-actions"

/** supabase ที่ระเบิดทันทีที่ถูกแตะ — ขอบวันต้องกันก่อนยิงฐานข้อมูลใด ๆ */
function explodingSupabase() {
  return {
    from: vi.fn((table: string) => {
      throw new Error(`ไม่ควรแตะตาราง ${table} เลยเมื่อวันคิวไม่ผ่านขอบ`)
    }),
  }
}

function queueForm(queueDate: string): FormData {
  const fd = new FormData()
  fd.set("service_id", "svc1")
  fd.set("start_time", "13:00")
  fd.set("duration_min", "60")
  fd.set("queue_date", queueDate)
  fd.set("source", "walk_in")
  return fd
}

type Result = { data: unknown; error?: { message: string } | null }

/** โต๊ะปลอมแบบ sequence — เรียก from(table) ครั้งที่ N ได้ผลลัพธ์ตัวที่ N (ค้างตัวสุดท้ายถ้าเรียกเกิน)
 *  รูปแบบเดียวกับ src/app/(app)/sale-actions.test.ts — รองรับ select/eq/or/in/not/limit/insert/update
 *  แล้วจบด้วย .single()/.maybeSingle() หรือ await ตรงๆ (thenable) ก็ได้ทั้งคู่ */
function seqTable(results: Result[], capture?: { insert?: unknown[]; update?: unknown[] }) {
  let i = 0
  return () => {
    const result = results[Math.min(i, results.length - 1)]
    i++
    const q: Record<string, unknown> = {}
    q.select = vi.fn(() => q)
    q.eq = vi.fn(() => q)
    q.or = vi.fn(() => q)
    q.in = vi.fn(() => q)
    q.order = vi.fn(() => q)
    q.limit = vi.fn(() => q)
    q.not = vi.fn(() => q)
    q.neq = vi.fn(() => q)
    q.insert = vi.fn((row: unknown) => {
      capture?.insert?.push(row)
      return q
    })
    q.update = vi.fn((row: unknown) => {
      capture?.update?.push(row)
      return q
    })
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
  return { from }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createClient).mockResolvedValue(explodingSupabase() as never)
})

describe("ขอบวันของการ์ดคิว — วันการ์ดคือวันที่ของบิลที่ด่านเครดิตเอาไปเทียบวันหมดอายุ", () => {
  it("เดือนก่อนที่ปิดงบไปแล้ว เพิ่มคิวไม่ได้ — /queue?date= รับวันอะไรก็ได้ ขอบต้องอยู่ฝั่ง server", () => {
    // ถ้าไม่มีขอบนี้: การ์ดลงวัน 2026-07-01 แล้วกดเก็บเงินด้วยเครดิตสมาชิก จะทำให้
    // checkCreditSpend เทียบวันหมดอายุกับ 2026-07-01 แล้วปล่อยเครดิตแช่แข็งทั้งก้อนออกไป
    return expect(createQueueEntry(queueForm("2026-07-31"))).resolves.toEqual({
      ok: false,
      error: "วันคิว 2026-07-31 อยู่ในเดือนที่ปิดงบไปแล้ว — เพิ่มคิวย้อนหลังได้เฉพาะเดือนปัจจุบัน",
    })
  })

  it("คิวกลุ่มใช้ขอบเดียวกัน — ทางเข้าที่สองต้องไม่หลุด", () => {
    const shared = queueForm("2026-07-31")
    return expect(
      createQueueGroup(shared, [
        { serviceId: "svc1" },
        { serviceId: "svc1" },
      ] as never)
    ).resolves.toEqual({
      ok: false,
      error: "วันคิว 2026-07-31 อยู่ในเดือนที่ปิดงบไปแล้ว — เพิ่มคิวย้อนหลังได้เฉพาะเดือนปัจจุบัน",
    })
  })

  it("ย้อนหลังภายในเดือนปัจจุบันยังทำได้ — ร้านคีย์ตามหลังของจริงเป็นปกติ", async () => {
    // ผ่านขอบวันแล้วเดินต่อไปแตะฐานข้อมูล (supabase ปลอมระเบิด) = พิสูจน์ว่าไม่ได้ถูกกันที่ขอบวัน
    await expect(createQueueEntry(queueForm("2026-08-01"))).rejects.toThrow("ไม่ควรแตะตาราง services")
  })

  it("จองล่วงหน้าข้ามเดือนยังทำได้ — วันในอนาคตไม่ใช่ทางปลดล็อกเครดิตแช่แข็ง", async () => {
    await expect(createQueueEntry(queueForm("2026-09-02"))).rejects.toThrow("ไม่ควรแตะตาราง services")
  })
})

describe("bed_id_2 ตัดทิ้งถ้าเมนูไม่ได้ตั้ง splits_room — server เป็นด่านสุดท้าย ไม่พึ่ง client อย่างเดียว", () => {
  // เคสที่ฟีเจอร์นี้ต้องกัน: พนักงานเลือกเมนู 120 นาทีที่แยกห้อง กดห้องที่สองไว้ แล้วลูกค้า
  // เปลี่ยนใจเหลือ 60 นาที (ไม่แยกห้อง) พนักงานสลับเมนูแล้วบันทึก — ถ้า bed_id_2 ยังติดไปด้วย
  // ระบบจะเข้าใจผิดว่าเตียงที่สองถูกครองทั้งที่ลูกค้าไม่เคยแตะห้องนั้นเลย
  function formWithBeds(queueDate: string): FormData {
    const fd = queueForm(queueDate)
    fd.set("bed_id", "bed-1")
    fd.set("bed_id_2", "bed-2") // ส่งมาเสมอไม่ว่าเมนูจะแยกห้องจริงไหม — server ต้องกรองเอง
    return fd
  }

  it("createQueueEntry — เมนูไม่แยกห้อง (splits_room: false) → บันทึก bed_id_2 เป็น null เสมอ", async () => {
    const written: { insert: unknown[] } = { insert: [] }
    const tables = {
      services: seqTable([{ data: { name: "นวดไทย 60 นาที", splits_room: false } }]),
      queue_entries: seqTable(
        [
          { data: [] }, // bedConflictError: ช่วงเดียว (bed_id_2 ถูกตัดแล้วก่อนเช็คด้วย)
          { data: null }, // insert
        ],
        written
      ),
    }
    vi.mocked(createClient).mockResolvedValue(fakeSupabase(tables) as never)

    const r = await createQueueEntry(formWithBeds("2026-08-11"))

    expect(r.ok).toBe(true)
    expect(written.insert).toHaveLength(1)
    expect(written.insert[0]).toMatchObject({ bed_id: "bed-1", bed_id_2: null })
  })

  it("createQueueEntry — เมนูแยกห้อง (splits_room: true) → bed_id_2 ที่พนักงานเลือกถูกเก็บจริง", async () => {
    const written: { insert: unknown[] } = { insert: [] }
    const tables = {
      services: seqTable([{ data: { name: "นวดคลายเท้า & คอบ่าไหล่ 120 นาที", splits_room: true } }]),
      queue_entries: seqTable(
        [
          { data: [] }, // ห้องแรก
          { data: [] }, // ห้องที่สอง
          { data: null }, // insert
        ],
        written
      ),
    }
    vi.mocked(createClient).mockResolvedValue(fakeSupabase(tables) as never)

    const fd = formWithBeds("2026-08-11")
    fd.set("duration_min", "120")
    const r = await createQueueEntry(fd)

    expect(r.ok).toBe(true)
    expect(written.insert[0]).toMatchObject({ bed_id: "bed-1", bed_id_2: "bed-2" })
  })

  it("updateQueueEntry — สลับเมนูมาเป็นเมนูไม่แยกห้อง → ห้องที่สองเดิมของการ์ดต้องถูกล้าง", async () => {
    const written: { update: unknown[] } = { update: [] }
    const tables = {
      services: seqTable([{ data: { name: "นวดไทย 60 นาที", splits_room: false } }]),
      queue_entries: seqTable(
        [
          { data: { queue_date: "2026-08-11" } }, // select current
          { data: [] }, // bedConflictError
          { data: null }, // update
        ],
        written
      ),
    }
    vi.mocked(createClient).mockResolvedValue(fakeSupabase(tables) as never)

    const r = await updateQueueEntry("q1", formWithBeds("2026-08-11"))

    expect(r.ok).toBe(true)
    expect(written.update[0]).toMatchObject({ bed_id: "bed-1", bed_id_2: null })
  })

  it("createQueueGroup — คนในกลุ่มที่เลือกเมนูไม่แยกห้อง ต้องไม่บันทึก bed_id_2 แม้ client ส่งมา", async () => {
    const written: { insert: unknown[] } = { insert: [] }
    const tables = {
      queue_entries: seqTable(
        [
          { data: [] }, // คนที่ 1: bedConflictError (ไม่ได้ตั้ง client_key เลยไม่มี dup check มาแทรก)
          { data: [] }, // คนที่ 2: bedConflictError
          { data: null }, // insert ทั้งกลุ่ม
        ],
        written
      ),
      services: seqTable([
        {
          data: [
            { id: "svc1", name: "นวดไทย 60 นาที", duration_min: 60, splits_room: false },
            { id: "svc2", name: "นวดไทย 60 นาที", duration_min: 60, splits_room: false },
          ],
        },
      ]),
    }
    vi.mocked(createClient).mockResolvedValue(fakeSupabase(tables) as never)

    const shared = queueForm("2026-08-11")
    const r = await createQueueGroup(shared, [
      { serviceId: "svc1", bedId: "bed-1", bedId2: "bed-2" },
      { serviceId: "svc2", bedId: "bed-3", bedId2: "bed-4" },
    ] as never)

    expect(r.ok).toBe(true)
    const rows = written.insert[0] as { bed_id_2: string | null }[]
    expect(rows.every((row) => row.bed_id_2 === null)).toBe(true)
  })
})

describe("เช็คเตียงชนพลาด (query error) — ต้องปฏิเสธ ไม่ใช่ปล่อยผ่านเงียบๆ ว่าเตียงว่าง", () => {
  it("createQueueEntry — findBedClash คืน error → ไม่บันทึก และบอกว่าเช็คเตียงไม่สำเร็จ", async () => {
    const written: { insert: unknown[] } = { insert: [] }
    const tables = {
      services: seqTable([{ data: { name: "นวดไทย 60 นาที", splits_room: false } }]),
      queue_entries: seqTable(
        [{ data: null, error: { message: "connection reset" } }], // bedConflictError query พัง
        written
      ),
    }
    vi.mocked(createClient).mockResolvedValue(fakeSupabase(tables) as never)

    const fd = queueForm("2026-08-11")
    fd.set("bed_id", "bed-1")
    const r = await createQueueEntry(fd)

    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain("เช็คเตียงว่างไม่สำเร็จ")
      expect(r.error).toContain("connection reset")
    }
    // ต้องหยุดก่อนเขียน — เช็คไม่ผ่านห้ามให้บันทึกลงไปทั้งที่ไม่รู้ว่าเตียงว่างจริงไหม
    expect(written.insert).toHaveLength(0)
  })
})
