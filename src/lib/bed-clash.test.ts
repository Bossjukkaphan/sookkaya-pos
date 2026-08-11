import { describe, expect, it } from "vitest"

import { clashLabel, firstClash, type ClashRow } from "./bed-clash"

const row = (o: Partial<ClashRow> & { id: string }): ClashRow => ({
  customer_name: null,
  service_name: "นวดไทย",
  duration_min: 60,
  start_time: "10:00:00",
  started_at: null,
  ...o,
})

describe("firstClash", () => {
  it("ไม่มีใครใช้ช่วงเวลานี้ → null", () => {
    const rows = [row({ id: "a", start_time: "10:00:00", duration_min: 60 })]
    expect(firstClash(rows, 11 * 60, 60, [])).toBeNull()
  })

  it("เวลาทับกัน → คืนแถวที่ชน", () => {
    const rows = [row({ id: "a", start_time: "10:00:00", duration_min: 60 })]
    expect(firstClash(rows, 10 * 60 + 30, 60, [])?.id).toBe("a")
  })

  it("ชนขอบพอดี (จบ 11:00 เริ่ม 11:00) ไม่นับชน — กติกาเดียวกับบอร์ดคิว", () => {
    const rows = [row({ id: "a", start_time: "10:00:00", duration_min: 60 })]
    expect(firstClash(rows, 11 * 60, 60, [])).toBeNull()
  })

  it("ใบที่ยกเว้น (ใบตัวเอง) ไม่นับ", () => {
    const rows = [row({ id: "a", start_time: "10:00:00", duration_min: 60 })]
    expect(firstClash(rows, 10 * 60, 60, ["a"])).toBeNull()
  })

  it("เริ่มนวดจริงแล้ว → ยึดเวลาเริ่มจริง ไม่ใช่เวลาจอง (มาสายเตียงติดนานขึ้น)", () => {
    // จอง 10:00 แต่เริ่มจริง 11:00 → ครองเตียงถึง 12:00
    const rows = [
      row({
        id: "a",
        start_time: "10:00:00",
        duration_min: 60,
        started_at: "2026-08-09T04:00:00+00:00", // 11:00 เวลาไทย
      }),
    ]
    expect(firstClash(rows, 10 * 60, 30, [])).toBeNull()
    expect(firstClash(rows, 11 * 60 + 30, 30, [])?.id).toBe("a")
  })

  it("ชนหลายใบ → คืนใบแรกที่เจอ", () => {
    const rows = [
      row({ id: "a", start_time: "09:00:00", duration_min: 30 }),
      row({ id: "b", start_time: "10:00:00", duration_min: 60 }),
      row({ id: "c", start_time: "10:30:00", duration_min: 60 }),
    ]
    expect(firstClash(rows, 10 * 60 + 15, 30, [])?.id).toBe("b")
  })
})

describe("clashLabel", () => {
  it("บอกช่วงเวลาและชื่อลูกค้าที่ครองอยู่", () => {
    expect(
      clashLabel(row({ id: "a", start_time: "13:55:00", duration_min: 120, customer_name: "เอ็ม" }))
    ).toBe("13:55–15:55 (คิวคุณเอ็ม)")
  })

  it("ไม่มีชื่อลูกค้า → ใช้ชื่อเมนูแทน", () => {
    expect(clashLabel(row({ id: "a", start_time: "10:00:00", service_name: "นวดเท้า" }))).toBe(
      "10:00–11:00 (คิวนวดเท้า)"
    )
  })

  it("เริ่มนวดจริงช้ากว่าจอง → ป้ายบอกช่วงที่ครองเตียงจริง", () => {
    expect(
      clashLabel(
        row({
          id: "a",
          start_time: "10:00:00",
          duration_min: 60,
          started_at: "2026-08-09T04:00:00+00:00",
          customer_name: "ก้อย",
        })
      )
    ).toBe("11:00–12:00 (คิวคุณก้อย)")
  })
})
