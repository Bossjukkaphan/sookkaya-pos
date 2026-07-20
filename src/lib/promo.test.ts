import { describe, expect, it } from "vitest"
import { promoKey } from "./promo"

describe("promoKey", () => {
  it("ยุบ Happy Hours ทุกแบบที่พนักงานเคยพิมพ์ให้เป็นคีย์เดียว", () => {
    expect(promoKey("Happy Hours")).toBe("happyhours")
    expect(promoKey("Happy hours")).toBe("happyhours")
    expect(promoKey("HappyHours")).toBe("happyhours")
    expect(promoKey("hApPy hOuRS")).toBe("happyhours")
    expect(promoKey("  happy   hours  ")).toBe("happyhours")
  })

  it("ยุบรหัสจอง Gowabi ทุกเลขให้เป็น gowabi เดียว", () => {
    expect(promoKey("Gowabi 517620293")).toBe("gowabi")
    expect(promoKey("Gowabi224653839")).toBe("gowabi")
    expect(promoKey("Gowabi    810131039")).toBe("gowabi")
  })

  it("ไม่ยุบชื่อที่ต่างกันจริง — happyhour กับ 1แถม1 ต้องคนละคีย์", () => {
    expect(promoKey("1 แถม 1")).toBe("1แถม1")
    expect(promoKey("1 แถม 1 (คูปอง)")).toBe("1แถม1(คูปอง)")
    expect(promoKey("60แถม30 member")).toBe("60แถม30member")
  })

  it("ค่าว่างและ null ให้คีย์ว่าง", () => {
    expect(promoKey(null)).toBe("")
    expect(promoKey("")).toBe("")
    expect(promoKey("   ")).toBe("")
  })
})
