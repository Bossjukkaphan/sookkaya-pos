import { describe, expect, it } from "vitest"

import { clashLabel, firstBedClash, firstClash, type ClashRow } from "./bed-clash"

const row = (o: Partial<ClashRow> & { id: string }): ClashRow => ({
  customer_name: null,
  service_name: "นวดไทย",
  duration_min: 60,
  start_time: "10:00:00",
  started_at: null,
  ...o,
})

describe("firstClash", () => {
  it("ไม่มีใครใช้ช่วงเวลานี้ → null", () => {
    const rows = [row({ id: "a", start_time: "10:00:00", duration_min: 60 })]
    expect(firstClash(rows, 11 * 60, 60, [])).toBeNull()
  })

  it("เวลาทับกัน → คืนแถวที่ชน", () => {
    const rows = [row({ id: "a", start_time: "10:00:00", duration_min: 60 })]
    expect(firstClash(rows, 10 * 60 + 30, 60, [])?.id).toBe("a")
  })

  it("ชนขอบพอดี (จบ 11:00 เริ่ม 11:00) ไม่นับชน — กติกาเดียวกับบอร์ดคิว", () => {
    const rows = [row({ id: "a", start_time: "10:00:00", duration_min: 60 })]
    expect(firstClash(rows, 11 * 60, 60, [])).toBeNull()
  })

  it("ใบที่ยกเว้น (ใบตัวเอง) ไม่นับ", () => {
    const rows = [row({ id: "a", start_time: "10:00:00", duration_min: 60 })]
    expect(firstClash(rows, 10 * 60, 60, ["a"])).toBeNull()
  })

  it("เริ่มนวดจริงแล้ว → ยึดเวลาเริ่มจริง ไม่ใช่เวลาจอง (มาสายเตียงติดนานขึ้น)", () => {
    // จอง 10:00 แต่เริ่มจริง 11:00 → ครองเตียงถึง 12:00
    const rows = [
      row({
        id: "a",
        start_time: "10:00:00",
        duration_min: 60,
        started_at: "2026-08-09T04:00:00+00:00", // 11:00 เวลาไทย
      }),
    ]
    expect(firstClash(rows, 10 * 60, 30, [])).toBeNull()
    expect(firstClash(rows, 11 * 60 + 30, 30, [])?.id).toBe("a")
  })

  it("ชนหลายใบ → คืนใบแรกที่เจอ", () => {
    const rows = [
      row({ id: "a", start_time: "09:00:00", duration_min: 30 }),
      row({ id: "b", start_time: "10:00:00", duration_min: 60 }),
      row({ id: "c", start_time: "10:30:00", duration_min: 60 }),
    ]
    expect(firstClash(rows, 10 * 60 + 15, 30, [])?.id).toBe("b")
  })
})

describe("clashLabel", () => {
  it("บอกช่วงเวลาและชื่อลูกค้าที่ครองอยู่", () => {
    expect(
      clashLabel(row({ id: "a", start_time: "13:55:00", duration_min: 120, customer_name: "เอ็ม" }))
    ).toBe("13:55–15:55 (คิวคุณเอ็ม)")
  })

  it("ไม่มีชื่อลูกค้า → ใช้ชื่อเมนูแทน", () => {
    expect(clashLabel(row({ id: "a", start_time: "10:00:00", service_name: "นวดเท้า" }))).toBe(
      "10:00–11:00 (คิวนวดเท้า)"
    )
  })

  it("เริ่มนวดจริงช้ากว่าจอง → ป้ายบอกช่วงที่ครองเตียงจริง", () => {
    expect(
      clashLabel(
        row({
          id: "a",
          start_time: "10:00:00",
          duration_min: 60,
          started_at: "2026-08-09T04:00:00+00:00",
          customer_name: "ก้อย",
        })
      )
    ).toBe("11:00–12:00 (คิวคุณก้อย)")
  })
})

describe("firstBedClash — เข้าใจการ์ดที่ย้ายห้องกลางคัน", () => {
  // เคสจริง 9 ส.ค. 2026 ที่ reconciliation ฟ้องมาสองวัน:
  // เอ็ม เมธี เมนู 120 นาที เริ่ม 13:55 บนเก้าอี้ 3 แล้วย้ายเตียงไทยตอน 14:55
  // กอล์ฟฟี่ เมนู 90 นาที เริ่ม 15:00 บนเก้าอี้ 3 — ไม่ได้ชนเลย พนักงานทำถูกมาตลอด
  const emm = {
    id: "emm", customer_name: "เอ็ม เมธี", service_name: "นวดคลายเท้า & คอบ่าไหล่ 120 นาที",
    duration_min: 120, start_time: "13:55", started_at: null,
    bed_id: "chair3", bed_id_2: "thai2",
  }

  it("การ์ดที่ย้ายห้องแล้ว — ห้องแรกว่างตั้งแต่ครึ่งทาง คิวถัดไปจองได้", () => {
    // กอล์ฟฟี่ 15:00 (900) 90 นาที บนเก้าอี้ 3 — เอ็มออกจากเก้าอี้ตอน 14:55 (895)
    expect(firstBedClash([emm], "chair3", 900, 90, [])).toBeNull()
  })

  it("การ์ดเดียวกันแต่ไม่ได้ระบุห้องที่สอง — ยังชนเหมือนเดิม (พฤติกรรมเดิมไม่เปลี่ยน)", () => {
    const oneRoom = { ...emm, bed_id_2: null }
    expect(firstBedClash([oneRoom], "chair3", 900, 90, [])?.id).toBe("emm")
  })

  it("ครึ่งหลังของการ์ดชนกับคิวใหม่บนเตียงไทย — ต้องจับได้", () => {
    // เอ็มอยู่เตียงไทย 14:55–15:55 (895–955) · คิวใหม่ 15:30 (930) 60 นาที
    expect(firstBedClash([emm], "thai2", 930, 60, [])?.id).toBe("emm")
  })

  it("ห้องที่ไม่เกี่ยวกับการ์ดนี้เลย — ไม่ชน", () => {
    expect(firstBedClash([emm], "thai5", 900, 60, [])).toBeNull()
  })

  it("ชนขอบพอดีไม่นับชน — เหมือนกติกาเดิม", () => {
    // ครึ่งแรกของเอ็มจบ 14:55 (895) คิวใหม่เริ่ม 14:55 พอดี
    expect(firstBedClash([emm], "chair3", 895, 60, [])).toBeNull()
  })

  it("ใบที่อยู่ใน excludeIds ไม่นับ — ใช้ตอนแก้การ์ดของตัวเอง", () => {
    expect(firstBedClash([emm], "thai2", 930, 60, ["emm"])).toBeNull()
  })
})
