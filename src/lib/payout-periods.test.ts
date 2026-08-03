import { describe, expect, it } from "vitest"
import {
  belongsToOtherMonth,
  canConfirmOn,
  commissionPeriodOfExpense,
  needsReason,
  payoutPeriodsOf,
  recordedWindowEnd,
  statusOf,
} from "./payout-periods"

describe("payoutPeriodsOf", () => {
  it("เดือน 31 วัน ได้ 4 งวด ช่วงวันถูกต้อง", () => {
    const p = payoutPeriodsOf("2026-08")
    expect(p).toHaveLength(4)
    expect(p[0]).toMatchObject({ kind: "commission", periodNo: 1, from: "2026-08-01", to: "2026-08-10" })
    expect(p[1]).toMatchObject({ kind: "commission", periodNo: 2, from: "2026-08-11", to: "2026-08-20" })
    expect(p[2]).toMatchObject({ kind: "commission", periodNo: 3, from: "2026-08-21", to: "2026-08-31" })
    expect(p[3]).toMatchObject({ kind: "salary", periodNo: 0, from: "2026-08-01", to: "2026-08-31" })
  })

  it("เดือน 30 วัน งวดท้ายจบวันที่ 30", () => {
    const p = payoutPeriodsOf("2026-09")
    expect(p[2].to).toBe("2026-09-30")
    expect(p[3].to).toBe("2026-09-30")
  })

  it("ก.พ. ปกติจบ 28 · ปีอธิกสุรทินจบ 29", () => {
    expect(payoutPeriodsOf("2026-02")[2].to).toBe("2026-02-28")
    expect(payoutPeriodsOf("2028-02")[2].to).toBe("2028-02-29")
  })

  it("ป้ายชื่ออ่านรู้เรื่องเป็นภาษาไทย", () => {
    const p = payoutPeriodsOf("2026-08")
    expect(p[0].label).toContain("1-10")
    expect(p[3].label).toContain("เงินเดือน")
  })
})

describe("needsReason", () => {
  it("เท่ากันเป๊ะ = ไม่ต้อง", () => {
    expect(needsReason(49145, 49145)).toBe(false)
  })
  // เคสจริง ก.ค.: งวด 1-10 ต่าง 50 · งวด 21-31 ต่าง 130 — ต้องมีเหตุผลทั้งคู่
  it("ต่างแม้แต่บาทเดียวหรือเศษสตางค์ = ต้อง", () => {
    expect(needsReason(47830, 47880)).toBe(true)
    expect(needsReason(100, 99)).toBe(true)
    expect(needsReason(100, 100.5)).toBe(true)
  })
})

describe("canConfirmOn", () => {
  const p2 = payoutPeriodsOf("2026-08")[1] // ค่ามือ 11-20
  it("ก่อนวันสุดท้ายของงวด = ยังติ๊กไม่ได้", () => {
    expect(canConfirmOn(p2, "2026-08-15")).toBe(false)
    expect(canConfirmOn(p2, "2026-08-19")).toBe(false)
  })
  it("ตั้งแต่วันสุดท้ายของงวดเป็นต้นไป = ติ๊กได้ รวมเดือนถัดๆ ไป", () => {
    expect(canConfirmOn(p2, "2026-08-20")).toBe(true)
    expect(canConfirmOn(p2, "2026-09-01")).toBe(true)
  })
  it("เงินเดือนติ๊กได้ตั้งแต่วันสิ้นเดือน", () => {
    const salary = payoutPeriodsOf("2026-08")[3]
    expect(canConfirmOn(salary, "2026-08-30")).toBe(false)
    expect(canConfirmOn(salary, "2026-08-31")).toBe(true)
  })
})

describe("recordedWindowEnd", () => {
  it("วันที่ 3 ของเดือนถัดไป", () => {
    expect(recordedWindowEnd("2026-07")).toBe("2026-08-03")
  })
  it("ข้ามปีถูก", () => {
    expect(recordedWindowEnd("2026-12")).toBe("2027-01-03")
  })
})

describe("belongsToOtherMonth", () => {
  it("เครื่องหมายเดือนอื่น = ใช่", () => {
    expect(belongsToOtherMonth("ค่ามือหมอ21-31/7/69", "2026-08")).toBe(true)
  })
  it("เครื่องหมายเดือนนี้ = ไม่ใช่", () => {
    expect(belongsToOtherMonth("ค่ามือหมอ21-31/7/69", "2026-07")).toBe(false)
  })
  it("ไม่มีเครื่องหมายเดือนเลย = ไม่ใช่", () => {
    expect(belongsToOtherMonth("พี่รันเบิกเงินล่วงหน้า 2,500บาท", "2026-07")).toBe(false)
  })
  it("เดือนเลขซ้อนกันไม่หลอกกัน — /12/ ไม่ใช่ของเดือน 1 หรือ 2", () => {
    expect(belongsToOtherMonth("ค่ามือหมอ1-10/12/69", "2027-01")).toBe(true)
    expect(belongsToOtherMonth("ค่ามือหมอ1-10/12/69", "2026-02")).toBe(true)
    expect(belongsToOtherMonth("ค่ามือหมอ1-10/12/69", "2026-12")).toBe(false)
  })
})

describe("commissionPeriodOfExpense", () => {
  const e = (item: string, expense_date: string) => ({ item, amount: 1, expense_date })

  // เคสจริง ก.ค. ที่ทำให้สูตรกรองตามวันที่พัง: งวด 11-20 ถูกคีย์วันที่ 21
  it("ชื่อบอกงวด 11-20 คีย์วันที่ 21 → เข้างวด 2 ตามชื่อ ไม่สนวันที่", () => {
    expect(commissionPeriodOfExpense(e("ค่ามือหมอ11-20/7/69", "2026-07-21"), "2026-07")).toBe(2)
  })
  it("ชื่อบอกงวดหลักงวดอื่นเข้าตามชื่อเช่นกัน", () => {
    expect(commissionPeriodOfExpense(e("ค่ามือหมอ1-10/7/69", "2026-07-10"), "2026-07")).toBe(1)
    expect(commissionPeriodOfExpense(e("ค่ามือหมอ21-31/7/69", "2026-07-31"), "2026-07")).toBe(3)
  })
  it("เครื่องหมายเดือนอื่น → ตัดทิ้ง (งวด ก.ค. คีย์ช้าห้ามโผล่ในเดือน ส.ค.)", () => {
    expect(commissionPeriodOfExpense(e("ค่ามือหมอ21-31/7/69", "2026-08-02"), "2026-08")).toBeNull()
  })
  it("งวด ก.ค. คีย์ช้า 2 ส.ค. ยังนับเข้า ก.ค. งวด 3 ได้ (อยู่ในหน้าต่างผ่อนผัน)", () => {
    expect(commissionPeriodOfExpense(e("ค่ามือหมอ21-31/7/69", "2026-08-02"), "2026-07")).toBe(3)
  })
  it("เงินเบิกล่วงหน้าไม่มีชื่องวด → เข้างวดตามวันที่", () => {
    expect(
      commissionPeriodOfExpense(e("พี่รันเบิกเงินล่วงหน้า 2,500บาท", "2026-07-15"), "2026-07")
    ).toBe(2)
    expect(
      commissionPeriodOfExpense(e("พี่บีบีเบิกเงินล่วงหน้า 2,500บาท", "2026-07-05"), "2026-07")
    ).toBe(1)
  })
  it("เงินเบิกในโซนผ่อนผัน (วันที่นอกเดือน) + ไม่บอกงวด → ตัดทิ้ง", () => {
    expect(commissionPeriodOfExpense(e("เบิกเงินล่วงหน้า", "2026-08-02"), "2026-07")).toBeNull()
  })
  it("ลำดับ match สำคัญ — ชื่อมี 11-20 ต้องไม่โดน 1-10 แย่ง", () => {
    expect(commissionPeriodOfExpense(e("ค่ามือหมอ11-20/8/69", "2026-08-25"), "2026-08")).toBe(2)
  })
})

describe("statusOf", () => {
  it("ไม่มีแถว = รอจ่าย", () => {
    expect(statusOf(null)).toBe("pending")
  })
  it("มีแถวแต่ยังไม่รับรอง = จ่ายแล้ว", () => {
    expect(statusOf({ endorsed_at: null })).toBe("paid")
  })
  it("รับรองแล้ว", () => {
    expect(statusOf({ endorsed_at: "2026-08-12T03:00:00Z" })).toBe("endorsed")
  })
})
