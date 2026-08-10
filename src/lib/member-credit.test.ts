import { describe, expect, it } from "vitest"
import { CREDIT_LOW_MAX, creditBucket } from "./member-credit"

describe("creditBucket", () => {
  it("แบ่งช่องตามขอบเขตของแดชบอร์ดเดิม", () => {
    expect(creditBucket(0)).toBe("empty")
    expect(creditBucket(1)).toBe("low")
    expect(creditBucket(CREDIT_LOW_MAX)).toBe("low")
    expect(creditBucket(CREDIT_LOW_MAX + 1)).toBe("mid")
    expect(creditBucket(3000)).toBe("mid")
    expect(creditBucket(3001)).toBe("ok")
  })

  it("ยอดติดลบนับเป็นหมดแล้ว ไม่หายไปจากทุกช่อง", () => {
    expect(creditBucket(-1300)).toBe("empty")
  })
})
