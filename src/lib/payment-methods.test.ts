import { describe, expect, it } from "vitest"

import { PAYMENT_METHODS, REAL_MONEY_METHODS } from "./constants"
import { PAY_COLOR, PAY_DOT, PAY_SELECTED } from "./payment-colors"
import { PAYMENT_LINE_METHODS } from "./payments"
import { POINT_EARNING_METHODS } from "./points"

/**
 * เทสต์ชุดนี้มีไว้กันความผิดพลาดเดิมซ้ำ: ก่อนหน้านี้รายชื่อช่องทางถูกก๊อปไว้ 3 ที่
 * พอเพิ่มช่องทางใหม่แล้วลืมบางจุด ระบบจะพังเงียบ ๆ คนละที่กัน
 */
describe("รายชื่อช่องทางชำระเงิน", () => {
  it("ช่องทางเงินจริงทุกตัวต้องอยู่ในรายชื่อช่องทางทั้งหมดด้วย", () => {
    for (const m of REAL_MONEY_METHODS) {
      expect(PAYMENT_METHODS as readonly string[]).toContain(m)
    }
  })

  it("E-Wallet อยู่ในทั้งสองรายชื่อ", () => {
    expect(REAL_MONEY_METHODS as readonly string[]).toContain("E-Wallet")
    expect(PAYMENT_METHODS as readonly string[]).toContain("E-Wallet")
  })

  it("ลำดับของชุดกลางคงที่ — ตัวแรกเป็นค่าตั้งต้นของกล่องเก็บเงินค้าง", () => {
    expect(REAL_MONEY_METHODS).toEqual([
      "เงินสด",
      "QR Code",
      "บัตรเครดิต",
      "E-Wallet",
    ])
  })

  it("บรรทัดแบ่งจ่ายและช่องทางได้แต้มใช้ชุดเดียวกับชุดกลาง", () => {
    expect(PAYMENT_LINE_METHODS).toEqual(REAL_MONEY_METHODS)
    expect(POINT_EARNING_METHODS).toEqual(REAL_MONEY_METHODS)
  })

  it("Gowabi / KOL / Member Credit ไม่ใช่เงินจริงจากลูกค้า", () => {
    for (const m of ["Gowabi", "KOL", "Member Credit"]) {
      expect(REAL_MONEY_METHODS as readonly string[]).not.toContain(m)
    }
  })
})

describe("สีประจำช่องทาง", () => {
  it("ช่องทางเงินจริงทุกตัวต้องมีสีครบทั้งสามชุด", () => {
    for (const m of REAL_MONEY_METHODS) {
      expect(PAY_COLOR[m], `PAY_COLOR ขาด ${m}`).toBeDefined()
      expect(PAY_DOT[m], `PAY_DOT ขาด ${m}`).toBeDefined()
      expect(PAY_SELECTED[m], `PAY_SELECTED ขาด ${m}`).toBeDefined()
    }
  })

  it("Member Credit ต้องมีสีด้วย — ไม่ใช่เงินจริงแต่โผล่ในการ์ดช่องทางชำระเงิน", () => {
    expect(PAY_COLOR["Member Credit"]).toBeDefined()
    expect(PAY_DOT["Member Credit"]).toBeDefined()
  })

  it("สีของ E-Wallet ต้องไม่ซ้ำกับช่องทางอื่น", () => {
    const used = Object.entries(PAY_COLOR).filter(([k]) => k !== "E-Wallet")
    expect(used.map(([, v]) => v)).not.toContain(PAY_COLOR["E-Wallet"])
  })
})
