import { describe, expect, it } from "vitest"
import { computeSlots, isBookableDate, canCancelAt, MAX_ADVANCE_DAYS } from "./booking-slots"

describe("computeSlots", () => {
  it("วันล่วงหน้า: ทุก 30 นาที ตั้งแต่ 10:00 และคิวต้องจบภายใน 22:00", () => {
    const slots = computeSlots({ date: "2026-08-01", today: "2026-07-24", nowMin: 900, durationMin: 120 })
    expect(slots[0]).toBe("10:00")
    expect(slots.at(-1)).toBe("20:00") // 20:00+120 = 22:00 พอดี · 20:30 ไม่ทัน
    expect(slots).toContain("14:30")
  })
  it("เมนู 60 นาที จองได้ถึง 21:00", () => {
    const slots = computeSlots({ date: "2026-08-01", today: "2026-07-24", nowMin: 0, durationMin: 60 })
    expect(slots.at(-1)).toBe("21:00")
  })
  it("วันนี้: เริ่มได้อย่างเร็ว ตอนนี้+60 นาที ปัดขึ้นเป็นช่อง 30 นาที", () => {
    // ตอนนี้ 13:10 → +60 = 14:10 → ช่องแรก 14:30
    const slots = computeSlots({ date: "2026-07-24", today: "2026-07-24", nowMin: 13 * 60 + 10, durationMin: 60 })
    expect(slots[0]).toBe("14:30")
  })
  it("วันนี้แต่สายจนไม่เหลือช่อง → ว่างเปล่า", () => {
    expect(computeSlots({ date: "2026-07-24", today: "2026-07-24", nowMin: 21 * 60, durationMin: 60 })).toEqual([])
  })
  it("วันที่ผ่านไปแล้ว → ว่างเปล่า", () => {
    expect(computeSlots({ date: "2026-07-23", today: "2026-07-24", nowMin: 0, durationMin: 60 })).toEqual([])
  })
})

describe("isBookableDate", () => {
  it("วันนี้ถึง +14 วันจองได้ · อดีต/ไกลกว่านั้นไม่ได้", () => {
    expect(isBookableDate("2026-07-24", "2026-07-24")).toBe(true)
    expect(isBookableDate("2026-08-07", "2026-07-24")).toBe(true)  // +14
    expect(isBookableDate("2026-08-08", "2026-07-24")).toBe(false) // +15
    expect(isBookableDate("2026-07-23", "2026-07-24")).toBe(false)
    expect(MAX_ADVANCE_DAYS).toBe(14)
  })
})

describe("canCancelAt", () => {
  it("ยกเลิกได้เมื่อเหลือ ≥120 นาทีก่อนนัด", () => {
    expect(canCancelAt("2026-07-24", "16:00", "2026-07-24", 14 * 60)).toBe(true)  // เหลือ 120 พอดี
    expect(canCancelAt("2026-07-24", "16:00", "2026-07-24", 14 * 60 + 1)).toBe(false)
    expect(canCancelAt("2026-07-25", "10:00", "2026-07-24", 23 * 60)).toBe(true)  // คนละวัน
    expect(canCancelAt("2026-07-23", "16:00", "2026-07-24", 0)).toBe(false)       // วันผ่านไปแล้ว
  })
})
