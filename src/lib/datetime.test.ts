import { describe, expect, it } from "vitest"
import { shopDateOf, thaiMonthAbbr } from "./datetime"

describe("thaiMonthAbbr", () => {
  it("คืนชื่อเดือนไทยย่อจากวันที่", () => {
    expect(thaiMonthAbbr("2026-06-15")).toBe("มิ.ย.")
    expect(thaiMonthAbbr("2026-01-01")).toBe("ม.ค.")
    expect(thaiMonthAbbr("2026-12-31")).toBe("ธ.ค.")
  })
})

describe("shopDateOf", () => {
  // ข้อมูลจริงจากโปรดักชัน — เที่ยงคืนไทยคือ 17:00 UTC (ไทย = UTC+7)
  it("ข้ามเที่ยงคืนไทยที่ 17:00 UTC พอดี", () => {
    expect(shopDateOf(new Date("2026-08-04T17:05:26Z"))).toBe("2026-08-05")
    expect(shopDateOf(new Date("2026-08-04T16:59:59Z"))).toBe("2026-08-04")
  })
})
