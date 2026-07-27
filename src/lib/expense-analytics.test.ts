import { describe, expect, it } from "vitest"
import { compareRange, median, rulerOf, type ExpenseRow } from "./expense-analytics"

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
