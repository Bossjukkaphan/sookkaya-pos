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
import { createQueueEntry, createQueueGroup } from "./queue-actions"

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
