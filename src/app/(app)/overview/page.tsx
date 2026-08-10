import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { getShopSettingsCached, getTherapistsCached } from "@/lib/cached-lookups"
import { formatBaht } from "@/lib/constants"
import { formatThaiDate, todayInShopTz } from "@/lib/datetime"
import { isMonthIncomplete, targetRunRate } from "@/lib/finance"
import { monthShortLabel, shiftMonth } from "@/lib/month"
import { daysSince, dormantCutoff } from "@/lib/insights"
import { creditBucket } from "@/lib/member-credit"
import { detectAnomalies, type ExpenseRow } from "@/lib/expense-analytics"
import { birthdayUpcomingCustomers } from "@/lib/crm-birthday"
import { buildCareList, guaranteeFlags, topTherapists } from "@/lib/boss-hub"
import {
  delta,
  mtdRange,
  prevMtdRange,
  sameWeekdayDates,
  verdictSentence,
} from "@/lib/period-compare"
import type { Series } from "@/components/charts/grouped-bar-chart"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { InsightsAccessDenied, canSeeInsights } from "../insights/shared"
import { CareList } from "./care-list"
import { MoneyZone } from "./money-zone"
import { TeamZone } from "./team-zone"
import { VerdictStrip } from "./verdict-strip"
import { ZoneError } from "./zone-error"

export const metadata = { title: "ภาพรวม · สุขกายา POS" }

const n = (x: number | string | null | undefined) => Number(x ?? 0)

/** ค่าเฉลี่ยวันเดียวกันของสัปดาห์ ใช้ย้อนหลัง 4 สัปดาห์ตามสเปก (period-compare ก็อิงเลขนี้) */
const WEEKS_COMPARED = 4

/** ลูกค้าที่ "หายไปนาน" ใช้เกณฑ์เดียวกับแท็บ dormant ของ /crm (ค่าเริ่มต้น 60 วัน) */
const DORMANT_DAYS = 60

const THAI_WEEKDAYS = [
  "วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ",
  "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์",
]

/**
 * เพดาน 1000 แถวของ supabase-js ตัดผลลัพธ์เงียบๆ — ขอมาน้อยกว่านั้นแล้วเทียบกับ
 * count จริง จะได้รู้ตัวว่าโดนตัดและบอกผู้ใช้ได้ แทนที่จะแสดงตัวเลขที่ขาดไปเฉยๆ
 */
const MEMBER_LIMIT = 500

// ════════════════════════════════════════════════════════════════════════════
// ตัวช่วยเรื่อง "โซนไหนล้ม"
// ════════════════════════════════════════════════════════════════════════════

/**
 * supabase คืน error มาในผลลัพธ์ ไม่ throw — ห่อให้ throw เพื่อให้ `Promise.allSettled`
 * จับเป็น rejected แล้วโซนนั้นขึ้นการ์ด "โหลดไม่สำเร็จ" แทนการโชว์ 0 ราวกับไม่มีข้อมูล
 */
async function must<T>(
  q: PromiseLike<{ data: T; error: { message: string } | null }>
): Promise<T> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data
}

/** เหมือน `must` แต่เอาเฉพาะ count (query แบบ head:true ไม่มี data ให้ใช้) */
async function mustCount(
  q: PromiseLike<{ count: number | null; error: { message: string } | null }>
): Promise<number> {
  const { count, error } = await q
  if (error) throw new Error(error.message)
  return count ?? 0
}

const value = <T,>(r: PromiseSettledResult<T>): T | null =>
  r.status === "fulfilled" ? r.value : null

/** โซนพังเมื่อ query ที่โซนนั้นต้องใช้ "ตัวใดตัวหนึ่ง" ล้ม — โซนอื่นยังแสดงปกติ */
const anyFailed = (...rs: PromiseSettledResult<unknown>[]) =>
  rs.some((r) => r.status === "rejected")

// ════════════════════════════════════════════════════════════════════════════
// RPC boss_hub_rollup — คืนชนิด Json ต้อง parse แบบระวัง
// ════════════════════════════════════════════════════════════════════════════

type RollupDay = { day: string; revenue: number; bills: number }
type RollupTherapist = { therapist_id: string; revenue: number; sessions: number }
type Rollup = { daily: RollupDay[]; byTherapist: RollupTherapist[] }

/**
 * แกะ jsonb ของ RPC โดยไม่เชื่อโครงสร้าง — ชนิดที่ generator ให้มาคือ `Json` ล้วน
 * ถ้าคีย์ไหนหาย/ผิดชนิด ให้กลายเป็นก้อนว่างแทนที่จะโยน error ทั้งหน้า
 *
 * หมายเหตุ: `revenue` เป็น numeric ของ Postgres จึงมีทศนิยม — ปัดตอนแสดงผลด้วย
 * formatBaht เท่านั้น ห้ามปัดตอนบวก (กติกาเดียวกับหน้า reports)
 */
function parseRollup(json: unknown): Rollup {
  const obj = (json ?? {}) as Record<string, unknown>
  const daily = Array.isArray(obj.daily) ? obj.daily : []
  const byTherapist = Array.isArray(obj.by_therapist) ? obj.by_therapist : []

  return {
    daily: daily.map((row) => {
      const r = (row ?? {}) as Record<string, unknown>
      return { day: String(r.day ?? ""), revenue: n(r.revenue as number), bills: n(r.bills as number) }
    }),
    byTherapist: byTherapist
      .map((row) => {
        const r = (row ?? {}) as Record<string, unknown>
        return {
          therapist_id: String(r.therapist_id ?? ""),
          revenue: n(r.revenue as number),
          sessions: n(r.sessions as number),
        }
      })
      .filter((t) => t.therapist_id !== ""),
  }
}

const sumRevenue = (rollup: Rollup) => rollup.daily.reduce((s, d) => s + d.revenue, 0)

// ════════════════════════════════════════════════════════════════════════════
// เครดิตสมาชิก — ยกก้อนเดิมของหน้ามาทั้งดุ้น (ต้องยิงสองต่อ topups → balances)
// ════════════════════════════════════════════════════════════════════════════

type CreditWatch = { id: string; name: string; balance: number }

/**
 * สมาชิกที่เครดิต "ใกล้หมด" (bucket ต่ำสุดที่ยังมียอดเหลือ) — โซน 3 เอาไปต่อท้ายลิสต์ดูแลด่วน
 *
 * สองต่อในฟังก์ชันเดียว เพื่อให้ทั้งก้อนเป็นสมาชิกเดียวของ allSettled — ล้มก็ล้มแค่โซน 3
 */
async function loadCreditWatch(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<CreditWatch[]> {
  // member_balances มีหนึ่งแถวต่อ "ลูกค้าทุกคน" (พันกว่าแถว) ไม่ใช่ต่อสมาชิก
  // ถ้าดึงทั้ง view supabase-js จะตัดที่ 1000 แถวเงียบๆ แล้วยอดคงค้างจะขาด
  // และ 960 กว่าคนที่ยอดศูนย์คือลูกค้าเดินเข้าร้านที่ไม่เคยเติมเงิน
  // ไม่ใช่ "สมาชิกที่เครดิตหมด" — จึงต้องคัดคนที่เคยมีใบเติมเงินก่อน
  // คัดจากใบเติมเงิน ไม่ใช่ customer_type='สมาชิก' เพราะ "เครดิตคงเหลือ" ของลูกค้าทั่วไป
  // (ยอดจ่ายล่วงหน้าที่ใช้ไม่ครบ) ก็เป็นหนี้ที่ร้านค้างลูกค้าเหมือนกัน ต้องนับด้วย
  const topups = await must(
    supabase.from("member_topups").select("customer_id").limit(MEMBER_LIMIT)
  )

  // ลูกค้าคนเดียวเติมได้หลายใบ — ตัดซ้ำก่อนนับ
  const memberIds = [
    ...new Set(
      (topups ?? [])
        .map((m) => m.customer_id)
        .filter((id): id is string => id !== null)
    ),
  ]
  if (memberIds.length === 0) return []

  const balances = await must(
    supabase
      .from("member_balances")
      .select("customer_id, name, nickname, credit_balance")
      .in("customer_id", memberIds)
  )

  return (balances ?? [])
    .map((b) => ({
      id: b.customer_id ?? "",
      name: b.nickname || b.name || "ไม่ระบุชื่อ",
      // ยอดมาจาก view ล้วนๆ — หน้านี้ไม่คิดสูตรเครดิตเอง
      balance: n(b.credit_balance),
    }))
    .filter((b) => b.id !== "" && creditBucket(b.balance) === "low")
}

// ════════════════════════════════════════════════════════════════════════════

export default async function OverviewPage() {
  const supabase = await createClient()
  const today = todayInShopTz()
  const month = today.slice(0, 7)
  const dayOfMonth = Number(today.slice(8, 10))

  const mtd = mtdRange(month, dayOfMonth)
  const prevMtd = prevMtdRange(month, dayOfMonth)

  // ค่าเฉลี่ย "วันเดียวกันของสัปดาห์" — ยิง rollup ช่วงเดียว [เก่าสุด..วันนี้] ครั้งเดียว
  // แล้วเลือกวันฝั่ง JS ดีกว่ายิงรายวัน 4 ครั้ง (round trip เดียวเทียบกับสี่)
  const weekdayDates = sameWeekdayDates(today, WEEKS_COMPARED)
  const weekdayFrom = weekdayDates[weekdayDates.length - 1]

  // ฐานย้อนหลังของ detectAnomalies คือ 3 เดือน (BASELINE_MONTHS) — ดึง 4 เดือนพอ
  // และช่วงนี้ครอบ MTD ทั้งเดือนนี้และเดือนก่อนอยู่แล้ว ใช้ก้อนเดียวคิดได้ทั้งสองเรื่อง
  const dataFloor = `${shiftMonth(month, -3)}-01`

  // query ทั้งชุดวิ่งก่อนเช็คสิทธิ์ (เพื่อรวม round trip) — ปลอดภัยเพราะ RLS คุมข้อมูลรายตาราง
  // และ gate `canSeeInsights` ด้านล่างยังตัดสินผลลัพธ์ที่ผู้ใช้เห็นเหมือนเดิม
  // ใช้ allSettled ไม่ใช่ all: query ตัวเดียวล้มต้องพังแค่โซนของมัน ไม่ใช่ทั้งหน้า
  const [
    profileR,
    rollupMtdR,
    rollupPrevR,
    rollupWeekR,
    plR,
    expenseR,
    dailySummaryR,
    commissionDailyR,
    therapistDailyR,
    birthdayR,
    dormantR,
    creditR,
    therapistsR,
    attendanceR,
    queueR,
    settingsR,
  ] = await Promise.allSettled([
    getMyProfile(),
    must(supabase.rpc("boss_hub_rollup", { p_from: mtd.from, p_to: mtd.to })),
    must(supabase.rpc("boss_hub_rollup", { p_from: prevMtd.from, p_to: prevMtd.to })),
    must(supabase.rpc("boss_hub_rollup", { p_from: weekdayFrom, p_to: today })),
    must(supabase.from("v_monthly_pl").select("*").order("month")),
    must(
      supabase
        .from("expenses")
        .select("expense_date, category, item, amount")
        .gte("expense_date", dataFloor)
    ),
    must(
      supabase.from("v_daily_summary").select("sale_date, net_revenue").gte("sale_date", dataFloor)
    ),
    must(
      supabase
        .from("v_commission_daily")
        .select("work_date, commission")
        .gte("work_date", dataFloor)
    ),
    // ค่ามือของ MTD (เดือนนี้ + เดือนก่อน) และธงการันตีของเดือนนี้ มาจาก view เดียวกัน
    // ~31 วัน × หมอนวด 6-7 คน × 2 เดือน ≈ 400 แถว ห่างจากเพดาน 1000 พอสมควร
    must(
      supabase
        .from("v_therapist_daily")
        .select("therapist_id, work_date, status, total_income")
        .gte("work_date", prevMtd.from)
        .lte("work_date", today)
        .limit(1000)
    ),
    birthdayUpcomingCustomers(supabase, today),
    // กติกา "หายไปนาน" เดียวกับแท็บ dormant ของ /crm — กรองใน SQL เสมอ (ดูเหตุผลใน dormantCutoff)
    must(
      supabase
        .from("v_customer_ltv")
        .select("customer_id, name, nickname, lifetime_value, last_visit")
        .gte("visits", 2)
        .lt("last_visit", dormantCutoff(today, DORMANT_DAYS))
        .order("lifetime_value", { ascending: false })
        .limit(5)
    ),
    loadCreditWatch(supabase),
    getTherapistsCached(),
    // นับหัวคนที่เช็คอินวันนี้ (ทั้งหมอนวดและพนักงาน) — ให้ฐานข้อมูลนับ ไม่ต้องดึงแถวมา
    mustCount(
      supabase
        .from("attendance")
        .select("id", { count: "exact", head: true })
        .eq("work_date", today)
    ),
    // คิววันนี้ ตัดใบที่ยกเลิก/ถูกปฏิเสธทิ้งเหมือนกระดานคิว
    must(
      supabase
        .from("queue_entries")
        .select("status, sale_id")
        .eq("queue_date", today)
        .not("status", "in", "(cancelled,rejected)")
    ),
    getShopSettingsCached(),
  ])

  // โปรไฟล์ล้ม = ตัดสินสิทธิ์ไม่ได้ ห้ามเดาว่าเห็นได้ — โยนต่อให้ error.tsx ของโซน (app)
  if (profileR.status === "rejected") throw profileR.reason
  if (!canSeeInsights(profileR.value?.role)) {
    return <InsightsAccessDenied title="ภาพรวม" />
  }

  // ── โซนไหนพัง (query ตัวเดียวกันถูกใช้หลายโซนได้ — ล้มทีก็พังทุกโซนที่พึ่งมัน) ──
  const zone1Failed = anyFailed(rollupMtdR, rollupPrevR, rollupWeekR, settingsR)
  const zone2Failed = anyFailed(
    rollupMtdR, rollupPrevR, plR, expenseR, dailySummaryR, commissionDailyR, therapistDailyR
  )
  const zone3Failed = anyFailed(birthdayR, dormantR, creditR)
  const zone4Failed = anyFailed(rollupMtdR, therapistsR, therapistDailyR, attendanceR, queueR)

  // ── โซน 1: วันนี้/เดือนนี้ ดีกว่าหรือแย่กว่าปกติ ──
  // parseRollup กัน null/โครงผิดให้แล้ว — โซนที่ query ล้มจะไม่ถูก render อยู่ดี
  const rollupMtdData = parseRollup(value(rollupMtdR))
  const rollupPrevData = parseRollup(value(rollupPrevR))
  const rollupWeekData = parseRollup(value(rollupWeekR))

  const revenueMtd = sumRevenue(rollupMtdData)
  const revenuePrevMtd = sumRevenue(rollupPrevData)
  const mtdDelta = delta(revenueMtd, revenuePrevMtd)

  const todayRow = rollupMtdData.daily.find((d) => d.day === today)
  const todayRevenue = todayRow?.revenue ?? 0
  const todayBills = todayRow?.bills ?? 0

  // วันที่ไม่มีบิลเลยไม่มีแถวใน daily — นับเฉพาะสัปดาห์ที่มีข้อมูลจริง แล้วบอกจำนวนสัปดาห์
  // ที่ใช้เทียบผ่านประโยคคำตัดสิน (ดีกว่านับเป็น 0 บาทซึ่งจะกดค่าเฉลี่ยให้ต่ำกว่าจริง)
  const weekdayRevenues = weekdayDates
    .map((d) => rollupWeekData.daily.find((row) => row.day === d)?.revenue)
    .filter((v): v is number => v !== undefined)
  const weekdayAvg =
    weekdayRevenues.length > 0
      ? weekdayRevenues.reduce((s, v) => s + v, 0) / weekdayRevenues.length
      : null

  const sentence = verdictSentence({
    mtd: mtdDelta,
    today: { revenue: todayRevenue, weekdayAvg, weeksUsed: weekdayRevenues.length },
    todayLabel: THAI_WEEKDAYS[new Date(`${today}T00:00:00Z`).getUTCDay()],
  })

  const settings = value(settingsR) ?? []
  const target = Number(settings.find((s) => s.key === "monthly_target")?.value ?? 0)
  const runRate = target > 0 ? targetRunRate(today, month, target - revenueMtd) : null

  // ── โซน 2: เงินไปไหน กำไรจริงเหลือเท่าไหร่ ──
  const expenseRows: ExpenseRow[] = (value(expenseR) ?? []).map((r) => ({
    expense_date: r.expense_date,
    category: r.category,
    item: r.item,
    amount: Number(r.amount),
  }))
  const therapistDays = value(therapistDailyR) ?? []

  /**
   * กำไร MTD ตามสูตร accrual ของ v_monthly_pl (profit_accrual):
   *   รายรับ − ค่ามือหมอ (v_therapist_daily.total_income) − (รายจ่ายรวม − หมวด HR / payroll)
   * ที่ต้องหักหมวด payroll ออกจากรายจ่าย เพราะค่ามือถูกนับไปแล้วจากงานจริง — ไม่งั้นนับซ้ำ
   * ใช้ rollup เป็นตัวรายรับ ไม่ใช่ view รายเดือน เพราะ view เป็นเดือนเต็ม เทียบ MTD ไม่ได้
   */
  const profitOf = (from: string, to: string, revenue: number) => {
    const inRange = expenseRows.filter((r) => r.expense_date >= from && r.expense_date <= to)
    const expenseTotal = inRange.reduce((s, r) => s + r.amount, 0)
    // prefix ต้องตรงกับ view เป๊ะ (`category like 'HR / payroll%'` ใน v_monthly_pl)
    // ชื่อหมวดเต็มเคยถูกเปลี่ยนมาแล้ว 27/7/2569 แต่ prefix ถูกตั้งใจคงไว้เพื่อการนี้
    const payrollPaid = inRange
      .filter((r) => r.category.startsWith("HR / payroll"))
      .reduce((s, r) => s + r.amount, 0)
    const commission = therapistDays
      .filter((d) => d.work_date !== null && d.work_date >= from && d.work_date <= to)
      .reduce((s, d) => s + n(d.total_income), 0)
    return revenue - commission - (expenseTotal - payrollPaid)
  }

  const profitMtd = profitOf(mtd.from, mtd.to, revenueMtd)
  const profitPrevMtd = profitOf(prevMtd.from, prevMtd.to, revenuePrevMtd)
  const profitDelta = delta(profitMtd, profitPrevMtd)
  // เดือนที่มีแต่รายจ่ายไม่มียอดขาย หาร margin ไม่ได้ — 0.0% จะอ่านเป็น "เท่าทุน" ซึ่งตรงข้ามกับความจริง
  const margin = revenueMtd > 0 ? (profitMtd / revenueMtd) * 100 : null

  const toDailyMap = (rows: { date: string | null; value: number | null }[]) => {
    const m = new Map<string, number>()
    for (const r of rows) {
      if (!r.date) continue
      m.set(r.date, (m.get(r.date) ?? 0) + Number(r.value ?? 0))
    }
    return m
  }
  const revenueByDate = toDailyMap(
    (value(dailySummaryR) ?? []).map((r) => ({ date: r.sale_date, value: r.net_revenue }))
  )
  const commissionByDate = toDailyMap(
    (value(commissionDailyR) ?? []).map((r) => ({ date: r.work_date, value: r.commission }))
  )

  // ตัวตรวจเดียวกับ /insights/expenses (เทียบค่ากลาง 3 เดือน) — เอาเฉพาะที่แรงสุด 3 อัน
  const anomalyChips = detectAnomalies({
    rows: expenseRows,
    revenueByDate,
    commissionByDate,
    month,
    throughDay: dayOfMonth,
    monthClosed: false,
  })
    .filter((d) => d.level === "alert" || d.level === "warn")
    .sort((a, b) => Math.abs(b.impactBaht) - Math.abs(a.impactBaht))
    .slice(0, 3)
    .map((d) => ({
      label: `${d.category} +${Math.round(d.deltaPct)}%`,
      level: d.level as "alert" | "warn",
    }))

  const plRows = (value(plR) ?? []).filter(
    (r): r is typeof r & { month: string } => r.month !== null
  )
  const last6 = plRows.filter((r) => r.month <= month).slice(-6)
  const monthPoints = (pick: (r: (typeof last6)[number]) => number) =>
    last6.map((r) => ({ label: monthShortLabel(r.month), value: pick(r) }))
  // margin ไม่แยกเป็นกราฟที่สองแล้ว (สเปก: ยุบเข้ากราฟหลัก) — กำไรเป็นชุดที่สามในกราฟเดียวกัน
  // ส่วนตัวเลข margin % โชว์เป็นสถิติหัวการ์ดของโซนนี้แทน
  const chart: Series[] = [
    { name: "รายได้", color: "#059669", points: monthPoints((r) => n(r.net_revenue)) },
    { name: "รายจ่าย", color: "#f97316", points: monthPoints((r) => n(r.expense_total)) },
    { name: "กำไรเงินสด", color: "#1e293b", points: monthPoints((r) => n(r.profit_cash)) },
  ]

  // รายจ่ายก้อนใหญ่ลงตอนสิ้นเดือน — ต้นเดือนกำไร MTD ข้างบนจึงสูงเกินจริง ต้องเตือน
  const selectedPl = plRows.find((r) => r.month === month) ?? null
  const incomplete = isMonthIncomplete(
    n(selectedPl?.fixed_cost),
    plRows.filter((r) => r.month < month).slice(-3).map((r) => n(r.fixed_cost))
  )

  const profitVerdict =
    profitDelta.pct === null
      ? "ยังเทียบเดือนก่อนไม่ได้"
      : profitDelta.pct >= 0
        ? `ดีกว่าเดือนก่อน ณ วันเดียวกัน ${profitDelta.pct}%`
        : `แย่กว่าเดือนก่อน ณ วันเดียวกัน ${Math.abs(profitDelta.pct)}%`
  const moneyHeadline = `${profitMtd < 0 ? "เดือนนี้ขาดทุน" : "เดือนนี้กำไรแล้ว"} ${formatBaht(
    Math.abs(profitMtd)
  )}฿${margin === null ? "" : ` (margin ${margin.toFixed(1)}%)`} — ${profitVerdict}`

  // ── โซน 3: ลูกค้าที่ต้องดูแลด่วน ──
  const careItems = buildCareList({
    // ชื่อเล่นก่อนชื่อจริงเหมือนทุกลิสต์ลูกค้าในระบบ — พนักงานจำชื่อเล่นได้มากกว่า
    birthdays: (value(birthdayR) ?? []).map((b) => ({
      id: b.id,
      name: b.nickname || b.name,
      nickname: b.nickname,
      daysUntil: b.daysUntil,
    })),
    dormant: (value(dormantR) ?? [])
      .filter((d) => d.customer_id !== null && d.last_visit !== null)
      .map((d) => ({
        id: d.customer_id!,
        name: d.nickname || d.name || "ไม่ระบุชื่อ",
        ltv: n(d.lifetime_value),
        daysSinceVisit: daysSince(d.last_visit!, today),
      })),
    lowCredit: value(creditR) ?? [],
  })

  // ── โซน 4: ทีมเป็นไง ──
  const therapistNames = new Map(
    (value(therapistsR) ?? []).map((t) => [t.id, t.name] as const)
  )
  // by_therapist ของ rollup คือ "ยอดขายที่หมอคนนั้นทำให้ร้าน" ไม่ใช่ค่ามือที่หมอได้รับ
  // (ค่ามือจริงอยู่หน้า /commission) — ห้ามติดป้ายว่า "ค่ามือ" เด็ดขาด
  const top = topTherapists(rollupMtdData.byTherapist, therapistNames, 5)
  const flags = guaranteeFlags(
    therapistDays
      .filter((d) => d.therapist_id !== null && d.work_date !== null && d.work_date >= mtd.from)
      .map((d) => ({ therapist_id: d.therapist_id!, hitGuarantee: d.status === "ใช้ประกัน" })),
    therapistNames
  )
  const queueRows = value(queueR) ?? []
  const todayStatus = {
    checkedIn: value(attendanceR) ?? 0,
    queueTotal: queueRows.length,
    // "เสร็จ" = จ่ายเงินแล้ว (มีบิลผูก หรือสถานะ paid) — กติกาเดียวกับกระดานคิว
    queueDone: queueRows.filter((q) => q.status === "paid" || q.sale_id !== null).length,
  }
  const teamHeadline = `${
    top.length > 0
      ? `เดือนนี้ ${top[0].name} ทำยอดขายให้ร้านสูงสุด ${formatBaht(top[0].revenue)}฿`
      : "เดือนนี้ยังไม่มียอดรายหมอนวด"
  } · วันนี้เข้างาน ${todayStatus.checkedIn} คน · คิว ${todayStatus.queueDone}/${todayStatus.queueTotal}`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">ภาพรวม</h1>
          {/* ทุกโซนพูดถึง "วันนี้/เดือนนี้" เท่านั้น — บอกวันให้ชัดว่าตัวเลขยังวิ่งอยู่ */}
          <p className="text-sm text-slate-600">{formatThaiDate(today)} · ตัวเลขวันนี้คือ ณ ตอนนี้</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/finance">ย้อนดูรายเดือน</Link>
          </Button>
          {/* ตารางเครดิตสมาชิกเต็ม (bottom-10 เดิม) ย้ายไปหน้า /members ตามสเปก —
              โซน 3 เก็บแค่ 3 คนที่ใกล้หมดที่สุด ต้องมีทางไปดูรายชื่อเต็ม */}
          <Button asChild variant="outline" size="sm">
            <Link href="/members">เครดิตสมาชิก</Link>
          </Button>
        </div>
      </div>

      {/* โซน 1 เต็มความกว้างเสมอ — คำตอบแรกที่เจ้าของร้านต้องเห็นก่อนใคร */}
      {zone1Failed ? (
        <ZoneError zone="วันนี้/เดือนนี้เป็นไง" />
      ) : (
        <VerdictStrip
          sentence={sentence}
          mtd={mtdDelta}
          todayRevenue={todayRevenue}
          todayBills={todayBills}
          target={
            target > 0
              ? {
                  amount: target,
                  achieved: (revenueMtd / target) * 100,
                  runRate: runRate?.perDay ?? 0,
                }
              : null
          }
        />
      )}

      {/* มือถือ: 2 → 3 → 4 เรียงลงมา · ≥lg: การเงินกิน 2 ส่วน ลูกค้า+ทีมซ้อนกันคอลัมน์ขวา */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {zone2Failed ? (
            <ZoneError zone="เงินไปไหน" />
          ) : (
            <>
              <MoneyZone
                headline={moneyHeadline}
                profit={profitMtd}
                margin={margin}
                profitDelta={profitDelta}
                anomalyChips={anomalyChips}
                chart={chart}
              />
              {incomplete && (
                <Card className="border-amber-300 bg-amber-50">
                  <CardContent className="py-3 text-sm text-amber-900">
                    <p className="font-semibold">เดือนนี้ยังบันทึกรายจ่ายไม่ครบ</p>
                    <p className="text-amber-800">
                      ค่าเช่าและเงินเดือนมักบันทึกตอนสิ้นเดือน กำไรและ margin ข้างบน
                      จึงสูงกว่าความจริง — อย่าเพิ่งใช้ตัวเลขนี้ตัดสินใจ
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>

        <div className="space-y-4">
          {zone3Failed ? <ZoneError zone="ลูกค้าที่ต้องดูแลด่วน" /> : <CareList items={careItems} />}
          {zone4Failed ? (
            <ZoneError zone="ทีมเป็นไง" />
          ) : (
            <TeamZone
              headline={teamHeadline}
              top={top}
              flags={flags}
              todayStatus={todayStatus}
            />
          )}
        </div>
      </div>
    </div>
  )
}
