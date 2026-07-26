import { describe, expect, it } from "vitest"
import { commissionPayoutStatus, isCommissionPayout } from "./commission-periods"

describe("isCommissionPayout (งวดค่ามือ = ชื่อมีค่ามือ + ยอดระดับงวด)", () => {
  it("งวดจริงนับ", () => {
    expect(isCommissionPayout("ค่ามือหมอ1-10/7/69", 45380)).toBe(true)
    expect(isCommissionPayout("ค่ามือพนักงาน20/3/69", 40660)).toBe(true)
    expect(isCommissionPayout("ค่ามือพนักงานนวด", 54445)).toBe(true)
  })
  it("เบิกย่อย/รายการอื่นไม่นับ", () => {
    expect(isCommissionPayout("เงินค่ามือพีโมเม", 6595)).toBe(false)
    expect(isCommissionPayout("เงินเดือนพนักงาน reception", 52450)).toBe(false)
    expect(isCommissionPayout("พี่รันเบิกเงินล่วงหน้า 2,500บาท", 2500)).toBe(false)
  })
})

describe("commissionPayoutStatus (เดือนละ 3 งวดเสมอ)", () => {
  const past = { isCurrentMonth: false, dayOfMonth: 31 }
  it("เดือนจบแล้ว: 3 งวด = ปกติ", () => {
    expect(commissionPayoutStatus(3, past).level).toBe("ok")
  })
  it("เดือนจบแล้ว: ขาด → เตือน", () => {
    const r = commissionPayoutStatus(2, past)
    expect(r.level).toBe("warn")
    expect(r.message).toContain("2 งวด")
  })
  it("เดือนจบแล้ว: เกิน → เตือน (เคสคีย์วันที่ผิดเดือนที่เคยเจอจริง)", () => {
    expect(commissionPayoutStatus(4, past).level).toBe("warn")
  })
  it("เดือนปัจจุบัน: จ่ายตามจังหวะ = info ไม่เตือน", () => {
    expect(
      commissionPayoutStatus(2, { isCurrentMonth: true, dayOfMonth: 26 }).level
    ).toBe("info")
    expect(
      commissionPayoutStatus(0, { isCurrentMonth: true, dayOfMonth: 5 }).level
    ).toBe("info")
  })
  it("เดือนปัจจุบัน: ช้ากว่าที่ควร → เตือน", () => {
    expect(
      commissionPayoutStatus(0, { isCurrentMonth: true, dayOfMonth: 15 }).level
    ).toBe("warn")
    expect(
      commissionPayoutStatus(1, { isCurrentMonth: true, dayOfMonth: 25 }).level
    ).toBe("warn")
  })
  it("เดือนปัจจุบัน: เกิน 3 → เตือนทันที", () => {
    expect(
      commissionPayoutStatus(4, { isCurrentMonth: true, dayOfMonth: 12 }).level
    ).toBe("warn")
  })
})
