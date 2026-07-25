import { describe, expect, it } from "vitest"
import { createHmac } from "node:crypto"
import { verifyLineSignature } from "./line-signature"

const secret = "test-channel-secret"
const body = JSON.stringify({ events: [{ type: "message", source: { type: "group", groupId: "C1" } }] })
const sign = (raw: string, key: string) => createHmac("sha256", key).update(raw).digest("base64")

describe("ตรวจลายเซ็น webhook ของ LINE", () => {
  it("ลายเซ็นถูกต้อง → ผ่าน", () => {
    expect(verifyLineSignature(body, sign(body, secret), secret)).toBe(true)
  })
  it("body ถูกแก้หลังเซ็น → ไม่ผ่าน", () => {
    expect(verifyLineSignature(body + " ", sign(body, secret), secret)).toBe(false)
  })
  it("เซ็นด้วย secret อื่น → ไม่ผ่าน", () => {
    expect(verifyLineSignature(body, sign(body, "other-secret"), secret)).toBe(false)
  })
  it("ไม่มี header ลายเซ็น → ไม่ผ่าน", () => {
    expect(verifyLineSignature(body, null, secret)).toBe(false)
  })
  it("ลายเซ็นเป็นขยะ (ไม่ใช่ base64 ของ 32 ไบต์) → ไม่ผ่าน", () => {
    expect(verifyLineSignature(body, "not-a-signature", secret)).toBe(false)
    expect(verifyLineSignature(body, "", secret)).toBe(false)
  })
  it("secret ว่าง → ไม่ผ่านเสมอ (ฟีเจอร์ยังไม่เปิด)", () => {
    expect(verifyLineSignature(body, sign(body, ""), "")).toBe(false)
  })
})
