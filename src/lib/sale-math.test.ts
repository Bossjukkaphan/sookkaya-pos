import { describe, expect, it } from "vitest"
import { computeSaleAmounts } from "./sale-math"

const base = {
  priceNormal: 650,
  discount: 0,
  paymentMethod: "QR Code",
  gowabiNet: null,
  isRequest: false,
  requestFee: 0,
  serviceCommission: 240,
  memberRatio: null,
}

describe("computeSaleAmounts", () => {
  it("ขายปกติ — ยอดสุทธิคือราคาลบส่วนลด", () => {
    const a = computeSaleAmounts({ ...base, discount: 160 })
    expect(a.netAmount).toBe(490)
    expect(a.discount).toBe(160)
    expect(a.commission).toBe(240)
    expect(a.revenueRecognize).toBe(490)
    expect(a.creditUsed).toBe(0)
  })

  it("Gowabi — กรอกยอดที่ได้จริง ส่วนลดคือส่วนต่างจากราคาปกติ", () => {
    const a = computeSaleAmounts({ ...base, paymentMethod: "Gowabi", gowabiNet: 390 })
    expect(a.netAmount).toBe(390)
    expect(a.discount).toBe(260)
    expect(a.revenueRecognize).toBe(390)
  })

  it("Gowabi ไม่กรอกยอด — ใช้ราคาปกติ ไม่ใช่ศูนย์", () => {
    const a = computeSaleAmounts({ ...base, paymentMethod: "Gowabi", gowabiNet: null })
    expect(a.netAmount).toBe(650)
    expect(a.discount).toBe(0)
  })

  it("Member Credit — ตัดเครดิตเต็มยอด แยกของแถมออกจากรายได้", () => {
    const a = computeSaleAmounts({
      ...base,
      priceNormal: 690,
      paymentMethod: "Member Credit",
      serviceCommission: 255,
      memberRatio: 5000 / 6000,
    })
    expect(a.creditUsed).toBe(690)
    expect(a.revenueRecognize).toBe(575)
    expect(a.bonusUsed).toBe(115)
    expect(a.creditUsed).toBe(a.revenueRecognize + a.bonusUsed)
  })

  it("Member Credit ที่ไม่มีของแถม — รับรู้เต็มจำนวน", () => {
    const a = computeSaleAmounts({ ...base, paymentMethod: "Member Credit", memberRatio: 1 })
    expect(a.creditUsed).toBe(650)
    expect(a.revenueRecognize).toBe(650)
    expect(a.bonusUsed).toBe(0)
  })

  it("ค่ารีเควสไม่นับเป็นยอดขาย แต่ติดไปกับรายการเพื่อจ่ายหมอ", () => {
    const a = computeSaleAmounts({ ...base, isRequest: true, requestFee: 40 })
    expect(a.netAmount).toBe(650)
    expect(a.requestFee).toBe(40)
  })

  it("ไม่ติ๊กรีเควส ค่ารีเควสต้องเป็นศูนย์แม้จะมีค่าค้างในฟอร์ม", () => {
    const a = computeSaleAmounts({ ...base, isRequest: false, requestFee: 40 })
    expect(a.requestFee).toBe(0)
  })

  it("ส่วนลดมากกว่าราคา — คืนยอดติดลบให้ผู้เรียกปฏิเสธ ไม่ปัดเป็นศูนย์เงียบๆ", () => {
    const a = computeSaleAmounts({ ...base, discount: 800 })
    expect(a.netAmount).toBeLessThan(0)
  })
})
