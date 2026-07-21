import { describe, expect, it } from "vitest"
import { creditBucket, summarizeCredit } from "./member-credit"

describe("creditBucket", () => {
  it("แบ่งช่องตามขอบเขตของแดชบอร์ดเดิม", () => {
    expect(creditBucket(0)).toBe("empty")
    expect(creditBucket(1)).toBe("low")
    expect(creditBucket(1500)).toBe("low")
    expect(creditBucket(1501)).toBe("mid")
    expect(creditBucket(3000)).toBe("mid")
    expect(creditBucket(3001)).toBe("ok")
  })

  it("ยอดติดลบนับเป็นหมดแล้ว ไม่หายไปจากทุกช่อง", () => {
    expect(creditBucket(-1300)).toBe("empty")
  })
})

describe("summarizeCredit", () => {
  it("นับครบทุกคนและรวมภาระเฉพาะยอดบวก", () => {
    const s = summarizeCredit([
      { balance: 0 },
      { balance: -1300 },
      { balance: 190 },
      { balance: 2000 },
      { balance: 6000 },
    ])

    expect(s.counts).toEqual({ empty: 2, low: 1, mid: 1, ok: 1 })
    expect(s.liability).toBe(8190)
    // ทุกคนต้องอยู่สักช่อง ไม่งั้นเจ้าของร้านจะนับหัวไม่ครบ
    const total = Object.values(s.counts).reduce((a, b) => a + b, 0)
    expect(total).toBe(5)
  })

  it("ไม่มีสมาชิกเลยก็ได้ศูนย์ทุกช่อง ไม่ throw", () => {
    expect(summarizeCredit([])).toEqual({
      counts: { empty: 0, low: 0, mid: 0, ok: 0 },
      liability: 0,
    })
  })
})
