import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }))
vi.mock("@/lib/auth", () => ({ getMyProfile: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { updateTag } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { saveService, saveSetting, saveTherapist } from "./settings-actions"

/**
 * supabase ปลอมที่ insert/update/upsert/select สำเร็จเสมอ — เทสต์นี้สนแค่ว่า
 * tag ถูกล้างเมื่อไหร่ ไม่ได้ตรวจ payload ที่ส่งเข้า DB
 * ครอบ method ตามที่ saveTherapist/saveService/saveSetting เรียกจริง:
 * - saveTherapist: insert/update + eq
 * - saveService (ไม่มี id ในเทสต์นี้): insert อย่างเดียว (ไม่ผ่านสาขา select current price/commission)
 * - saveSetting: upsert
 */
function okSupabase() {
  const chain: Record<string, unknown> = {}
  for (const m of ["update", "insert", "upsert", "select", "eq", "single", "maybeSingle"]) {
    chain[m] = vi.fn(() => chain)
  }
  chain.then = (resolve: (v: { error: null }) => void) => resolve({ error: null })
  return { from: vi.fn(() => chain) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createClient).mockResolvedValue(okSupabase() as never)
})

function fd(pairs: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(pairs)) f.set(k, v)
  return f
}

describe("cache invalidation ของข้อมูลกึ่งนิ่ง", () => {
  it("บันทึกหมอนวดสำเร็จ → ล้าง tag therapists ทันที (updateTag ไม่ใช่ revalidateTag)", async () => {
    const r = await saveTherapist(fd({ name: "ครูใหม่", status: "active" }))
    expect(r.ok).toBe(true)
    expect(updateTag).toHaveBeenCalledWith("therapists")
  })

  it("บันทึกเมนูบริการสำเร็จ → ล้าง tag services", async () => {
    const r = await saveService(fd({ name: "นวดไทย", price: "300", commission: "100" }))
    expect(r.ok).toBe(true)
    expect(updateTag).toHaveBeenCalledWith("services")
  })

  it("บันทึกตั้งค่าสำเร็จ → ล้าง tag settings", async () => {
    const r = await saveSetting("shop_open", "10:00")
    expect(r.ok).toBe(true)
    expect(updateTag).toHaveBeenCalledWith("settings")
  })

  it("ข้อมูลไม่ผ่าน validation → ไม่แตะ cache", async () => {
    const r = await saveTherapist(fd({ name: "", status: "active" }))
    expect(r.ok).toBe(false)
    expect(updateTag).not.toHaveBeenCalled()
  })
})
