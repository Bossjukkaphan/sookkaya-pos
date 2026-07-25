import { describe, expect, it } from "vitest"
import {
  birthdayWithinDays,
  daysUntilBirthday,
  msgBirthday,
  msgWinback,
  msgNewFollow,
} from "./crm"

describe("daysUntilBirthday / birthdayWithinDays", () => {
  it("วันเกิดวันนี้ = 0 วัน", () => {
    expect(daysUntilBirthday("1990-07-26", "2026-07-26")).toBe(0)
    expect(birthdayWithinDays("1990-07-26", "2026-07-26", 7)).toBe(true)
  })
  it("วันเกิดใน 7 วันข้างหน้า", () => {
    expect(daysUntilBirthday("1985-08-01", "2026-07-26")).toBe(6)
    expect(birthdayWithinDays("1985-08-01", "2026-07-26", 7)).toBe(true)
    expect(birthdayWithinDays("1985-08-03", "2026-07-26", 7)).toBe(false)
  })
  it("ข้ามปี: ปลายธันวา → ต้นมกรา", () => {
    expect(daysUntilBirthday("1990-01-02", "2026-12-30")).toBe(3)
    expect(birthdayWithinDays("1990-01-02", "2026-12-30", 7)).toBe(true)
  })
  it("วันเกิดเพิ่งผ่านไป = รอปีหน้า ไม่เข้าลิสต์", () => {
    expect(birthdayWithinDays("1990-07-20", "2026-07-26", 7)).toBe(false)
  })
})

describe("เทมเพลตข้อความ", () => {
  it("ใส่ชื่อลูกค้า และมีลิงก์จองคิว", () => {
    expect(msgBirthday("ตั้ม")).toContain("ตั้ม")
    expect(msgWinback("ดาว")).toContain("ดาว")
    expect(msgNewFollow("แนน")).toContain("แนน")
    expect(msgWinback("ดาว")).toContain("liff.line.me")
  })
  it("ไม่มีชื่อ → คุณลูกค้า", () => {
    expect(msgBirthday("")).toContain("คุณลูกค้า")
    expect(msgWinback(null)).toContain("คุณลูกค้า")
  })
})
