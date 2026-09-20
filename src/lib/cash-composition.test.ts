import { describe, expect, it } from "vitest"

import {
  cashInBreakdown,
  memberMoneySplit,
  topupBreakdown,
} from "./cash-composition"

describe("cashInBreakdown", () => {
  it("แยกทุกช่องทางว่ามาจากบิลเท่าไร มาจากแพ็กเกจเท่าไร", () => {
    const r = cashInBreakdown(
      [
        { method: "QR Code", amount: 100 },
        { method: "QR Code", amount: 50 },
        { method: "บัตรเครดิต", amount: 400 },
      ],
      [
        { payment_method: "บัตรเครดิต", cash_received: 5000 },
        { payment_method: "QR Code", cash_received: 1000 },
      ]
    )
    expect(r.rows).toEqual([
      { method: "บัตรเครดิต", bills: 400, topups: 5000, total: 5400 },
      { method: "QR Code", bills: 150, topups: 1000, total: 1150 },
    ])
    expect(r.billsTotal).toBe(550)
    expect(r.topupsTotal).toBe(6000)
    expect(r.total).toBe(6550)
  })

  it("ผลรวมของทุกช่องทางต้องเท่ากับยอดเงินเข้าเสมอ — ห้ามมีเงินหล่นระหว่างแยก", () => {
    const r = cashInBreakdown(
      [{ method: "QR Code", amount: 300 }],
      [{ payment_method: "บัตรเครดิต", cash_received: 700 }]
    )
    expect(r.rows.reduce((s, x) => s + x.total, 0)).toBe(r.total)
  })

  it("รับค่า string จาก PostgREST และช่องทางว่าง → 'ไม่ระบุ'", () => {
    const r = cashInBreakdown(
      [{ method: null, amount: "250.50" }],
      [{ payment_method: "  ", cash_received: "100" }]
    )
    expect(r.rows).toEqual([
      { method: "ไม่ระบุ", bills: 250.5, topups: 100, total: 350.5 },
    ])
  })

  it("ช่องทางที่มีแต่บิล หรือมีแต่แพ็กเกจ ก็ต้องขึ้นแถวของตัวเอง", () => {
    const r = cashInBreakdown(
      [{ method: "E-Wallet", amount: 80 }],
      [{ payment_method: "บัตรเครดิต", cash_received: 20 }]
    )
    expect(r.rows.map((x) => x.method)).toEqual(["E-Wallet", "บัตรเครดิต"])
    expect(r.rows[0]).toEqual({ method: "E-Wallet", bills: 80, topups: 0, total: 80 })
    expect(r.rows[1]).toEqual({ method: "บัตรเครดิต", bills: 0, topups: 20, total: 20 })
  })

  it("ไม่มีข้อมูลเลย → ศูนย์ ไม่ใช่ NaN", () => {
    expect(cashInBreakdown([], [])).toEqual({
      rows: [], billsTotal: 0, topupsTotal: 0, total: 0,
    })
  })
})

describe("topupBreakdown", () => {
  const t = (
    payment_method: string | null,
    cash_received: number | string | null,
    tier: string | null = "Silver"
  ) => ({ payment_method, cash_received, tier })

  it("รวมยอด นับจำนวนใบ และแยกทั้งช่องทางและระดับแพ็กเกจ", () => {
    const r = topupBreakdown([
      t("บัตรเครดิต", 10000, "Gold"),
      t("บัตรเครดิต", 5000, "Silver"),
      t("QR Code", 5000, "Silver"),
    ])
    expect(r.total).toBe(20000)
    expect(r.count).toBe(3)
    expect(r.byMethod).toEqual([
      { label: "บัตรเครดิต", amount: 15000, count: 2 },
      { label: "QR Code", amount: 5000, count: 1 },
    ])
    expect(r.byTier).toEqual([
      { label: "Gold", amount: 10000, count: 1 },
      { label: "Silver", amount: 10000, count: 2 },
    ])
  })

  it("ยอดเท่ากันเรียงตามชื่อคงที่ — ตัวเลขเท่ากันต้องไม่สลับที่ทุกครั้งที่โหลด", () => {
    const r = topupBreakdown([t("QR Code", 100, "Silver"), t("บัตรเครดิต", 100, "Gold")])
    expect(r.byMethod.map((x) => x.label)).toEqual(["QR Code", "บัตรเครดิต"])
  })

  it("ระดับ/ช่องทางที่ไม่ได้ระบุ → 'ไม่ระบุ' ไม่ใช่หายไปเฉยๆ", () => {
    const r = topupBreakdown([t(null, 500, null)])
    expect(r.byMethod).toEqual([{ label: "ไม่ระบุ", amount: 500, count: 1 }])
    expect(r.byTier).toEqual([{ label: "ไม่ระบุ", amount: 500, count: 1 }])
  })

  it("ไม่มีใบเติมเลย → ศูนย์ทั้งหมด", () => {
    expect(topupBreakdown([])).toEqual({ total: 0, count: 0, byMethod: [], byTier: [] })
  })
})

describe("memberMoneySplit", () => {
  it("แยกยอดใช้บริการเป็นเงินใหม่กับเครดิตเก่า พร้อม % ของเครดิต", () => {
    const r = memberMoneySplit({ volume: 273955, creditUsed: 82160, topupIn: 65000 })
    expect(r.freshMoney).toBe(191795)
    expect(r.creditUsed).toBe(82160)
    expect(r.creditPct).toBe(30)
    expect(r.cashIn).toBe(256795)
  })

  it("ไม่มียอดขายเลย → 0% ไม่ใช่ NaN", () => {
    const r = memberMoneySplit({ volume: 0, creditUsed: 0, topupIn: 0 })
    expect(r.creditPct).toBe(0)
    expect(r.freshMoney).toBe(0)
    expect(r.cashIn).toBe(0)
  })

  it("รับค่า string จาก RPC ได้ และเครดิตห้ามเกินยอดขายจนเงินใหม่ติดลบ", () => {
    const r = memberMoneySplit({ volume: "1000", creditUsed: "1500", topupIn: "0" })
    expect(r.freshMoney).toBe(0)
    expect(r.creditPct).toBe(100)
  })
})
