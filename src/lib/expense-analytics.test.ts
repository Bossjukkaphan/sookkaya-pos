import { describe, expect, it } from "vitest"
import { median, rulerOf } from "./expense-analytics"

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
