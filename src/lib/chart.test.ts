import { describe, expect, it } from "vitest"
import { barGeometry, linePath, linearScale } from "./chart"

describe("linearScale", () => {
  it("รวมศูนย์ไว้ในช่วงเสมอ เพื่อให้แท่งกราฟตั้งบนเส้นฐานจริง", () => {
    const s = linearScale([100, 200], 100)
    expect(s.min).toBe(0)
    expect(s.max).toBe(200)
    expect(s.y(200)).toBeCloseTo(0)
    expect(s.y(0)).toBeCloseTo(100)
    expect(s.zeroY).toBeCloseTo(100)
  })

  it("ค่าติดลบวางใต้เส้นศูนย์ได้ — กำไร 3 เดือนแรกติดลบจริง", () => {
    const s = linearScale([-107695, 88991], 150)
    expect(s.min).toBe(-107695)
    expect(s.max).toBe(88991)
    expect(s.y(-107695)).toBeCloseTo(150)
    expect(s.y(88991)).toBeCloseTo(0)
    expect(s.zeroY).toBeGreaterThan(0)
    expect(s.zeroY).toBeLessThan(150)
  })

  it("ไม่หารด้วยศูนย์เมื่อไม่มีข้อมูล", () => {
    const s = linearScale([], 100)
    expect(Number.isFinite(s.y(0))).toBe(true)
    expect(Number.isFinite(s.zeroY)).toBe(true)
  })

  it("ไม่หารด้วยศูนย์เมื่อทุกค่าเท่ากันและเป็นศูนย์", () => {
    const s = linearScale([0, 0, 0], 100)
    expect(Number.isFinite(s.y(0))).toBe(true)
  })
})

describe("barGeometry", () => {
  it("แบ่งความกว้างเท่าๆ กันและแท่งไม่ทับกัน", () => {
    const bars = barGeometry([
      { label: "มี.ค.", value: 100 },
      { label: "เม.ย.", value: 200 },
    ], 100, 50)

    expect(bars).toHaveLength(2)
    expect(bars[0].x + bars[0].w).toBeLessThanOrEqual(bars[1].x)
    expect(bars[1].h).toBeGreaterThan(bars[0].h)
  })

  it("แท่งค่าติดลบเริ่มที่เส้นศูนย์แล้วยื่นลงล่าง", () => {
    const bars = barGeometry([
      { label: "มี.ค.", value: -100 },
      { label: "มิ.ย.", value: 100 },
    ], 100, 100)

    expect(bars[0].y).toBeCloseTo(50)
    expect(bars[0].h).toBeCloseTo(50)
    expect(bars[1].y).toBeCloseTo(0)
  })

  it("คืนอาเรย์ว่างเมื่อไม่มีข้อมูล ไม่ throw", () => {
    expect(barGeometry([], 100, 50)).toEqual([])
  })
})

describe("linePath", () => {
  it("สร้าง path ที่เริ่มด้วย M แล้วต่อด้วย L ทีละจุด", () => {
    const d = linePath([
      { label: "a", value: 0 },
      { label: "b", value: 100 },
    ], 100, 50)

    expect(d.startsWith("M ")).toBe(true)
    expect(d.split("L")).toHaveLength(2)
  })

  it("คืนสตริงว่างเมื่อไม่มีข้อมูล — SVG จะไม่วาดอะไรเลย", () => {
    expect(linePath([], 100, 50)).toBe("")
  })

  it("จุดเดียวก็ยังได้ path ที่ valid", () => {
    const d = linePath([{ label: "a", value: 50 }], 100, 50)
    expect(d.startsWith("M ")).toBe(true)
  })
})
