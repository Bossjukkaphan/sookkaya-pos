import { describe, expect, it } from "vitest"

import {
  looksLikePhone,
  phoneDiff,
  phoneDigits,
  phoneLikeKeys,
  rankSimilarPhones,
} from "./phone-similar"

describe("phoneDigits", () => {
  it("เหลือแต่ตัวเลข — ขีด เว้นวรรค วงเล็บ ตัดออกหมด", () => {
    expect(phoneDigits("064-302-6632")).toBe("0643026632")
    expect(phoneDigits(" 064 302 6632 ")).toBe("0643026632")
    expect(phoneDigits("(064)3026632")).toBe("0643026632")
  })

  it("เบอร์แบบสากล +66 → 0 (เบอร์เดียวกันกับที่ร้านบันทึก)", () => {
    expect(phoneDigits("+66643026632")).toBe("0643026632")
    expect(phoneDigits("0066643026632")).toBe("0643026632")
  })

  it("ค่าว่าง/null → สตริงว่าง", () => {
    expect(phoneDigits(null)).toBe("")
    expect(phoneDigits(undefined)).toBe("")
    expect(phoneDigits("ต้าร์")).toBe("")
  })
})

describe("looksLikePhone", () => {
  it("คำค้นที่เป็นเบอร์ (ยาวพอจะเทียบได้) → จริง", () => {
    expect(looksLikePhone("0643026632")).toBe(true)
    expect(looksLikePhone("064-302-6632")).toBe(true)
    expect(looksLikePhone("+66 64 302 6632")).toBe(true)
    expect(looksLikePhone("02 123 4567")).toBe(true) // เบอร์บ้าน 9 หลัก
  })

  it("ชื่อคน หรือเลขสั้นเกินไป → ไม่ใช่เบอร์ (ไม่ต้องไปเดาเบอร์ใกล้เคียง)", () => {
    expect(looksLikePhone("ต้าร์")).toBe(false)
    expect(looksLikePhone("064")).toBe(false)
    expect(looksLikePhone("0643026")).toBe(false) // 7 หลัก ยังสั้นเกิน
    expect(looksLikePhone("boss 0643026632")).toBe(false) // มีตัวอักษรปน = ค้นด้วยชื่อ
    expect(looksLikePhone("")).toBe(false)
  })
})

describe("phoneDiff", () => {
  it("สลับเลขสองตัว — เคสจริงที่เจอบ่อยสุด (0643206632 vs 0643026632)", () => {
    expect(phoneDiff("0643206632", "0643026632")).toBe("สลับเลข")
    expect(phoneDiff("0865369256", "0865369265")).toBe("สลับเลข")
  })

  it("ต่างกันตัวเดียว", () => {
    expect(phoneDiff("0643026632", "0643026633")).toBe("ต่างกัน 1 ตัว")
    expect(phoneDiff("0943026632", "0643026632")).toBe("ต่างกัน 1 ตัว")
  })

  it("พิมพ์ขาด/เกินไปหนึ่งตัว", () => {
    expect(phoneDiff("064302663", "0643026632")).toBe("ขาด/เกิน 1 ตัว")
    expect(phoneDiff("06430266322", "0643026632")).toBe("ขาด/เกิน 1 ตัว")
    expect(phoneDiff("643026632", "0643026632")).toBe("ขาด/เกิน 1 ตัว")
  })

  it("ตัวเลขชุดเดียวกันแต่เก็บต่างรูปแบบ → เบอร์เดียวกัน (ค้นด้วย ilike ไม่เจอ)", () => {
    expect(phoneDiff("0643026632", "064-302-6632")).toBe("เบอร์เดียวกัน")
  })

  it("ต่างกันเกินกว่านั้น → ไม่ใช่เบอร์ใกล้เคียง", () => {
    expect(phoneDiff("0643026632", "0812345678")).toBeNull()
    expect(phoneDiff("0643026632", "0643020000")).toBeNull() // ต่าง 2 ตัว แบบไม่ใช่สลับ
    expect(phoneDiff("0643026632", "06430266")).toBeNull() // สั้นไป 2 ตัว
    expect(phoneDiff("0643026632", "")).toBeNull()
    expect(phoneDiff("0643026632", null)).toBeNull()
  })
})

describe("phoneLikeKeys", () => {
  it("คืนหัว 4 ตัวและท้าย 4 ตัว — ใช้แคบวงก่อนดึงจากฐานข้อมูล", () => {
    expect(phoneLikeKeys("064-302-6632")).toEqual({ head: "0643", tail: "6632" })
  })

  it("คำค้นที่ไม่ใช่เบอร์ → null (ไม่ต้องยิง query)", () => {
    expect(phoneLikeKeys("ต้าร์")).toBeNull()
    expect(phoneLikeKeys("064")).toBeNull()
  })
})

describe("rankSimilarPhones", () => {
  const rows = [
    { id: "a", name: "ต้าร์", nickname: null, phone: "0643026632" }, // สลับเลข
    { id: "b", name: "คนอื่น", nickname: null, phone: "0812345678" }, // ไม่เกี่ยว
    { id: "c", name: "ต้าร์ (บันทึกไม่ครบ)", nickname: null, phone: "064320663" }, // ขาด 1 ตัว
    { id: "d", name: "ไม่มีเบอร์", nickname: null, phone: null },
  ]

  it("คัดเฉพาะเบอร์ที่ใกล้เคียงจริง และเรียงจากน่าจะเป็นที่สุด", () => {
    const found = rankSimilarPhones("0643206632", rows)
    expect(found.map((f) => f.id)).toEqual(["a", "c"])
    expect(found[0].reason).toBe("สลับเลข")
    expect(found[1].reason).toBe("ขาด/เกิน 1 ตัว")
  })

  it("จำกัดจำนวนที่แสดง — รายการยาวไม่ช่วยให้ตัดสินใจเร็วขึ้น", () => {
    expect(rankSimilarPhones("0643206632", rows, 1)).toHaveLength(1)
  })

  it("คำค้นที่ไม่ใช่เบอร์ → ว่าง", () => {
    expect(rankSimilarPhones("ต้าร์", rows)).toEqual([])
  })

  it("เบอร์ที่ตรงเป๊ะไม่ต้องเตือน — ช่องค้นหาปกติเจอเองแล้ว", () => {
    expect(rankSimilarPhones("0643026632", rows).map((f) => f.id)).not.toContain("a")
  })
})
