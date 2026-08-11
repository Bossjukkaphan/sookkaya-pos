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
 * ยอดติดลบเกิดไม่ได้อีกแล้วตั้งแต่ member_balances เปลี่ยนมาจัดสรรยอดใช้ลงก้อนแบบ FIFO
 * (2026-08-11) — ก้อนที่หมดอายุจะพาทั้งยอดที่ให้และยอดที่ใช้ของก้อนนั้นหายไปพร้อมกัน
 * ทำให้ยอดต่ำสุดที่เป็นไปได้ทางคณิตศาสตร์คือ 0 เสมอ ไม่ว่าจะใช้เกินก้อนที่มีหรือไม่เคย
 * เติมเงินมาก่อนเลยก็ตาม
 *
 * ผลคือการคีย์บิลผิดใบ (ตัดเครดิตของลูกค้าที่ไม่เคยเติมเงิน) จะมองไม่เห็นจากยอดคงเหลือ
 * อีกต่อไป ต้องไปดูที่การตรวจ orphan_credit_used ใน supabase/reconciliation.sql แทน
 *
 * เงื่อนไข balance <= 0 ด้านล่างยังคงไว้เป็นเกราะกันพลาด ไม่ใช่เพราะคาดว่าจะเจอค่าติดลบจริง
 */
export function creditBucket(balance: number): CreditBucket {
  if (balance <= 0) return "empty"
  if (balance <= CREDIT_LOW_MAX) return "low"
  if (balance <= 3000) return "mid"
  return "ok"
}
