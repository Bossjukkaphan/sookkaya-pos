import { describe, expect, it } from "vitest"
import {
  bedSegments,
  canMoveCardWindow,
  BOARD_END_MIN,
  BOARD_START_MIN,
  PX_PER_MIN,
  bedHolderInGroup,
  bedStartMin,
  busyBedIds,
  busyTherapistIds,
  clampStart,
  countFreeTherapists,
  groupBedClash,
  groupSlotTimes,
  hasBedClash,
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

describe("busyBedIds — การ์ดที่ย้ายห้องกลางคัน", () => {
  const moved = [
    {
      bed_id: "chair3", bed_id_2: "thai2",
      start_time: "13:55", duration_min: 120, status: "paid",
    },
  ]

  it("เก้าอี้ว่างหลังลูกค้าย้ายออก แต่เตียงไทยไม่ว่าง", () => {
    // 15:00–16:30 (900, 90 นาที): เก้าอี้ว่างแล้ว (ออกตอน 14:55) เตียงไทยยังอยู่ถึง 15:55
    expect(busyBedIds(moved, 900, 90)).toEqual(new Set(["thai2"]))
  })

  it("ช่วงครึ่งแรกยังติดเก้าอี้ ยังไม่ติดเตียงไทย", () => {
    // 14:00–14:30 (840, 30 นาที)
    expect(busyBedIds(moved, 840, 30)).toEqual(new Set(["chair3"]))
  })
})

describe("hasBedClash — ป้าย ⚠️ซ้อน บนบอร์ดคิว", () => {
  // เคสจริง 9 ส.ค. 2569: เอ็ม เมธี 13:55 เมนู 120 นาที เก้าอี้ 3 → ย้ายเตียงไทย 2 ตอน 14:55
  // (bed_id_2) · กอล์ฟฟี่ 15:00 เมนู 90 นาที เก้าอี้ 3 — ไม่ได้ชนกันจริง
  const emm = {
    id: "emm",
    bed_id: "chair3",
    bed_id_2: "thai2",
    start_time: "13:55",
    duration_min: 120,
    status: "in_service",
    started_at: null as string | null,
  }
  const golffy = {
    id: "golffy",
    bed_id: "chair3",
    bed_id_2: null,
    start_time: "15:00",
    duration_min: 90,
    status: "waiting",
    started_at: null as string | null,
  }

  it("การ์ดย้ายห้องกลางคัน + คิวถัดไปจองห้องแรกหลังย้ายออก — ไม่ใช่ซ้อน (เทียบเต็มโปรแกรมจะพลาดเคสนี้)", () => {
    expect(hasBedClash(emm, [emm, golffy])).toBe(false)
    expect(hasBedClash(golffy, [emm, golffy])).toBe(false)
  })

  it("ห้องที่สองชนจริง — เตียงไทยมีคิวอื่นทับช่วงครึ่งหลัง", () => {
    const other = {
      id: "other",
      bed_id: "thai2",
      bed_id_2: null,
      start_time: "15:30",
      duration_min: 60,
      status: "waiting",
      started_at: null as string | null,
    }
    expect(hasBedClash(emm, [emm, other])).toBe(true)
    expect(hasBedClash(other, [emm, other])).toBe(true)
  })

  it("การ์ดห้องเดียวชนกันตรงๆ (พฤติกรรมเดิม) — ยังจับได้เหมือนเดิม", () => {
    const a = {
      id: "a", bed_id: "b1", bed_id_2: null,
      start_time: "10:00", duration_min: 60, status: "waiting", started_at: null as string | null,
    }
    const b = {
      id: "b", bed_id: "b1", bed_id_2: null,
      start_time: "10:30", duration_min: 60, status: "waiting", started_at: null as string | null,
    }
    expect(hasBedClash(a, [a, b])).toBe(true)
  })

  it("ยกเลิกแล้วไม่นับว่าครองเตียง", () => {
    const a = {
      id: "a", bed_id: "b1", bed_id_2: null,
      start_time: "10:00", duration_min: 60, status: "waiting", started_at: null as string | null,
    }
    const cancelled = {
      id: "b", bed_id: "b1", bed_id_2: null,
      start_time: "10:30", duration_min: 60, status: "cancelled", started_at: null as string | null,
    }
    expect(hasBedClash(a, [a, cancelled])).toBe(false)
  })

  it("ไม่นับตัวเอง แม้จะอยู่ใน others", () => {
    const a = {
      id: "a", bed_id: "b1", bed_id_2: null,
      start_time: "10:00", duration_min: 60, status: "waiting", started_at: null as string | null,
    }
    expect(hasBedClash(a, [a])).toBe(false)
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

  it("ฟอร์มไม่ส่ง bed_id_2 มา — ต้องไม่แตะห้องที่สองของการ์ด", () => {
    // ฟอร์มแก้บิลไม่มีช่องห้องที่สอง ถ้าเขียน null ทับจะลบห้องที่พนักงานเลือกไว้ทิ้ง
    const fd = new FormData()
    fd.set("customer_name", "ทดสอบ")
    const patch = queueMirrorFromSale(fd, "svc1", { name: "นวดไทย", duration_min: 60 }, "th1")
    expect(Object.keys(patch)).not.toContain("bed_id_2")
  })

  it("ฟอร์มส่ง bed_id_2 ค่าว่างมา — ตั้งใจเอาห้องที่สองออก เขียน null ถูกแล้ว", () => {
    const fd = new FormData()
    fd.set("bed_id_2", "")
    const patch = queueMirrorFromSale(fd, "svc1", { name: "นวดไทย", duration_min: 60 }, "th1")
    expect(patch).toMatchObject({ bed_id_2: null })
  })
})

describe("canMoveCardWindow — ย้ายเตียง/เปลี่ยนหมอได้ภายใน 15 นาทีแรกของการนวดจริง", () => {
  // การ์ดจ่ายแล้ว จอง 17:00 นวด 120 นาที
  const base = {
    start_time: "17:00",
    duration_min: 120,
    started_at: null as string | null,
  }
  const bkk = (hhmm: string) => `2026-08-01T${hhmm}:00+07:00`

  it("ยังไม่เริ่มนวด (จ่ายแล้วรอเริ่ม) → ย้ายได้", () => {
    expect(canMoveCardWindow(base, 16 * 60 + 30).allowed).toBe(true)
  })
  it("เริ่มจริง 17:00 · ตอนนี้ 17:10 (ผ่านไป 10 นาที) → ย้ายได้", () => {
    expect(canMoveCardWindow({ ...base, started_at: bkk("17:00") }, 17 * 60 + 10).allowed).toBe(true)
  })
  it("นาทีที่ 15 พอดี → ยังย้ายได้ (ขอบใน)", () => {
    expect(canMoveCardWindow({ ...base, started_at: bkk("17:00") }, 17 * 60 + 15).allowed).toBe(true)
  })
  it("นาทีที่ 16 → ล็อกแล้ว พร้อมเหตุผล", () => {
    const r = canMoveCardWindow({ ...base, started_at: bkk("17:00") }, 17 * 60 + 16)
    expect(r.allowed).toBe(false)
    expect(r.reason).toContain("15 นาที")
  })
  it("ลูกค้ามาสาย เริ่มจริง 17:30 → หน้าต่างนับจากเวลาเริ่มจริง ไม่ใช่เวลาจอง", () => {
    expect(canMoveCardWindow({ ...base, started_at: bkk("17:30") }, 17 * 60 + 40).allowed).toBe(true)
    expect(canMoveCardWindow({ ...base, started_at: bkk("17:30") }, 17 * 60 + 50).allowed).toBe(false)
  })
  it("นวดจบแล้ว → ล็อกเสมอ (กันเคสข้อมูลเวลาเริ่มหาย)", () => {
    // ไม่มี started_at แต่เลยเวลาจบตามจองไปแล้ว — ห้ามย้ายย้อนหลัง
    const r = canMoveCardWindow(base, 19 * 60 + 1)
    expect(r.allowed).toBe(false)
  })
})

describe("groupSlotTimes", () => {
  const dur = (id: string) =>
    ({ s60: 60, s90: 90, s30: 30 })[id as "s60" | "s90" | "s30"] ?? null

  it("คนละคนมาพร้อมกัน — เริ่มเวลาเดียวกันทุกคน ระยะเวลายึดตามเมนูของแต่ละคน", () => {
    const slots = groupSlotTimes(
      [{ serviceId: "s60" }, { serviceId: "s90" }, { serviceId: "s30" }],
      timeToMin("14:00"),
      dur
    )
    expect(slots).toEqual([
      { startMin: 840, durationMin: 60 },
      { startMin: 840, durationMin: 90 },
      { startMin: 840, durationMin: 30 },
    ])
  })

  it("ต่อเวลา — เริ่มต่อจากรายการก่อนหน้าจบ ไม่ใช่พร้อมกัน", () => {
    const slots = groupSlotTimes(
      [{ serviceId: "s60" }, { serviceId: "s90", sequential: true }],
      timeToMin("14:00"),
      dur
    )
    expect(slots[1]).toEqual({ startMin: 900, durationMin: 90 })
  })

  it("ต่อเวลาซ้อนกันหลายใบ — ไล่ต่อกันเป็นลูกโซ่", () => {
    const slots = groupSlotTimes(
      [
        { serviceId: "s60" },
        { serviceId: "s30", sequential: true },
        { serviceId: "s60", sequential: true },
      ],
      timeToMin("10:00"),
      dur
    )
    expect(slots.map((s) => minToTime(s.startMin))).toEqual([
      "10:00",
      "11:00",
      "11:30",
    ])
  })

  it("คนปกติแทรกกลางลูกโซ่ — กลับไปเริ่มพร้อมกลุ่ม แต่ยังดันปลายลูกโซ่ต่อ (ตรงกับ server)", () => {
    const slots = groupSlotTimes(
      [
        { serviceId: "s60" },
        { serviceId: "s90", sequential: true },
        { serviceId: "s30" },
        { serviceId: "s60", sequential: true },
      ],
      timeToMin("10:00"),
      dur
    )
    expect(slots.map((s) => minToTime(s.startMin))).toEqual([
      "10:00",
      "11:00",
      "10:00",
      "10:30",
    ])
  })

  it("ยังไม่เลือกเมนู หรือเมนูไม่มีระยะเวลา → ใช้ 60 นาทีเหมือน server", () => {
    const slots = groupSlotTimes(
      [{ serviceId: "" }, { serviceId: "ไม่รู้จัก", sequential: true }],
      timeToMin("10:00"),
      dur
    )
    expect(slots).toEqual([
      { startMin: 600, durationMin: 60 },
      { startMin: 660, durationMin: 60 },
    ])
  })
})

describe("bedHolderInGroup", () => {
  const row = (bedId: string, startMin: number | null, durationMin = 60) => ({
    bedId,
    startMin,
    durationMin,
  })

  it("เตียงเดียวกันแต่คนละช่วงเวลา (ลูกค้าคนเดิมนวดต่อ) → ไม่ชน", () => {
    const rows = [row("b1", 600), row("b1", 660)]
    expect(bedHolderInGroup(rows, 1, "b1")).toBe(-1)
  })

  it("เตียงเดียวกันเวลาทับกัน → คืนดัชนีคนที่ถือเตียงอยู่", () => {
    const rows = [row("b1", 600), row("b1", 630)]
    expect(bedHolderInGroup(rows, 1, "b1")).toBe(0)
  })

  it("ชนขอบพอดี 10:00–11:00 กับ 11:00–12:00 → ไม่ชน", () => {
    const rows = [row("b1", 600), row("b1", 660)]
    expect(bedHolderInGroup(rows, 0, "b1")).toBe(-1)
  })

  it("เวลาไม่ครบ (เว้นว่าง = ใช้เวลาบันทึก) → กันไว้ก่อน ถือว่าชน", () => {
    expect(bedHolderInGroup([row("b1", null), row("b1", 600)], 1, "b1")).toBe(0)
    expect(bedHolderInGroup([row("b1", 600), row("b1", null)], 1, "b1")).toBe(0)
  })

  it("คนละเตียง · ไม่นับตัวเอง · เตียงว่างไม่ถือเป็นชน", () => {
    expect(bedHolderInGroup([row("b1", 600), row("b2", 600)], 1, "b2")).toBe(-1)
    expect(bedHolderInGroup([row("", 600), row("", 600)], 1, "")).toBe(-1)
  })

  it("ระยะเวลาต่างกันรายคน — ใช้ของแต่ละแถวคำนวณ", () => {
    // คนแรก 10:00 ยาว 120 นาที · คนที่สอง 11:00 → ทับ
    const rows = [row("b1", 600, 120), row("b1", 660, 60)]
    expect(bedHolderInGroup(rows, 1, "b1")).toBe(0)
  })
})

describe("groupBedClash — ห้องซ้ำในกลุ่มเดียวกันก่อนแถวไหนถูก insert จริง (createQueueGroup)", () => {
  // คนแรกอยู่ room1 ตลอด 10:00–11:00 (ไม่มีห้องที่สอง)
  const personA = { bed_id: "room1", bed_id_2: null, start_time: "10:00", duration_min: 60 }

  it("คนที่สองถือ room1 เป็น 'ห้องที่สอง' ทับช่วงเวลาของคนแรก — เทียบ bed_id ตรงตัวจะพลาดเคสนี้", () => {
    // ครึ่งหลังของคนที่สอง (room1) คือ 10:45–11:15 ซึ่งทับกับคนแรก 10:00–11:00
    const personB = { bed_id: "roomX", bed_id_2: "room1", start_time: "10:15", duration_min: 60 }
    expect(groupBedClash([personA, personB], 1)).toBe(true)
  })

  it("คนที่สองถือ room1 เป็นห้องที่สอง แต่ช่วงเวลาไม่ทับกับคนแรก — ต้องผ่าน ไม่ใช่กันไปหมด", () => {
    // ครึ่งหลังของคนที่สอง (room1) เริ่ม 12:00 พ้นช่วงคนแรก (จบ 11:00) ไปแล้ว
    const personB = { bed_id: "roomX", bed_id_2: "room1", start_time: "11:30", duration_min: 60 }
    expect(groupBedClash([personA, personB], 1)).toBe(false)
  })
})

describe("bedSegments — การ์ดหนึ่งใบยึดห้องไหน ช่วงไหนบ้าง", () => {
  const base = { start_time: "10:00", duration_min: 120, status: "waiting" }

  it("ไม่มีห้องที่สอง — ช่วงเดียว ยาวเต็มโปรแกรม (พฤติกรรมเดิมเป๊ะ)", () => {
    expect(bedSegments({ ...base, bed_id: "b1" })).toEqual([
      { bedId: "b1", startMin: 600, durationMin: 120 },
    ])
  })

  it("มีห้องที่สอง 120 นาที — สองช่วงละ 60 ต่อกันพอดี ไม่มีรู ไม่ทับกัน", () => {
    expect(bedSegments({ ...base, bed_id: "b1", bed_id_2: "b2" })).toEqual([
      { bedId: "b1", startMin: 600, durationMin: 60 },
      { bedId: "b2", startMin: 660, durationMin: 60 },
    ])
  })

  it("นาทีคี่ — ครึ่งหลังได้เศษ รวมสองช่วงต้องเท่าโปรแกรมเป๊ะ", () => {
    const segs = bedSegments({
      ...base, duration_min: 45, bed_id: "b1", bed_id_2: "b2",
    })
    expect(segs).toEqual([
      { bedId: "b1", startMin: 600, durationMin: 22 },
      { bedId: "b2", startMin: 622, durationMin: 23 },
    ])
    expect(segs[0].durationMin + segs[1].durationMin).toBe(45)
  })

  it("ไม่มีห้องแรกเลย — ไม่ยึดอะไรทั้งนั้น", () => {
    expect(bedSegments({ ...base, bed_id: null })).toEqual([])
    expect(bedSegments({ ...base, bed_id: null, bed_id_2: "b2" })).toEqual([])
  })

  it("ห้องที่สองเป็นห้องเดียวกับห้องแรก — ยังเป็นสองช่วงที่ต่อกัน ไม่ยุบรวม", () => {
    // ลูกค้าอยู่ห้องเดิมแต่พนักงานกรอกซ้ำ — ผลลัพธ์ต้องเท่ากับครองยาวอยู่ดี
    expect(bedSegments({ ...base, bed_id: "b1", bed_id_2: "b1" })).toEqual([
      { bedId: "b1", startMin: 600, durationMin: 60 },
      { bedId: "b1", startMin: 660, durationMin: 60 },
    ])
  })

  it("กดเริ่มนวดแล้ว — ทั้งสองช่วงเลื่อนตามเวลาเริ่มจริง", () => {
    // จอง 10:00 เริ่มจริง 10:30 (03:30Z = 10:30 เวลาไทย) → ครึ่งแรก 10:30 ครึ่งหลัง 11:30
    expect(
      bedSegments({
        ...base, bed_id: "b1", bed_id_2: "b2",
        started_at: "2026-07-26T03:30:00+00:00",
      })
    ).toEqual([
      { bedId: "b1", startMin: 630, durationMin: 60 },
      { bedId: "b2", startMin: 690, durationMin: 60 },
    ])
  })
})
