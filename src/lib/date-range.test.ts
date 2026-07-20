import { describe, expect, it } from "vitest"
import { previousRange, rangeFromPreset, rangeLengthDays } from "./date-range"

const TODAY = "2026-07-20"   // วันจันทร์

describe("rangeFromPreset", () => {
  it("วันนี้", () => {
    expect(rangeFromPreset("today", TODAY)).toEqual({ from: "2026-07-20", to: "2026-07-20" })
  })

  it("7 วันล่าสุด นับรวมวันนี้", () => {
    expect(rangeFromPreset("last7", TODAY)).toEqual({ from: "2026-07-14", to: "2026-07-20" })
  })

  it("เดือนนี้ สิ้นสุดที่วันนี้ ไม่ใช่สิ้นเดือน", () => {
    expect(rangeFromPreset("thisMonth", TODAY)).toEqual({ from: "2026-07-01", to: "2026-07-20" })
  })

  it("เดือนที่แล้ว เต็มเดือน", () => {
    expect(rangeFromPreset("lastMonth", TODAY)).toEqual({ from: "2026-06-01", to: "2026-06-30" })
  })

  it("เดือนที่แล้วข้ามปี", () => {
    expect(rangeFromPreset("lastMonth", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" })
  })

  it("เดือนที่แล้วของเดือน ก.พ. ปีอธิกสุรทิน", () => {
    expect(rangeFromPreset("lastMonth", "2028-03-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" })
  })
})

describe("rangeLengthDays", () => {
  it("นับรวมวันเริ่มและวันจบ", () => {
    expect(rangeLengthDays({ from: "2026-07-20", to: "2026-07-20" })).toBe(1)
    expect(rangeLengthDays({ from: "2026-07-14", to: "2026-07-20" })).toBe(7)
    expect(rangeLengthDays({ from: "2026-06-01", to: "2026-06-30" })).toBe(30)
  })
})

describe("previousRange", () => {
  it("ถอยหลังไปเท่ากับความยาวของช่วงเดิม", () => {
    expect(previousRange({ from: "2026-07-14", to: "2026-07-20" }))
      .toEqual({ from: "2026-07-07", to: "2026-07-13" })
  })

  it("ช่วงวันเดียวถอยไปวันก่อนหน้า", () => {
    expect(previousRange({ from: "2026-07-20", to: "2026-07-20" }))
      .toEqual({ from: "2026-07-19", to: "2026-07-19" })
  })

  it("ข้ามเดือนได้ถูกต้อง", () => {
    expect(previousRange({ from: "2026-06-01", to: "2026-06-30" }))
      .toEqual({ from: "2026-05-02", to: "2026-05-31" })
  })
})
