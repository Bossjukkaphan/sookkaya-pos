import { describe, expect, it } from "vitest"
import { CLOSE_GRACE_DAYS, canEditExpenseOn } from "./accounting-window"

describe("canEditExpenseOn", () => {
  it("เดือนปัจจุบันแก้ได้ทุกวัน", () => {
    expect(canEditExpenseOn("2026-08-15", "2026-08-20")).toBe(true)
    expect(canEditExpenseOn("2026-08-01", "2026-08-31")).toBe(true)
  })

  // เคสจริงที่ทำให้ต้องมีกติกานี้: 3/8/2569 พนักงานไล่คีย์รายจ่ายเดือน ก.ค. ที่ค้างอยู่แล้วคีย์ไม่ได้
  it("เดือนก่อนหน้ายังแก้ได้จนถึงวันที่ 3 ของเดือนถัดไป", () => {
    expect(canEditExpenseOn("2026-07-31", "2026-08-01")).toBe(true)
    expect(canEditExpenseOn("2026-07-05", "2026-08-03")).toBe(true)
  })

  it("พ้นวันที่ 3 แล้วเดือนก่อนหน้าปิด", () => {
    expect(canEditExpenseOn("2026-07-31", "2026-08-04")).toBe(false)
    expect(canEditExpenseOn("2026-07-01", "2026-08-31")).toBe(false)
  })

  it("เดือนก่อนหน้าสองเดือนขึ้นไปปิดเสมอ แม้ยังไม่พ้นวันที่ 3", () => {
    expect(canEditExpenseOn("2026-06-30", "2026-08-01")).toBe(false)
  })

  // ข้ามปีเป็นจุดที่สูตรลบเดือนแบบง่ายๆ พังบ่อย
  it("ข้ามปีต้องนับถูก — ธ.ค. ยังแก้ได้ถึง 3 ม.ค.", () => {
    expect(canEditExpenseOn("2026-12-31", "2027-01-03")).toBe(true)
    expect(canEditExpenseOn("2026-12-31", "2027-01-04")).toBe(false)
  })

  it("เดือนอนาคตบันทึกไม่ได้ ป้องกันคีย์วันผิดปีแล้วไปโผล่งบเดือนหน้า", () => {
    expect(canEditExpenseOn("2026-09-01", "2026-08-31")).toBe(false)
  })

  it("ช่วงผ่อนผันเป็นค่าคงที่ที่อ่านได้ ไม่ใช่เลขลอยในโค้ด", () => {
    expect(CLOSE_GRACE_DAYS).toBe(3)
  })
})
