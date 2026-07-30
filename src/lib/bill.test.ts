import { describe, expect, it } from "vitest"
import { groupSalesByBill, billTotal, allocateCredit } from "./bill"

type Row = { id: string; bill_id: string | null; net_amount: number }
const r = (id: string, bill_id: string | null, net = 100): Row => ({ id, bill_id, net_amount: net })

describe("groupSalesByBill", () => {
  it("แถวเดี่ยว (bill_id ว่าง) = บิลของตัวเอง ลำดับคงเดิม", () => {
    const groups = groupSalesByBill([r("a", null), r("b", null)])
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([["a"], ["b"]])
  })

  it("แถว bill_id เดียวกันรวมเป็นบิลเดียว ตำแหน่ง = แถวแรกที่เจอ", () => {
    const groups = groupSalesByBill([r("a", "B1"), r("x", null), r("b", "B1")])
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([["a", "b"], ["x"]])
  })

  it("หลายบิลชุดไม่ปนกัน", () => {
    const groups = groupSalesByBill([r("a", "B1"), r("c", "B2"), r("b", "B1"), r("d", "B2")])
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([["a", "b"], ["c", "d"]])
  })

  it("billTotal รวมยอดสุทธิทุกรายการ", () => {
    expect(billTotal([r("a", "B1", 390), r("b", "B1", 550)])).toBe(940)
  })
})

describe("allocateCredit — เฉลี่ยเครดิตลงรายการตามสัดส่วน เศษลงท้าย", () => {
  it("สัดส่วนเท่ากัน แบ่งครึ่ง", () => {
    expect(allocateCredit([650, 650], 500)).toEqual([250, 250])
  })
  it("รายการเดียว หนีบที่ยอดรายการ", () => {
    expect(allocateCredit([800], 9999)).toEqual([800])
  })
  it("เครดิตพอทั้งบิล → เต็มทุกรายการ", () => {
    expect(allocateCredit([390, 650], 2000)).toEqual([390, 650])
  })
  it("เศษหารไม่ลงตัว: ผลรวมตรงเป๊ะ เศษสตางค์ลงรายการท้าย", () => {
    const out = allocateCredit([390, 390, 390], 1000)
    expect(out.reduce((s, n) => s + n, 0)).toBe(1000)
    expect(out).toEqual([333.33, 333.33, 333.34])
  })
  it("เครดิตศูนย์/ติดลบ → ศูนย์หมด", () => {
    expect(allocateCredit([650, 650], 0)).toEqual([0, 0])
    expect(allocateCredit([650], -5)).toEqual([0])
  })
})
