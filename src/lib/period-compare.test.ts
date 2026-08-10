import { describe, expect, it } from "vitest"

import {
  delta,
  mtdRange,
  prevMtdRange,
  sameWeekdayDates,
  verdictSentence,
} from "./period-compare"

describe("mtdRange / prevMtdRange", () => {
  it("MTD ปกติ", () => {
    expect(mtdRange("2026-08", 9)).toEqual({ from: "2026-08-01", to: "2026-08-09" })
    expect(prevMtdRange("2026-08", 9)).toEqual({ from: "2026-07-01", to: "2026-07-09" })
  })
  it("ข้ามปี: ม.ค. เทียบ ธ.ค. ปีก่อน", () => {
    expect(prevMtdRange("2026-01", 15)).toEqual({ from: "2025-12-01", to: "2025-12-15" })
  })
  it("เดือนก่อนสั้นกว่า: 31 มี.ค. ตัดที่ 28 ก.พ. (ปีปกติ)", () => {
    expect(prevMtdRange("2026-03", 31)).toEqual({ from: "2026-02-01", to: "2026-02-28" })
  })
  it("ปีอธิกสุรทิน: 30 มี.ค. 2028 ตัดที่ 29 ก.พ.", () => {
    expect(prevMtdRange("2028-03", 30)).toEqual({ from: "2028-02-01", to: "2028-02-29" })
  })
  it("วันแรกของเดือน", () => {
    expect(mtdRange("2026-08", 1)).toEqual({ from: "2026-08-01", to: "2026-08-01" })
  })
})

describe("sameWeekdayDates", () => {
  it("เสาร์ 4 สัปดาห์ล่าสุด ไม่รวมวันนี้ เรียงใหม่→เก่า", () => {
    // 2026-08-08 เป็นวันเสาร์
    expect(sameWeekdayDates("2026-08-08", 4)).toEqual([
      "2026-08-01", "2026-07-25", "2026-07-18", "2026-07-11",
    ])
  })
})

describe("delta", () => {
  it("คำนวณ pct ปกติ", () => {
    expect(delta(112, 100)).toEqual({ current: 112, previous: 100, pct: 12 })
  })
  it("previous = 0 → pct null (ห้ามหารศูนย์)", () => {
    expect(delta(50, 0).pct).toBeNull()
  })
})

describe("verdictSentence", () => {
  it("เดือนวิ่งเร็วกว่า + วันนี้สูงกว่าค่าเฉลี่ย", () => {
    const s = verdictSentence({
      mtd: delta(112000, 100000),
      today: { revenue: 8450, weekdayAvg: 7750, weeksUsed: 4 },
      todayLabel: "วันเสาร์",
    })
    expect(s).toContain("เร็วกว่า")
    expect(s).toContain("12%")
    expect(s).toContain("วันเสาร์")
  })
  it("ไม่มีข้อมูลเดือนก่อน → บอกตรงๆ ไม่โชว์ delta หลอก", () => {
    const s = verdictSentence({
      mtd: delta(50000, 0),
      today: { revenue: 3000, weekdayAvg: null, weeksUsed: 0 },
      todayLabel: "วันอาทิตย์",
    })
    expect(s).toContain("ยังเทียบเดือนก่อนไม่ได้")
    expect(s).not.toContain("%")
  })
  it("ข้อมูลไม่ครบ 4 สัปดาห์ → ระบุจำนวนสัปดาห์ที่ใช้", () => {
    const s = verdictSentence({
      mtd: delta(90000, 100000),
      today: { revenue: 5000, weekdayAvg: 5200, weeksUsed: 2 },
      todayLabel: "วันพุธ",
    })
    expect(s).toContain("2 สัปดาห์")
  })
})
