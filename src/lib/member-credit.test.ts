import { describe, expect, it } from "vitest"
import { CREDIT_LOW_MAX, checkCreditSpend, creditBucket, isCreditFrozen } from "./member-credit"

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

  it("wanted เท่ากับ 0 ไม่ตัดอะไรเลย จึงผ่านเสมอ", () => {
    expect(checkCreditSpend({ ...ใช้ได้, wanted: 0 })).toEqual({ ok: true })
  })

  it("wanted ติดลบ (ไม่มีการตัดจริง) ผ่านเสมอเหมือนกับ 0", () => {
    expect(checkCreditSpend({ ...ใช้ได้, wanted: -100 })).toEqual({ ok: true })
  })

  it("alreadyUsedOnThisBill มากกว่า balance (ข้อมูลขัดแย้งกันเอง) ไม่ทำให้ authorize ผิด — ตกไปเช็คยอดคงเหลือตามปกติ", () => {
    const r = checkCreditSpend({
      expiry: "2026-08-10", onDate: "2026-08-11", balance: 2300,
      wanted: 3000, alreadyUsedOnThisBill: 5000,
    })
    // wanted (3000) <= previously (5000) จึงไม่ถูกกันด้วยเหตุผล expired
    // แต่ยอดคงเหลือจริงมีแค่ 2300 ไม่พอ 3000 จึงต้องโดนกันด้วย insufficient ตามปกติ
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe("insufficient")
  })

  it("หมดอายุและยอดไม่พอพร้อมกัน ต้องตอบ expired ไม่ใช่ insufficient เพราะ insufficient จะชวนพนักงานไปเก็บเงินเพิ่มเฉย ๆ ทั้งที่ลูกค้าต้องซื้อแพ็กเกจใหม่เพื่อปลดล็อกเครดิตแช่แข็งก่อน", () => {
    const r = checkCreditSpend({
      expiry: "2026-08-10", onDate: "2026-08-11", balance: 100, wanted: 5000,
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

describe("isCreditFrozen", () => {
  // ทุกหน้าจอ (POS ทั้งสองแบบ, หน้าลูกค้า, ตารางลูกค้า, การ์ดสมาชิก, โปรไฟล์ไลน์) เรียกตัวนี้
  // ตัวเดียวก่อนโชว์ข้อความ "เครดิตหมดอายุแล้ว ยอด X ฿ ยังอยู่ครบ" — ยังไม่เคยมีเคสจริงใน
  // production เกิดขึ้นเลย (แพ็กเกจที่ยังไม่หมดอายุเร็วสุดคือ 2026-10-15) จึงต้องมี unit test
  // ยืนยันเงื่อนไขไว้ตรงนี้ แทนที่จะรอเห็นจริงตอนแพ็กเกจแรกหมดอายุ

  it("มีเครดิตและหมดอายุ = แช่แข็ง ต้องโชว์ข้อความชวนเติม", () => {
    expect(isCreditFrozen(2300, true)).toBe(true)
  })

  it("ยอด 0 และหมดอายุ = ไม่ใช่แช่แข็ง (ไม่มีอะไรให้ปลดล็อก อย่าโชว์ข้อความ)", () => {
    expect(isCreditFrozen(0, true)).toBe(false)
  })

  it("มีเครดิตแต่ยังไม่หมดอายุ = ไม่ใช่แช่แข็ง", () => {
    expect(isCreditFrozen(2300, false)).toBe(false)
  })

  it("ลูกค้าทั่วไปไม่เคยเป็นสมาชิก (ยอด 0 ไม่หมดอายุ) = ไม่ใช่แช่แข็ง", () => {
    expect(isCreditFrozen(0, false)).toBe(false)
  })

  it("ต้องจับคู่กับ balance > 0 เสมอ — ถ้าเช็คแค่ expired เฉยๆ (ไม่สนยอด) เคสยอด 0 จะพัง", () => {
    // เท่ากับ regression guard ของบั๊กที่บอกลูกค้าทั่วไป (ไม่เคยมีเครดิต) ว่า "เครดิตหมดอายุ"
    const balance = 0
    const expired = true
    const wrongImplementation = expired // ลืมจับคู่กับ balance > 0
    expect(isCreditFrozen(balance, expired)).toBe(false)
    expect(wrongImplementation).not.toBe(isCreditFrozen(balance, expired))
  })
})
