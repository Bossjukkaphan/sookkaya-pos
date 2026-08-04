/** สูตรของการ์ดสรุปยอดขายรายวันที่ส่งเข้าไลน์ — ฟังก์ชันบริสุทธิ์ล้วน ไม่แตะฐานข้อมูล
 *  spec: docs/superpowers/specs/2026-08-05-line-daily-report-design.md */

import { addMonths } from "./datetime"
import { addDays } from "./date-range"

export type DailySummaryRow = {
  sale_date: string
  sessions: number
  net_revenue: number
  cash_in: number
}

export type TopTherapist = { name: string; income: number; sessions: number }

export type DailyReportInput = {
  /** วันที่รายงาน ตามเวลาไทย */
  today: string
  /** แถว v_daily_summary ตั้งแต่ต้นเดือนที่แล้วถึงวันนี้ (ลำดับไม่สำคัญ) */
  daily: DailySummaryRow[]
  /** v_commission_daily.commission ของวันนี้ — รวมประกันมือและค่ารีเควสแล้ว */
  commission: number
  customers: number
  topTherapist: TopTherapist | null
  bookingsTomorrow: number
  memberCreditEmpty: number
  memberCreditLow: number
}

export type DailyReport = {
  date: string
  /** ไม่มีบิลเลยในวันนี้ — การ์ดจะย่อเหลือแค่หัวกับปุ่ม ไม่โชว์เลข 0 ให้เข้าใจผิด */
  empty: boolean
  netRevenue: number
  cashIn: number
  commission: number
  grossProfit: number
  margin: number
  sessions: number
  customers: number
  vsAvg7dPct: number | null
  mtd: number
  mtdDeltaPct: number | null
  topTherapist: TopTherapist | null
  bookingsTomorrow: number
  alerts: string[]
}

/** จำนวนวันย้อนหลังที่ใช้หาค่าเฉลี่ย */
export const PRIOR_DAYS = 7
/** ต้องมีวันที่เปิดร้านอย่างน้อยเท่านี้ถึงจะเทียบค่าเฉลี่ย ไม่งั้นตัวเลข % หลอก */
export const MIN_PRIOR_DAYS = 3
/** เซสชันต่ำกว่าค่าเฉลี่ยคูณค่านี้ = ผิดปกติ */
export const LOW_SESSION_RATIO = 0.7
/** เครดิตเหลือไม่เกินนี้ = ใกล้หมด ต้องเตือนให้เชียร์เติม */
export const CREDIT_LOW_BAHT = 1500
/** เตือนเกินนี้คนจะเลิกอ่าน */
export const MAX_ALERTS = 3

function monthStart(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`
}

function sumNetRevenue(rows: DailySummaryRow[], from: string, to: string): number {
  return rows
    .filter((r) => r.sale_date >= from && r.sale_date <= to)
    .reduce((sum, r) => sum + r.net_revenue, 0)
}

export function buildDailyReport(input: DailyReportInput): DailyReport {
  const { today, daily, commission, customers } = input

  const todayRow = daily.find((r) => r.sale_date === today)
  const sessions = todayRow?.sessions ?? 0
  const netRevenue = todayRow?.net_revenue ?? 0
  const cashIn = todayRow?.cash_in ?? 0
  const empty = sessions === 0

  const grossProfit = netRevenue - commission
  const margin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0

  // ฐานเฉลี่ย: เฉพาะวันที่เปิดร้านใน 7 วันก่อนหน้า ไม่รวมวันนี้
  const prior = daily.filter(
    (r) =>
      r.sessions > 0 &&
      r.sale_date >= addDays(today, -PRIOR_DAYS) &&
      r.sale_date <= addDays(today, -1)
  )
  const hasBaseline = prior.length >= MIN_PRIOR_DAYS
  const avgNetRevenue = hasBaseline
    ? prior.reduce((s, r) => s + r.net_revenue, 0) / prior.length
    : 0
  const avgSessions = hasBaseline
    ? prior.reduce((s, r) => s + r.sessions, 0) / prior.length
    : 0
  const vsAvg7dPct =
    hasBaseline && avgNetRevenue > 0
      ? ((netRevenue - avgNetRevenue) / avgNetRevenue) * 100
      : null

  const mtd = sumNetRevenue(daily, monthStart(today), today)
  // addMonths หดวันที่ให้พอดีเดือน (31 มี.ค. → 28/29 ก.พ.) จึงเทียบ "ช่วงวันเท่ากัน" ได้เสมอ
  const prevSameDay = addMonths(today, -1)
  const mtdPrev = sumNetRevenue(daily, monthStart(prevSameDay), prevSameDay)
  const mtdDeltaPct = mtdPrev > 0 ? ((mtd - mtdPrev) / mtdPrev) * 100 : null

  const alerts: string[] = []
  if (input.memberCreditEmpty > 0) {
    alerts.push(`🔴 Member ${input.memberCreditEmpty} คน เครดิตหมด → เชียร์ขาย Top-up ใหม่`)
  }
  if (input.memberCreditLow > 0) {
    alerts.push(
      `🟠 Member ${input.memberCreditLow} คน เครดิตใกล้หมด (≤฿${CREDIT_LOW_BAHT.toLocaleString("th-TH")}) → เตือนเติมต่อ`
    )
  }
  if (hasBaseline && avgSessions > 0 && sessions < avgSessions * LOW_SESSION_RATIO) {
    const gap = Math.round((1 - sessions / avgSessions) * 100)
    alerts.push(`📉 Sessions ต่ำกว่าค่าเฉลี่ย 7 วัน ${gap}% → ส่งโปร LINE OA พรุ่งนี้`)
  }
  if (!empty && grossProfit < 0) {
    alerts.push(
      `⚠️ กำไรขั้นต้นติดลบ ฿${Math.round(Math.abs(grossProfit)).toLocaleString("th-TH")} → ตรวจค่ามือ/ส่วนลด`
    )
  }

  return {
    date: today,
    empty,
    netRevenue,
    cashIn,
    commission,
    grossProfit,
    margin,
    sessions,
    customers,
    vsAvg7dPct,
    mtd,
    mtdDeltaPct,
    topTherapist: input.topTherapist,
    bookingsTomorrow: input.bookingsTomorrow,
    alerts: alerts.slice(0, MAX_ALERTS),
  }
}
