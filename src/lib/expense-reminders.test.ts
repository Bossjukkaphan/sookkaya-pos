import { describe, expect, it } from "vitest"

import {
  lastTherapistDue,
  lastSalaryDue,
  lastUtilityDue,
  lastInternetDue,
  expenseReminderLabel,
} from "./expense-reminders"

describe("lastTherapistDue — รอบ 10/20/สิ้นเดือน ล่าสุดที่ผ่านมาแล้ว (ก่อนวันนี้)", () => {
  it("ต้นเดือน → รอบสิ้นเดือนก่อนหน้า", () => {
    expect(lastTherapistDue("2026-08-01")).toBe("2026-07-31")
    expect(lastTherapistDue("2026-08-02")).toBe("2026-07-31")
  })
  it("วันที่ 11-20 → รอบวันที่ 10", () => {
    expect(lastTherapistDue("2026-08-11")).toBe("2026-08-10")
    expect(lastTherapistDue("2026-08-20")).toBe("2026-08-10")
  })
  it("วันที่ 21-สิ้นเดือน → รอบวันที่ 20", () => {
    expect(lastTherapistDue("2026-08-21")).toBe("2026-08-20")
    expect(lastTherapistDue("2026-08-31")).toBe("2026-08-20")
  })
  it("วันครบกำหนดพอดียังไม่เตือน (เตือนวันถัดไป)", () => {
    expect(lastTherapistDue("2026-08-10")).toBe("2026-07-31")
    expect(lastTherapistDue("2026-08-20")).toBe("2026-08-10")
  })
  it("เดือนสั้น: ต้นมี.ค. → สิ้นเดือน ก.พ. (รวมปีอธิกสุรทิน)", () => {
    expect(lastTherapistDue("2026-03-01")).toBe("2026-02-28")
    expect(lastTherapistDue("2024-03-01")).toBe("2024-02-29")
  })
  it("ข้ามปี: 1 ม.ค. → 31 ธ.ค. ปีก่อน", () => {
    expect(lastTherapistDue("2026-01-01")).toBe("2025-12-31")
  })
})

describe("lastSalaryDue — สิ้นเดือนล่าสุดที่ผ่านมาแล้ว", () => {
  it("ระหว่างเดือน → สิ้นเดือนก่อนหน้า", () => {
    expect(lastSalaryDue("2026-08-02")).toBe("2026-07-31")
    expect(lastSalaryDue("2026-08-31")).toBe("2026-07-31")
  })
  it("วันที่ 1 → สิ้นเดือนเมื่อวาน · ข้ามปีถูก", () => {
    expect(lastSalaryDue("2026-08-01")).toBe("2026-07-31")
    expect(lastSalaryDue("2026-01-01")).toBe("2025-12-31")
  })
})

describe("lastUtilityDue — ค่าน้ำ/ค่าไฟครบกำหนดสิ้นเดือนล่าสุดที่ผ่านมา", () => {
  it("ระหว่างเดือน → สิ้นเดือนก่อนหน้า (เหมือนเงินเดือน)", () => {
    expect(lastUtilityDue("2026-08-23")).toBe("2026-07-31")
    expect(lastUtilityDue("2026-03-01")).toBe("2026-02-28")
  })
})

describe("lastInternetDue — บิลเน็ตครบกำหนดวันที่ 12 ล่าสุดที่ผ่านมา", () => {
  it("หลังวันที่ 12 → วันที่ 12 เดือนนี้", () => {
    expect(lastInternetDue("2026-08-13")).toBe("2026-08-12")
    expect(lastInternetDue("2026-08-31")).toBe("2026-08-12")
  })
  it("วันที่ 1-12 → วันที่ 12 เดือนก่อน (วันครบกำหนดพอดียังไม่เตือน)", () => {
    expect(lastInternetDue("2026-08-01")).toBe("2026-07-12")
    expect(lastInternetDue("2026-08-12")).toBe("2026-07-12")
  })
  it("ข้ามปี: ต้น ม.ค. → 12 ธ.ค. ปีก่อน", () => {
    expect(lastInternetDue("2026-01-05")).toBe("2025-12-12")
  })
})

describe("expenseReminderLabel", () => {
  it("ค่ามือหมอ รอบวันที่ 10/20 บอกวันที่", () => {
    expect(expenseReminderLabel("therapist_fee", "2026-08-10")).toBe(
      "💰 อย่าลืมบันทึกค่ามือหมอ รอบวันที่ 10 ส.ค."
    )
    expect(expenseReminderLabel("therapist_fee", "2026-08-20")).toBe(
      "💰 อย่าลืมบันทึกค่ามือหมอ รอบวันที่ 20 ส.ค."
    )
  })
  it("ค่ามือหมอ รอบสิ้นเดือน", () => {
    expect(expenseReminderLabel("therapist_fee", "2026-07-31")).toBe(
      "💰 อย่าลืมบันทึกค่ามือหมอ รอบสิ้นเดือน ก.ค."
    )
  })
  it("เงินเดือน บอกชื่อเดือน", () => {
    expect(expenseReminderLabel("salary", "2026-07-31")).toBe(
      "💼 อย่าลืมบันทึกเงินเดือนพนักงาน เดือน ก.ค."
    )
  })
  it("บิลประจำหมวดค่าน้ำ/ค่าไฟ/เน็ต บอกเดือนของรอบ", () => {
    expect(expenseReminderLabel("electricity", "2026-07-31")).toBe(
      "💡 อย่าลืมบันทึกค่าไฟ เดือน ก.ค."
    )
    expect(expenseReminderLabel("water", "2026-07-31")).toBe(
      "🚰 อย่าลืมบันทึกค่าน้ำ เดือน ก.ค."
    )
    expect(expenseReminderLabel("internet", "2026-08-12")).toBe(
      "🌐 อย่าลืมบันทึกค่าเน็ต/โทรศัพท์ร้าน รอบต้นเดือน ส.ค."
    )
  })
})
