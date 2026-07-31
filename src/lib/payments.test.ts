import { describe, expect, it } from "vitest"
import {
  MAX_PAYMENT_LINES, PAYMENT_LINE_METHODS,
  dueAmount, parsePaymentLines, primaryMethod,
} from "./payments"

describe("parsePaymentLines", () => {
  it("เคสจริง: บัตร 650 + โอน 240 บนบิล 890", () => {
    const r = parsePaymentLines(
      JSON.stringify([
        { method: "บัตรเครดิต", amount: 650 },
        { method: "QR Code", amount: 240 },
      ]), 890)
    expect(r).toEqual({ ok: true, lines: [
      { method: "บัตรเครดิต", amount: 650 }, { method: "QR Code", amount: 240 },
    ]})
  })
  it("ว่าง/ไม่ส่ง = บรรทัดว่าง (บิลค้างรับเต็มยอด หรือโค้ดเก่า)", () => {
    expect(parsePaymentLines("", 500)).toEqual({ ok: true, lines: [] })
    expect(parsePaymentLines("[]", 500)).toEqual({ ok: true, lines: [] })
  })
  it("วิธีนอกลิสต์ (Member Credit/Gowabi) → error", () => {
    expect(parsePaymentLines(JSON.stringify([{ method: "Member Credit", amount: 100 }]), 500).ok).toBe(false)
    expect(parsePaymentLines(JSON.stringify([{ method: "Gowabi", amount: 100 }]), 500).ok).toBe(false)
  })
  it("จำนวน ≤ 0 · เกิน 3 บรรทัด · รวมเกินยอดต้องเก็บ → error", () => {
    expect(parsePaymentLines(JSON.stringify([{ method: "เงินสด", amount: 0 }]), 500).ok).toBe(false)
    expect(parsePaymentLines(JSON.stringify(Array(4).fill({ method: "เงินสด", amount: 10 })), 500).ok).toBe(false)
    expect(parsePaymentLines(JSON.stringify([
      { method: "เงินสด", amount: 300 }, { method: "QR Code", amount: 300 },
    ]), 500).ok).toBe(false)
  })
  it("JSON เสีย → error ไม่ throw", () => {
    expect(parsePaymentLines("{บึ้ม", 500).ok).toBe(false)
  })
})

describe("primaryMethod", () => {
  it("บรรทัดยอดมากสุดชนะ · เท่ากันเอาบรรทัดแรก · ว่าง = null", () => {
    expect(primaryMethod([
      { method: "บัตรเครดิต", amount: 650 }, { method: "QR Code", amount: 240 },
    ])).toBe("บัตรเครดิต")
    expect(primaryMethod([
      { method: "เงินสด", amount: 250 }, { method: "QR Code", amount: 250 },
    ])).toBe("เงินสด")
    expect(primaryMethod([])).toBeNull()
  })
})

describe("dueAmount", () => {
  it("จ่ายครบ = 0 · ขาด = ค้างรับ · เศษสตางค์ไม่หลอน", () => {
    expect(dueAmount(890, [{ method: "บัตรเครดิต", amount: 650 }, { method: "QR Code", amount: 240 }])).toBe(0)
    expect(dueAmount(890, [{ method: "บัตรเครดิต", amount: 650 }])).toBe(240)
    expect(dueAmount(0.3, [{ method: "เงินสด", amount: 0.1 }, { method: "เงินสด", amount: 0.2 }])).toBe(0)
  })
})
