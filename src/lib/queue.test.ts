import { describe, expect, it } from "vitest"
import {
  BOARD_END_MIN,
  BOARD_START_MIN,
  PX_PER_MIN,
  busyBedIds,
  clampStart,
  countFreeTherapists,
  minToTime,
  minToX,
  overlaps,
  snapMin,
  timeToMin,
} from "./queue"

describe("timeToMin / minToTime", () => {
  it("แปลง HH:MM และ HH:MM:SS", () => {
    expect(timeToMin("10:00")).toBe(600)
    expect(timeToMin("14:30:00")).toBe(870)
    expect(minToTime(870)).toBe("14:30")
    expect(minToTime(600)).toBe("10:00")
  })
})

describe("พิกัด x", () => {
  it("10:00 คือขอบซ้าย และสเกลตาม PX_PER_MIN", () => {
    expect(minToX(BOARD_START_MIN)).toBe(0)
    expect(minToX(660)).toBe(60 * PX_PER_MIN)
  })
})

describe("snapMin + clampStart", () => {
  it("snap ทีละ 15 นาที", () => {
    expect(snapMin(607)).toBe(600)
    expect(snapMin(608)).toBe(615)
  })
  it("การ์ดไม่หลุดขอบบอร์ด", () => {
    expect(clampStart(500, 60)).toBe(BOARD_START_MIN)
    // ปลายการ์ดชนขอบขวา: เริ่มช้าสุด = 22:00 - duration
    expect(clampStart(2000, 60)).toBe(BOARD_END_MIN - 60)
  })
})

describe("overlaps", () => {
  it("ทับกันจริงเท่านั้น (ชนขอบพอดีไม่นับ)", () => {
    expect(overlaps(600, 60, 630, 60)).toBe(true)
    expect(overlaps(600, 60, 660, 60)).toBe(false)
    expect(overlaps(700, 30, 600, 200)).toBe(true)
  })
})

describe("countFreeTherapists", () => {
  const entries = [
    { therapist_id: "a", start_time: "10:00", duration_min: 60, status: "in_service" },
    { therapist_id: "b", start_time: "12:00", duration_min: 60, status: "waiting" },
    { therapist_id: "a", start_time: "13:00", duration_min: 60, status: "cancelled" },
    { therapist_id: null, start_time: "10:00", duration_min: 60, status: "waiting" },
  ]
  it("นับหมอที่ไม่มีคิวคร่อมเวลานี้ (ยกเลิก/จ่ายแล้วไม่นับว่าติด)", () => {
    // 10:30 — a ติด (in_service คร่อม), b ว่าง, c ว่าง · คิวไม่ระบุหมอไม่นับ
    expect(countFreeTherapists(["a", "b", "c"], entries, 630)).toBe(2)
    // 12:30 — b ติด (waiting คร่อม = จองไว้)
    expect(countFreeTherapists(["a", "b", "c"], entries, 750)).toBe(2)
    // 13:30 — a ว่าง (คิว 13:00 ถูกยกเลิก)
    expect(countFreeTherapists(["a", "b", "c"], entries, 810)).toBe(3)
  })
})

describe("busyBedIds", () => {
  const entries = [
    { bed_id: "b1", start_time: "10:00", duration_min: 60, status: "waiting" },
    { bed_id: "b2", start_time: "11:00", duration_min: 60, status: "cancelled" },
    { bed_id: null, start_time: "10:00", duration_min: 60, status: "waiting" },
    { bed_id: "b3", start_time: "12:00", duration_min: 60, status: "paid" },
  ]
  it("เตียงไม่ว่าง = มีคิว(ไม่นับยกเลิก)คร่อมช่วงเวลา", () => {
    expect(busyBedIds(entries, 630, 60)).toEqual(new Set(["b1"]))
    expect(busyBedIds(entries, 660, 30)).toEqual(new Set()) // b2 ยกเลิก
    expect(busyBedIds(entries, 720, 60)).toEqual(new Set(["b3"])) // paid ยังครองเตียงตามเวลา
  })
})
