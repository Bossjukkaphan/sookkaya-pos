/**
 * จัดกลุ่มเครดิตคงเหลือของสมาชิกตามที่แดชบอร์ดเดิมของเจ้าของร้านใช้
 *
 * ที่นี่ไม่มีการคำนวณยอดเครดิตใหม่ — ยอดมาจาก view member_balances เท่านั้น
 * โมดูลนี้แค่บอกว่ายอดที่ได้มาตกอยู่ช่องไหนและรวมได้เท่าไหร่
 */

export type CreditBucket = "empty" | "low" | "mid" | "ok"

export type MemberCredit = { balance: number }

/**
 * ขอบบนของ bucket "ใกล้หมด" — export ไว้ให้ผู้เรียกที่คัดกรองที่ฐานข้อมูลเอง
 * (เช่น overview/page.tsx query member_balances) ใช้ค่าเดียวกับ creditBucket() เป๊ะ
 * ไม่ต้องคัดลอกเลข 1500 ไปแยกไว้อีกที่แล้วลืมซิงก์กัน
 */
export const CREDIT_LOW_MAX = 1500

/**
 * ยอดติดลบเกิดได้จริงเมื่อแพ็กเกจหมดอายุแต่ยังมีประวัติตัดเครดิตอยู่
 * ถือเป็น "หมดแล้ว" เหมือนยอดศูนย์ ไม่ใช่ปล่อยให้หายไปจากทุกช่อง
 */
export function creditBucket(balance: number): CreditBucket {
  if (balance <= 0) return "empty"
  if (balance <= CREDIT_LOW_MAX) return "low"
  if (balance <= 3000) return "mid"
  return "ok"
}
