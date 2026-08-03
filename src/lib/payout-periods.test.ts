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
