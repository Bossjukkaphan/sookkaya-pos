import { describe, expect, it } from "vitest"

import {
  criterionStatus,
  dayClass,
  hireVerdict,
  recommendedTherapists,
  thaiMonthLabel,
  type StaffingDayRow,
} from "./staffing"

describe("thaiMonthLabel — ป้ายเดือนไทยแบบเต็ม + พ.ศ.", () => {
  it("แปลง YYYY-MM เป็นชื่อเดือนเต็มภาษาไทย + ปี พ.ศ.", () => {
    expect(thaiMonthLabel("2026-08")).toBe("สิงหาคม 2569")
  })
  it("เดือนมกราคมและธันวาคม (ขอบสองด้านของตาราง)", () => {
    expect(thaiMonthLabel("2026-01")).toBe("มกราคม 2569")
    expect(thaiMonthLabel("2026-12")).toBe("ธันวาคม 2569")
  })
})

describe("dayClass — จำแนกประเภทวันจากวันที่", () => {
  it("จันทร์ถึงพฤหัสเป็น mon_thu", () => {
    expect(dayClass("2026-08-17")).toBe("mon_thu") // จันทร์
    expect(dayClass("2026-08-20")).toBe("mon_thu") // พฤหัส
  })
  it("ศุกร์แยกเป็นประเภทของตัวเอง — พฤติกรรมยอดใกล้เสาร์อาทิตย์กว่าวันธรรมดา", () => {
    expect(dayClass("2026-08-21")).toBe("fri")
  })
  it("เสาร์และอาทิตย์เป็น weekend", () => {
    expect(dayClass("2026-08-22")).toBe("weekend")
    expect(dayClass("2026-08-23")).toBe("weekend")
  })
})

// แถวตัวอย่าง: หมอ n คน ยอด revenue peak เท่าไร — ค่าอื่นตามค่าตั้งต้น
const day = (n: number, revenue: number, peak: number, over: Partial<StaffingDayRow> = {}):
  StaffingDayRow => ({
  day_class: "weekend", therapists_checked_in: n, revenue,
  peak_concurrent_therapists: peak, idle_therapists: 0, is_estimated: false, ...over,
})

describe("recommendedTherapists — จำนวนหมอน้อยสุดที่ยอดต่อหมอไม่จมและไม่เต็มบ่อย", () => {
  it("เลือก n น้อยสุดที่ผ่านทั้งยอดต่อหมอ ≥2000 และวันเต็ม ≤30%", () => {
    const rows = [
      // 5 คน: ต่อหมอ 2,400 แต่เต็ม 2 ใน 3 วัน (67%) → ไม่ผ่านข้อ (ข)
      day(5, 12_000, 5), day(5, 12_000, 5), day(5, 12_000, 4),
      // 6 คน: ต่อหมอ 2,500 เต็ม 0 ใน 3 วัน → ผ่านทั้งคู่
      day(6, 15_000, 5), day(6, 15_000, 5), day(6, 15_000, 4),
    ]
    const r = recommendedTherapists(rows)
    expect(r.count).toBe(6)
    expect(r.inconclusive).toBe(false)
  })
  it("n ที่มีข้อมูลน้อยกว่า 3 วันถูกข้าม — ห้ามตัดสินจากวันเดียว", () => {
    const rows = [
      day(4, 20_000, 3), // 4 คนมีวันเดียว แม้ตัวเลขสวยก็ห้ามใช้
      day(6, 15_000, 5), day(6, 15_000, 5), day(6, 15_000, 4),
    ]
    expect(recommendedTherapists(rows).count).toBe(6)
  })
  it("ไม่มี n ไหนผ่าน → inconclusive และคืน n ที่ยอดต่อหมอสูงสุดในกลุ่มที่ข้อมูลพอ", () => {
    const rows = [
      day(5, 8_000, 5), day(5, 8_000, 5), day(5, 8_000, 5),   // ต่อหมอ 1,600 เต็มทุกวัน
      day(6, 10_800, 6), day(6, 10_800, 6), day(6, 10_800, 6), // ต่อหมอ 1,800 เต็มทุกวัน
    ]
    const r = recommendedTherapists(rows)
    expect(r.inconclusive).toBe(true)
    expect(r.count).toBe(6)
  })
  it("ข้อมูลว่าง → count null และ inconclusive", () => {
    const r = recommendedTherapists([])
    expect(r.count).toBeNull()
    expect(r.inconclusive).toBe(true)
  })
  it("idleCount นับเฉพาะแถวข้อมูลเช็คอินจริง — แถวประมาณย้อนหลัง idle เป็น 0 เทียมเสมอ", () => {
    const rows = [
      day(6, 15_000, 4, { idle_therapists: 2, is_estimated: true }),  // ห้ามนับ
      day(6, 15_000, 4, { idle_therapists: 1, is_estimated: false }),
      day(6, 15_000, 4, { idle_therapists: 1, is_estimated: false }),
    ]
    expect(recommendedTherapists(rows).idleCount).toBe(2)
  })
})

describe("criterionStatus — ไฟสถานะเกณฑ์ เขียว/เหลือง/แดง", () => {
  it("ทิศ gte: ผ่านเมื่อถึงเกณฑ์ · เหลืองเมื่อขาดไม่เกิน 15% · แดงเมื่อต่ำกว่านั้น", () => {
    expect(criterionStatus(70, 70, "gte")).toBe("pass")
    expect(criterionStatus(59.5, 70, "gte")).toBe("near") // 85% ของ 70 = 59.5 พอดี
    expect(criterionStatus(59.4, 70, "gte")).toBe("fail")
  })
  it("ทิศ lte: ผ่านเมื่อไม่เกินเกณฑ์ · เหลืองเมื่อเกินไม่เกิน 15%", () => {
    expect(criterionStatus(15, 15, "lte")).toBe("pass")
    expect(criterionStatus(17.25, 15, "lte")).toBe("near") // 115% ของ 15 พอดี
    expect(criterionStatus(17.3, 15, "lte")).toBe("fail")
  })
})

describe("hireVerdict — ถึงเวลาจ้างเมื่อผ่านครบสองเดือนติด", () => {
  it("เดือนล่าสุดผ่านครบแต่เดือนก่อนไม่ → ยังไม่ถึงเวลา", () => {
    expect(hireVerdict([{ allPass: true }, { allPass: false }]).verdict).toBe("not_yet")
  })
  it("สองเดือนติดผ่านครบ → ถึงเวลาพิจารณา", () => {
    expect(hireVerdict([{ allPass: true }, { allPass: true }]).verdict).toBe("ready")
  })
  it("มีข้อมูลเดือนเดียว → ยังไม่ถึงเวลา (กันเดือนแรกที่บังเอิญสวย)", () => {
    expect(hireVerdict([{ allPass: true }]).verdict).toBe("not_yet")
  })
})
