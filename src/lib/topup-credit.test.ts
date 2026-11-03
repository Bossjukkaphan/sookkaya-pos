import { describe, expect, it } from "vitest"

import {
  bucketUsableOn,
  planCreditSplit,
  usableCreditOn,
  validateSplit,
  weightedRecognizeRatio,
  type TopupBucket,
} from "./topup-credit"

const bucket = (over: Partial<TopupBucket> & { topupId: string }): TopupBucket => ({
  tier: "Silver",
  topupDate: "2026-01-01",
  expiryDate: "2026-07-01",
  remaining: 1000,
  recognizeRatio: 5000 / 6000,
  isActive: true,
  ...over,
})

describe("bucketUsableOn", () => {
  it("ใบปกติใช้ได้ · วันหมดอายุวันนั้นพอดียังใช้ได้ทั้งวัน", () => {
    const b = bucket({ topupId: "a" })
    expect(bucketUsableOn(b, "2026-06-30")).toBe(true)
    expect(bucketUsableOn(b, "2026-07-01")).toBe(true)
    expect(bucketUsableOn(b, "2026-07-02")).toBe(false)
  })
  it("ใบที่ซื้อหลังวันบิล / ปิดใช้งาน = ตัดไม่ได้", () => {
    expect(bucketUsableOn(bucket({ topupId: "a", topupDate: "2026-05-01" }), "2026-04-30")).toBe(false)
    expect(bucketUsableOn(bucket({ topupId: "a", isActive: false }), "2026-03-01")).toBe(false)
  })
})

describe("planCreditSplit — อัตโนมัติ ใกล้หมดอายุก่อน", () => {
  const near = bucket({ topupId: "near", expiryDate: "2026-05-01", remaining: 600 })
  const far = bucket({ topupId: "far", expiryDate: "2026-12-01", remaining: 5000 })

  it("ใบเดียวพอ → ตัดใบใกล้หมดอายุก่อน", () => {
    const r = planCreditSplit({ buckets: [far, near], amount: 500, onDate: "2026-03-01" })
    expect(r).toMatchObject({ ok: true, parts: [{ topupId: "near", amount: 500 }] })
  })
  it("ใบแรกไม่พอ → ไหลไปใบถัดไปอัตโนมัติ (แบ่งสองใบ)", () => {
    const r = planCreditSplit({ buckets: [far, near], amount: 1000, onDate: "2026-03-01" })
    expect(r).toMatchObject({
      ok: true,
      parts: [
        { topupId: "near", amount: 600 },
        { topupId: "far", amount: 400 },
      ],
    })
  })
  it("ใบหมดอายุถูกข้าม — เงินในใบนั้นไม่ถูกนับ", () => {
    const r = planCreditSplit({ buckets: [far, near], amount: 1000, onDate: "2026-06-01" })
    expect(r).toMatchObject({ ok: true, parts: [{ topupId: "far", amount: 1000 }] })
  })
  it("ใช้ได้ไม่พอแต่มีใบแช่แข็ง → เหตุผลคือ expired (ชวนต่ออายุ ไม่ใช่เก็บเงินเพิ่ม)", () => {
    const r = planCreditSplit({ buckets: [near], amount: 300, onDate: "2026-08-01" })
    expect(r).toMatchObject({ ok: false, reason: "expired" })
  })
  it("ไม่เคยมีใบเลย → expired พร้อมข้อความยังไม่เคยซื้อแพ็กเกจ", () => {
    const r = planCreditSplit({ buckets: [], amount: 300, onDate: "2026-08-01" })
    expect(r).toMatchObject({ ok: false, reason: "expired" })
  })
  it("ใบใช้ได้มีแต่ยอดรวมไม่ถึง → insufficient", () => {
    const r = planCreditSplit({ buckets: [near], amount: 700, onDate: "2026-03-01" })
    expect(r).toMatchObject({ ok: false, reason: "insufficient" })
  })
  it("แก้บิล: โควตาที่บิลเคยตัดจากใบที่หมดอายุไปแล้ว ยังใช้ได้เท่าเดิม", () => {
    const expired = bucket({ topupId: "old", expiryDate: "2026-05-01", remaining: 0 })
    const r = planCreditSplit({
      buckets: [expired, far],
      amount: 500,
      onDate: "2026-06-01",
      already: new Map([["old", 500]]),
    })
    // ใบเดิมของบิลมาก่อนเสมอ — ไม่ย้ายใบโดยไม่จำเป็น
    expect(r).toMatchObject({ ok: true, parts: [{ topupId: "old", amount: 500 }] })
  })
})

describe("validateSplit — พนักงานแก้การแบ่งเอง", () => {
  const a = bucket({ topupId: "a", remaining: 600, expiryDate: "2026-05-01" })
  const b = bucket({ topupId: "b", remaining: 5000, expiryDate: "2026-12-01" })

  it("แบ่งถูกต้อง ผ่าน", () => {
    const r = validateSplit({
      parts: [
        { topupId: "b", amount: 700 },
        { topupId: "a", amount: 300 },
      ],
      buckets: [a, b],
      amount: 1000,
      onDate: "2026-03-01",
    })
    expect(r.ok).toBe(true)
  })
  it("ตัดเกินยอดใบ / รวมไม่เท่ายอดบิล / ใบคนอื่น → ไม่ผ่าน", () => {
    expect(
      validateSplit({ parts: [{ topupId: "a", amount: 700 }], buckets: [a, b], amount: 700, onDate: "2026-03-01" }).ok
    ).toBe(false)
    expect(
      validateSplit({ parts: [{ topupId: "b", amount: 900 }], buckets: [a, b], amount: 1000, onDate: "2026-03-01" }).ok
    ).toBe(false)
    expect(
      validateSplit({ parts: [{ topupId: "zzz", amount: 100 }], buckets: [a, b], amount: 100, onDate: "2026-03-01" }).ok
    ).toBe(false)
  })
  it("ใบหมดอายุตัดใหม่ไม่ได้ แต่โควตาเดิมของบิลตัดได้", () => {
    const old = bucket({ topupId: "old", remaining: 100, expiryDate: "2026-01-31" })
    expect(
      validateSplit({ parts: [{ topupId: "old", amount: 50 }], buckets: [old], amount: 50, onDate: "2026-03-01" }).ok
    ).toBe(false)
    expect(
      validateSplit({
        parts: [{ topupId: "old", amount: 50 }],
        buckets: [old],
        amount: 50,
        onDate: "2026-03-01",
        already: new Map([["old", 80]]),
      }).ok
    ).toBe(true)
  })
})

describe("weightedRecognizeRatio — รายได้รับรู้ตามใบที่ตัดจริง", () => {
  it("ถ่วงน้ำหนักตามยอดต่อใบ", () => {
    const silver = bucket({ topupId: "s", recognizeRatio: 5000 / 6000 })
    const leftover = bucket({ topupId: "l", recognizeRatio: 1 }) // เครดิตยอดเกิน ไม่มีโบนัส
    const ratio = weightedRecognizeRatio(
      [
        { topupId: "s", amount: 600 },
        { topupId: "l", amount: 400 },
      ],
      [silver, leftover]
    )
    expect(ratio).toBeCloseTo((600 * (5000 / 6000) + 400 * 1) / 1000, 10)
  })
  it("ไม่มีการตัด → 1 (ไม่กระทบสูตร)", () => {
    expect(weightedRecognizeRatio([], [])).toBe(1)
  })
})

describe("usableCreditOn", () => {
  it("นับเฉพาะใบที่ตัดได้จริง ณ วันบิล", () => {
    const list = [
      bucket({ topupId: "a", remaining: 600, expiryDate: "2026-05-01" }),
      bucket({ topupId: "b", remaining: 400, expiryDate: "2026-12-01" }),
      bucket({ topupId: "c", remaining: 999, isActive: false }),
    ]
    expect(usableCreditOn(list, "2026-06-01")).toBe(400)
    expect(usableCreditOn(list, "2026-03-01")).toBe(1000)
  })
})
