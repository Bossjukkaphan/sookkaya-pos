import { describe, expect, it } from "vitest"
import {
  BOARD_END_MIN,
  BOARD_START_MIN,
  PX_PER_MIN,
  bedStartMin,
  busyBedIds,
  busyTherapistIds,
  clampStart,
  countFreeTherapists,
  minToTime,
  minToX,
  overlaps,
  queueMirrorFromSale,
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
  it("เริ่มนวดแล้วยึดเวลาเริ่มจริง — มาสายเตียงติดนานขึ้น", () => {
    // จอง 10:00 แต่เริ่มจริง 10:30 (03:30Z = 10:30 เวลาไทย) → เตียงติดถึง 11:30
    const late = [
      {
        bed_id: "b1",
        start_time: "10:00",
        duration_min: 60,
        status: "in_service",
        started_at: "2026-07-26T03:30:00+00:00",
      },
    ]
    expect(busyBedIds(late, 660, 30)).toEqual(new Set(["b1"])) // 11:00–11:30 ยังติด
    expect(busyBedIds(late, 600, 30)).toEqual(new Set()) // 10:00–10:30 ว่าง (ยังไม่เริ่มจริง)
  })
})

describe("bedStartMin", () => {
  it("ยังไม่เริ่ม = เวลาจอง · เริ่มแล้ว = เวลาเริ่มจริง (เวลาไทย)", () => {
    expect(bedStartMin({ start_time: "14:00", started_at: null })).toBe(840)
    expect(
      bedStartMin({ start_time: "14:00", started_at: "2026-07-26T07:10:00+00:00" })
    ).toBe(850) // 07:10Z = 14:10 ไทย
  })
})

describe("busyTherapistIds", () => {
  it("หมอติดคิว = มีคิว(ไม่นับยกเลิก)คร่อมช่วงเวลา — เริ่มแล้วยึดเวลาเริ่มจริง", () => {
    const entries = [
      { therapist_id: "t1", start_time: "10:00", duration_min: 60, status: "waiting" },
      { therapist_id: "t2", start_time: "10:00", duration_min: 60, status: "cancelled" },
      { therapist_id: null, start_time: "10:00", duration_min: 60, status: "waiting" },
      {
        // จอง 11:00 แต่เริ่มจริง 11:30 (04:30Z) → ติดถึง 12:30
        therapist_id: "t3",
        start_time: "11:00",
        duration_min: 60,
        status: "in_service",
        started_at: "2026-07-26T04:30:00+00:00",
      },
    ]
    expect(busyTherapistIds(entries, 630, 30)).toEqual(new Set(["t1"]))
    expect(busyTherapistIds(entries, 720, 30)).toEqual(new Set(["t3"])) // 12:00 ยังติด (เริ่มช้า)
    expect(busyTherapistIds(entries, 660, 15)).toEqual(new Set()) // 11:00–11:15 ว่าง (t3 ยังไม่เริ่ม)
  })
})

describe("queueMirrorFromSale", () => {
  const service = { name: "นวดไทยด้วยบาล์ม หรือน้ำมัน 120 นาที", duration_min: 120 }

  function fd(entries: Record<string, string>) {
    const f = new FormData()
    for (const [k, v] of Object.entries(entries)) f.set(k, v)
    return f
  }

  it("การ์ดเดินตามบิลครบทุกช่อง — เมนู ความยาวเวลา หมอ เตียง", () => {
    const out = queueMirrorFromSale(
      fd({ bed_id: "bed-2", customer_name: " ชวน ", customer_phone: "0812345678" }),
      "svc-120",
      service,
      "th-jang"
    )
    expect(out.service_id).toBe("svc-120")
    expect(out.service_name).toBe(service.name)
    expect(out.duration_min).toBe(120)
    expect(out.therapist_id).toBe("th-jang")
    expect(out.bed_id).toBe("bed-2")
    expect(out.customer_name).toBe("ชวน")
  })

  // เคสจริง 25/7/2569: บิลถูกแก้ 90→120 นาที แต่การ์ดค้าง 90
  // บล็อกบนบอร์ดสั้นกว่าจริงครึ่งชั่วโมง เสี่ยงจัดคิวทับ
  it("เปลี่ยนเมนูแล้วความยาวเวลาบนการ์ดต้องเปลี่ยนตาม", () => {
    const out = queueMirrorFromSale(fd({}), "svc-90", { name: "x", duration_min: 90 }, "t1")
    expect(out.duration_min).toBe(90)
  })

  // ฟอร์มแก้บิลไม่มีช่องเตียงเลย ถ้าเผลอเขียน null ทับ
  // เตียงที่พนักงานเลือกไว้ตอนกดชำระจะหายทันทีที่มีคนแก้บิล
  it("ไม่มีคีย์เตียงมาเลย = ไม่แตะเตียงเดิมของการ์ด", () => {
    const out = queueMirrorFromSale(fd({ customer_name: "ก" }), "s", service, "t")
    expect("bed_id" in out).toBe(false)
  })

  it("มีคีย์เตียงแต่ค่าว่าง = ตั้งใจเอาเตียงออก", () => {
    const out = queueMirrorFromSale(fd({ bed_id: "" }), "s", service, "t")
    expect(out.bed_id).toBeNull()
  })

  it("เมนูที่ไม่ได้ตั้งความยาวเวลาไว้ ใช้ 60 นาทีเป็นค่าตั้งต้น", () => {
    const out = queueMirrorFromSale(fd({}), "s", { name: "x", duration_min: null }, "t")
    expect(out.duration_min).toBe(60)
  })
})
