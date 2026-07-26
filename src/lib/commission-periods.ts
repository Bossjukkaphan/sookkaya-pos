/**
 * ค่ามือหมอจ่ายเดือนละ 3 งวดเสมอ (1-10 · 11-20 · 21-สิ้นเดือน)
 * เดือนไหนขาดหรือเกิน = สัญญาณคีย์ผิดเดือน/คีย์ซ้ำ/ตกหล่น
 * (เคสจริงที่เคยเจอ: งวด 1-10/6/69 ถูกคีย์วันที่เป็น 10/7 → กำไรสองเดือนเพี้ยนเดือนละ ~43,000)
 */

/** รายการรายจ่ายที่นับเป็น "งวดค่ามือ" — ชื่อมีคำว่าค่ามือ และยอดระดับงวดจริง
 * (ตัดพวกเบิกย่อย เช่น "เงินค่ามือพีโมเม 6,595" ที่ไม่ใช่งวดหลักออก) */
export const COMMISSION_PAYOUT_MIN_AMOUNT = 10_000

export function isCommissionPayout(item: string, amount: number): boolean {
  return item.includes("ค่ามือ") && amount >= COMMISSION_PAYOUT_MIN_AMOUNT
}

export type PayoutCheck = {
  level: "ok" | "info" | "warn"
  message: string
}

/**
 * ประเมินจำนวนงวดค่ามือของเดือน
 * เดือนที่จบแล้ว: ต้องมี 3 งวดพอดี · เดือนปัจจุบัน: เทียบกับงวดที่ควรจ่ายไปแล้วตามวันที่
 * (งวด 1-10 จ่ายราววันที่ 10-11 · งวด 11-20 ราว 20-21 · งวดปลายเดือนราวสิ้นเดือน)
 */
export function commissionPayoutStatus(
  count: number,
  opts: { isCurrentMonth: boolean; dayOfMonth: number }
): PayoutCheck {
  if (!opts.isCurrentMonth) {
    if (count === 3) return { level: "ok", message: "ค่ามือครบ 3 งวด" }
    if (count < 3)
      return {
        level: "warn",
        message: `เดือนนี้มีงวดค่ามือแค่ ${count} งวด (ปกติ 3 งวด: 1-10 · 11-20 · 21-สิ้นเดือน) — อาจตกหล่นหรือถูกคีย์วันที่เป็นเดือนอื่น`,
      }
    return {
      level: "warn",
      message: `เดือนนี้มีงวดค่ามือ ${count} งวด เกินปกติ (3 งวด) — อาจคีย์ซ้ำหรืองวดของเดือนอื่นถูกคีย์วันที่มาลงเดือนนี้`,
    }
  }

  // เดือนปัจจุบัน: เกิน 3 = ผิดแน่ · น้อยกว่าที่ควรจ่ายแล้ว (เผื่อจ่ายช้า 2-3 วัน) = เตือน
  if (count > 3)
    return {
      level: "warn",
      message: `เดือนนี้มีงวดค่ามือ ${count} งวด เกินปกติ (3 งวด) — อาจคีย์ซ้ำหรืองวดของเดือนอื่นถูกคีย์วันที่มาลงเดือนนี้`,
    }
  const minExpected =
    (opts.dayOfMonth >= 13 ? 1 : 0) + (opts.dayOfMonth >= 23 ? 1 : 0)
  if (count < minExpected)
    return {
      level: "warn",
      message: `ถึงวันนี้ควรจ่ายค่ามือแล้วอย่างน้อย ${minExpected} งวด แต่บันทึกไว้ ${count} งวด — อาจลืมคีย์หรือคีย์วันที่ผิดเดือน`,
    }
  return { level: "info", message: `จ่ายค่ามือแล้ว ${count}/3 งวด` }
}
