import { describe, expect, it } from "vitest"
import { parseExcelTime } from "./excel-time"

describe("parseExcelTime", () => {
  it("แปลงรูปแบบ ชั่วโมง.นาที โดยเติมศูนย์ขวา", () => {
    expect(parseExcelTime(10.05)).toBe("10:05")
    expect(parseExcelTime(10.3)).toBe("10:30")
    expect(parseExcelTime(10.1)).toBe("10:10")
    expect(parseExcelTime(11.46)).toBe("11:46")
    expect(parseExcelTime(21.09)).toBe("21:09")
  })

  it("แปลงเลข 4 หลักแบบ HHMM", () => {
    expect(parseExcelTime(1515)).toBe("15:15")
  })

  it("แปลงข้อความที่มี am/pm", () => {
    expect(parseExcelTime("4.20pm")).toBe("16:20")
    expect(parseExcelTime("6.00pm")).toBe("18:00")
    expect(parseExcelTime("12.30pm")).toBe("12:30")
    expect(parseExcelTime("12.15am")).toBe("00:15")
    expect(parseExcelTime("10.05am")).toBe("10:05")
  })

  it("แปลงค่าเศษส่วนของ Excel", () => {
    expect(parseExcelTime(0.5)).toBe("12:00")
    expect(parseExcelTime(0.458333333333333)).toBe("11:00")
  })

  it("คืน null เมื่อตีความไม่ได้ ไม่เดา", () => {
    expect(parseExcelTime(10.7)).toBeNull()   // .70 ไม่ใช่นาทีที่ถูกต้อง
    expect(parseExcelTime(null)).toBeNull()
    expect(parseExcelTime("")).toBeNull()
    expect(parseExcelTime("เช้า")).toBeNull()
    expect(parseExcelTime(99)).toBeNull()
    expect(parseExcelTime(-3)).toBeNull()
  })

  it("ไม่ยอมรับเวลาที่เกินขอบเขต", () => {
    expect(parseExcelTime(25.3)).toBeNull()
    expect(parseExcelTime(2599)).toBeNull()
  })
})
