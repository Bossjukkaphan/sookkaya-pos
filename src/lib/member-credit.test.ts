import { describe, expect, it } from "vitest"
import { CREDIT_LOW_MAX, checkCreditSpend, creditBucket } from "./member-credit"

describe("creditBucket", () => {
  it("แบ่งช่องตามขอบเขตของแดชบอร์ดเดิม", () => {
    expect(creditBucket(0)).toBe("empty")
    expect(creditBucket(1)).toBe("low")
    expect(creditBucket(CREDIT_LOW_MAX)).toBe("low")
    expect(creditBucket(CREDIT_LOW_MAX + 1)).toBe("mid")
    expect(creditBucket(3000)).toBe("mid")
    expect(creditBucket(3001)).toBe("ok")
  })

  it("ยอดติดลบนับเป็นหมดแล้ว ไม่หายไปจากทุกช่อง", () => {
    expect(creditBucket(-1300)).toBe("empty")
  })
})

describe("checkCreditSpend", () => {
  const ใช้ได้ = { expiry: "2026-12-31", onDate: "2026-08-11", balance: 2300 }

  it("ตัดเครดิตได้เมื่อยังไม่หมดอายุและยอดพอ", () => {
    expect(checkCreditSpend({ ...ใช้ได้, wanted: 650 })).toEqual({ ok: true })
  })

  it("ยอดไม่พอ ปฏิเสธพร้อมบอกตัวเลขทั้งสองฝั่ง", () => {
    const r = checkCreditSpend({ ...ใช้ได้, wanted: 5000 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe("insufficient")
    expect(r.message).toContain("2300")
    expect(r.message).toContain("5000")
  })

  it("วันหมดอายุวันนี้พอดี ยังใช้ได้ทั้งวัน", () => {
    expect(
      checkCreditSpend({ expiry: "2026-08-11", onDate: "2026-08-11", balance: 2300, wanted: 650 })
    ).toEqual({ ok: true })
  })

  it("เลยวันหมดอายุมาหนึ่งวัน ใช้ไม่ได้ และข้อความต้องบอกยอดที่ยังค้างอยู่", () => {
    const r = checkCreditSpend({
      expiry: "2026-08-10", onDate: "2026-08-11", balance: 2300, wanted: 650,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe("expired")
    expect(r.message).toContain("2300")
    expect(r.message).toContain("เติม")
  })

  it("ไม่เคยเติมเงินเลย ถือว่าใช้ไม่ได้", () => {
    const r = checkCreditSpend({ expiry: null, onDate: "2026-08-11", balance: 0, wanted: 650 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe("expired")
  })

  it("บิลย้อนหลังที่ให้บริการตอนเครดิตยังไม่หมดอายุ ยังบันทึกได้", () => {
    expect(
      checkCreditSpend({ expiry: "2026-08-05", onDate: "2026-08-03", balance: 2300, wanted: 650 })
    ).toEqual({ ok: true })
  })

  it("หมดอายุแล้ว แก้บิลเก่าให้ยอดเท่าเดิมได้", () => {
    expect(
      checkCreditSpend({
        expiry: "2026-08-10", onDate: "2026-08-11", balance: 2300,
        wanted: 650, alreadyUsedOnThisBill: 650,
      })
    ).toEqual({ ok: true })
  })

  it("หมดอายุแล้ว แก้บิลเก่าให้ยอดน้อยลงได้", () => {
    expect(
      checkCreditSpend({
        expiry: "2026-08-10", onDate: "2026-08-11", balance: 2300,
        wanted: 400, alreadyUsedOnThisBill: 650,
      })
    ).toEqual({ ok: true })
  })

  it("หมดอายุแล้ว แก้บิลเก่าให้ยอดเพิ่มขึ้นไม่ได้ = ใช้เครดิตใหม่", () => {
    const r = checkCreditSpend({
      expiry: "2026-08-10", onDate: "2026-08-11", balance: 2300,
      wanted: 900, alreadyUsedOnThisBill: 650,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe("expired")
  })
})

describe("creditBucket กับสถานะหมดอายุ", () => {
  it("มีเครดิตแต่หมดอายุ = expired ไม่ใช่ empty", () => {
    expect(creditBucket(2300, true)).toBe("expired")
  })

  it("ไม่มีเครดิตและหมดอายุ = empty เพราะไม่มีอะไรให้ปลดล็อก", () => {
    expect(creditBucket(0, true)).toBe("empty")
  })

  it("เรียกแบบเดิมที่ไม่ส่งพารามิเตอร์ที่สอง ต้องได้ผลเหมือนเดิม", () => {
    expect(creditBucket(2300)).toBe("mid")
  })
})
