import { describe, expect, it } from "vitest"
import {
  EXCLUDED_TIER,
  MAX_ALERTS,
  buildDailyReport,
  type DailyReportInput,
  type DailySummaryRow,
  type TopupRow,
  type TopupHistoryRow,
} from "./daily-report"

/** ตัวเลขจริงวันที่ 4 ส.ค. 2569 ที่สืบไว้ตอนทำ spec — ใช้เป็นหมุดกันสูตรเพี้ยน */
const row = (sale_date: string, sessions: number, net_revenue: number, cash_in = 0): DailySummaryRow => ({
  sale_date, sessions, net_revenue, cash_in,
})

const base: DailyReportInput = {
  today: "2026-08-04",
  daily: [row("2026-08-04", 16, 11673.67, 19107)],
  commission: 4680,
  customers: 14,
  topTherapist: null,
  bookingsTomorrow: 0,
  memberCreditEmpty: 0,
  memberCreditLow: 0,
  topups: [],
  topupHistory: [],
}

describe("buildDailyReport — ตัวเลขหลัก", () => {
  it("กำไรขั้นต้น = ยอดสุทธิ − ค่ามือ และ margin คิดจากยอดสุทธิ", () => {
    const r = buildDailyReport(base)
    expect(r.netRevenue).toBe(11673.67)
    expect(r.commission).toBe(4680)
    expect(r.grossProfit).toBeCloseTo(6993.67, 2)
    expect(r.margin).toBeCloseTo(59.91, 2)
  })

  it("ยอดสุทธิเป็น 0 ไม่ทำให้ margin หารด้วยศูนย์", () => {
    const r = buildDailyReport({
      ...base,
      daily: [row("2026-08-04", 1, 0, 0)],
      commission: 500,
    })
    expect(r.margin).toBe(0)
  })

  it("ส่งค่าอื่นผ่านตรงๆ ไม่แปลง", () => {
    const r = buildDailyReport({ ...base, customers: 14, bookingsTomorrow: 5 })
    expect(r.date).toBe("2026-08-04")
    expect(r.cashIn).toBe(19107)
    expect(r.sessions).toBe(16)
    expect(r.customers).toBe(14)
    expect(r.bookingsTomorrow).toBe(5)
  })
})

describe("buildDailyReport — โหมดไม่มีบิล", () => {
  it("ไม่มีแถวของวันนี้เลย = empty และเลขเป็น 0 ทั้งหมด", () => {
    const r = buildDailyReport({ ...base, daily: [], commission: 0, customers: 0 })
    expect(r.empty).toBe(true)
    expect(r.netRevenue).toBe(0)
    expect(r.sessions).toBe(0)
  })

  // วันที่มีแต่คนมาเติมเครดิต ไม่มีคนนวด — v_daily_summary มีแถวแต่ sessions = 0
  it("มีแถวแต่ sessions เป็น 0 ก็ถือว่า empty", () => {
    const r = buildDailyReport({
      ...base,
      daily: [row("2026-08-04", 0, 0, 3000)],
      commission: 0,
      customers: 0,
    })
    expect(r.empty).toBe(true)
  })

  it("มีบิลอย่างน้อยหนึ่งใบ = ไม่ empty", () => {
    expect(buildDailyReport(base).empty).toBe(false)
  })
})

describe("buildDailyReport — เทียบค่าเฉลี่ย 7 วัน", () => {
  const prior = (days: [string, number, number][]): DailySummaryRow[] =>
    days.map(([d, s, n]) => row(d, s, n))

  it("มีข้อมูลครบ 3 วันขึ้นไปถึงคำนวณ", () => {
    const r = buildDailyReport({
      ...base,
      daily: [
        ...prior([["2026-08-01", 10, 10000], ["2026-08-02", 10, 10000], ["2026-08-03", 10, 10000]]),
        row("2026-08-04", 16, 12000),
      ],
    })
    // เฉลี่ย 10,000 · วันนี้ 12,000 → +20%
    expect(r.vsAvg7dPct).toBeCloseTo(20, 5)
  })

  it("มีข้อมูลย้อนหลังแค่ 2 วัน = ไม่คำนวณ", () => {
    const r = buildDailyReport({
      ...base,
      daily: [
        ...prior([["2026-08-02", 10, 10000], ["2026-08-03", 10, 10000]]),
        row("2026-08-04", 16, 12000),
      ],
    })
    expect(r.vsAvg7dPct).toBeNull()
  })

  // v_daily_summary ไม่มีแถวของวันที่ร้านปิด ถ้าหารด้วย 7 ตายตัว ค่าเฉลี่ยจะต่ำเกินจริง
  it("หารด้วยจำนวนวันที่มีข้อมูลจริง ไม่ใช่ 7 ตายตัว", () => {
    const r = buildDailyReport({
      ...base,
      daily: [
        ...prior([["2026-08-01", 10, 9000], ["2026-08-02", 10, 10000], ["2026-08-03", 10, 11000]]),
        row("2026-08-04", 16, 10000),
      ],
    })
    // เฉลี่ยจาก 3 วัน = 10,000 (ถ้าหารด้วย 7 จะได้ 4,285.7 แล้ว % จะพุ่งผิด)
    expect(r.vsAvg7dPct).toBeCloseTo(0, 5)
  })

  it("วันที่ปิดร้าน (sessions 0) ไม่ถูกนับเป็นฐานเฉลี่ย", () => {
    const r = buildDailyReport({
      ...base,
      daily: [
        ...prior([["2026-08-01", 10, 10000], ["2026-08-02", 0, 0], ["2026-08-03", 10, 10000]]),
        row("2026-08-04", 16, 10000),
      ],
    })
    expect(r.vsAvg7dPct).toBeNull() // เหลือ 2 วัน ไม่ถึงขั้นต่ำ
  })

  it("ไม่นับวันเกิน 7 วันย้อนหลัง และไม่นับวันนี้เข้าฐานเฉลี่ย", () => {
    const r = buildDailyReport({
      ...base,
      daily: [
        row("2026-07-20", 10, 999999), // เกิน 7 วัน ต้องไม่ถูกนับ
        ...prior([["2026-07-29", 10, 10000], ["2026-07-30", 10, 10000], ["2026-08-03", 10, 10000]]),
        row("2026-08-04", 16, 10000),
      ],
    })
    expect(r.vsAvg7dPct).toBeCloseTo(0, 5)
  })
})

describe("buildDailyReport — ยอดสะสมเดือนนี้ (MTD)", () => {
  it("รวมตั้งแต่วันที่ 1 ถึงวันนี้ และเทียบเดือนที่แล้วช่วงวันเท่ากัน", () => {
    const r = buildDailyReport({
      ...base,
      today: "2026-08-03",
      daily: [
        row("2026-07-01", 10, 1000), row("2026-07-02", 10, 1000), row("2026-07-03", 10, 1000),
        row("2026-07-31", 10, 50000), // เกินวันที่ 3 ของเดือนที่แล้ว ต้องไม่ถูกนับ
        row("2026-08-01", 10, 1200), row("2026-08-02", 10, 1200), row("2026-08-03", 10, 1200),
      ],
    })
    expect(r.mtd).toBeCloseTo(3600, 2)
    expect(r.mtdDeltaPct).toBeCloseTo(20, 5) // 3600 vs 3000
  })

  it("เดือนที่แล้วไม่มียอดเลย = ไม่แสดง %", () => {
    const r = buildDailyReport({
      ...base,
      today: "2026-08-03",
      daily: [row("2026-08-01", 10, 1200)],
    })
    expect(r.mtd).toBeCloseTo(1200, 2)
    expect(r.mtdDeltaPct).toBeNull()
  })

  // 31 มี.ค. ย้อนไป ก.พ. ไม่มีวันที่ 31 — addMonths ต้องหดให้เป็นวันสุดท้ายของเดือน
  it("วันที่ไม่มีในเดือนที่แล้ว ใช้วันสุดท้ายของเดือนนั้น", () => {
    const r = buildDailyReport({
      ...base,
      today: "2026-03-31",
      daily: [
        row("2026-02-01", 10, 500), row("2026-02-28", 10, 500),
        row("2026-03-31", 10, 2000),
      ],
    })
    expect(r.mtd).toBeCloseTo(2000, 2)
    expect(r.mtdDeltaPct).toBeCloseTo(100, 5) // 2000 vs 1000
  })
})

describe("buildDailyReport — Action alerts", () => {
  // ข้อความนี้ลอกจากการ์ดเดิมที่เจ้าของร้านอ่านทุกวัน ห้ามเปลี่ยนรูปแบบตัวเลข
  it("เครดิตหมดและใกล้หมด ขึ้นเตือนพร้อมจำนวนคน", () => {
    const r = buildDailyReport({ ...base, memberCreditEmpty: 2, memberCreditLow: 18 })
    expect(r.alerts[0]).toContain("2 คน เครดิตหมด")
    expect(r.alerts[1]).toContain("18 คน เครดิตใกล้หมด")
    expect(r.alerts[1]).toContain("(≤฿1,500)")
  })

  it("ไม่มีสมาชิกเข้าเงื่อนไข = ไม่มีเตือนเรื่องเครดิต", () => {
    expect(buildDailyReport(base).alerts).toEqual([])
  })

  it("เซสชันต่ำกว่าค่าเฉลี่ย 7 วันเกิน 30% ขึ้นเตือน", () => {
    const r = buildDailyReport({
      ...base,
      daily: [
        row("2026-08-01", 20, 10000), row("2026-08-02", 20, 10000), row("2026-08-03", 20, 10000),
        row("2026-08-04", 10, 6000),
      ],
    })
    // เฉลี่ย 20 · วันนี้ 10 = 50% ของค่าเฉลี่ย ต่ำกว่าเกณฑ์ 0.7
    expect(r.alerts.some((a) => a.includes("Sessions ต่ำกว่าค่าเฉลี่ย"))).toBe(true)
    expect(r.alerts.some((a) => a.includes("50%"))).toBe(true)
  })

  it("ข้อมูลย้อนหลังไม่ถึงขั้นต่ำ ไม่ตัดสินเรื่องเซสชัน", () => {
    const r = buildDailyReport({
      ...base,
      daily: [row("2026-08-03", 20, 10000), row("2026-08-04", 1, 500)],
    })
    expect(r.alerts.some((a) => a.includes("Sessions ต่ำกว่า"))).toBe(false)
  })

  it("กำไรขั้นต้นติดลบขึ้นเตือน", () => {
    const r = buildDailyReport({ ...base, commission: 20000 })
    expect(r.alerts.some((a) => a.includes("กำไรขั้นต้นติดลบ"))).toBe(true)
  })

  it("เข้าเงื่อนไขครบทุกข้อ ตัดเหลือ 3 ข้อแรก", () => {
    const r = buildDailyReport({
      ...base,
      commission: 99999,
      memberCreditEmpty: 2,
      memberCreditLow: 18,
      daily: [
        row("2026-08-01", 20, 10000), row("2026-08-02", 20, 10000), row("2026-08-03", 20, 10000),
        row("2026-08-04", 5, 6000),
      ],
    })
    expect(r.alerts).toHaveLength(MAX_ALERTS)
    expect(r.alerts[0]).toContain("เครดิตหมด")
    expect(r.alerts[2]).toContain("Sessions ต่ำกว่า")
  })

  it("วันที่ไม่มีบิลเลย ไม่ต้องเตือนกำไรติดลบ", () => {
    const r = buildDailyReport({ ...base, daily: [], commission: 0, customers: 0 })
    expect(r.alerts.some((a) => a.includes("กำไรขั้นต้นติดลบ"))).toBe(false)
  })
})

const topup = (customer_id: string, tier: string | null, cash_received: number | null): TopupRow => ({
  customer_id, tier, cash_received,
})
const hist = (customer_id: string, topup_date: string): TopupHistoryRow => ({ customer_id, topup_date })

describe("buildDailyReport — สมาชิกที่เติมเงิน", () => {
  it("ลูกค้าที่ไม่เคยเติมมาก่อน นับเป็นสมาชิกใหม่", () => {
    const r = buildDailyReport({
      ...base,
      topups: [topup("c1", "Silver", 5000)],
      topupHistory: [hist("c1", "2026-08-04")],
    })
    expect(r.memberSignups.newCount).toBe(1)
    expect(r.memberSignups.newCash).toBe(5000)
    expect(r.memberSignups.newTiers).toEqual([{ tier: "Silver", count: 1 }])
    expect(r.memberSignups.renewCount).toBe(0)
  })

  it("ลูกค้าที่เคยเติมเมื่อเดือนก่อน นับเป็นต่ออายุ", () => {
    const r = buildDailyReport({
      ...base,
      topups: [topup("c1", "Silver", 5000)],
      topupHistory: [hist("c1", "2026-07-01"), hist("c1", "2026-08-04")],
    })
    expect(r.memberSignups.newCount).toBe(0)
    expect(r.memberSignups.renewCount).toBe(1)
    expect(r.memberSignups.renewCash).toBe(5000)
    expect(r.memberSignups.renewTiers).toEqual([{ tier: "Silver", count: 1 }])
  })

  it("คนเดียวเติมสองครั้งในวันเดียว = ใหม่ 1 ต่ออายุ 1 เงินครบทั้งสองแถว", () => {
    const r = buildDailyReport({
      ...base,
      topups: [topup("c1", "Silver", 5000), topup("c1", "Gold", 8000)],
      topupHistory: [hist("c1", "2026-08-04"), hist("c1", "2026-08-04")],
    })
    expect(r.memberSignups.newCount).toBe(1)
    expect(r.memberSignups.newCash).toBe(5000)
    expect(r.memberSignups.renewCount).toBe(1)
    expect(r.memberSignups.renewCash).toBe(8000)
  })

  it("tier เครดิตคงเหลือ ไม่ถูกนับ", () => {
    const r = buildDailyReport({
      ...base,
      topups: [topup("c1", EXCLUDED_TIER, 1020)],
      topupHistory: [hist("c1", "2026-08-04")],
    })
    expect(r.memberSignups.newCount).toBe(0)
    expect(r.memberSignups.renewCount).toBe(0)
    expect(r.memberSignups.newCash).toBe(0)
  })

  it("เครดิตคงเหลือในประวัติ ไม่ทำให้คนซื้อแพ็กเกจครั้งแรกกลายเป็นต่ออายุ", () => {
    const r = buildDailyReport({
      ...base,
      topups: [topup("c1", "Silver", 5000)],
      topupHistory: [hist("c1", "2026-08-04")],
      // แถว EXCLUDED_TIER ของเมื่อวานถูก route ตัดออกตั้งแต่ query แล้ว
      // เทสนี้ยืนยันว่าไม่มีแถวเก่าเหลือ = ยังนับเป็นใหม่
    })
    expect(r.memberSignups.newCount).toBe(1)
  })

  it("หลาย tier ในวันเดียว เรียงจำนวนมากไปน้อย ยอดเท่ากันเรียงตามชื่อ", () => {
    const r = buildDailyReport({
      ...base,
      topups: [
        topup("c1", "Silver", 5000),
        topup("c2", "Silver", 5000),
        topup("c3", "Gold", 8000),
      ],
      topupHistory: [hist("c1", "2026-08-04"), hist("c2", "2026-08-04"), hist("c3", "2026-08-04")],
    })
    expect(r.memberSignups.newTiers).toEqual([
      { tier: "Silver", count: 2 },
      { tier: "Gold", count: 1 },
    ])
  })

  it("cash_received เป็น null นับรายแต่ยอดเป็น 0", () => {
    const r = buildDailyReport({
      ...base,
      topups: [topup("c1", "Silver", null)],
      topupHistory: [hist("c1", "2026-08-04")],
    })
    expect(r.memberSignups.newCount).toBe(1)
    expect(r.memberSignups.newCash).toBe(0)
  })

  it("tier เป็น null แสดงเป็น ไม่ระบุ", () => {
    const r = buildDailyReport({
      ...base,
      topups: [topup("c1", null, 3000)],
      topupHistory: [hist("c1", "2026-08-04")],
    })
    expect(r.memberSignups.newTiers).toEqual([{ tier: "ไม่ระบุ", count: 1 }])
  })

  it("ไม่มี topup เลย ทุกช่องเป็นศูนย์", () => {
    const r = buildDailyReport(base)
    expect(r.memberSignups).toEqual({
      newCount: 0, newCash: 0, newTiers: [],
      renewCount: 0, renewCash: 0, renewTiers: [],
    })
  })
})
