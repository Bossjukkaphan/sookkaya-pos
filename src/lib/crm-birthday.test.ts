import { describe, expect, it, vi } from "vitest"

import { birthdayTodayCustomers, birthdayUpcomingCustomers } from "./crm-birthday"

/** ตาราง customers + crm_contacts ปลอม — คุมข้อมูลเองทุกแถว */
function fakeSupabase(customers: unknown[], contacts: unknown[]) {
  return {
    from: vi.fn((table: string) => {
      const c: Record<string, unknown> = {}
      for (const m of ["select", "not", "eq", "gte"]) c[m] = vi.fn(() => c)
      c.then = (resolve: (v: { data: unknown[] }) => void) =>
        resolve({ data: table === "customers" ? customers : contacts })
      return c
    }),
  } as never
}

const CUST = (id: string, birthday: string) => ({ id, name: id, nickname: null, birthday })

describe("birthdayUpcomingCustomers", () => {
  it("รวมวันนี้ (daysUntil 0) และพรุ่งนี้ (daysUntil 1) — เกินนั้นไม่เอา", async () => {
    const db = fakeSupabase(
      [CUST("today", "1990-08-09"), CUST("tomorrow", "1990-08-10"), CUST("far", "1990-08-12")],
      []
    )
    const r = await birthdayUpcomingCustomers(db, "2026-08-09")
    expect(r.map((x) => [x.id, x.daysUntil])).toEqual([["today", 0], ["tomorrow", 1]])
  })
  it("คนที่ถูกบันทึกผล birthday ใน 30 วันแล้ว ไม่โผล่", async () => {
    const db = fakeSupabase([CUST("a", "1990-08-09")], [{ customer_id: "a" }])
    expect(await birthdayUpcomingCustomers(db, "2026-08-09")).toEqual([])
  })
  it("ข้ามเดือน: วันนี้สิ้นเดือน พรุ่งนี้คือวันที่ 1", async () => {
    const db = fakeSupabase([CUST("next", "1990-09-01")], [])
    const r = await birthdayUpcomingCustomers(db, "2026-08-31")
    expect(r.map((x) => [x.id, x.daysUntil])).toEqual([["next", 1]])
  })
  it("birthdayTodayCustomers เดิมพฤติกรรมเดิม (วันนี้เท่านั้น)", async () => {
    const db = fakeSupabase([CUST("today", "1990-08-09"), CUST("tmr", "1990-08-10")], [])
    const r = await birthdayTodayCustomers(db, "2026-08-09")
    expect(r.map((x) => x.id)).toEqual(["today"])
  })
})
