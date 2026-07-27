import { describe, expect, it } from "vitest"
import {
  compareRange, detectAnomalies, median, rulerOf, type ExpenseRow,
} from "./expense-analytics"

describe("rulerOf — หมวดไหนใช้ไม้บรรทัดอะไร", () => {
  it("หมวดที่ควรโตตามงาน", () => {
    expect(rulerOf("HR / payroll (ค่ามือหมอ)")).toBe("revenue_linked")
    expect(rulerOf("วัสดุ-สิ้นเปลือง (น้ำมัน บาล์ม ฯลฯ)")).toBe("revenue_linked")
    expect(rulerOf("ซักรีด")).toBe("revenue_linked")
  })

  it("หมวดที่ไม่ควรโตตามงาน", () => {
    expect(rulerOf("ค่าเช่าสถานที่")).toBe("fixed")
    expect(rulerOf("เงินเดือนพนักงานประจำ")).toBe("fixed")
    expect(rulerOf("ค่าน้ำ / ค่าไฟ / Internet")).toBe("fixed")
  })

  it("หมวดที่เจ้าของร้านตั้งใจจ่ายเอง ไม่เตือน", () => {
    expect(rulerOf("การตลาด / โฆษณา")).toBe("discretionary")
    expect(rulerOf("อื่นๆ")).toBe("discretionary")
  })

  // ชื่อหมวด HR เคยถูกเปลี่ยนมาแล้วเมื่อ 27/7/2569 จึงต้องจับด้วยคำขึ้นต้น
  it("จับด้วยคำขึ้นต้น ไม่ใช่ชื่อเต็ม", () => {
    expect(rulerOf("HR / payroll (เงินประกัน ค่ามือ เงินเดือน)")).toBe("revenue_linked")
  })

  // กันเตือนผิดด้วยไม้บรรทัดผิดอัน — ปลอดภัยกว่าเดา
  it("หมวดที่ไม่รู้จักตกไปกลุ่มไม่เตือน", () => {
    expect(rulerOf("หมวดที่พึ่งสร้างเมื่อวาน")).toBe("discretionary")
  })
})

describe("median", () => {
  it("จำนวนคี่เอาตัวกลาง", () => {
    expect(median([38250, 41650, 39500])).toBe(39500)
  })

  it("จำนวนคู่เอาค่าเฉลี่ยของสองตัวกลาง", () => {
    expect(median([10, 20, 30, 40])).toBe(25)
  })

  it("ค่าซ้ำกันได้", () => {
    expect(median([12000, 12000, 9900])).toBe(12000)
  })

  it("ค่าเดียว", () => {
    expect(median([5])).toBe(5)
  })

  it("ไม่มีค่าเลยคืน 0", () => {
    expect(median([])).toBe(0)
  })
})

const row = (date: string, category: string, item: string, amount: number): ExpenseRow => ({
  expense_date: date,
  category,
  item,
  amount,
})

describe("compareRange — บล็อก 1", () => {
  const rows = [
    row("2026-06-05", "ซักรีด", "ซักผ้า มิ.ย.", 7400),
    row("2026-06-15", "อื่นๆ", "ค่าช่างทำประตู", 23000),
    // วันที่ 29 อยู่นอกช่วง 1-27 ต้องไม่ถูกนับ
    row("2026-06-29", "ค่าเช่าสถานที่", "ค่าเช่า มิ.ย.", 36000),
    row("2026-07-05", "ซักรีด", "ซักผ้า ก.ค.", 5000),
    row("2026-07-10", "อื่นๆ", "โอนให้คุณบอส", 2990),
  ]
  const revenue = new Map([
    ["2026-06-10", 316788],
    ["2026-07-10", 322242],
  ])

  const result = compareRange({ rows, revenueByDate: revenue, month: "2026-07", throughDay: 27 })

  it("ตัดวันเท่ากันทั้งสองฝั่ง — ค่าเช่าวันที่ 29 ต้องไม่ถูกนับ", () => {
    expect(result.current.expense).toBe(7990)
    expect(result.previous.expense).toBe(30400)
  })

  it("ดึงรายได้ของช่วงเดียวกันมาด้วย", () => {
    expect(result.current.revenue).toBe(322242)
    expect(result.previous.revenue).toBe(316788)
  })

  it("เรียงหมวดตามขนาดผลกระทบ ไม่ใช่ตามเครื่องหมาย", () => {
    expect(result.byCategory.map((c) => c.category)).toEqual(["อื่นๆ", "ซักรีด"])
    expect(result.byCategory[0].deltaBaht).toBe(-20010)
    expect(result.byCategory[1].deltaBaht).toBe(-2400)
  })

  it("โชว์รายการใหญ่สุดของช่วงปัจจุบัน เรียงจากมากไปน้อย", () => {
    expect(result.topItems).toEqual([
      { item: "ซักผ้า ก.ค.", amount: 5000 },
      { item: "โอนให้คุณบอส", amount: 2990 },
    ])
  })

  it("หมวดที่มีเฉพาะเดือนก่อนก็ต้องโผล่ในรายการส่วนต่าง", () => {
    const onlyPrev = compareRange({
      rows: [row("2026-06-03", "การตลาด / โฆษณา", "ยิงแอด", 5000)],
      revenueByDate: new Map(),
      month: "2026-07",
      throughDay: 27,
    })
    expect(onlyPrev.byCategory).toEqual([
      { category: "การตลาด / โฆษณา", deltaBaht: -5000 },
    ])
  })

  it("เดือนที่ปิดแล้วส่ง throughDay 31 เพื่อเอาทั้งเดือน", () => {
    const full = compareRange({ rows, revenueByDate: revenue, month: "2026-07", throughDay: 31 })
    expect(full.previous.expense).toBe(66400)
  })
})

describe("detectAnomalies — บล็อก 2", () => {
  /** เคสจริงเดือน มิ.ย. 2569: เงินเดือนประจำโตจริง ส่วนค่าเช่ากับค่าน้ำค่าไฟเป็นสัญญาณหลอก
   *  ที่ค่าเฉลี่ยจับผิด แต่ค่ากลางจับถูก — เทสนี้คือเหตุผลที่เลือกค่ากลาง */
  const salary = (month: string, amount: number) =>
    row(`${month}-30`, "เงินเดือนพนักงานประจำ", "เงินเดือน reception", amount)
  const rent = (month: string, amount: number) =>
    row(`${month}-05`, "ค่าเช่าสถานที่", "ค่าเช่า", amount)
  const util = (month: string, amount: number) =>
    row(`${month}-10`, "ค่าน้ำ / ค่าไฟ / Internet", "ค่าไฟ", amount)

  const rows = [
    salary("2026-03", 38250), salary("2026-04", 39500),
    salary("2026-05", 41650), salary("2026-06", 52450),
    rent("2026-03", 36566), rent("2026-04", 18000),
    rent("2026-05", 41000), rent("2026-06", 36000),
    util("2026-03", 2941), util("2026-04", 16375),
    util("2026-05", 20016), util("2026-06", 16198),
  ]

  const result = detectAnomalies({
    rows,
    revenueByDate: new Map(),
    commissionByDate: new Map(),
    month: "2026-06",
    throughDay: 31,
    monthClosed: true,
  })
  const byName = (name: string) => result.find((d) => d.category.startsWith(name))!

  it("เงินเดือนประจำโต 32.8% ต้องเตือนแดง", () => {
    const d = byName("เงินเดือน")
    expect(d.baseline).toBe(39500)
    expect(d.current).toBe(52450)
    expect(Math.round(d.deltaPct * 10) / 10).toBe(32.8)
    expect(d.level).toBe("alert")
  })

  it("ค่าเช่าเป็นจังหวะจ่าย ไม่ใช่ค่าเช่าขึ้น — ต้องเงียบ", () => {
    expect(byName("ค่าเช่า").level).toBe("ok")
  })

  it("ค่าน้ำค่าไฟที่ มี.ค. บันทึกไม่ครบ ต้องไม่ทำให้เตือนหลอก", () => {
    expect(byName("ค่าน้ำ").level).toBe("ok")
  })

  it("เดือนที่ยังไม่จบต้องไม่ตรวจหมวดคงที่ เพราะจ่ายเป็นก้อนวันที่ตายตัว", () => {
    const partial = detectAnomalies({
      rows,
      revenueByDate: new Map(),
      commissionByDate: new Map(),
      month: "2026-06",
      throughDay: 27,
      monthClosed: false,
    })
    expect(partial.find((d) => d.category.startsWith("เงินเดือน"))).toBeUndefined()
  })

  it("มีประวัติไม่ครบ 3 เดือน ต้องเป็น unknown ไม่ใช่ ok", () => {
    const short = detectAnomalies({
      rows: [salary("2026-05", 41650), salary("2026-06", 52450)],
      revenueByDate: new Map(),
      commissionByDate: new Map(),
      month: "2026-06",
      throughDay: 31,
      monthClosed: true,
    })
    expect(short.find((d) => d.category.startsWith("เงินเดือน"))!.level).toBe("unknown")
  })

  it("ค่ามือหมออ่านจากงานจริง ไม่ใช่จากแถวรายจ่าย", () => {
    const commission = new Map([
      ["2026-04-15", 110775], ["2026-05-15", 104135],
      ["2026-06-15", 126150], ["2026-07-15", 131035],
    ])
    const revenue = new Map([
      ["2026-04-15", 288887], ["2026-05-15", 238863],
      ["2026-06-15", 316788], ["2026-07-15", 322242],
    ])
    const out = detectAnomalies({
      // แถวรายจ่ายค่ามือตั้งใจใส่ยอดผิดเพี้ยน เพื่อพิสูจน์ว่าไม่ได้ถูกใช้
      rows: [row("2026-07-10", "HR / payroll (ค่ามือหมอ)", "ค่ามืองวด 1-10", 999999)],
      revenueByDate: revenue,
      commissionByDate: commission,
      month: "2026-07",
      throughDay: 27,
      monthClosed: false,
    })
    const d = out.find((x) => x.category.startsWith("HR / payroll"))!
    // 131035/322242 = 40.66% เทียบค่ากลาง 39.82% = โตแค่ 2.1% ยังไม่ถึงเกณฑ์
    expect(Math.round(d.current * 100) / 100).toBe(40.66)
    expect(Math.round(d.baseline * 100) / 100).toBe(39.82)
    expect(d.level).toBe("ok")
  })

  it("หมวดที่ตั้งใจจ่ายเองไม่ถูกนำมาตรวจเลย", () => {
    const out = detectAnomalies({
      rows: [
        row("2026-04-01", "การตลาด / โฆษณา", "แอด", 44869),
        row("2026-05-01", "การตลาด / โฆษณา", "แอด", 12320),
        row("2026-06-01", "การตลาด / โฆษณา", "แอด", 1000),
        row("2026-07-01", "การตลาด / โฆษณา", "แอด", 90000),
      ],
      revenueByDate: new Map(),
      commissionByDate: new Map(),
      month: "2026-07",
      throughDay: 27,
      monthClosed: false,
    })
    expect(out).toHaveLength(0)
  })

  it("เข้าเกณฑ์ % แต่เงินไม่ถึง 2,000 ต้องไม่เตือน", () => {
    const small = (month: string, amount: number) =>
      row(`${month}-10`, "ค่าน้ำ / ค่าไฟ / Internet", "ค่าไฟ", amount)
    const out = detectAnomalies({
      rows: [small("2026-03", 1000), small("2026-04", 1000), small("2026-05", 1000), small("2026-06", 2500)],
      revenueByDate: new Map(),
      commissionByDate: new Map(),
      month: "2026-06",
      throughDay: 31,
      monthClosed: true,
    })
    // โต 150% แต่เป็นเงินแค่ 1,500 บาท
    expect(out.find((d) => d.category.startsWith("ค่าน้ำ"))!.level).toBe("ok")
  })

  it("ค่าที่อยู่ตรงเส้นเกณฑ์พอดีต้องนับว่าเข้าเกณฑ์", () => {
    const u = (month: string, amount: number) =>
      row(`${month}-10`, "ค่าเช่าสถานที่", "ค่าเช่า", amount)
    const out = detectAnomalies({
      rows: [u("2026-03", 20000), u("2026-04", 20000), u("2026-05", 20000), u("2026-06", 22000)],
      revenueByDate: new Map(),
      commissionByDate: new Map(),
      month: "2026-06",
      throughDay: 31,
      monthClosed: true,
    })
    // โต 10.0% พอดี และเป็นเงิน 2,000 พอดี
    expect(out.find((d) => d.category.startsWith("ค่าเช่า"))!.level).toBe("warn")
  })

  it("ยอดขายเป็นศูนย์ต้องไม่หารด้วยศูนย์", () => {
    const out = detectAnomalies({
      rows: [row("2026-07-01", "ซักรีด", "ซักผ้า", 5000)],
      revenueByDate: new Map(),
      commissionByDate: new Map(),
      month: "2026-07",
      throughDay: 27,
      monthClosed: false,
    })
    const d = out.find((x) => x.category === "ซักรีด")!
    expect(Number.isFinite(d.current)).toBe(true)
    expect(d.level).toBe("unknown")
  })

  it("ลดลงเกินเกณฑ์และเป็นเงินพอ ต้องขึ้นว่าดีขึ้น", () => {
    const s = (month: string, amount: number) =>
      row(`${month}-10`, "ค่าเช่าสถานที่", "ค่าเช่า", amount)
    const out = detectAnomalies({
      rows: [s("2026-03", 40000), s("2026-04", 40000), s("2026-05", 40000), s("2026-06", 30000)],
      revenueByDate: new Map(),
      commissionByDate: new Map(),
      month: "2026-06",
      throughDay: 31,
      monthClosed: true,
    })
    expect(out.find((d) => d.category.startsWith("ค่าเช่า"))!.level).toBe("better")
  })
})
