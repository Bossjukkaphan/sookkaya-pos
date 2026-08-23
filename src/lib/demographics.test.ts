import { describe, expect, it } from "vitest"

import { ageBucket, demographicBreakdown } from "./demographics"

describe("ageBucket", () => {
  const today = "2026-08-21"

  it("แบ่งช่วงตามอายุจริง ณ วันนี้", () => {
    expect(ageBucket("2010-01-01", today)).toBe("ต่ำกว่า 20")
    expect(ageBucket("1998-05-10", today)).toBe("20-29")
    expect(ageBucket("1990-12-01", today)).toBe("30-39")
    expect(ageBucket("1980-01-15", today)).toBe("40-49")
    expect(ageBucket("1970-06-30", today)).toBe("50-59")
    expect(ageBucket("1960-02-02", today)).toBe("60+")
  })

  it("ขอบพอดี: ครบ 20/30 ปีวันนี้เข้าช่วงบน · พรุ่งนี้ค่อยครบยังอยู่ช่วงล่าง", () => {
    expect(ageBucket("2006-08-21", today)).toBe("20-29") // ครบ 20 วันนี้พอดี
    expect(ageBucket("2006-08-22", today)).toBe("ต่ำกว่า 20") // ครบ 20 พรุ่งนี้
    expect(ageBucket("1996-08-21", today)).toBe("30-39")
    expect(ageBucket("1996-08-22", today)).toBe("20-29")
  })

  it("วันเกิด 29 ก.พ. — ปีไม่มี 29 ก.พ. ถือว่าครบรอบเมื่อถึง 1 มี.ค. (แนวเดียวกับ daysUntilBirthday)", () => {
    // เกิด 2000-02-29 · วันนี้ 2026-02-28 → ยังไม่ครบ 26 = อายุ 25
    expect(ageBucket("2000-02-29", "2026-02-28")).toBe("20-29")
    // 2026-03-01 → ครบ 26 แล้ว (ยังช่วงเดิม แค่ยืนยันไม่พัง)
    expect(ageBucket("2000-02-29", "2026-03-01")).toBe("20-29")
  })

  it("ไม่มีวันเกิด → null (ไม่ทราบ)", () => {
    expect(ageBucket(null, today)).toBeNull()
  })
})

describe("demographicBreakdown", () => {
  const today = "2026-08-21"
  const cust = (
    id: string,
    gender: string | null,
    birthday: string | null,
    nationality: string | null = null
  ) => ({ id, gender, birthday, nationality })
  const bill = (
    customer_id: string | null,
    net: number,
    recognize: number | null = null
  ) => ({ customer_id, net_amount: net, revenue_recognize: recognize })

  it("นับลูกค้ายูนีค ยอดรวมทุกบิล และบิลไม่ระบุชื่อแยกไว้", () => {
    const r = demographicBreakdown(
      [cust("a", "หญิง", "1990-01-01"), cust("b", "ชาย", null)],
      [bill("a", 500), bill("a", 300), bill("b", 400), bill(null, 900)],
      today
    )
    expect(r.population).toBe(2)
    expect(r.unnamedBills).toBe(1)
    const female = r.gender.find((g) => g.label === "หญิง")!
    expect(female.customers).toBe(1)
    expect(female.revenue).toBe(800)
    expect(female.avgPerCustomer).toBe(800)
    expect(female.avgVisits).toBe(2)
  })

  it("รายได้ยึด revenue_recognize ก่อน net_amount (กติกากลาง) และรับค่า string จาก PostgREST", () => {
    const r = demographicBreakdown(
      [cust("a", "หญิง", null)],
      [{ customer_id: "a", net_amount: "1000", revenue_recognize: "250" }],
      today
    )
    expect(r.gender[0].revenue).toBe(250)
  })

  it("เพศ/อายุ/สัญชาติที่ไม่รู้ → แถว 'ไม่ทราบ' เสมอ และอยู่ท้ายลิสต์", () => {
    const r = demographicBreakdown(
      [cust("a", null, null), cust("b", "หญิง", "1990-01-01")],
      [bill("a", 100), bill("b", 100)],
      today
    )
    expect(r.gender[r.gender.length - 1].label).toBe("ไม่ทราบ")
    expect(r.age[r.age.length - 1].label).toBe("ไม่ทราบ")
    expect(r.nationality[r.nationality.length - 1].label).toBe("ไม่ทราบ")
  })

  it("ช่วงอายุเรียงตามลำดับช่วงเสมอ (ไม่ใช่ตามจำนวน)", () => {
    const r = demographicBreakdown(
      [cust("a", null, "1960-01-01"), cust("b", null, "1998-01-01"), cust("c", null, null)],
      [bill("a", 100), bill("b", 100), bill("c", 100)],
      today
    )
    expect(r.age.map((g) => g.label)).toEqual(["20-29", "60+", "ไม่ทราบ"])
  })

  it("เปอร์เซ็นต์ความครอบคลุมนับจากประชากรที่มีบิล ไม่ใช่ลูกค้าทั้งระบบ", () => {
    const r = demographicBreakdown(
      [
        cust("a", "หญิง", "1990-01-01"),
        cust("b", null, null),
        cust("no-bill", "ชาย", "1980-01-01"), // ไม่มีบิล — ต้องไม่ถูกนับ
      ],
      [bill("a", 100), bill("b", 100)],
      today
    )
    expect(r.population).toBe(2)
    expect(r.genderKnownPct).toBe(50)
    expect(r.ageKnownPct).toBe(50)
  })

  it("ไม่มีบิลเลย → ทุกอย่างเป็นศูนย์ ไม่มี NaN", () => {
    const r = demographicBreakdown([cust("a", "หญิง", null)], [], today)
    expect(r).toEqual({
      population: 0, unnamedBills: 0, genderKnownPct: 0, ageKnownPct: 0,
      gender: [], age: [], nationality: [],
    })
  })

  it("บิลของลูกค้าที่ไม่อยู่ในลิสต์ลูกค้า (ข้อมูลหลุดจังหวะ) → นับเป็นไม่ทราบ ไม่ throw", () => {
    const r = demographicBreakdown([], [bill("ghost", 100)], today)
    expect(r.population).toBe(1)
    expect(r.gender[0].label).toBe("ไม่ทราบ")
  })
})
