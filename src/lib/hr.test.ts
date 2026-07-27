import { describe, expect, it } from "vitest"
import { pickStars, summarizeWorkdays, type AttendanceInput, type SaleInput } from "./hr"

const people = [
  { id: "t1", name: "โมเม" },
  { id: "t2", name: "บีบี" },
]

/** ร้านเปิด 3 วัน */
const openDays = ["2026-07-01", "2026-07-02", "2026-07-03"]

const att = (
  personId: string,
  date: string,
  inH = 10,
  outH: number | null = 18,
  estimated = false
): AttendanceInput => ({
  personId,
  workDate: date,
  checkedInAt: `${date}T${String(inH).padStart(2, "0")}:00:00+07:00`,
  checkedOutAt: outH === null ? null : `${date}T${String(outH).padStart(2, "0")}:00:00+07:00`,
  estimated,
})

const sale = (
  therapistId: string,
  date: string,
  opts: Partial<SaleInput> = {}
): SaleInput => ({
  therapistId,
  saleDate: date,
  commission: 200,
  netAmount: 500,
  isRequest: false,
  customerId: null,
  ...opts,
})

describe("summarizeWorkdays — วันทำงาน/ขาด", () => {
  it("นับวันที่มีแถวเข้างานเป็นวันทำงาน", () => {
    const rows = summarizeWorkdays({
      people,
      attendance: [att("t1", "2026-07-01"), att("t1", "2026-07-03")],
      sales: [],
      openDays,
    })
    expect(rows.find((r) => r.personId === "t1")!.daysWorked).toBe(2)
  })

  it("ขาด = วันร้านเปิดที่ไม่มา แต่นับเฉพาะช่วงที่ยังทำงานอยู่", () => {
    // t1 มาวันที่ 1 และ 3 → ขาดวันที่ 2 (อยู่ระหว่างวันแรก-วันสุดท้ายของเขา)
    const rows = summarizeWorkdays({
      people,
      attendance: [att("t1", "2026-07-01"), att("t1", "2026-07-03")],
      sales: [],
      openDays,
    })
    expect(rows.find((r) => r.personId === "t1")!.daysAbsent).toBe(1)
  })

  it("คนที่เพิ่งเข้าวันสุดท้าย ไม่โดนนับขาดย้อนหลัง", () => {
    const rows = summarizeWorkdays({
      people,
      attendance: [att("t2", "2026-07-03")],
      sales: [],
      openDays,
    })
    const t2 = rows.find((r) => r.personId === "t2")!
    expect(t2.daysWorked).toBe(1)
    expect(t2.daysAbsent).toBe(0)
  })

  it("ไม่มีข้อมูลเลยทั้งช่วง = ไม่นับขาด (ยังไม่เข้า/ลาออกไปแล้ว)", () => {
    const rows = summarizeWorkdays({ people, attendance: [], sales: [], openDays })
    expect(rows.every((r) => r.daysAbsent === 0)).toBe(true)
  })

  it("วันที่วางแผนหยุดไว้ (เฟส 2) ไม่นับเป็นขาด", () => {
    const rows = summarizeWorkdays({
      people,
      attendance: [att("t1", "2026-07-01"), att("t1", "2026-07-03")],
      sales: [],
      openDays,
      plannedOffDays: { t1: ["2026-07-02"] },
    })
    expect(rows.find((r) => r.personId === "t1")!.daysAbsent).toBe(0)
  })
})

describe("summarizeWorkdays — ชั่วโมงงาน", () => {
  it("รวมชั่วโมงจากเวลาเข้า-ออก", () => {
    const rows = summarizeWorkdays({
      people,
      attendance: [att("t1", "2026-07-01", 10, 18), att("t1", "2026-07-02", 12, 20)],
      sales: [],
      openDays,
    })
    expect(rows.find((r) => r.personId === "t1")!.hours).toBe(16)
  })

  it("ยังไม่เช็คเอาต์ = ไม่นับชั่วโมงวันนั้น", () => {
    const rows = summarizeWorkdays({
      people,
      attendance: [att("t1", "2026-07-01", 10, null)],
      sales: [],
      openDays,
    })
    expect(rows.find((r) => r.personId === "t1")!.hours).toBe(0)
  })

  it("ติดธงว่ามีเวลาประมาณจากบิลย้อนหลัง", () => {
    const rows = summarizeWorkdays({
      people,
      attendance: [att("t1", "2026-07-01", 10, 18, true)],
      sales: [],
      openDays,
    })
    expect(rows.find((r) => r.personId === "t1")!.hasEstimatedTime).toBe(true)
  })
})

describe("summarizeWorkdays — เงินและคุณภาพบริการ", () => {
  it("รวมบิล ยอดขาย ค่ามือ และเฉลี่ยต่อวัน", () => {
    const rows = summarizeWorkdays({
      people,
      attendance: [att("t1", "2026-07-01"), att("t1", "2026-07-02")],
      sales: [
        sale("t1", "2026-07-01", { commission: 200, netAmount: 500 }),
        sale("t1", "2026-07-01", { commission: 300, netAmount: 700 }),
        sale("t1", "2026-07-02", { commission: 100, netAmount: 300 }),
      ],
      openDays,
    })
    const t1 = rows.find((r) => r.personId === "t1")!
    expect(t1.bills).toBe(3)
    expect(t1.revenue).toBe(1500)
    expect(t1.commission).toBe(600)
    expect(t1.commissionPerDay).toBe(300)
  })

  it("นับรีเควสและคิดเป็น % ของบิลตัวเอง", () => {
    const rows = summarizeWorkdays({
      people,
      attendance: [att("t1", "2026-07-01")],
      sales: [
        sale("t1", "2026-07-01", { isRequest: true }),
        sale("t1", "2026-07-01", { isRequest: true }),
        sale("t1", "2026-07-01"),
        sale("t1", "2026-07-01"),
      ],
      openDays,
    })
    const t1 = rows.find((r) => r.personId === "t1")!
    expect(t1.requests).toBe(2)
    expect(t1.requestPct).toBe(50)
  })

  it("ลูกค้ากลับมาหาซ้ำ = ลูกค้าที่มาหาคนนี้ ≥2 ครั้ง (ไม่นับบิลไม่ผูกชื่อ)", () => {
    const rows = summarizeWorkdays({
      people,
      attendance: [att("t1", "2026-07-01")],
      sales: [
        sale("t1", "2026-07-01", { customerId: "c1" }),
        sale("t1", "2026-07-02", { customerId: "c1" }),
        sale("t1", "2026-07-02", { customerId: "c2" }),
        sale("t1", "2026-07-03", { customerId: null }),
        sale("t1", "2026-07-03", { customerId: null }),
      ],
      openDays,
    })
    expect(rows.find((r) => r.personId === "t1")!.repeatCustomers).toBe(1)
  })

  it("ไม่มีวันทำงาน = ค่าเฉลี่ยเป็น 0 ไม่ใช่ NaN", () => {
    const rows = summarizeWorkdays({ people, attendance: [], sales: [], openDays })
    expect(rows[0].commissionPerDay).toBe(0)
    expect(rows[0].hoursPerDay).toBe(0)
    expect(rows[0].requestPct).toBe(0)
  })
})

describe("pickStars — ดาวเด่นประจำช่วง", () => {
  const rows = summarizeWorkdays({
    people: [...people, { id: "t3", name: "แพต" }],
    attendance: [
      att("t1", "2026-07-01"),
      att("t1", "2026-07-02"),
      att("t1", "2026-07-03"),
      att("t2", "2026-07-01"),
      att("t2", "2026-07-03"),
      att("t3", "2026-07-01"),
      att("t3", "2026-07-02"),
      att("t3", "2026-07-03"),
    ],
    sales: [
      sale("t1", "2026-07-01", { commission: 1000, isRequest: true, customerId: "c1" }),
      sale("t1", "2026-07-02", { commission: 1000, customerId: "c1" }),
      sale("t2", "2026-07-01", { commission: 100, isRequest: true }),
      sale("t2", "2026-07-03", { commission: 100, isRequest: true }),
      sale("t3", "2026-07-01", { commission: 50 }),
    ],
    openDays,
  })

  it("เลือกค่ามือสูงสุด / รีเควสมากสุด / ลูกค้าซ้ำมากสุด", () => {
    const stars = pickStars(rows)
    expect(stars.topCommission?.personId).toBe("t1")
    expect(stars.topRequests?.personId).toBe("t2")
    expect(stars.topRepeat?.personId).toBe("t1")
  })

  it("ขยันที่สุด = ขาดน้อยสุด (เสมอกันเอาคนที่ทำงานมากวันกว่า)", () => {
    const stars = pickStars(rows)
    expect(["t1", "t3"]).toContain(stars.mostDiligent?.personId)
    expect(stars.mostDiligent?.daysAbsent).toBe(0)
  })

  it("ไม่มีข้อมูลเลย = ไม่มีดาวเด่น (ไม่โชว์การ์ด)", () => {
    const empty = summarizeWorkdays({ people, attendance: [], sales: [], openDays })
    const stars = pickStars(empty)
    expect(stars.topCommission).toBeNull()
    expect(stars.topRequests).toBeNull()
    expect(stars.mostDiligent).toBeNull()
  })
})

describe("summarizeWorkdays — วันหยุดตามแผน (เฟส 2)", () => {
  it("นับวันหยุดตามแผนแยกจากขาดงาน", () => {
    const rows = summarizeWorkdays({
      people,
      attendance: [att("t1", "2026-07-01"), att("t1", "2026-07-03")],
      sales: [],
      openDays,
      plannedOffDays: { t1: ["2026-07-02"] },
    })
    const t1 = rows.find((r) => r.personId === "t1")!
    expect(t1.daysPlannedOff).toBe(1)
    expect(t1.daysAbsent).toBe(0)
  })
})
