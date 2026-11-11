import { describe, expect, it } from "vitest"

import {
  addDaysIso,
  creditExpiryContactSuppressed,
  daysLeft,
  dueThresholds,
  expiryUrgency,
  groupExpiringByCustomer,
  msgCreditExpiryStaff,
} from "./credit-expiry"

describe("daysLeft / addDaysIso", () => {
  it("นับวันตรงไปตรงมา: วันนี้ = 0 · พรุ่งนี้ = 1 · เมื่อวาน = -1", () => {
    expect(daysLeft("2026-11-11", "2026-11-11")).toBe(0)
    expect(daysLeft("2026-11-12", "2026-11-11")).toBe(1)
    expect(daysLeft("2026-11-10", "2026-11-11")).toBe(-1)
  })

  it("ข้ามเดือน/ปีได้ถูก", () => {
    expect(daysLeft("2026-12-01", "2026-11-11")).toBe(20)
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDaysIso("2026-11-11", -30)).toBe("2026-10-12")
  })
})

describe("groupExpiringByCustomer", () => {
  const today = "2026-11-11"

  it("คนเดียวหลายใบ = แถวเดียว ยอดรวม + วันหมดที่ใกล้สุด", () => {
    const rows = groupExpiringByCustomer(
      [
        { topupId: "t1", customerId: "a", expiryDate: "2026-11-25", remaining: 1000 },
        { topupId: "t2", customerId: "a", expiryDate: "2026-11-15", remaining: 500 },
      ],
      today
    )
    expect(rows).toEqual([
      {
        customerId: "a",
        total: 1500,
        nearestExpiry: "2026-11-15",
        daysLeft: 4,
        bucketCount: 2,
      },
    ])
  })

  it("ใบหมดไปแล้ว / เกิน 30 วัน / ยอดศูนย์ ไม่เข้าลิสต์ · เรียงด่วนก่อนแล้วยอดมากก่อน", () => {
    const rows = groupExpiringByCustomer(
      [
        { topupId: "t1", customerId: "a", expiryDate: "2026-11-10", remaining: 900 }, // หมดแล้ว
        { topupId: "t2", customerId: "b", expiryDate: "2026-12-30", remaining: 900 }, // ไกลเกิน
        { topupId: "t3", customerId: "c", expiryDate: "2026-11-20", remaining: 0 }, // ยอดศูนย์
        { topupId: "t4", customerId: "d", expiryDate: "2026-11-20", remaining: 300 },
        { topupId: "t5", customerId: "e", expiryDate: "2026-11-20", remaining: 800 },
        { topupId: "t6", customerId: "f", expiryDate: "2026-11-12", remaining: 100 },
      ],
      today
    )
    expect(rows.map((r) => r.customerId)).toEqual(["f", "e", "d"])
  })

  it("หมดอายุวันนี้พอดียังเข้าลิสต์ (ยังใช้ได้ทั้งวัน — โทรเช้ายังทัน)", () => {
    const rows = groupExpiringByCustomer(
      [{ topupId: "t", customerId: "a", expiryDate: today, remaining: 50 }],
      today
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].daysLeft).toBe(0)
  })
})

describe("creditExpiryContactSuppressed — กติกาโผล่กลับมาตอนเข้าโซนแดง", () => {
  it("นอกโซนแดง: ติดต่อใน 30 วันล่าสุด = ซ่อน", () => {
    expect(
      creditExpiryContactSuppressed({
        nearestExpiry: "2026-12-05", // เหลือ 24 วัน
        today: "2026-11-11",
        contactDates: ["2026-11-01"],
      })
    ).toBe(true)
    expect(
      creditExpiryContactSuppressed({
        nearestExpiry: "2026-12-05",
        today: "2026-11-11",
        contactDates: ["2026-10-01"], // เกิน 30 วันแล้ว
      })
    ).toBe(false)
  })

  it("เข้าโซนแดง: การติดต่อ 'ก่อน' เข้าโซนไม่กดแถว — โผล่กลับมาให้ชวนรอบสุดท้าย", () => {
    // หมด 17 พ.ย. → โซนแดงเริ่ม 10 พ.ย. · โทรไปแล้ว 5 พ.ย. (ตอน D-12)
    expect(
      creditExpiryContactSuppressed({
        nearestExpiry: "2026-11-17",
        today: "2026-11-11",
        contactDates: ["2026-11-05"],
      })
    ).toBe(false)
    // โทรซ้ำ 10 พ.ย. (ในโซนแดงแล้ว) = ซ่อนจนหมดอายุ
    expect(
      creditExpiryContactSuppressed({
        nearestExpiry: "2026-11-17",
        today: "2026-11-11",
        contactDates: ["2026-11-05", "2026-11-10"],
      })
    ).toBe(true)
  })

  it("ไม่เคยติดต่อเลย = โชว์เสมอ", () => {
    expect(
      creditExpiryContactSuppressed({
        nearestExpiry: "2026-11-13",
        today: "2026-11-11",
        contactDates: [],
      })
    ).toBe(false)
  })
})

describe("dueThresholds — หลักไมล์ D-30/14/7/3 เตือนครั้งเดียวต่อหลัก", () => {
  it("เพิ่งเข้ากรอบ 30 วัน → เตือนหลัก 30 หลักเดียว", () => {
    expect(dueThresholds(25, new Set())).toEqual([30])
  })

  it("cron หยุดไปหลายวันแล้วกลับมา — เก็บหลักที่ค้างทั้งหมดในรอบเดียว", () => {
    expect(dueThresholds(6, new Set())).toEqual([30, 14, 7])
    expect(dueThresholds(6, new Set([30, 14]))).toEqual([7])
  })

  it("เตือนครบแล้วไม่เตือนซ้ำ · ใบหมดอายุไปแล้วไม่เตือน (สายเกิน)", () => {
    expect(dueThresholds(2, new Set([30, 14, 7, 3]))).toEqual([])
    expect(dueThresholds(-1, new Set())).toEqual([])
  })

  it("หมดอายุวันนี้ (0 วัน) ยังเตือนได้ — เช้านี้คือโอกาสสุดท้าย", () => {
    expect(dueThresholds(0, new Set([30, 14, 7]))).toEqual([3])
  })
})

describe("expiryUrgency / msgCreditExpiryStaff", () => {
  it("โซนสีถูกขอบ: 7=แดง 8=ส้ม 14=ส้ม 15=เหลือง", () => {
    expect(expiryUrgency(7).icon).toBe("🔴")
    expect(expiryUrgency(8).icon).toBe("🟠")
    expect(expiryUrgency(14).icon).toBe("🟠")
    expect(expiryUrgency(15).icon).toBe("🟡")
    expect(expiryUrgency(0).label).toBe("หมดอายุวันนี้!")
  })

  it("ข้อความกลุ่มทีม: ชื่อ ยอด วันเหลือ ครบ จบด้วยลิงก์ CRM", () => {
    const msg = msgCreditExpiryStaff([
      { name: "แพรว", total: 2960, daysLeft: 6, expiryThai: "17 พ.ย." },
      { name: "ฝน", total: 1500, daysLeft: 0, expiryThai: "11 พ.ย." },
    ])
    expect(msg).toContain("2 คน")
    expect(msg).toContain("คุณแพรว ฿2,960 เหลือ 6 วัน (17 พ.ย.)")
    expect(msg).toContain("คุณฝน ฿1,500 หมดอายุวันนี้!")
    expect(msg).toContain("https://sookkaya-pos.vercel.app/crm")
  })
})
