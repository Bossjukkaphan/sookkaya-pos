import { describe, expect, it } from "vitest"
import {
  birthdayWithinDays,
  crmMessage,
  daysUntilBirthday,
  LINE_MESSAGE_MAX,
  msgBirthday,
  msgWinback,
  msgNewFollow,
  validateCrmLineText,
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

describe("crmMessage", () => {
  it("เลือกเทมเพลตตามประเภทลิสต์", () => {
    expect(crmMessage("birthday", "ส้ม")).toBe(msgBirthday("ส้ม"))
    expect(crmMessage("winback", "ส้ม")).toBe(msgWinback("ส้ม"))
    expect(crmMessage("new_follow", "ส้ม")).toBe(msgNewFollow("ส้ม"))
  })
})

describe("validateCrmLineText", () => {
  it("ข้อความปกติ → ok พร้อม trim", () => {
    expect(validateCrmLineText("  สวัสดีค่ะ  ")).toEqual({ ok: true, text: "สวัสดีค่ะ" })
  })
  it("ว่าง/ช่องว่างล้วน → error", () => {
    expect(validateCrmLineText("   ").ok).toBe(false)
    expect(validateCrmLineText("").ok).toBe(false)
  })
  it("ยาวเกิน 500 → error, พอดี 500 → ok", () => {
    expect(validateCrmLineText("ก".repeat(LINE_MESSAGE_MAX + 1)).ok).toBe(false)
    expect(validateCrmLineText("ก".repeat(LINE_MESSAGE_MAX)).ok).toBe(true)
  })
})
