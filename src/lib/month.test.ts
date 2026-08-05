import { describe, expect, it } from "vitest"
import { daysInMonth, monthLabel, monthShortLabel, recentMonths, shiftMonth } from "./month"

describe("monthLabel — ปีพุทธศักราชและชื่อเดือนไทย", () => {
  it("แปลง 2026-07 เป็น กรกฎาคม 2569", () => {
    expect(monthLabel("2026-07")).toBe("กรกฎาคม 2569")
  })

  it("เดือนแรกและเดือนสุดท้ายไม่หลุดขอบ array", () => {
    expect(monthLabel("2026-01")).toBe("มกราคม 2569")
    expect(monthLabel("2026-12")).toBe("ธันวาคม 2569")
  })
})

describe("monthShortLabel — ใช้บนหัวตารางที่มีที่แคบ", () => {
  it("ย่อชื่อเดือนและปีเหลือสองหลัก", () => {
    expect(monthShortLabel("2026-07")).toBe("ก.ค. 69")
  })
})

describe("shiftMonth", () => {
  it("เลื่อนภายในปีเดียวกัน", () => {
    expect(shiftMonth("2026-07", -1)).toBe("2026-06")
  })

  it("ข้ามปีทั้งสองทิศ", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12")
    expect(shiftMonth("2026-12", 1)).toBe("2027-01")
  })

  it("เลื่อนหลายเดือนพร้อมกัน", () => {
    expect(shiftMonth("2026-07", -3)).toBe("2026-04")
  })
})

describe("daysInMonth", () => {
  it("เดือน 30 และ 31 วัน", () => {
    expect(daysInMonth("2026-06")).toBe(30)
    expect(daysInMonth("2026-07")).toBe(31)
  })

  it("กุมภาพันธ์ปีปกติและปีอธิกสุรทิน", () => {
    expect(daysInMonth("2026-02")).toBe(28)
    expect(daysInMonth("2028-02")).toBe(29)
  })
})

describe("recentMonths — ชิพเลือกเดือนบนหน้ารายจ่าย", () => {
  it("คืนเดือนล่าสุดก่อน ไล่ย้อนหลังตามจำนวนที่ขอ", () => {
    expect(recentMonths("2026-08-05", 6)).toEqual([
      "2026-08", "2026-07", "2026-06", "2026-05", "2026-04", "2026-03",
    ])
  })

  it("ข้ามปีได้ถูกต้อง", () => {
    expect(recentMonths("2026-01-15", 3)).toEqual(["2026-01", "2025-12", "2025-11"])
  })

  it("ขอเดือนเดียวก็ได้", () => {
    expect(recentMonths("2026-08-05", 1)).toEqual(["2026-08"])
  })

  it("ขอ 0 หรือติดลบ คืนอาเรย์ว่าง ไม่พัง", () => {
    expect(recentMonths("2026-08-05", 0)).toEqual([])
    expect(recentMonths("2026-08-05", -3)).toEqual([])
  })
})
