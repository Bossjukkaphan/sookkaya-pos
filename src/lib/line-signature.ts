import { createHmac, timingSafeEqual } from "node:crypto"

/** ตรวจ `x-line-signature` = base64(HMAC-SHA256(channel secret, raw body))
 *  ต้องคำนวณจาก raw body ก่อน parse เสมอ · เทียบแบบ timing-safe
 *  secret ว่าง (ฟีเจอร์ยังไม่เปิด) → ไม่ผ่านเสมอ */
export function verifyLineSignature(
  rawBody: string,
  signature: string | null,
  secret: string | undefined
): boolean {
  if (!signature || !secret) return false
  const expected = createHmac("sha256", secret).update(rawBody).digest()
  const given = Buffer.from(signature, "base64")
  return given.length === expected.length && timingSafeEqual(given, expected)
}
