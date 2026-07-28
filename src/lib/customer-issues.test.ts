import { describe, expect, it } from "vitest"
import { ISSUES, issueBadgeClass, issuesOf } from "./customer-issues"

describe("issuesOf", () => {
  it("ไม่มีปัญหา = ไม่มีป้าย", () => {
    expect(
      issuesOf({
        dup_phone: false,
        no_phone: false,
        bad_phone: false,
        negative_credit: false,
        negative_points: false,
      })
    ).toEqual([])
  })

  it("มีหลายปัญหาพร้อมกัน ต้องขึ้นครบทุกป้าย", () => {
    // เคสจริง: ลูกค้าชื่อ "โอ๋" เบอร์ 611230256 ซ้ำกับ "โอ" และขาดเลข 0 หน้า
    const keys = issuesOf({ dup_phone: true, bad_phone: true }).map((i) => i.key)
    expect(keys).toEqual(["dup_phone", "bad_phone"])
  })

  // ป้ายต้องเรียงเหมือนกันทุกแถว ไม่งั้นตากวาดตารางแล้วสะดุด
  it("ลำดับป้ายตาม ISSUES เสมอ ไม่ขึ้นกับลำดับคีย์ที่ส่งมา", () => {
    const a = issuesOf({ negative_credit: true, dup_phone: true }).map((i) => i.key)
    const b = issuesOf({ dup_phone: true, negative_credit: true }).map((i) => i.key)
    expect(a).toEqual(b)
    expect(a.indexOf("dup_phone")).toBeLessThan(a.indexOf("negative_credit"))
  })

  it("null ถือว่าไม่เป็นปัญหา", () => {
    expect(issuesOf({ dup_phone: null, no_phone: null })).toEqual([])
  })

  it("คีย์ที่ไม่ได้ส่งมาเลย ถือว่าไม่เป็นปัญหา", () => {
    expect(issuesOf({}).length).toBe(0)
  })
})

describe("ISSUES", () => {
  it("มีครบ 5 แบบ และคีย์ไม่ซ้ำกัน", () => {
    expect(ISSUES).toHaveLength(5)
    expect(new Set(ISSUES.map((i) => i.key)).size).toBe(5)
  })

  it("ทุกป้ายมีชื่อไทยและคำอธิบายว่าทำไมถึงเป็นปัญหา", () => {
    for (const i of ISSUES) {
      expect(i.label.length).toBeGreaterThan(0)
      expect(i.why.length).toBeGreaterThan(0)
    }
  })

  it("แบ่งเป็นกลุ่มตัวตน 3 กับกลุ่มเงิน 2", () => {
    expect(ISSUES.filter((i) => i.tone === "identity")).toHaveLength(3)
    expect(ISSUES.filter((i) => i.tone === "money")).toHaveLength(2)
  })
})

describe("issueBadgeClass", () => {
  it("กลุ่มเงินเป็นสีแดง กลุ่มตัวตนเป็นสีเหลือง", () => {
    expect(issueBadgeClass("money")).toContain("red")
    expect(issueBadgeClass("identity")).toContain("amber")
  })
})
