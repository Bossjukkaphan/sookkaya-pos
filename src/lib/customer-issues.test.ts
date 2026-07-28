import { describe, expect, it } from "vitest"
import { ISSUES, issueBadgeClass, issuesOf } from "./customer-issues"
import type { CustomerIssueRow, IssueKey } from "./customer-issues"

/** ธงครบห้าตัวโดยตั้งต้นเป็น false — เทสระบุเฉพาะตัวที่สนใจ
 *  (row จริงจาก view มีครบทุกคอลัมน์เสมอ เทสจึงควรสะท้อนความจริงข้อนั้น) */
function flags(on: Partial<Record<IssueKey, boolean | null>> = {}) {
  return {
    dup_phone: false,
    no_phone: false,
    bad_phone: false,
    negative_credit: false,
    negative_points: false,
    ...on,
  }
}

describe("issuesOf", () => {
  it("ไม่มีปัญหา = ไม่มีป้าย", () => {
    expect(
      issuesOf(
        flags({
          dup_phone: false,
          no_phone: false,
          bad_phone: false,
          negative_credit: false,
          negative_points: false,
        })
      )
    ).toEqual([])
  })

  it("มีหลายปัญหาพร้อมกัน ต้องขึ้นครบทุกป้าย", () => {
    // เคสจริง: ลูกค้าชื่อ "โอ๋" เบอร์ 611230256 ซ้ำกับ "โอ" และขาดเลข 0 หน้า
    const keys = issuesOf(flags({ dup_phone: true, bad_phone: true })).map((i) => i.key)
    expect(keys).toEqual(["dup_phone", "bad_phone"])
  })

  // ป้ายต้องเรียงเหมือนกันทุกแถว ไม่งั้นตากวาดตารางแล้วสะดุด
  it("ลำดับป้ายตาม ISSUES เสมอ ไม่ขึ้นกับลำดับคีย์ที่ส่งมา", () => {
    const a = issuesOf(flags({ negative_credit: true, dup_phone: true })).map((i) => i.key)
    const b = issuesOf(flags({ dup_phone: true, negative_credit: true })).map((i) => i.key)
    expect(a).toEqual(b)
    expect(a.indexOf("dup_phone")).toBeLessThan(a.indexOf("negative_credit"))
  })

  it("null ถือว่าไม่เป็นปัญหา", () => {
    expect(issuesOf(flags({ dup_phone: null, no_phone: null }))).toEqual([])
  })

  it("คีย์ที่ไม่ได้ส่งมาเลย ถือว่าไม่เป็นปัญหา", () => {
    expect(issuesOf(flags()).length).toBe(0)
  })

  it("ค่าที่ไม่ใช่ true เป๊ะๆ ไม่นับเป็นปัญหา", () => {
    // กันคนมาเปลี่ยนเป็น truthy check ในอนาคต แล้วค่าแปลกๆ จากไดรเวอร์กลายเป็นป้ายผี
    expect(issuesOf(flags({ dup_phone: 1 as unknown as boolean }))).toEqual([])
  })

  it("แถวเต็มรูปแบบจาก view เรียกได้โดยไม่ต้องแปลงอะไร", () => {
    // ผูกเทสกับ type จริงของ view — ถ้าคอลัมน์ธงถูกเปลี่ยนชื่อ เทสนี้จะคอมไพล์ไม่ผ่าน
    const row: CustomerIssueRow = {
      customer_id: "x",
      name: "โอ๋",
      nickname: null,
      phone: "611230256",
      customer_type: "ลูกค้าทั่วไป",
      credit_balance: 0,
      visits: 2,
      last_visit: "2026-03-17",
      dup_phone: true,
      no_phone: false,
      bad_phone: true,
      negative_credit: false,
      negative_points: false,
    }
    expect(issuesOf(row).map((i) => i.key)).toEqual(["dup_phone", "bad_phone"])
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
