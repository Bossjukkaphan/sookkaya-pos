/**
 * ย้ายยอดเกินรับของบิลไปเป็นเครดิตลูกค้า — กติกาล้วนๆ (ไม่แตะ DB)
 * ดู docs/superpowers/specs/2026-08-02-overpay-to-credit-design.md
 */

/** ต่ำกว่านี้ถือเป็นเศษ/ทิป ไม่ออกใบเครดิต — กันใบเครดิตเศษๆ รกระบบ */
export const MIN_OVERPAY_CREDIT = 100

/** อายุเครดิตคงเหลือ (เดือน) — เท่าแพ็กเกจยาวสุด เพราะเป็นเงินของลูกค้าเอง ไม่ใช่ของแถม */
export const OVERPAY_CREDIT_MONTHS = 12

/** ชื่อประเภทใบเติมเงินของเงินก้อนนี้ — แยกจากแพ็กเกจสมาชิก Silver/Gold/Platinum ให้ชัด
 *  (ตรงกับ constraint member_topups_tier_check หลัง migration allow_leftover_credit_tier) */
export const LEFTOVER_CREDIT_TIER = "เครดิตคงเหลือ"

/** เศษทศนิยมลอยของ view — ต่ำกว่านี้ถือว่าเป็นศูนย์ (ค่าเดียวกับ DUE_EPSILON ฝั่ง UI) */
const DUE_EPSILON = 0.005

const round2 = (n: number) => Math.round(n * 100) / 100

/** ยอดเกินรับจากค่า due ของ v_bill_due (due ติดลบ = รับเกิน) */
export function overpayAmount(due: number): number {
  if (!Number.isFinite(due) || due >= -DUE_EPSILON) return 0
  return round2(-due)
}

export type PaymentLine = { id: string; amount: number }
export type ReductionStep = { id: string; newAmount: number; remove: boolean }

/**
 * แผนการลดบรรทัดชำระให้รวมลดลงเท่า `amount` — ไล่จากบรรทัดล่าสุดก่อน
 * (บรรทัดล่าสุดคือบรรทัดที่เพิ่งคีย์ผิด/คีย์เกินมากที่สุด แตะก่อนแล้วอธิบายง่ายที่สุด)
 * บรรทัดที่ถูกลดจนเหลือ 0 ให้ลบทิ้ง ไม่เก็บบรรทัดยอดศูนย์ไว้ให้รก
 * @param lines เรียงเก่า→ใหม่
 * @throws เมื่อ amount มากกว่าเงินที่รับไว้ทั้งหมด (ผู้เรียกต้องกันก่อน — เป็นบั๊ก ไม่ใช่ input ผู้ใช้)
 */
export function planPaymentReduction(
  lines: PaymentLine[],
  amount: number
): ReductionStep[] {
  if (!Number.isFinite(amount) || amount <= 0) return []
  const total = lines.reduce((s, l) => s + l.amount, 0)
  if (amount > total + DUE_EPSILON) {
    throw new Error(`ลดเกินเงินที่รับไว้ (รับ ${total} ลด ${amount})`)
  }

  const steps: ReductionStep[] = []
  let left = amount
  for (let i = lines.length - 1; i >= 0 && left > DUE_EPSILON; i--) {
    const line = lines[i]
    const cut = Math.min(line.amount, left)
    const newAmount = round2(line.amount - cut)
    steps.push({ id: line.id, newAmount, remove: newAmount <= DUE_EPSILON })
    left = round2(left - cut)
  }
  return steps
}
