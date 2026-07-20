export type UnitInput = {
  netRevenue: number
  sessions: number
  variableCost: number
  fixedCost: number
  onetimeCost: number
}

export type UnitResult = {
  revenuePerSession: number
  variableCostPerSession: number
  contributionMargin: number
}

/** กำไรที่ร้านได้เพิ่มทุกครั้งที่ขายอีก 1 เซสชัน หลังหักต้นทุนที่ผันแปรตามงาน */
export function unitEconomics(input: UnitInput): UnitResult {
  if (input.sessions <= 0) {
    return { revenuePerSession: 0, variableCostPerSession: 0, contributionMargin: 0 }
  }
  const revenuePerSession = Math.round(input.netRevenue / input.sessions)
  const variableCostPerSession = Math.round(input.variableCost / input.sessions)
  return {
    revenuePerSession,
    variableCostPerSession,
    contributionMargin: revenuePerSession - variableCostPerSession,
  }
}

/**
 * ต้องขายกี่เซสชันถึงจะครอบคลุมต้นทุนที่ต้องจ่ายไม่ว่าจะมีลูกค้าหรือไม่
 * คืน null ถ้ากำไรต่อเซสชันไม่เป็นบวก — ขายเท่าไหร่ก็ไม่มีวันคุ้ม
 */
export function breakEvenSessions(
  fixedCost: number,
  contributionMargin: number
): number | null {
  if (contributionMargin <= 0) return null
  return Math.ceil(fixedCost / contributionMargin)
}

/**
 * รายจ่ายก้อนใหญ่ (ค่าเช่า เงินเดือน) บันทึกตอนสิ้นเดือน
 * ต้นเดือนกำไรจึงดูสูงเกินจริง — ตรวจจับเพื่อเตือนก่อนเจ้าของร้านตัดสินใจผิด
 */
export function isMonthIncomplete(
  fixedCostThisMonth: number,
  fixedCostPreviousMonths: number[]
): boolean {
  if (fixedCostPreviousMonths.length === 0) return false
  const average =
    fixedCostPreviousMonths.reduce((sum, v) => sum + v, 0) /
    fixedCostPreviousMonths.length
  if (average <= 0) return false
  return fixedCostThisMonth < average * 0.5
}
