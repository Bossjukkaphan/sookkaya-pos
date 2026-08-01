import { beforeEach, describe, expect, it, vi } from "vitest"

// mock ทุกอย่างที่แตะ Next/Supabase/LINE — เทสต์เฉพาะลอจิกของ action
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth", () => ({ getMyProfile: vi.fn() }))
vi.mock("@/lib/line", () => ({ pushLineMessage: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { getMyProfile } from "@/lib/auth"
import { pushLineMessage } from "@/lib/line"
import { createClient } from "@/lib/supabase/server"
import { sendCrmLineMessage } from "./crm-actions"

const CUSTOMER = "11111111-1111-1111-1111-111111111111"
const LINE_UID = "Uabc123"

/** สร้าง supabase ปลอม: คุมผล lookup line_accounts + จับ insert crm_contacts */
function fakeSupabase(opts: { linked: boolean; insertError?: string | null }) {
  const insert = vi.fn().mockResolvedValue({
    error: opts.insertError ? { message: opts.insertError } : null,
  })
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: opts.linked ? { line_user_id: LINE_UID } : null })
  const from = vi.fn((table: string) => {
    if (table === "line_accounts") {
      const chain = {
        select: vi.fn(),
        eq: vi.fn(),
        maybeSingle,
      } as { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; maybeSingle: typeof maybeSingle }
      chain.select.mockReturnValue(chain)
      chain.eq.mockReturnValue(chain)
      return chain
    }
    return { insert }
  })
  return { client: { from }, insert }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getMyProfile).mockResolvedValue({
    id: "u1",
    email: "boss@test.com",
    full_name: "Boss",
    role: "owner",
  } as never)
  vi.mocked(pushLineMessage).mockResolvedValue(true)
})

describe("sendCrmLineMessage", () => {
  it("ยังไม่ล็อกอิน → ปฏิเสธ ไม่ push", async () => {
    vi.mocked(getMyProfile).mockResolvedValue(null)
    const r = await sendCrmLineMessage(CUSTOMER, "birthday", LINE_UID, "สวัสดี")
    expect(r.ok).toBe(false)
    expect(pushLineMessage).not.toHaveBeenCalled()
  })

  it("ข้อความว่าง → ปฏิเสธ ไม่ push", async () => {
    const { client } = fakeSupabase({ linked: true })
    vi.mocked(createClient).mockResolvedValue(client as never)
    const r = await sendCrmLineMessage(CUSTOMER, "birthday", LINE_UID, "   ")
    expect(r.ok).toBe(false)
    expect(pushLineMessage).not.toHaveBeenCalled()
  })

  it("ไลน์ไม่ได้ผูกกับลูกค้าคนนี้ → ปฏิเสธ ไม่ push", async () => {
    const { client } = fakeSupabase({ linked: false })
    vi.mocked(createClient).mockResolvedValue(client as never)
    const r = await sendCrmLineMessage(CUSTOMER, "winback", LINE_UID, "สวัสดี")
    expect(r.ok).toBe(false)
    expect(pushLineMessage).not.toHaveBeenCalled()
  })

  it("push ล้มเหลว → ไม่ insert crm_contacts", async () => {
    const { client, insert } = fakeSupabase({ linked: true })
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(pushLineMessage).mockResolvedValue(false)
    const r = await sendCrmLineMessage(CUSTOMER, "birthday", LINE_UID, "สวัสดี")
    expect(r.ok).toBe(false)
    expect(insert).not.toHaveBeenCalled()
  })

  it("สำเร็จ → push ด้วยข้อความ trim แล้ว + insert result contacted note ส่งไลน์", async () => {
    const { client, insert } = fakeSupabase({ linked: true })
    vi.mocked(createClient).mockResolvedValue(client as never)
    const r = await sendCrmLineMessage(CUSTOMER, "new_follow", LINE_UID, "  สวัสดีค่ะ  ")
    expect(r).toEqual({ ok: true })
    expect(pushLineMessage).toHaveBeenCalledWith(LINE_UID, "สวัสดีค่ะ")
    expect(insert).toHaveBeenCalledWith({
      customer_id: CUSTOMER,
      list_type: "new_follow",
      result: "contacted",
      note: "ส่งไลน์",
      created_by: "Boss",
    })
  })
})
