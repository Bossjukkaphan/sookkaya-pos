import { describe, expect, it } from "vitest"
import { deriveCardStatus } from "./queue-status"

// ตัวช่วยอ่านง่าย: การ์ดเริ่ม 10:00 (600) นวด 60 นาที → จบ 11:00 (660)
const card = (status: string, saleId: string | null = null) => ({
  status,
  start_time: "10:00",
  duration_min: 60,
  sale_id: saleId,
})

describe("deriveCardStatus — ชิพนวด (คำนวณจากเวลา)", () => {
  it("ยังไม่ถึงเวลา + ยังไม่กดเริ่ม = รอเริ่ม", () => {
    expect(deriveCardStatus(card("waiting"), 590).service).toBe("waiting")
  })
  it("กดเริ่มบริการแล้ว = กำลังนวด", () => {
    expect(deriveCardStatus(card("in_service"), 620).service).toBe("in_service")
  })
  it("เลยเวลาจบ = เสร็จสิ้นอัตโนมัติ (ไม่ต้องกด)", () => {
    expect(deriveCardStatus(card("in_service"), 660).service).toBe("done")
    expect(deriveCardStatus(card("in_service"), 700).service).toBe("done")
  })
  it("การ์ดจ่ายแล้ว (status=paid เดิม): ก่อนเริ่ม=รอเริ่ม ระหว่าง=กำลังนวด หลังจบ=เสร็จสิ้น", () => {
    expect(deriveCardStatus(card("paid", "s1"), 590).service).toBe("waiting")
    expect(deriveCardStatus(card("paid", "s1"), 630).service).toBe("in_service")
    expect(deriveCardStatus(card("paid", "s1"), 661).service).toBe("done")
  })
})

describe("deriveCardStatus — ชิพจ่ายเงิน (อิสระจากนวด)", () => {
  it("ผูกบิลแล้ว = ชำระแล้ว ไม่ว่าสถานะนวดใด", () => {
    expect(deriveCardStatus(card("in_service", "s1"), 620).paid).toBe(true)
    expect(deriveCardStatus(card("paid", "s1"), 700).paid).toBe(true)
  })
  it("เสร็จสิ้นแล้วแต่ยังไม่จ่าย = รอชำระ (เตือน)", () => {
    const r = deriveCardStatus(card("in_service"), 670)
    expect(r.service).toBe("done")
    expect(r.paid).toBe(false)
    expect(r.awaitingPayment).toBe(true)
  })
  it("ยังนวดอยู่และยังไม่จ่าย = ไม่ใช่รอชำระ", () => {
    expect(deriveCardStatus(card("in_service"), 620).awaitingPayment).toBe(false)
  })
})

describe("deriveCardStatus — ตัวจับเวลา", () => {
  it("กำลังนวด: เหลือกี่นาที", () => {
    expect(deriveCardStatus(card("in_service"), 620).remainingMin).toBe(40)
  })
  it("เสร็จสิ้นแต่ยังไม่จ่าย: เกินมากี่นาที", () => {
    expect(deriveCardStatus(card("in_service"), 664).overdueMin).toBe(4)
  })
  it("เสร็จสิ้นและจ่ายแล้ว: ไม่ต้องเตือนเวลา", () => {
    const r = deriveCardStatus(card("paid", "s1"), 700)
    expect(r.overdueMin).toBeUndefined()
  })
  it("รอเริ่มแต่เลยเวลานัดแล้ว: เตือนสาย", () => {
    expect(deriveCardStatus(card("waiting"), 615).lateStartMin).toBe(15)
  })
})

describe("deriveCardStatus — นับจากเวลาเริ่มนวดจริง ไม่ใช่เวลาจอง", () => {
  // จอง 10:00 นวด 60 นาที แต่ลูกค้ามาสาย เริ่มจริง 10:30 → ต้องจบ 11:30 ไม่ใช่ 11:00
  const late = (status: string, saleId: string | null = null) => ({
    status,
    start_time: "10:00",
    duration_min: 60,
    sale_id: saleId,
    started_at: "2026-07-30T10:30:00+07:00",
  })

  it("เหลืออีกกี่นาที นับจากเวลาเริ่มจริง", () => {
    // 11:00 (660) — เริ่มจริง 10:30 ผ่านไป 30 นาที ต้องเหลือ 30
    expect(deriveCardStatus(late("in_service"), 660).remainingMin).toBe(30)
  })

  it("ยังไม่เสร็จตอน 11:00 เพราะเพิ่งเริ่ม 10:30", () => {
    expect(deriveCardStatus(late("in_service"), 660).service).toBe("in_service")
    expect(deriveCardStatus(late("in_service"), 690).service).toBe("done")
  })

  it("การ์ดที่จ่ายเงินแล้วก็ต้องนับจากเวลาเริ่มจริงเหมือนกัน", () => {
    // เคสที่เจอบ่อยสุด: กดชำระจาก POS การ์ดเป็น paid แล้วป้ายขึ้น "เหลือ N น."
    expect(deriveCardStatus(late("paid", "s1"), 660).remainingMin).toBe(30)
  })

  it("เกินเวลากี่นาที นับจากเวลาจบจริง", () => {
    // 11:40 (700) — จบจริง 11:30 เกินมา 10 นาที (ของเดิมนับจากจอง จะได้ 40)
    expect(deriveCardStatus(late("in_service"), 700).overdueMin).toBe(10)
  })

  it("ป้าย “สาย” ยังนับจากเวลาจองเหมือนเดิม — หมายถึงเลยเวลานัดแล้วยังไม่ได้เริ่ม", () => {
    expect(deriveCardStatus(card("waiting"), 615).lateStartMin).toBe(15)
  })

  it("ยังไม่กดเริ่มนวด = ใช้เวลาจองไปก่อนเหมือนเดิม", () => {
    expect(deriveCardStatus(card("in_service"), 620).remainingMin).toBe(40)
  })
})
