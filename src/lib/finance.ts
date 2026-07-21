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

export type RunRate = { daysLeft: number; perDay: number }

/**
 * ต้องทำวันละเท่าไหร่ถึงจะถึงเป้าสิ้นเดือน
 *
 * วันต้องคิดจาก today ที่เรียกจาก todayInShopTz() เท่านั้น ห้ามใช้ current_date
 * ของฐานข้อมูล เพราะ server รัน UTC แต่ร้านอยู่ Asia/Bangkok
 *
 * คืน null เมื่อไม่มีความหมาย: เดือนที่เลือกไม่ใช่เดือนปัจจุบัน (อดีตแก้อะไรไม่ได้แล้ว
 * อนาคตยังไม่เริ่ม) หรือถึงเป้าแล้ว วันนี้นับเป็นวันที่ยังขายได้ จึงรวมอยู่ใน daysLeft
 */
export function targetRunRate(
  today: string,
  month: string,
  remaining: number
): RunRate | null {
  if (today.slice(0, 7) !== month) return null
  if (remaining <= 0) return null

  const [year, m] = month.split("-").map(Number)
  const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate()
  const dayOfMonth = Number(today.slice(8, 10))
  const daysLeft = daysInMonth - dayOfMonth + 1

  if (daysLeft <= 0) return null
  return { daysLeft, perDay: Math.ceil(remaining / daysLeft) }
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
