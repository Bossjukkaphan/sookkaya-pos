import { describe, expect, it } from "vitest"
import {
  barGeometry,
  groupedBarGeometry,
  groupedBarsWithLine,
  linePath,
  linearScale,
} from "./chart"

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

describe("groupedBarGeometry", () => {
  const revenue = [
    { label: "มี.ค.", value: 174842 },
    { label: "เม.ย.", value: 316123 },
  ]
  const expense = [
    { label: "มี.ค.", value: 282537 },
    { label: "เม.ย.", value: 386552 },
  ]

  it("ใช้สเกลเดียวกันทุกชุด — ค่าเท่ากันต้องสูงเท่ากันแม้อยู่คนละชุด", () => {
    const [a, b] = groupedBarGeometry(
      [
        [{ label: "มี.ค.", value: 100 }, { label: "เม.ย.", value: 50 }],
        [{ label: "มี.ค.", value: 50 }, { label: "เม.ย.", value: 100 }],
      ],
      120,
      100
    )

    expect(a[0].h).toBeCloseTo(b[1].h)
    expect(a[1].h).toBeCloseTo(b[0].h)
    // สเกลรวมสูงสุดคือ 100 → แท่ง 100 ต้องเต็มความสูง
    expect(a[0].h).toBeCloseTo(100)
  })

  it("รายจ่ายสูงกว่ารายได้ต้องได้แท่งที่สูงกว่า ไม่ใช่เท่ากันเพราะต่างคนต่างสเกล", () => {
    const [rev, exp] = groupedBarGeometry([revenue, expense], 200, 100)
    expect(exp[0].h).toBeGreaterThan(rev[0].h)
    // แท่งที่สูงที่สุดในภาพคือรายจ่าย เม.ย. = ค่าสูงสุดรวม
    expect(exp[1].h).toBeCloseTo(100)
  })

  it("วางแท่งเรียงข้างกันในช่องเดียวกัน ไม่ทับกันและไม่ล้นช่อง", () => {
    const [rev, exp] = groupedBarGeometry([revenue, expense], 200, 100)
    const slot = 200 / 2

    expect(rev[0].x + rev[0].w).toBeLessThanOrEqual(exp[0].x + 1e-9)
    expect(exp[0].x + exp[0].w).toBeLessThanOrEqual(slot)
    expect(rev[1].x).toBeGreaterThanOrEqual(slot)
    expect(rev[0].w).toBeCloseTo(exp[0].w)
  })

  it("คืนอาเรย์ว่างเมื่อไม่มีชุดข้อมูลเลย", () => {
    expect(groupedBarGeometry([], 100, 50)).toEqual([])
  })

  it("ชุดข้อมูลว่างทุกชุดก็ยังคืนโครงเดิม ไม่ throw", () => {
    expect(groupedBarGeometry([[], []], 100, 50)).toEqual([[], []])
  })

  it("ชุดข้อมูลยาวไม่เท่ากัน — ช่องนับตามชุดที่ยาวที่สุด และไม่เติมแท่งปลอม", () => {
    const [a, b] = groupedBarGeometry(
      [
        [
          { label: "มี.ค.", value: 100 },
          { label: "เม.ย.", value: 200 },
          { label: "พ.ค.", value: 300 },
        ],
        [{ label: "มี.ค.", value: 150 }],
      ],
      300,
      100
    )

    expect(a).toHaveLength(3)
    expect(b).toHaveLength(1)
    // 3 ช่องบนความกว้าง 300 → ช่องละ 100 · แท่งของ พ.ค. ต้องอยู่ในช่องที่สาม
    expect(a[2].x).toBeGreaterThanOrEqual(200)
    // สเกลรวมยังคิดจากทุกชุด — 300 คือค่าสูงสุด
    expect(a[2].h).toBeCloseTo(100)
  })

  it("ค่าติดลบห้อยใต้เส้นศูนย์ ไม่ใช่ตั้งขึ้นจากขอบล่าง", () => {
    const [a, b] = groupedBarGeometry(
      [
        [{ label: "มี.ค.", value: -100 }],
        [{ label: "มี.ค.", value: 100 }],
      ],
      100,
      100
    )

    expect(a[0].y).toBeCloseTo(50)
    expect(a[0].h).toBeCloseTo(50)
    expect(b[0].y).toBeCloseTo(0)
    expect(b[0].h).toBeCloseTo(50)
  })
})

describe("groupedBarsWithLine", () => {
  it("เส้นใช้สเกลเดียวกับแท่ง — จุดที่ค่าเท่าแท่งต้องอยู่ที่ยอดแท่งพอดี", () => {
    const { bars, path } = groupedBarsWithLine(
      [[{ label: "มี.ค.", value: 100 }]],
      [{ label: "มี.ค.", value: 100 }],
      100,
      100
    )

    expect(bars[0][0].y).toBeCloseTo(0)
    // จุดเดียว → กลางช่องที่กว้างเท่าภาพ
    expect(path).toBe("M 50 0")
  })

  it("ค่าของเส้นถูกนับเข้าสเกลด้วย ไม่งั้นเส้นจะทะลุกรอบ", () => {
    const { bars, path } = groupedBarsWithLine(
      [[{ label: "มี.ค.", value: 100 }]],
      [{ label: "มี.ค.", value: 200 }],
      100,
      100
    )

    // ค่าสูงสุดรวมคือ 200 → แท่ง 100 สูงครึ่งเดียว และเส้นอยู่ขอบบน
    expect(bars[0][0].h).toBeCloseTo(50)
    expect(path).toBe("M 50 0")
  })

  it("ไม่มีข้อมูลก็ไม่ throw และ path ว่าง", () => {
    const { bars, path } = groupedBarsWithLine([], [], 100, 100)
    expect(bars).toEqual([])
    expect(path).toBe("")
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
