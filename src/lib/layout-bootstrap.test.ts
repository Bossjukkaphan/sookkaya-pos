// src/lib/layout-bootstrap.test.ts
import { describe, expect, it, vi } from "vitest"

import { layoutBootstrap, parseLayoutBootstrap } from "./layout-bootstrap"

const FULL = {
  profile: { id: "u1", email: "a@b.c", full_name: "บอส", role: "admin" },
  pending_count: 3,
  birthdays: [{ id: "c1", name: "สมชาย", nickname: "ชาย" }],
  expense_reminders: [
    { duty: "therapist_fee", due: "2026-08-20" },
    { duty: "salary", due: "2026-07-31" },
  ],
}

describe("parseLayoutBootstrap", () => {
  it("แปลงผล RPC ครบทุกช่อง และ map duty+due เป็น label ไทย", () => {
    const r = parseLayoutBootstrap(FULL)
    expect(r.profile?.role).toBe("admin")
    expect(r.pendingCount).toBe(3)
    expect(r.birthdays).toHaveLength(1)
    // label ต้องตรงกับ expenseReminderLabel เดิม — รอบ 20 ส.ค. และเงินเดือน ก.ค.
    expect(r.expenseReminders[0].label).toContain("ค่ามือหมอ")
    expect(r.expenseReminders[0].label).toContain("20")
    expect(r.expenseReminders[1].label).toContain("เงินเดือน")
  })

  it("profile null (คนนอก allowlist) และลิสต์ว่าง — ไม่พัง", () => {
    const r = parseLayoutBootstrap({
      profile: null, pending_count: 0, birthdays: [], expense_reminders: [],
    })
    expect(r.profile).toBeNull()
    expect(r.pendingCount).toBe(0)
    expect(r.expenseReminders).toEqual([])
  })

  it("ข้อมูลเพี้ยน (ไม่ใช่ object) → ค่า default ปลอดภัย ไม่ throw", () => {
    const r = parseLayoutBootstrap(null)
    expect(r).toEqual({ profile: null, pendingCount: 0, birthdays: [], expenseReminders: [] })
  })

  it("สมาชิกใน array เพี้ยนเป็นรายตัว (เช่น null) → คัดทิ้งเฉพาะตัวนั้น ไม่ throw", () => {
    const r = parseLayoutBootstrap({
      profile: null,
      pending_count: 0,
      birthdays: [null, { id: "c1", name: "สมชาย", nickname: null }],
      expense_reminders: [null, { duty: "salary", due: "2026-07-31" }],
    })
    expect(r.birthdays).toHaveLength(1)
    expect(r.birthdays[0].id).toBe("c1")
    expect(r.expenseReminders).toHaveLength(1)
    expect(r.expenseReminders[0].label).toContain("เงินเดือน")
  })

  it("duty บิลประจำใหม่ได้ label ถูกงาน ส่วน duty แปลกหน้า (SQL ใหม่กว่า app) ถูกคัดทิ้ง", () => {
    const r = parseLayoutBootstrap({
      profile: null,
      pending_count: 0,
      birthdays: [],
      expense_reminders: [
        { duty: "water", due: "2026-07-31" },
        { duty: "internet", due: "2026-08-12" },
        { duty: "duty_from_the_future", due: "2026-08-12" },
      ],
    })
    expect(r.expenseReminders.map((x) => x.label)).toEqual([
      "🚰 อย่าลืมบันทึกค่าน้ำ เดือน ก.ค.",
      "🌐 อย่าลืมบันทึกค่าเน็ต/โทรศัพท์ร้าน รอบต้นเดือน ส.ค.",
    ])
  })
})

describe("layoutBootstrap", () => {
  it("เรียก rpc ด้วยชื่อ/พารามิเตอร์ถูก และส่งผลผ่าน parse", async () => {
    const rpc = vi.fn(async () => ({ data: FULL, error: null }))
    const r = await layoutBootstrap({ rpc } as never, "2026-08-09")
    expect(rpc).toHaveBeenCalledWith("layout_bootstrap", { p_today: "2026-08-09" })
    expect(r.pendingCount).toBe(3)
  })

  it("RPC error → degrade เงียบเหมือนพฤติกรรม layout เดิม (ทุกอย่างว่าง ไม่ throw)", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }))
    const r = await layoutBootstrap({ rpc } as never, "2026-08-09")
    expect(r.profile).toBeNull()
    expect(r.pendingCount).toBe(0)
  })
})
