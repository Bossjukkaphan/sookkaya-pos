import { describe, expect, it } from "vitest"

import {
  birthdayPushPayload,
  bookingPushPayload,
  pendingReminderPayload,
} from "./push-message"

describe("bookingPushPayload", () => {
  it("บอกชื่อ วันเวลา และเมนู — พนักงานตัดสินใจได้จากหน้าจอล็อกเลย", () => {
    const p = bookingPushPayload({
      customerName: "สุธิดา",
      queueDate: "2026-08-17",
      startTime: "14:30",
      services: ["ทรีตเมนต์ขัดผิว + นวดน้ำมัน 90 นาที"],
      therapistNote: null,
    })
    expect(p.title).toBe("มีคิวจองใหม่จากไลน์ 🌿")
    expect(p.body).toContain("สุธิดา")
    expect(p.body).toContain("14:30")
    expect(p.body).toContain("ทรีตเมนต์ขัดผิว")
    // แตะแล้วต้องพาไปบอร์ดวันของคิวนั้น ไม่ใช่วันนี้
    expect(p.url).toBe("/queue?date=2026-08-17")
  })

  it("จองหลายคน — รวมเมนูทุกคนและบอกจำนวนที่นั่ง", () => {
    const p = bookingPushPayload({
      customerName: "ก้อย",
      queueDate: "2026-08-18",
      startTime: "10:00",
      services: ["นวดไทย 60 นาที", "นวดเท้า 60 นาที"],
      therapistNote: null,
    })
    expect(p.body).toContain("2 ท่าน")
    expect(p.body).toContain("นวดไทย 60 นาที")
    expect(p.body).toContain("นวดเท้า 60 นาที")
  })

  it("รีเควสหมอ — ต้องเห็นตั้งแต่การแจ้งเตือน ไม่ต้องกดเข้าไปดู", () => {
    const p = bookingPushPayload({
      customerName: "แป๋ม",
      queueDate: "2026-08-18",
      startTime: "19:00",
      services: ["นวดน้ำมัน 90 นาที"],
      therapistNote: "รีเควสหมอส้ม",
    })
    expect(p.body).toContain("รีเควสหมอส้ม")
  })

  it("ไม่มีชื่อลูกค้า → ใช้คำแทนกลางๆ ไม่ปล่อยว่าง", () => {
    const p = bookingPushPayload({
      customerName: "",
      queueDate: "2026-08-18",
      startTime: "19:00",
      services: ["นวดไทย 60 นาที"],
      therapistNote: null,
    })
    expect(p.body).toContain("ลูกค้า LINE")
  })

  it("tag ผูกกับคิว — เตือนเรื่องเดียวกันซ้ำไม่กองซ้อนบนหน้าจอ", () => {
    const a = bookingPushPayload({
      customerName: "ก",
      queueDate: "2026-08-18",
      startTime: "10:00",
      services: ["x"],
      therapistNote: null,
      tag: "queue-abc",
    })
    expect(a.tag).toBe("queue-abc")
  })
})

describe("pendingReminderPayload", () => {
  it("คำขอค้างใบเดียว → บอกชื่อกับเวลาให้ตัดสินใจได้ทันที", () => {
    const p = pendingReminderPayload([
      { customerName: "สุธิดา", queueDate: "2026-08-17", startTime: "14:30", waitedMin: 12 },
    ])
    expect(p?.title).toContain("ยังไม่ได้ตอบ")
    expect(p?.body).toContain("สุธิดา")
    expect(p?.body).toContain("14:30")
    expect(p?.body).toContain("12 นาที")
    expect(p?.url).toBe("/queue?date=2026-08-17")
  })

  it("ค้างหลายใบ → สรุปจำนวน และพาไปวันของใบที่ค้างนานสุด", () => {
    const p = pendingReminderPayload([
      { customerName: "ก้อย", queueDate: "2026-08-18", startTime: "10:00", waitedMin: 30 },
      { customerName: "แป๋ม", queueDate: "2026-08-17", startTime: "19:00", waitedMin: 45 },
    ])
    expect(p?.body).toContain("2 รายการ")
    expect(p?.url).toBe("/queue?date=2026-08-17")
  })

  it("ไม่มีคำขอค้าง → null (ไม่ต้องส่งอะไรเลย)", () => {
    expect(pendingReminderPayload([])).toBeNull()
  })
})

describe("birthdayPushPayload", () => {
  it("คนเดียว → บอกชื่อไปเลย พนักงานทักได้ทันที", () => {
    const p = birthdayPushPayload(["น้ำ"])
    expect(p?.title).toContain("วันเกิด")
    expect(p?.body).toContain("น้ำ")
    expect(p?.url).toBe("/crm")
  })

  it("หลายคน → รวมชื่อทุกคน", () => {
    const p = birthdayPushPayload(["น้ำ", "ตั๊ก", "ชัย"])
    expect(p?.body).toContain("น้ำ")
    expect(p?.body).toContain("ตั๊ก")
    expect(p?.body).toContain("ชัย")
    expect(p?.body).toContain("3 คน")
  })

  it("ไม่มีวันเกิดวันนี้ → null (ไม่กวนพนักงาน)", () => {
    expect(birthdayPushPayload([])).toBeNull()
  })

  it("tag คงที่ต่อวัน — เตือนซ้ำทับอันเดิม ไม่กองเป็นตับ", () => {
    expect(birthdayPushPayload(["น้ำ"])?.tag).toBe("birthday-today")
  })
})
