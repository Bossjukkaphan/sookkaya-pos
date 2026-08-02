import { describe, expect, it } from "vitest"

import {
  MIN_OVERPAY_CREDIT,
  overpayAmount,
  planPaymentReduction,
} from "./overpay-credit"

describe("overpayAmount — ยอดเกินรับจาก due ของ v_bill_due", () => {
  it("due ติดลบ = เกินรับเท่าค่าสัมบูรณ์", () => {
    expect(overpayAmount(-160)).toBe(160)
    expect(overpayAmount(-520)).toBe(520)
  })
  it("due เป็นบวก/ศูนย์ = ไม่มีเกินรับ", () => {
    expect(overpayAmount(0)).toBe(0)
    expect(overpayAmount(120)).toBe(0)
  })
  it("เศษทศนิยมลอยไม่นับเป็นเกินรับ", () => {
    expect(overpayAmount(-0.004)).toBe(0)
  })
  it("ปัดเศษสตางค์ให้ลงตัว", () => {
    expect(overpayAmount(-160.005)).toBe(160.01)
  })
})

describe("planPaymentReduction — ไล่ลดบรรทัดชำระจากล่าสุดก่อน", () => {
  // บรรทัดเรียงเก่า→ใหม่ตามที่ action ส่งเข้ามา
  const lines = [
    { id: "a", amount: 300 },
    { id: "b", amount: 200 },
    { id: "c", amount: 150 },
  ]

  it("ลดพอดีในบรรทัดล่าสุดบรรทัดเดียว", () => {
    expect(planPaymentReduction(lines, 100)).toEqual([
      { id: "c", newAmount: 50, remove: false },
    ])
  })
  it("ลดหมดบรรทัดล่าสุดพอดี = ลบบรรทัดนั้น", () => {
    expect(planPaymentReduction(lines, 150)).toEqual([
      { id: "c", newAmount: 0, remove: true },
    ])
  })
  it("ลดข้ามหลายบรรทัด", () => {
    expect(planPaymentReduction(lines, 250)).toEqual([
      { id: "c", newAmount: 0, remove: true },
      { id: "b", newAmount: 100, remove: false },
    ])
  })
  it("ลดเท่ายอดทั้งหมด = ลบทุกบรรทัด", () => {
    expect(planPaymentReduction(lines, 650)).toEqual([
      { id: "c", newAmount: 0, remove: true },
      { id: "b", newAmount: 0, remove: true },
      { id: "a", newAmount: 0, remove: true },
    ])
  })
  it("ยอดที่จะลดมากกว่าเงินที่รับไว้ = โยน (ผู้เรียกต้องกันไว้ก่อน)", () => {
    expect(() => planPaymentReduction(lines, 700)).toThrow()
  })
  it("ยอดลด 0 หรือติดลบ = ไม่ทำอะไร", () => {
    expect(planPaymentReduction(lines, 0)).toEqual([])
  })
})

describe("MIN_OVERPAY_CREDIT", () => {
  it("ขั้นต่ำ 100 บาท — เศษต่ำกว่านี้ไม่ออกใบเครดิต", () => {
    expect(MIN_OVERPAY_CREDIT).toBe(100)
  })
})
