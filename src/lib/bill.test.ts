import { describe, expect, it } from "vitest"
import { groupSalesByBill, billTotal } from "./bill"

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
