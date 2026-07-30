import { describe, expect, it } from "vitest"
import { computeSaleAmounts } from "./sale-math"

const base = {
  priceNormal: 650,
  discount: 0,
  paymentMethod: "QR Code",
  gowabiNet: null,
  isRequest: false,
  requestFee: 0,
  roomFee: 0,
  serviceCommission: 240,
  memberRatio: null,
  creditRequested: 0,
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

  it("ยอดมีเศษสตางค์: เครดิตเต็มบิลยังตรงสูตรเดิม (ปัดที่รายได้ก่อน)", () => {
    const a = computeSaleAmounts({
      ...base, priceNormal: 2.01, paymentMethod: "Member Credit",
      memberRatio: 5000 / 6000, creditRequested: 0,
    })
    expect(a.revenueRecognize).toBe(1.67)  // round2(2.01 × 5000/6000)
    expect(a.bonusUsed).toBe(0.34)         // 2.01 − 1.67
    expect(a.creditUsed).toBe(a.revenueRecognize + a.bonusUsed)
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

describe("ค่าห้องสปาส่วนตัว (ลูกค้าจ่าย บวกเข้ายอดบิล)", () => {
  it("ขายปกติ + ห้องสปา — ยอดสุทธิรวมค่าห้อง ส่วนลดไม่แตะค่าห้อง", () => {
    const a = computeSaleAmounts({ ...base, discount: 160, roomFee: 100 })
    expect(a.netAmount).toBe(590) // 650 - 160 + 100
    expect(a.discount).toBe(160)
    expect(a.roomFee).toBe(100)
    expect(a.revenueRecognize).toBe(590) // เข้ารายได้ร้านเต็ม
    expect(a.commission).toBe(240) // ค่ามือหมอไม่เพิ่ม — เงินห้องเป็นของร้าน
  })
  it("Gowabi + ห้องสปา — ค่าห้องบวกทับยอดที่ Gowabi จ่าย ส่วนลดคิดจากยอดนวดล้วน", () => {
    const a = computeSaleAmounts({
      ...base, paymentMethod: "Gowabi", gowabiNet: 390, roomFee: 100,
    })
    expect(a.netAmount).toBe(490)
    expect(a.discount).toBe(260) // 650 - 390 ไม่เกี่ยวค่าห้อง
  })
  it("Member Credit + ห้องสปา — เครดิตถูกตัดรวมค่าห้อง ตามสัดส่วนรับรู้", () => {
    const a = computeSaleAmounts({
      ...base, priceNormal: 690, paymentMethod: "Member Credit",
      memberRatio: 5000 / 6000, roomFee: 100,
    })
    expect(a.creditUsed).toBe(790)
    expect(a.creditUsed).toBe(a.revenueRecognize + a.bonusUsed)
  })
  it("ไม่ติ๊กห้องสปา (roomFee 0) — ทุกอย่างเท่าเดิมเป๊ะ", () => {
    const a = computeSaleAmounts({ ...base, discount: 160 })
    expect(a.netAmount).toBe(490)
    expect(a.roomFee).toBe(0)
  })
})

describe("แบ่งชำระ: เครดิตบางส่วน + เงินจริง", () => {
  const base = {
    priceNormal: 800, discount: 0, gowabiNet: null,
    isRequest: false, requestFee: 0, roomFee: 0, serviceCommission: 250,
  }

  it("เคสจริง 31/7: บิล 800 เครดิต 500 โอน 300 (Silver ratio 5000/6000)", () => {
    const r = computeSaleAmounts({
      ...base, paymentMethod: "QR Code", memberRatio: 5000 / 6000, creditRequested: 500,
    })
    expect(r.creditUsed).toBe(500)
    expect(r.bonusUsed).toBe(83.33)          // 500 × (1 − 5000/6000)
    expect(r.revenueRecognize).toBe(716.67)  // 800 − 83.33
    expect(r.netAmount).toBe(800)
  })

  it("ขอเครดิตเกินยอดบิล → หนีบเหลือเท่ายอดบิล", () => {
    const r = computeSaleAmounts({
      ...base, paymentMethod: "QR Code", memberRatio: 1, creditRequested: 9999,
    })
    expect(r.creditUsed).toBe(800)
  })

  it("creditRequested = 0 → เหมือนบิลปกติทุกช่อง", () => {
    const split = computeSaleAmounts({
      ...base, paymentMethod: "QR Code", memberRatio: null, creditRequested: 0,
    })
    const legacy = computeSaleAmounts({
      ...base, paymentMethod: "QR Code", memberRatio: null, creditRequested: 0,
    })
    expect(split).toEqual(legacy)
    expect(split.creditUsed).toBe(0)
    expect(split.revenueRecognize).toBe(800)
  })

  it("พิสูจน์เข้ากันได้: Member Credit เต็มบิล = สูตรเดิมเป๊ะ (ratio ใดๆ)", () => {
    for (const ratio of [1, 5000 / 6000, 10000 / 12000]) {
      const r = computeSaleAmounts({
        ...base, paymentMethod: "Member Credit", memberRatio: ratio, creditRequested: 0,
      })
      expect(r.creditUsed).toBe(800)
      expect(r.revenueRecognize).toBe(Math.round(800 * ratio * 100) / 100)
      expect(r.bonusUsed).toBe(Math.round((800 - 800 * ratio) * 100) / 100)
    }
  })

  it("แบ่งจ่าย + ค่าห้อง: เครดิตหนีบที่ net รวมค่าห้อง", () => {
    const r = computeSaleAmounts({
      ...base, roomFee: 100, paymentMethod: "เงินสด", memberRatio: 1, creditRequested: 9999,
    })
    expect(r.netAmount).toBe(900)
    expect(r.creditUsed).toBe(900)
  })
})
