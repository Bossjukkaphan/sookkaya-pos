import { describe, expect, it } from "vitest"

import { buildCareList, guaranteeFlags, topTherapists } from "./boss-hub"

describe("buildCareList", () => {
  it("เรียง วันเกิด → dormant → เครดิต และตัดที่ 10 แถว", () => {
    const r = buildCareList({
      birthdays: [{ id: "b1", name: "บี", nickname: null, daysUntil: 0 }],
      dormant: Array.from({ length: 7 }, (_, i) => ({
        id: `d${i}`, name: `ด${i}`, ltv: 1000 - i, daysSinceVisit: 70 + i,
      })),
      lowCredit: Array.from({ length: 4 }, (_, i) => ({
        id: `c${i}`, name: `ซ${i}`, balance: 100 + i,
      })),
    })
    expect(r[0].reason).toBe("birthday")
    expect(r.filter((x) => x.reason === "dormant")).toHaveLength(5) // top 5
    expect(r.filter((x) => x.reason === "low_credit")).toHaveLength(3) // top 3
    expect(r.length).toBeLessThanOrEqual(10)
  })
  it("dormant เรียงตาม ltv มาก→น้อย", () => {
    const r = buildCareList({
      birthdays: [],
      dormant: [
        { id: "low", name: "น้อย", ltv: 100, daysSinceVisit: 90 },
        { id: "high", name: "มาก", ltv: 9999, daysSinceVisit: 61 },
      ],
      lowCredit: [],
    })
    expect(r[0].customerId).toBe("high")
  })
  it("ทุกแหล่งว่าง → ลิสต์ว่าง (UI แสดง 'ไม่มีเคสด่วน')", () => {
    expect(buildCareList({ birthdays: [], dormant: [], lowCredit: [] })).toEqual([])
  })
  it("low_credit badge ต้องมี ฿ symbol", () => {
    const r = buildCareList({
      birthdays: [],
      dormant: [],
      lowCredit: [{ id: "c1", name: "ซ1", balance: 120 }],
    })
    expect(r[0].badge).toMatch(/฿/)
    expect(r[0].badge).toBe("💳 เหลือ 120฿")
  })
  it("ไม่แก้ input.dormant array (no mutation)", () => {
    const dormant = [
      { id: "low", name: "น้อย", ltv: 100, daysSinceVisit: 90 },
      { id: "high", name: "มาก", ltv: 9999, daysSinceVisit: 61 },
    ]
    const dormantCopy = JSON.parse(JSON.stringify(dormant))
    buildCareList({
      birthdays: [],
      dormant,
      lowCredit: [],
    })
    // ต้องเหมือนเดิม ไม่เปลี่ยน order
    expect(dormant).toEqual(dormantCopy)
  })
  it("lowCredit เลือก 3 อันเครดิตต่ำสุด (sorted by balance ascending)", () => {
    // ส่งมาไม่เรียง → ต้องเลือก 3 อันต่ำสุด
    const r = buildCareList({
      birthdays: [],
      dormant: [],
      lowCredit: [
        { id: "c1", name: "ซ1", balance: 300 },
        { id: "c2", name: "ซ2", balance: 100 },
        { id: "c3", name: "ซ3", balance: 500 },
        { id: "c4", name: "ซ4", balance: 50 },
      ],
    })
    expect(r).toHaveLength(3)
    // ต้องเป็น c4 (50), c2 (100), c1 (300)
    expect(r[0].customerId).toBe("c4") // 50 ต่ำสุด
    expect(r[1].customerId).toBe("c2") // 100
    expect(r[2].customerId).toBe("c1") // 300
  })
  it("birthday amountLabel ต้องเป็น empty string", () => {
    const r = buildCareList({
      birthdays: [{ id: "b1", name: "บี", nickname: "นิกเนม", daysUntil: 0 }],
      dormant: [],
      lowCredit: [],
    })
    expect(r[0].amountLabel).toBe("")
  })
})

describe("topTherapists", () => {
  it("เรียงตามรายได้ แนบชื่อ และ sharePct เทียบ top1", () => {
    const r = topTherapists(
      [
        { therapist_id: "a", revenue: 500, sessions: 5 },
        { therapist_id: "b", revenue: 1000, sessions: 8 },
      ],
      new Map([["a", "ครูเอ"], ["b", "ครูบี"]]),
      5
    )
    expect(r[0]).toMatchObject({ name: "ครูบี", sharePct: 100 })
    expect(r[1]).toMatchObject({ name: "ครูเอ", sharePct: 50 })
  })
  it("ไม่รู้จักชื่อ (id ไม่อยู่ใน map) → ข้ามแถวนั้น", () => {
    const r = topTherapists([{ therapist_id: "x", revenue: 100, sessions: 1 }], new Map(), 5)
    expect(r).toEqual([])
  })
  it("zero revenue → sharePct = 0 (ไม่ NaN/Infinity)", () => {
    const r = topTherapists(
      [
        { therapist_id: "a", revenue: 0, sessions: 1 },
        { therapist_id: "b", revenue: 0, sessions: 1 },
      ],
      new Map([["a", "ครูเอ"], ["b", "ครูบี"]]),
      5
    )
    expect(r).toHaveLength(2)
    expect(r[0].sharePct).toBe(0)
    expect(r[1].sharePct).toBe(0)
    expect(isNaN(r[0].sharePct)).toBe(false)
    expect(isFinite(r[0].sharePct)).toBe(true)
  })
})

describe("guaranteeFlags", () => {
  it("เกินครึ่งของวันทำงาน → ติดธง · ครึ่งพอดีไม่ติด", () => {
    const days = [
      ...Array.from({ length: 3 }, () => ({ therapist_id: "a", hitGuarantee: true })),
      ...Array.from({ length: 2 }, () => ({ therapist_id: "a", hitGuarantee: false })),
      ...Array.from({ length: 2 }, () => ({ therapist_id: "b", hitGuarantee: true })),
      ...Array.from({ length: 2 }, () => ({ therapist_id: "b", hitGuarantee: false })),
    ]
    const names = new Map([["a", "ครูเอ"], ["b", "ครูบี"]])
    const r = guaranteeFlags(days, names)
    expect(r).toHaveLength(1)          // a = 3/5 ติด · b = 2/4 ครึ่งพอดี ไม่ติด
    expect(r[0]).toMatchObject({ name: "ครูเอ" })
  })
})
