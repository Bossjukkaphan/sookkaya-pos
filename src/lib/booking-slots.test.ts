import { describe, expect, it } from "vitest"
import {
  computeSlots, isBookableDate, canCancelAt, MAX_ADVANCE_DAYS,
  peakLoad, hasRoomAt, openSlots,
} from "./booking-slots"

describe("computeSlots", () => {
  it("วันล่วงหน้า: ทุก 30 นาที ตั้งแต่ 10:00 และคิวต้องจบภายใน 22:00", () => {
    const slots = computeSlots({ date: "2026-08-01", today: "2026-07-24", nowMin: 900, durationMin: 120 })
    expect(slots[0]).toBe("10:00")
    expect(slots.at(-1)).toBe("20:00") // 20:00+120 = 22:00 พอดี · 20:30 ไม่ทัน
    expect(slots).toContain("14:30")
  })
  it("เมนู 60 นาที จองได้ถึง 21:00", () => {
    const slots = computeSlots({ date: "2026-08-01", today: "2026-07-24", nowMin: 0, durationMin: 60 })
    expect(slots.at(-1)).toBe("21:00")
  })
  it("วันนี้: เริ่มได้อย่างเร็ว ตอนนี้+60 นาที ปัดขึ้นเป็นช่อง 30 นาที", () => {
    // ตอนนี้ 13:10 → +60 = 14:10 → ช่องแรก 14:30
    const slots = computeSlots({ date: "2026-07-24", today: "2026-07-24", nowMin: 13 * 60 + 10, durationMin: 60 })
    expect(slots[0]).toBe("14:30")
  })
  it("วันนี้แต่สายจนไม่เหลือช่อง → ว่างเปล่า", () => {
    expect(computeSlots({ date: "2026-07-24", today: "2026-07-24", nowMin: 21 * 60, durationMin: 60 })).toEqual([])
  })
  it("วันที่ผ่านไปแล้ว → ว่างเปล่า", () => {
    expect(computeSlots({ date: "2026-07-23", today: "2026-07-24", nowMin: 0, durationMin: 60 })).toEqual([])
  })
})

describe("isBookableDate", () => {
  it("วันนี้ถึง +14 วันจองได้ · อดีต/ไกลกว่านั้นไม่ได้", () => {
    expect(isBookableDate("2026-07-24", "2026-07-24")).toBe(true)
    expect(isBookableDate("2026-08-07", "2026-07-24")).toBe(true)  // +14
    expect(isBookableDate("2026-08-08", "2026-07-24")).toBe(false) // +15
    expect(isBookableDate("2026-07-23", "2026-07-24")).toBe(false)
    expect(MAX_ADVANCE_DAYS).toBe(14)
  })
})

describe("peakLoad — คิวที่ซ้อนกันมากที่สุดในช่วงที่จะจอง", () => {
  const q = (start: string, dur: number) => ({ start_time: start, duration_min: dur })

  it("นับการ์ดที่ยังไม่ระบุหมอด้วย — นี่คือรูที่ทำให้คิว 29/7 15:00 หลุดเข้ามา", () => {
    // การ์ดหน้าร้านที่ยังไม่ระบุหมอไม่มีคอลัมน์หมอให้ดู แต่กินตัวหมอ 1 คนเท่ากัน
    expect(peakLoad([q("15:00", 60), q("15:00", 60)], 15 * 60, 60)).toBe(2)
  })

  it("ชนขอบพอดีไม่นับ (จบ 15:00 เริ่ม 15:00)", () => {
    expect(peakLoad([q("14:00", 60)], 15 * 60, 60)).toBe(0)
  })

  it("คิวยาวคร่อมมาจากก่อนหน้าก็นับ", () => {
    // 13:55 + 120 = 15:55 ยังคร่อม 15:00 อยู่
    expect(peakLoad([q("13:55", 120)], 15 * 60, 60)).toBe(1)
  })

  it("นับจุดที่แน่นที่สุด ไม่ใช่จำนวนใบที่แตะช่วงนั้น", () => {
    // 15:00-16:00 คือช่วงที่จะจอง · A จบ 15:10 · B เริ่ม 15:30
    // ใบที่แตะช่วงมี 2 ใบ แต่ไม่เคยซ้อนกันเลย จุดที่แน่นที่สุดคือ 1
    expect(peakLoad([q("14:10", 60), q("15:30", 30)], 15 * 60, 60)).toBe(1)
  })

  it("ไม่มีคิวเลย = 0", () => {
    expect(peakLoad([], 15 * 60, 60)).toBe(0)
  })
})

describe("hasRoomAt — ช่วงนี้รับเพิ่มได้อีกกี่คน", () => {
  const q = (start: string, dur: number) => ({ start_time: start, duration_min: dur })
  // เคสจริง 29/7/2569: หมอเช็คอิน 5 คน · 15:00 ติดคิวครบทั้ง 5
  const busy29 = [
    q("15:00", 90), q("15:00", 90),   // เบนซ์ ศรัณย์ 2 ใบ · บีบี + แพท
    q("13:55", 120), q("13:55", 120), // เจ ยศวัฒน์ 2 ใบ · รัน + แจง (ถึง 15:55)
    q("14:05", 120),                  // ได้ พิเชษฐ์ · โจโจ้ (ถึง 16:05)
  ]

  it("คิว 15:00 ของ “เม” 2 ท่าน ต้องถูกปฏิเสธตั้งแต่แรก", () => {
    expect(hasRoomAt({ entries: busy29, startMin: 15 * 60, durationMin: 60, capacity: 5, seats: 2 }))
      .toBe(false)
  })

  it("ต่อให้ขอคนเดียวก็ยังไม่ว่าง — หมอติดครบ 5", () => {
    expect(hasRoomAt({ entries: busy29, startMin: 15 * 60, durationMin: 60, capacity: 5, seats: 1 }))
      .toBe(false)
  })

  it("16:30 ว่างแล้ว (คิวสุดท้ายจบ 16:30) รับได้ 2 ท่าน", () => {
    expect(hasRoomAt({ entries: busy29, startMin: 16 * 60 + 30, durationMin: 60, capacity: 5, seats: 2 }))
      .toBe(true)
  })

  it("เหลือหมอ 1 คน จอง 2 ท่านไม่ได้ แต่ 1 ท่านได้", () => {
    const four = [q("15:00", 60), q("15:00", 60), q("15:00", 60), q("15:00", 60)]
    expect(hasRoomAt({ entries: four, startMin: 15 * 60, durationMin: 60, capacity: 5, seats: 2 })).toBe(false)
    expect(hasRoomAt({ entries: four, startMin: 15 * 60, durationMin: 60, capacity: 5, seats: 1 })).toBe(true)
  })

  it("ไม่มีหมอเข้างานเลย = ปิดรับทั้งวัน", () => {
    expect(hasRoomAt({ entries: [], startMin: 15 * 60, durationMin: 60, capacity: 0, seats: 1 })).toBe(false)
  })

  it("คิวยาวต้องว่างตลอดทั้งช่วง ไม่ใช่แค่ตอนเริ่ม", () => {
    // ขอ 15:00 ยาว 120 นาที · หมอ 1 คน · มีคิวเดิม 16:00-17:00 คั่นกลาง
    expect(hasRoomAt({ entries: [q("16:00", 60)], startMin: 15 * 60, durationMin: 120, capacity: 1, seats: 1 }))
      .toBe(false)
  })
})

describe("openSlots — คัดเฉพาะช่องที่ยังรับได้", () => {
  it("ตัดช่องที่เต็มออก เหลือเฉพาะช่องที่ว่างพอ", () => {
    const slots = ["14:00", "15:00", "16:00"]
    const entries = [{ start_time: "15:00", duration_min: 60 }]
    expect(openSlots({ slots, entries, capacity: 1, durationMin: 60, seats: 1 }))
      .toEqual(["14:00", "16:00"])
  })

  it("เต็มหมดทุกช่อง → ว่างเปล่า (หน้าจองจะขึ้นว่าเต็ม)", () => {
    expect(openSlots({
      slots: ["15:00"], entries: [{ start_time: "15:00", duration_min: 60 }],
      capacity: 1, durationMin: 60, seats: 1,
    })).toEqual([])
  })
})

describe("canCancelAt", () => {
  it("ยกเลิกได้เมื่อเหลือ ≥120 นาทีก่อนนัด", () => {
    expect(canCancelAt("2026-07-24", "16:00", "2026-07-24", 14 * 60)).toBe(true)  // เหลือ 120 พอดี
    expect(canCancelAt("2026-07-24", "16:00", "2026-07-24", 14 * 60 + 1)).toBe(false)
    expect(canCancelAt("2026-07-25", "10:00", "2026-07-24", 23 * 60)).toBe(true)  // คนละวัน
    expect(canCancelAt("2026-07-23", "16:00", "2026-07-24", 0)).toBe(false)       // วันผ่านไปแล้ว
  })
})
