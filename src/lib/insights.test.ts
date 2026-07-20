import { describe, expect, it } from "vitest"
import { daysSince, dormantCutoff, heatIntensity, isDormant } from "./insights"

describe("heatIntensity", () => {
  it("ไล่ระดับ 0-4 ตามสัดส่วนของช่องที่แน่นที่สุด", () => {
    expect(heatIntensity(0, 20)).toBe(0)
    expect(heatIntensity(1, 20)).toBe(1)
    expect(heatIntensity(10, 20)).toBe(3)
    expect(heatIntensity(20, 20)).toBe(4)
  })

  it("ไม่หารด้วยศูนย์เมื่อยังไม่มีข้อมูลเลย", () => {
    expect(heatIntensity(0, 0)).toBe(0)
    expect(heatIntensity(5, 0)).toBe(0)
  })
})

describe("daysSince", () => {
  it("นับจำนวนวันเต็มระหว่างสองวัน", () => {
    expect(daysSince("2026-07-01", "2026-07-20")).toBe(19)
    expect(daysSince("2026-07-20", "2026-07-20")).toBe(0)
  })

  it("ข้ามเดือนและข้ามปีได้ถูกต้อง", () => {
    expect(daysSince("2026-06-28", "2026-07-01")).toBe(3)
    expect(daysSince("2025-12-31", "2026-01-01")).toBe(1)
  })
})

describe("isDormant", () => {
  it("นับเฉพาะลูกค้าที่เคยมาอย่างน้อย 2 ครั้ง — มาครั้งเดียวยังไม่ใช่ลูกค้าประจำที่หายไป", () => {
    expect(isDormant({ visits: 1, lastVisit: "2026-01-01" }, "2026-07-20", 60)).toBe(false)
    expect(isDormant({ visits: 2, lastVisit: "2026-01-01" }, "2026-07-20", 60)).toBe(true)
  })

  it("ใช้เกณฑ์ 'เกิน N วัน' ไม่ใช่ 'ครบ N วัน'", () => {
    expect(isDormant({ visits: 3, lastVisit: "2026-05-21" }, "2026-07-20", 60)).toBe(false)
    expect(isDormant({ visits: 3, lastVisit: "2026-05-20" }, "2026-07-20", 60)).toBe(true)
  })
})

describe("dormantCutoff", () => {
  it("คืนวันที่ที่ใช้กรองใน SQL ได้ตรงกับที่ isDormant ตัดสิน", () => {
    expect(dormantCutoff("2026-07-20", 60)).toBe("2026-05-21")
    expect(dormantCutoff("2026-07-20", 30)).toBe("2026-06-20")
  })

  it("ข้ามเดือนและข้ามปีได้ถูกต้อง", () => {
    expect(dormantCutoff("2026-01-01", 30)).toBe("2025-12-02")
  })
})
