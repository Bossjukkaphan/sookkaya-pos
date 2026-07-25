import { describe, expect, it } from "vitest"
import { pointsForBaht, pointExpiryDate, genCouponCode, couponExpiryDate } from "./points"

describe("pointsForBaht (ทุก 100฿ = 1 แต้ม ปัดลง)", () => {
  it("คิดจากยอดจ่ายจริง", () => {
    expect(pointsForBaht(100)).toBe(1)
    expect(pointsForBaht(390)).toBe(3)
    expect(pointsForBaht(1390)).toBe(13)
  })
  it("ต่ำกว่า 100 หรือค่าประหลาด = 0", () => {
    expect(pointsForBaht(99)).toBe(0)
    expect(pointsForBaht(0)).toBe(0)
    expect(pointsForBaht(-500)).toBe(0)
    expect(pointsForBaht(NaN)).toBe(0)
  })
})

describe("pointExpiryDate (แต้มปีนี้หมดสิ้นปีถัดไป)", () => {
  it("ได้แต้มปี 2026 → หมด 31 ธ.ค. 2027", () => {
    expect(pointExpiryDate("2026-07-25")).toBe("2027-12-31")
    expect(pointExpiryDate("2026-01-01")).toBe("2027-12-31")
    expect(pointExpiryDate("2026-12-31")).toBe("2027-12-31")
  })
  it("ปีอื่นตามสูตรเดียวกัน", () => {
    expect(pointExpiryDate("2027-03-15")).toBe("2028-12-31")
  })
})

describe("couponExpiryDate (คูปองอายุ 30 วัน)", () => {
  it("บวก 30 วันจากวันที่แลก", () => {
    expect(couponExpiryDate("2026-07-25")).toBe("2026-08-24")
    expect(couponExpiryDate("2026-12-15")).toBe("2027-01-14")
  })
})

describe("genCouponCode", () => {
  it("ยาว 6 ตัว ไม่มีตัวสับสน (0 O 1 I L)", () => {
    for (let i = 0; i < 200; i++) {
      const code = genCouponCode()
      expect(code).toHaveLength(6)
      expect(code).toMatch(/^[A-HJ-KM-NP-Z2-9]+$/)
    }
  })
})
