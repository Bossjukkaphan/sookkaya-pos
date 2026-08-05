import { describe, expect, it } from "vitest"
import { thaiMonthAbbr } from "./datetime"

describe("thaiMonthAbbr", () => {
  it("คืนชื่อเดือนไทยย่อจากวันที่", () => {
    expect(thaiMonthAbbr("2026-06-15")).toBe("มิ.ย.")
    expect(thaiMonthAbbr("2026-01-01")).toBe("ม.ค.")
    expect(thaiMonthAbbr("2026-12-31")).toBe("ธ.ค.")
  })
})
