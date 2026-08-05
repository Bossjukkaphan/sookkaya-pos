/** สูตรของการ์ดสรุปยอดขายรายวันที่ส่งเข้าไลน์ — ฟังก์ชันบริสุทธิ์ล้วน ไม่แตะฐานข้อมูล
 *  spec: docs/superpowers/specs/2026-08-05-line-daily-report-design.md */

import { addMonths, thaiMonthAbbr } from "./datetime"
import { addDays } from "./date-range"

export type DailySummaryRow = {
  sale_date: string
  sessions: number
  net_revenue: number
  cash_in: number
}

export type TopTherapist = { name: string; income: number; sessions: number }

export type TierCount = { tier: string; count: number }

export type MemberSignups = {
  newCount: number
  newCash: number
  newTiers: TierCount[]
  renewCount: number
  renewCash: number
  renewTiers: TierCount[]
}

export type TopupRow = {
  customer_id: string
  tier: string | null
  cash_received: number | null
}

/** ประวัติการเติมของลูกค้าที่เติมวันนี้ — รวมแถวของวันนี้และแถว EXCLUDED_TIER มาด้วยตามที่คิวรีได้
 *  ผู้เรียกส่งมาดิบๆ ไม่ต้องกรองอะไรเอง สูตรกรองทั้งวันที่และ tier เอง */
export type TopupHistoryRow = {
  customer_id: string
  topup_date: string
  tier: string | null
}

/** ยอดเกินที่เก็บเข้าเครดิตจากฟีเจอร์ overpay-to-credit ไม่ใช่การซื้อแพ็กเกจ */
export const EXCLUDED_TIER = "เครดิตคงเหลือ"

const TIER_UNKNOWN = "ไม่ระบุ"

export type ExpenseEntryRow = {
  expense_date: string
  amount: number | null
  /** วันที่บันทึกตามเวลาไทย YYYY-MM-DD — route แปลงมาให้แล้ว */
  recorded_date: string
}

export type ExpenseEntries = {
  count: number
  total: number
  backdatedCount: number
  backdatedTotal: number
  /** เฉพาะรายการย้อนหลัง สี่เดือนยอดสูงสุด เรียงเก่าไปใหม่ */
  byMonth: { month: string; total: number }[]
  /** ยอดรวมของเดือนที่ถูกตัดออกจาก byMonth — 0 เมื่อไม่มีเดือนถูกตัด */
  otherMonthsTotal: number
}

/** เดือนมากกว่านี้การ์ดจะยาวจนคนเลิกอ่าน */
export const MAX_BACKDATED_MONTHS = 4

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
  /** แถว member_topups ของวันนี้ ตัด EXCLUDED_TIER ออกแล้วจาก query */
  topups: TopupRow[]
  /** ประวัติการเติมทั้งหมดของลูกค้าที่เติมวันนี้ — ส่งดิบๆ มาได้เลย สูตรตัด EXCLUDED_TIER เอง */
  topupHistory: TopupHistoryRow[]
  /** แถวรายจ่ายที่ถูก "บันทึกเข้าระบบ" วันนี้ (ไม่ใช่วันที่บนใบเสร็จ) — route แปลง recorded_date มาให้แล้ว */
  expenseEntries: ExpenseEntryRow[]
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
  memberSignups: MemberSignups
  expenseEntries: ExpenseEntries
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

/** นับ tier แล้วเรียงจำนวนมากไปน้อย เท่ากันเรียงตามชื่อ ให้ผลคงที่ทุกครั้ง */
function countTiers(rows: TopupRow[]): TierCount[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const tier = r.tier?.trim() ? r.tier : TIER_UNKNOWN
    map.set(tier, (map.get(tier) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([tier, count]) => ({ tier, count }))
    .sort((a, b) => b.count - a.count || a.tier.localeCompare(b.tier, "th"))
}

function sumCash(rows: TopupRow[]): number {
  return rows.reduce((s, r) => s + Number(r.cash_received ?? 0), 0)
}

export function buildMemberSignups(
  today: string,
  topups: TopupRow[],
  history: TopupHistoryRow[]
): MemberSignups {
  const rows = topups.filter((r) => r.tier !== EXCLUDED_TIER)
  // ลูกค้าที่มีแถวเก่ากว่าวันนี้ = เคยเป็นสมาชิกมาก่อน — แถว EXCLUDED_TIER ไม่นับเป็นประวัติ
  // เพราะไม่ใช่การซื้อแพ็กเกจ ตัดออกที่นี่แทนที่จะพึ่งผู้เรียก
  const returning = new Set(
    history
      .filter((h) => h.tier !== EXCLUDED_TIER && h.topup_date < today)
      .map((h) => h.customer_id)
  )
  // ตัดสินรายแถว: คนเดียวเติมสองครั้งวันเดียว ครั้งแรกใหม่ ครั้งที่สองต่ออายุ
  const seenToday = new Set<string>()
  const fresh: TopupRow[] = []
  const renew: TopupRow[] = []
  for (const r of rows) {
    if (returning.has(r.customer_id) || seenToday.has(r.customer_id)) renew.push(r)
    else fresh.push(r)
    seenToday.add(r.customer_id)
  }
  return {
    newCount: fresh.length,
    newCash: sumCash(fresh),
    newTiers: countTiers(fresh),
    renewCount: renew.length,
    renewCash: sumCash(renew),
    renewTiers: countTiers(renew),
  }
}

export function buildExpenseEntries(rows: ExpenseEntryRow[]): ExpenseEntries {
  const amount = (r: ExpenseEntryRow) => Number(r.amount ?? 0)
  const backdated = rows.filter((r) => r.expense_date < r.recorded_date)

  // คีย์เป็น YYYY-MM เพื่อเรียงตามเวลาได้ตรง แล้วค่อยแปลงเป็นชื่อเดือนตอนคืนค่า
  const byKey = new Map<string, number>()
  for (const r of backdated) {
    const key = r.expense_date.slice(0, 7)
    byKey.set(key, (byKey.get(key) ?? 0) + amount(r))
  }
  const all = [...byKey.entries()].map(([key, total]) => ({ key, total }))
  const kept = [...all].sort((a, b) => b.total - a.total).slice(0, MAX_BACKDATED_MONTHS)
  const keptKeys = new Set(kept.map((m) => m.key))

  return {
    count: rows.length,
    total: rows.reduce((s, r) => s + amount(r), 0),
    backdatedCount: backdated.length,
    backdatedTotal: backdated.reduce((s, r) => s + amount(r), 0),
    byMonth: kept
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((m) => ({ month: thaiMonthAbbr(`${m.key}-01`), total: m.total })),
    otherMonthsTotal: all
      .filter((m) => !keptKeys.has(m.key))
      .reduce((s, m) => s + m.total, 0),
  }
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

  const memberSignups = buildMemberSignups(today, input.topups, input.topupHistory)
  const expenseEntries = buildExpenseEntries(input.expenseEntries)

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
    memberSignups,
    expenseEntries,
  }
}
