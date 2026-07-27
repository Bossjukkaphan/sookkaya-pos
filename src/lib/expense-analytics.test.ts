import { describe, expect, it } from "vitest"
import {
  COMMISSION_LABEL, WARN_PCT, compareRange, detectAnomalies, median, monthlySeries,
  projectMonthEnd, rulerOf,
  type ExpenseRow,
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

  it("คำขึ้นต้นต้องไม่สั้นจนคาบเกี่ยวหมวดอื่น", () => {
    expect(rulerOf("ค่าน้ำมันรถ")).toBe("discretionary")
    expect(rulerOf("ค่าน้ำดื่มลูกค้า")).toBe("discretionary")
    expect(rulerOf("ค่าน้ำ / ค่าไฟ / Internet")).toBe("fixed")
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
    const d = out.find((x) => x.category === COMMISSION_LABEL)!
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

  /** สร้างรายได้ก้อนเดียวกลางเดือน — พอสำหรับเทสที่ throughDay >= 15 */
  const revMid = (amount: number) =>
    new Map([
      ["2026-04-15", amount], ["2026-05-15", amount],
      ["2026-06-15", amount], ["2026-07-15", amount],
    ])

  it("หมวดที่เพิ่งโผล่ครั้งแรกต้องเป็น unknown ไม่ใช่ ok", () => {
    const out = detectAnomalies({
      rows: [row("2026-07-10", "วัสดุ-สิ้นเปลือง (น้ำมัน บาล์ม ฯลฯ)", "บาล์มล็อตใหญ่", 50000)],
      revenueByDate: revMid(300000),
      commissionByDate: new Map(),
      month: "2026-07",
      throughDay: 27,
      monthClosed: false,
    })
    // เคยขึ้นเขียว "ปกติ" ทั้งที่ไม่มีอะไรให้เทียบ แล้วแบกยอด 50,000 ไว้ในการ์ด
    expect(out.find((d) => d.category.startsWith("วัสดุ"))!.level).toBe("unknown")
  })

  it("บิลที่ยังไม่ได้คีย์ในเดือนที่ยังไม่จบ ต้องไม่ขึ้นว่าประหยัดได้", () => {
    const laundry = (month: string) => row(`${month}-03`, "ซักรีด", "ค่าซักผ้า", 11000)
    const out = detectAnomalies({
      rows: [laundry("2026-04"), laundry("2026-05"), laundry("2026-06")],
      revenueByDate: revMid(300000),
      commissionByDate: new Map(),
      month: "2026-07",
      throughDay: 20,
      monthClosed: false,
    })
    // เคยขึ้น better −100% ประหยัดได้ 11,000 ทั้งที่แค่ยังไม่คีย์บิล
    expect(out.find((d) => d.category === "ซักรีด")!.level).toBe("unknown")
  })

  it("เดือนที่ยังไม่จบและเพิ่งผ่านไปไม่กี่วัน ต้องยังไม่ตัดสินหมวดที่วัดเป็น %", () => {
    const supply = (month: string, amount: number) =>
      row(`${month}-01`, "วัสดุ-สิ้นเปลือง (น้ำมัน บาล์ม ฯลฯ)", "ของใช้", amount)
    const rev = new Map([
      ["2026-04-01", 10000], ["2026-05-01", 10000],
      ["2026-06-01", 10000], ["2026-07-01", 10000],
    ])
    const out = detectAnomalies({
      rows: [supply("2026-04", 400), supply("2026-05", 400), supply("2026-06", 400), supply("2026-07", 8000)],
      revenueByDate: rev,
      commissionByDate: new Map(),
      month: "2026-07",
      throughDay: 2,
      monthClosed: false,
    })
    // เคยขึ้นแดง "โต 1,900%" เพราะซื้อของล็อตเดียววันที่ 1 แล้วดูวันที่ 2
    expect(out.find((d) => d.category.startsWith("วัสดุ"))!.level).toBe("unknown")
  })

  it("ค่ามือหมอต้องถูกตรวจแม้เดือนนั้นยังไม่มีแถวจ่ายค่ามือเลย", () => {
    const out = detectAnomalies({
      rows: [row("2026-07-01", "ซักรีด", "ซักผ้า", 5000)],
      revenueByDate: revMid(300000),
      commissionByDate: new Map([
        ["2026-04-15", 100000], ["2026-05-15", 100000],
        ["2026-06-15", 100000], ["2026-07-15", 200000],
      ]),
      month: "2026-07",
      throughDay: 27,
      monthClosed: false,
    })
    const d = out.find((x) => x.category === COMMISSION_LABEL)
    // ค่ามือเป็นก้อนใหญ่สุดของร้าน หายไปทั้งหมวดแปลว่าหน้าเว็บโกหกว่าไม่มีอะไรผิดปกติ
    expect(d).toBeDefined()
    expect(d!.level).toBe("alert")
  })

  it("ชื่อหมวดค่ามือเก่ากับใหม่อยู่ด้วยกัน ต้องได้การ์ดเดียว", () => {
    const out = detectAnomalies({
      rows: [
        row("2026-04-10", "HR / payroll (ค่ามือหมอ)", "ค่ามืองวด", 100000),
        row("2026-07-10", "HR / payroll (เงินประกัน ค่ามือ เงินเดือน)", "ค่ามืองวด", 120000),
      ],
      revenueByDate: revMid(300000),
      commissionByDate: new Map([
        ["2026-04-15", 100000], ["2026-05-15", 100000],
        ["2026-06-15", 100000], ["2026-07-15", 100000],
      ]),
      month: "2026-07",
      throughDay: 27,
      monthClosed: false,
    })
    expect(out.filter((d) => d.category === COMMISSION_LABEL)).toHaveLength(1)
    expect(out.filter((d) => d.category.startsWith("HR / payroll"))).toHaveLength(0)
  })
})

/**
 * กับดักวันที่ 31 — เจอตอนตรวจหน้าเว็บจริงหลัง deploy 27/7/2569
 *
 * เงินเดือนจ่ายวันสุดท้ายของเดือน ซึ่งเป็นวันที่ 31 ใน มี.ค. และ พ.ค. แต่เป็นวันที่ 30 ใน เม.ย. และ มิ.ย.
 * ถ้าดูเดือน มิ.ย. แล้วส่ง throughDay = 30 (จำนวนวันของ มิ.ย.) ค่านั้นจะถูกเอาไปตัดเดือนฐานด้วย
 * เงินเดือนของ มี.ค. กับ พ.ค. จึงหายไป เหลือประวัติเดือนเดียว แล้วระบบบอกว่า "ตัดสินไม่ได้"
 * ทั้งที่ความจริงคือเงินเดือนโต 32.8% ซึ่งเป็นเรื่องสำคัญที่สุดที่หน้านี้ควรบอก
 *
 * เดือนที่ปิดแล้วต้องส่ง 31 เสมอ = ไม่ตัดวันเลย · ตัดวันมีความหมายเฉพาะเดือนที่ยังไม่จบ
 */
describe("detectAnomalies — เดือนที่ปิดแล้วต้องไม่ตัดวันสุดท้ายของเดือนฐานทิ้ง", () => {
  // วันที่จ่ายจริงจากฐานข้อมูล — มี.ค./พ.ค. จ่ายวันที่ 31 · เม.ย./มิ.ย. จ่ายวันที่ 30
  const payroll = [
    row("2026-03-31", "เงินเดือนพนักงานประจำ", "เงินเดือน reception", 38250),
    row("2026-04-30", "เงินเดือนพนักงานประจำ", "เงินเดือน reception", 39500),
    row("2026-05-31", "เงินเดือนพนักงานประจำ", "เงินเดือน reception", 41650),
    row("2026-06-30", "เงินเดือนพนักงานประจำ", "เงินเดือน reception", 52450),
  ]
  const args = {
    rows: payroll,
    revenueByDate: new Map<string, number>(),
    commissionByDate: new Map<string, number>(),
    month: "2026-06",
    monthClosed: true,
  }

  it("ส่ง 31 แล้วต้องเห็นครบทุกเดือนและเตือนได้", () => {
    const d = detectAnomalies({ ...args, throughDay: 31 }).find((x) =>
      x.category.startsWith("เงินเดือน")
    )!
    expect(d.baseline).toBe(39500)
    expect(d.current).toBe(52450)
    expect(d.level).toBe("alert")
  })

  it("ส่ง 30 จะตัดวันที่ 31 ของเดือนฐานทิ้ง — จึงห้ามใช้กับเดือนที่ปิดแล้ว", () => {
    const d = detectAnomalies({ ...args, throughDay: 30 }).find((x) =>
      x.category.startsWith("เงินเดือน")
    )!
    // เทสนี้บันทึกพฤติกรรมที่ถูกต้องของ lib ไว้ ไม่ใช่บั๊ก — บั๊กคือหน้าเว็บเคยส่ง 30 มาให้
    expect(d.level).toBe("unknown")
  })
})

/**
 * ข้อมูลจริงจากฐานข้อมูลร้าน มี.ค.–มิ.ย. 2569 (ซักรีด + วัสดุสิ้นเปลือง)
 *
 * เทสอื่นทุกตัวใช้ "เดือนละแถวเดียวต่อหมวด" และเป็นจำนวนเต็มล้วน ซึ่งไม่เหมือนของจริงเลย —
 * ของจริงเดือนหนึ่งมี 4-5 แถว และมีทศนิยม (1,376.80 · 5,596.10 · 13,390.50)
 * เทสชุดนี้จึงคุมเส้นทางที่ของจริงเดินแต่เทสสมมติไม่เคยเดิน
 *
 * ค่าที่คาดหวังคำนวณจาก SQL บนฐานข้อมูลจริง แล้วตรวจซ้ำด้วยมืออีกรอบ — ตรงกันทั้งสองทาง
 */
describe("detectAnomalies — ข้อมูลจริงหลายแถวต่อเดือน มี.ค.–มิ.ย. 2569", () => {
  const LAUNDRY = "ซักรีด"
  const SUPPLY = "วัสดุ-สิ้นเปลือง (น้ำมัน บาล์ม ฯลฯ)"

  // [วันที่, L=ซักรีด/S=วัสดุ, จำนวนเงิน] — คัดลอกจากตาราง expenses ตรงๆ
  const raw: [string, "L" | "S", number][] = [
    ["2026-03-09", "L", 1303], ["2026-03-10", "L", 453], ["2026-03-11", "L", 370],
    ["2026-03-12", "L", 300], ["2026-03-13", "L", 660], ["2026-03-14", "S", 577],
    ["2026-03-14", "L", 440], ["2026-03-15", "L", 520], ["2026-03-16", "L", 1130],
    ["2026-03-16", "S", 830], ["2026-03-19", "L", 420], ["2026-03-20", "S", 600],
    ["2026-03-20", "S", 178], ["2026-03-23", "S", 390], ["2026-03-25", "S", 2117],
    ["2026-03-27", "L", 2000], ["2026-03-28", "S", 1324], ["2026-03-29", "S", 1028],
    ["2026-03-30", "S", 1463],
    ["2026-04-03", "S", 1435], ["2026-04-04", "S", 1499], ["2026-04-05", "L", 2000],
    ["2026-04-06", "S", 867], ["2026-04-07", "S", 178], ["2026-04-10", "S", 2000],
    ["2026-04-11", "L", 2000], ["2026-04-13", "S", 1430], ["2026-04-14", "S", 1177],
    ["2026-04-16", "L", 4000], ["2026-04-23", "L", 4000], ["2026-04-25", "S", 614],
    ["2026-04-28", "S", 215], ["2026-04-28", "S", 328], ["2026-04-28", "S", 2000],
    ["2026-04-29", "S", 834], ["2026-04-29", "S", 541],
    ["2026-05-01", "S", 1055], ["2026-05-04", "L", 4000], ["2026-05-04", "S", 1975],
    ["2026-05-11", "S", 2135], ["2026-05-11", "S", 1333], ["2026-05-11", "L", 4000],
    ["2026-05-12", "S", 1376.8], ["2026-05-15", "S", 700], ["2026-05-20", "L", 4000],
    ["2026-05-26", "S", 1341.5], ["2026-05-27", "S", 178], ["2026-05-28", "S", 5596.1],
    ["2026-05-30", "L", 400], ["2026-05-30", "S", 1174],
    ["2026-06-01", "L", 2400], ["2026-06-03", "S", 1810.65], ["2026-06-11", "L", 2500],
    ["2026-06-12", "S", 474], ["2026-06-14", "S", 13390.5], ["2026-06-19", "S", 684],
    ["2026-06-22", "L", 2500], ["2026-06-29", "L", 2500],
  ]

  const rows: ExpenseRow[] = raw.map(([date, kind, amount]) =>
    row(date, kind === "L" ? LAUNDRY : SUPPLY, "รายการจริง", amount)
  )

  // รายได้สุทธิรายเดือนจริง — เดือนที่ปิดแล้วดูทั้งเดือน วางไว้วันเดียวได้ ผลรวมเท่ากัน
  const revenue = new Map([
    ["2026-03-15", 174842], ["2026-04-15", 316123],
    ["2026-05-15", 286158], ["2026-06-15", 347018],
  ])

  const out = detectAnomalies({
    rows,
    revenueByDate: revenue,
    commissionByDate: new Map(),
    month: "2026-06",
    throughDay: 30,
    monthClosed: true,
  })

  it("ซักรีดคุมได้ดีขึ้นจริง — 2.85% ของยอดขาย เทียบค่าปกติ 4.33%", () => {
    const d = out.find((x) => x.category === LAUNDRY)!
    expect(Math.round(d.current * 100) / 100).toBe(2.85)
    expect(Math.round(d.baseline * 100) / 100).toBe(4.33)
    expect(Math.round(d.deltaPct * 100) / 100).toBe(-34.16)
    expect(Math.round(d.impactBaht)).toBe(-5137)
    expect(d.level).toBe("better")
  })

  it("วัสดุสิ้นเปลืองแกว่งแต่ยังปกติ — ต้องไม่เตือนทั้งที่ มิ.ย. มีของก้อน 13,390", () => {
    const d = out.find((x) => x.category === SUPPLY)!
    expect(Math.round(d.current * 100) / 100).toBe(4.71)
    expect(Math.round(d.baseline * 100) / 100).toBe(4.87)
    // เกินเกณฑ์เงิน 2,000 ไม่ได้ และ % ก็ไม่ถึง — ต้องเงียบทั้งสองทาง
    expect(Math.abs(d.deltaPct)).toBeLessThan(WARN_PCT)
    expect(d.level).toBe("ok")
  })

  it("รวมหลายแถวในเดือนเดียวกันได้ถูก รวมทั้งแถวที่มีทศนิยม", () => {
    // มิ.ย. วัสดุ = 1810.65 + 474 + 13390.5 + 684 = 16359.15 → 4.7143% ของ 347018
    const d = out.find((x) => x.category === SUPPLY)!
    expect(Math.round(((d.current / 100) * 347018) * 100) / 100).toBe(16359.15)
  })

  it("แถววันที่ 29 ต้องถูกนับเมื่อดูทั้งเดือน แต่ต้องหลุดเมื่อตัดที่วันที่ 27", () => {
    const cut = detectAnomalies({
      rows,
      revenueByDate: revenue,
      commissionByDate: new Map(),
      month: "2026-06",
      throughDay: 27,
      monthClosed: true,
    })
    const full = out.find((x) => x.category === LAUNDRY)!
    const partial = cut.find((x) => x.category === LAUNDRY)!
    // ซักรีด 2,500 บาทของวันที่ 29 หายไปจากช่วง 1-27
    expect(Math.round((full.current / 100) * 347018)).toBe(9900)
    expect(Math.round((partial.current / 100) * 347018)).toBe(7400)
  })
})

describe("monthlySeries — บล็อก 3 และ 4", () => {
  const salary = (month: string, amount: number) =>
    row(`${month}-30`, "เงินเดือนพนักงานประจำ", "เงินเดือน", amount)
  const rows = [
    salary("2026-03", 38250), salary("2026-04", 39500),
    salary("2026-05", 41650), salary("2026-06", 52450),
    salary("2026-07", 5000), // เดือนปัจจุบันยังไม่จบ ยอดยังไม่ครบ
  ]
  const revenueByMonth = new Map([
    ["2026-03", 174842], ["2026-04", 316123],
    ["2026-05", 286158], ["2026-06", 347018], ["2026-07", 322242],
  ])

  const result = monthlySeries({ rows, revenueByMonth, currentMonth: "2026-07" })

  it("เรียงเดือนจากเก่าไปใหม่", () => {
    expect(result.months).toEqual(["2026-03", "2026-04", "2026-05", "2026-06", "2026-07"])
  })

  it("ลูกศรแนวโน้มไม่นับเดือนปัจจุบัน ไม่งั้นทุกหมวดจะชี้ลงเสมอ", () => {
    const salaryRow = result.byCategory.find((c) => c.category.startsWith("เงินเดือน"))!
    expect(salaryRow.trend).toBe("up")
  })

  it("ค่ากลางคิดจากเดือนที่ปิดแล้ว 3 เดือนล่าสุด", () => {
    const salaryRow = result.byCategory.find((c) => c.category.startsWith("เงินเดือน"))!
    expect(salaryRow.median3).toBe(41650)
  })

  it("ต้นทุนต่อรายได้ 100 บาท", () => {
    const jun = result.costPer100Revenue[3]
    expect(Math.round(jun * 10) / 10).toBe(15.1)
  })

  it("เดือนที่ปิดแล้วไม่ถึง 3 เดือน ไม่แสดงลูกศรและไม่มีค่ากลาง", () => {
    const short = monthlySeries({
      rows: [salary("2026-05", 41650), salary("2026-06", 52450)],
      revenueByMonth,
      currentMonth: "2026-06",
    })
    const r = short.byCategory[0]
    expect(r.trend).toBeNull()
    expect(r.median3).toBeNull()
  })
})

describe("projectMonthEnd — ประมาณการสิ้นเดือน", () => {
  it("เติมเฉพาะหมวดประจำที่ยังบันทึกไม่ถึงค่าปกติ ส่วนหมวดตั้งใจจ่ายเองนับตามจริง", () => {
    const rows = [
      // ค่าเช่า: ปกติ 36,000 แต่เดือนนี้บันทึกแค่ 2,500 → ต้องเติมให้ถึง 36,000
      row("2026-04-05", "ค่าเช่าสถานที่", "ค่าเช่า", 36000),
      row("2026-05-05", "ค่าเช่าสถานที่", "ค่าเช่า", 36000),
      row("2026-06-05", "ค่าเช่าสถานที่", "ค่าเช่า", 36000),
      row("2026-07-05", "ค่าเช่าสถานที่", "มัดจำ", 2500),
      // อื่นๆ เป็นหมวดตั้งใจจ่ายเอง → นับเฉพาะที่บันทึกแล้ว ไม่เดาต่อ
      row("2026-04-20", "อื่นๆ", "ค่าป้ายร้าน", 104500),
      row("2026-05-20", "อื่นๆ", "เครื่องซักผ้า", 22290),
      row("2026-06-20", "อื่นๆ", "ค่าช่าง", 23000),
      row("2026-07-20", "อื่นๆ", "โอนให้คุณบอส", 2990),
    ]
    const result = projectMonthEnd({ rows, month: "2026-07", throughDay: 27 })
    expect(result.total).toBe(38990)
    expect(result.assumedCategories).toEqual(["ค่าเช่าสถานที่"])
  })

  it("บันทึกเกินค่าปกติแล้วไม่ต้องเติม", () => {
    const rows = [
      row("2026-04-05", "ค่าเช่าสถานที่", "ค่าเช่า", 10000),
      row("2026-05-05", "ค่าเช่าสถานที่", "ค่าเช่า", 10000),
      row("2026-06-05", "ค่าเช่าสถานที่", "ค่าเช่า", 10000),
      row("2026-07-05", "ค่าเช่าสถานที่", "ค่าเช่า", 15000),
    ]
    const result = projectMonthEnd({ rows, month: "2026-07", throughDay: 27 })
    expect(result.total).toBe(15000)
    expect(result.assumedCategories).toEqual([])
  })
})
