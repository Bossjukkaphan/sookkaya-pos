import { describe, expect, it } from "vitest"
import { breakEvenSessions, isMonthIncomplete, unitEconomics } from "./finance"

describe("unitEconomics", () => {
  it("คำนวณจากตัวเลขจริงเดือน มิ.ย. 69", () => {
    const u = unitEconomics({
      netRevenue: 347018, sessions: 529,
      variableCost: 125059, fixedCost: 104648, onetimeCost: 28320,
    })
    expect(u.revenuePerSession).toBe(656)
    expect(u.variableCostPerSession).toBe(236)
    expect(u.contributionMargin).toBe(420)
  })

  it("ไม่หารด้วยศูนย์เมื่อไม่มีเซสชัน", () => {
    const u = unitEconomics({
      netRevenue: 0, sessions: 0, variableCost: 0, fixedCost: 50000, onetimeCost: 0,
    })
    expect(u.revenuePerSession).toBe(0)
    expect(u.contributionMargin).toBe(0)
  })
})

describe("breakEvenSessions", () => {
  it("ปัดขึ้นเสมอ เพราะทำเซสชันครึ่งเดียวไม่ได้", () => {
    expect(breakEvenSessions(104648, 420)).toBe(250)
    expect(breakEvenSessions(1000, 300)).toBe(4)
  })

  it("คืน null เมื่อกำไรต่อเซสชันเป็นศูนย์หรือติดลบ — คุ้มทุนไม่ได้เลย", () => {
    expect(breakEvenSessions(104648, 0)).toBeNull()
    expect(breakEvenSessions(104648, -50)).toBeNull()
  })
})

describe("isMonthIncomplete", () => {
  it("เตือนเมื่อต้นทุนคงที่ต่ำกว่าครึ่งของค่าเฉลี่ยย้อนหลัง", () => {
    expect(isMonthIncomplete(2636, [77757, 102666, 104648])).toBe(true)
  })

  it("ไม่เตือนเมื่อบันทึกครบตามปกติ", () => {
    expect(isMonthIncomplete(104648, [77757, 75815, 102666])).toBe(false)
  })

  it("ไม่เตือนเมื่อยังไม่มีข้อมูลย้อนหลังให้เทียบ", () => {
    expect(isMonthIncomplete(0, [])).toBe(false)
  })
})
