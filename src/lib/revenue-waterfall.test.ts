import { describe, expect, it } from "vitest"

import { revenueWaterfall } from "./revenue-waterfall"

const round2 = (n: number) => Math.round(n * 100) / 100

describe("revenueWaterfall", () => {
  it("ไม่มีค่าห้องสปา — ให้ผลเท่าสูตรเดิมเป๊ะ (gross = volume + ส่วนลด)", () => {
    expect(revenueWaterfall({ volume: 135112, discount: 5618, roomFee: 0 })).toEqual({
      gross: 140730,
      roomFee: 0,
      discount: 5618,
      volume: 135112,
    })
  })

  it("มีค่าห้องสปา — ถอดออกจากมูลค่าเต็มตามเมนู ไม่ให้กลืนอยู่ข้างใน", () => {
    // เคสจริงช่วง 1-10 ส.ค. 2026: ค่าห้อง 100 บาทหนึ่งใบ
    // สูตรเดิมให้ gross = 140,830 ซึ่งกลืนค่าห้องไว้เงียบ ๆ
    expect(revenueWaterfall({ volume: 135212, discount: 5618, roomFee: 100 })).toEqual({
      gross: 140730,
      roomFee: 100,
      discount: 5618,
      volume: 135212,
    })
  })

  it("สมการต้องลงตัวเสมอ: gross + ค่าห้อง − ส่วนลด = ยอดรับจริง", () => {
    const cases = [
      { volume: 0, discount: 0, roomFee: 0 },
      { volume: 590, discount: 0, roomFee: 100 },
      { volume: 20880, discount: 1200, roomFee: 300 },
      { volume: 128932.02, discount: 5618, roomFee: 100 },
      { volume: 135212, discount: 0, roomFee: 0 },
    ]
    for (const c of cases) {
      const w = revenueWaterfall(c)
      expect(round2(w.gross + w.roomFee - w.discount)).toBe(w.volume)
    }
  })

  it("ยอดที่มีเศษสตางค์ไม่เพี้ยนจาก floating point", () => {
    const w = revenueWaterfall({ volume: 128932.02, discount: 5618, roomFee: 100 })
    expect(w.gross).toBe(134450.02)
    expect(w.volume).toBe(128932.02)
  })

  it("ค่าห้องติดลบถือเป็นศูนย์ — ข้อมูลเพี้ยนต้องไม่ทำให้มูลค่าเมนูบวมขึ้น", () => {
    expect(revenueWaterfall({ volume: 500, discount: 0, roomFee: -100 })).toEqual({
      gross: 500,
      roomFee: 0,
      discount: 0,
      volume: 500,
    })
  })

  it("วันที่ไม่มีบิลขายเลย (มีแต่เติมเงิน) — ทุกยอดเป็นศูนย์ ไม่ใช่ NaN", () => {
    expect(revenueWaterfall({ volume: 0, discount: 0, roomFee: 0 })).toEqual({
      gross: 0,
      roomFee: 0,
      discount: 0,
      volume: 0,
    })
  })
})
