/**
 * จัดกลุ่มเครดิตคงเหลือของสมาชิกตามที่แดชบอร์ดเดิมของเจ้าของร้านใช้
 *
 * ที่นี่ไม่มีการคำนวณยอดเครดิตใหม่ — ยอดมาจาก view member_balances เท่านั้น
 * โมดูลนี้แค่บอกว่ายอดที่ได้มาตกอยู่ช่องไหนและรวมได้เท่าไหร่
 */

export type CreditBucket = "empty" | "low" | "mid" | "ok"

export type MemberCredit = { balance: number }

export const BUCKET_LABEL: Record<CreditBucket, string> = {
  empty: "หมดแล้ว",
  low: "ใกล้หมด",
  mid: "ต่ำ",
  ok: "ปกติ",
}

/** สีตามแดชบอร์ดเดิม — แดง เหลืองส้ม เหลือง เขียว */
export const BUCKET_CLASS: Record<CreditBucket, string> = {
  empty: "border-red-200 bg-red-50 text-red-800",
  low: "border-amber-200 bg-amber-50 text-amber-800",
  mid: "border-yellow-200 bg-yellow-50 text-yellow-800",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
}

/**
 * ยอดติดลบเกิดได้จริงเมื่อแพ็กเกจหมดอายุแต่ยังมีประวัติตัดเครดิตอยู่
 * ถือเป็น "หมดแล้ว" เหมือนยอดศูนย์ ไม่ใช่ปล่อยให้หายไปจากทุกช่อง
 */
export function creditBucket(balance: number): CreditBucket {
  if (balance <= 0) return "empty"
  if (balance <= 1500) return "low"
  if (balance <= 3000) return "mid"
  return "ok"
}

export type CreditSummary = {
  counts: Record<CreditBucket, number>
  /** ภาระที่ร้านต้องให้บริการในอนาคต — นับเฉพาะยอดบวก ยอดติดลบไม่ใช่หนี้ของร้าน */
  liability: number
}

export function summarizeCredit(members: MemberCredit[]): CreditSummary {
  const counts: Record<CreditBucket, number> = { empty: 0, low: 0, mid: 0, ok: 0 }
  let liability = 0

  for (const m of members) {
    counts[creditBucket(m.balance)] += 1
    if (m.balance > 0) liability += m.balance
  }

  return { counts, liability }
}
