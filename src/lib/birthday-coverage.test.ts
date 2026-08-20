import { describe, expect, it } from "vitest"

import { birthdayCoverage } from "./birthday-coverage"

const cust = (id: string, name: string, birthday: string) => ({
  id, name, nickname: null, birthday,
})
/** contact แถวหนึ่ง: อวยพรลูกค้า id ตอนเวลาไทย bkkDate (แปลงเป็น UTC ให้เอง) */
const contact = (
  customer_id: string,
  bkkDate: string,
  time = "10:00",
  result: string | null = "contacted"
) => ({
  customer_id,
  created_at: new Date(`${bkkDate}T${time}:00+07:00`).toISOString(),
  result,
})

describe("birthdayCoverage", () => {
  const today = "2026-08-20"

  it("อวยพรวันเดียวกับวันเกิด → นับว่าส่งแล้ว", () => {
    const r = birthdayCoverage(
      [cust("a", "น้ำ", "1990-08-16")],
      [contact("a", "2026-08-16")],
      today,
      30
    )
    expect(r.total).toBe(1)
    expect(r.greeted).toBe(1)
    expect(r.pct).toBe(100)
    expect(r.missed).toEqual([])
  })

  it("อวยพรช้าไปวันนึง (ดึกแล้วส่งเช้าวันรุ่งขึ้น) → ยังนับว่าส่ง", () => {
    const r = birthdayCoverage(
      [cust("a", "น้ำ", "1990-08-16")],
      [contact("a", "2026-08-17", "09:00")],
      today, 30
    )
    expect(r.greeted).toBe(1)
  })

  it("ทักล่วงหน้าตามการ์ด 🎂 (ไม่เกิน 7 วันก่อนวันเกิด) → นับว่าส่ง", () => {
    // หน้า /crm โชว์วันเกิดล่วงหน้า 7 วัน และพอกดบันทึกแล้วชื่อหลุดลิสต์ไป 30 วัน
    // จึงกดซ้ำในวันเกิดจริงไม่ได้ — ถ้าไม่นับช่วงนี้ ร้านที่ทักล่วงหน้าจะได้ 0% ทั้งที่ทำถูก
    const r = birthdayCoverage(
      [cust("a", "น้ำ", "1990-08-16")],
      [contact("a", "2026-08-11")],
      today, 30
    )
    expect(r.greeted).toBe(1)
    expect(r.missed).toEqual([])
  })

  it("ทักล่วงหน้าเกิน 7 วัน → ไม่นับ (คนละรอบ)", () => {
    const r = birthdayCoverage(
      [cust("a", "น้ำ", "1990-08-16")],
      [contact("a", "2026-08-08")],
      today, 30
    )
    expect(r.greeted).toBe(0)
    expect(r.missed).toEqual([{ customerId: "a", name: "น้ำ", date: "2026-08-16" }])
  })

  it("อวยพรช้าเกิน 1 วัน → ไม่นับ", () => {
    const r = birthdayCoverage(
      [cust("a", "น้ำ", "1990-08-16")],
      [contact("a", "2026-08-19")],
      today, 30
    )
    expect(r.greeted).toBe(0)
  })

  it("เบอร์ผิด = ลูกค้าไม่ได้รับอะไรเลย → ไม่นับว่าส่ง", () => {
    const r = birthdayCoverage(
      [cust("a", "น้ำ", "1990-08-16")],
      [contact("a", "2026-08-16", "10:00", "wrong_number")],
      today, 30
    )
    expect(r.greeted).toBe(0)
    expect(r.missed[0].name).toBe("น้ำ")
  })

  it("ติดต่อได้แต่ลูกค้าปฏิเสธข้อเสนอ → ยังนับว่าส่งถึงตัวแล้ว", () => {
    const r = birthdayCoverage(
      [cust("a", "น้ำ", "1990-08-16")],
      [contact("a", "2026-08-16", "10:00", "declined")],
      today, 30
    )
    expect(r.greeted).toBe(1)
  })

  it("วันเกิดวันนี้ที่ยังไม่ส่ง — ไม่นับเป็นตกหล่น (ยังส่งทันอยู่)", () => {
    const r = birthdayCoverage([cust("a", "ตั๊ก", "1990-08-20")], [], today, 30)
    expect(r.total).toBe(0)
    expect(r.missed).toEqual([])
  })

  it("นอกช่วงที่ดู → ไม่นับ", () => {
    // ดูย้อน 7 วัน (13-19 ส.ค.) วันเกิด 5 ส.ค. อยู่นอกช่วง
    const r = birthdayCoverage([cust("a", "ก้อย", "1990-08-05")], [], today, 7)
    expect(r.total).toBe(0)
  })

  it("หลายคน — คิด % และเรียงคนที่ตกหล่นใหม่สุดก่อน", () => {
    const r = birthdayCoverage(
      [
        cust("a", "ใบเตย", "1990-08-01"),
        cust("b", "พลอย", "1990-08-03"),
        cust("c", "น้ำ", "1990-08-16"),
        cust("d", "วรวิทย์", "1990-08-18"),
      ],
      [contact("c", "2026-08-16"), contact("d", "2026-08-18")],
      today, 30
    )
    expect(r.total).toBe(4)
    expect(r.greeted).toBe(2)
    expect(r.pct).toBe(50)
    expect(r.missed.map((m) => m.name)).toEqual(["พลอย", "ใบเตย"])
  })

  it("ไม่มีวันเกิดในช่วง → 0 ทุกช่อง และ % เป็น 0 ไม่ใช่ NaN", () => {
    const r = birthdayCoverage([], [], today, 30)
    expect(r).toEqual({ total: 0, greeted: 0, pct: 0, missed: [] })
  })

  it("ใช้ชื่อเล่นถ้ามี — พนักงานเรียกชื่อนั้น", () => {
    const r = birthdayCoverage(
      [{ id: "a", name: "สุกัญญา พึ่งอ่ำ", nickname: "น้ำ", birthday: "1990-08-16" }],
      [], today, 30
    )
    expect(r.missed[0].name).toBe("น้ำ")
  })

  it("ลูกค้าไม่มีวันเกิด → ข้ามไป ไม่พัง", () => {
    const r = birthdayCoverage(
      [{ id: "a", name: "x", nickname: null, birthday: null }],
      [], today, 30
    )
    expect(r.total).toBe(0)
  })
})
