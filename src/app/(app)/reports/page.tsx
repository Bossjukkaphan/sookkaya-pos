import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { formatBaht } from "@/lib/constants"
import {
  CHANNEL_LABEL,
  SOURCE_LABEL,
  isBookingChannel,
  isCustomerSource,
} from "@/lib/customer-source"
import { formatThaiDate, todayInShopTz } from "@/lib/datetime"
import { InsightsAccessDenied, canSeeInsights } from "@/app/(app)/insights/shared"
import { getMyProfile } from "@/lib/auth"
import { MONEY_INFO } from "@/lib/money-info"
import { PAY_DOT, PAY_DOT_DEFAULT } from "@/lib/payment-colors"
import { promoKey } from "@/lib/promo"
import { BarChart } from "@/components/charts/bar-chart"
import { InfoDot } from "@/components/info-dot"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export const metadata = { title: "รายงาน · สุขกายา POS" }

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const supabase = await createClient()

  // หน้านี้มีกำไรหยาบ — สงวนให้ผู้จัดการขึ้นไป เหมือนหน้าวิเคราะห์อื่น
  const profile = await getMyProfile()
  if (!canSeeInsights(profile?.role)) {
    return <InsightsAccessDenied title="รายงาน" />
  }

  const params = await searchParams
  const today = todayInShopTz()

  // เดือนที่แล้วเต็มเดือน (ปุ่มลัดเทียบยอดเดือนต่อเดือน)
  const [ty, tm] = today.split("-").map(Number)
  const prevM = new Date(Date.UTC(ty, tm - 2, 1))
  const prevMonth = `${prevM.getUTCFullYear()}-${String(prevM.getUTCMonth() + 1).padStart(2, "0")}`
  const prevMonthEnd = new Date(Date.UTC(ty, tm - 1, 0)).getUTCDate()

  // ช่วงสำเร็จรูปแบบ Thai Hand: วันนี้ / เมื่อวาน / 7 วัน / เดือนนี้ / เดือนที่แล้ว + กำหนดเอง
  const presets = [
    { key: "today", label: "วันนี้", from: today, to: today },
    { key: "yesterday", label: "เมื่อวาน", from: shiftDate(today, -1), to: shiftDate(today, -1) },
    { key: "7d", label: "7 วันล่าสุด", from: shiftDate(today, -6), to: today },
    { key: "month", label: "เดือนนี้", from: `${today.slice(0, 7)}-01`, to: today },
    {
      key: "lastMonth",
      label: "เดือนที่แล้ว",
      from: `${prevMonth}-01`,
      to: `${prevMonth}-${String(prevMonthEnd).padStart(2, "0")}`,
    },
  ] as const

  const isDate = (s: string | undefined): s is string =>
    !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
  const from = isDate(params.from) ? params.from : presets[3].from
  const to = isDate(params.to) ? params.to : presets[3].to
  const activePreset = presets.find((p) => p.from === from && p.to === to)?.key
  const isSingleDay = from === to

  const [
    { data: sales },
    { data: expenses },
    { data: therapists },
    { data: therapistDaily },
  ] = await Promise.all([
    supabase
      .from("sales")
      .select(
        "sale_date, sale_time, therapist_id, service_name, net_amount, revenue_recognize, commission, request_fee, payment_method, discount, coupon_promo, source, booking_channel, customer_id, credit_used, bonus_used"
      )
      .gte("sale_date", from)
      .lte("sale_date", to),
    supabase
      .from("expenses")
      .select("amount, category")
      .gte("expense_date", from)
      .lte("expense_date", to),
    supabase.from("therapists").select("id, name"),
    supabase
      .from("v_therapist_daily")
      .select("work_date, therapist_id, sessions, total_commission, net_commission, request_fee, total_income")
      .gte("work_date", from)
      .lte("work_date", to),
  ])

  // เงินเข้าบัญชีเอาจาก view สูตรกลาง (ยอดขายไม่รวมเครดิต + เงินเติมสมาชิก)
  // ห้ามคิดสูตรเงินใหม่ในหน้านี้ — แยกช่องทางค่อยประกอบจากข้อมูลดิบให้ผลรวมตรงกัน
  const [
    { data: dailySummary },
    { data: topups },
    { data: promos },
    { data: promoAliases },
    { data: paymentLines },
  ] = await Promise.all([
      supabase
        .from("v_daily_summary")
        .select("cash_in")
        .gte("sale_date", from)
        .lte("sale_date", to),
      supabase
        .from("member_topups")
        .select("cash_received, payment_method")
        .gte("topup_date", from)
        .lte("topup_date", to),
      // จัดกลุ่มส่วนลดตามชื่อโปรจริง — พนักงานพิมพ์ชื่อโปรได้หลายแบบ (เคยมี Happy Hour 8 แบบ)
      // ต้อง map ผ่าน aliases ไม่งั้นโปรเดียวกันแตกเป็นหลายบรรทัด
      supabase.from("promotions").select("id, name"),
      supabase.from("promotion_aliases").select("raw_key, promotion_id"),
      // เงินจริงตามบรรทัดชำระ (บิลเก่า view สังเคราะห์ให้เท่าสูตรเดิมเป๊ะ) — กรองด้วย
      // received_date (วันเงินเข้าจริง) ไม่ใช่ sale_date เพื่อให้บิลค้างรับที่มาจ่ายวันหลัง
      // ขึ้นในวันที่จ่ายจริง ไม่ใช่วันบิล
      supabase
        .from("v_bill_payments")
        .select("bill_key, method, amount")
        .gte("received_date", from)
        .lte("received_date", to),
    ])

  const rows = sales ?? []
  const therapistName = new Map((therapists ?? []).map((t) => [t.id, t.name]))

  const revenue = rows.reduce(
    (sum, s) => sum + Number(s.revenue_recognize ?? s.net_amount),
    0
  )
  const discountTotal = rows.reduce((sum, s) => sum + Number(s.discount ?? 0), 0)

  // ส่วนลดแยกตามโปรโมชั่น: map ชื่อที่พนักงานพิมพ์ → โปรจริงผ่าน aliases
  // ที่จับคู่ไม่ได้รวมเป็น "อื่นๆ" พร้อมโชว์ข้อความดิบที่เจอบ่อยสุด
  const promoNameById = new Map((promos ?? []).map((p) => [p.id, p.name]))
  const promoIdByKey = new Map(
    (promoAliases ?? []).map((a) => [a.raw_key, a.promotion_id])
  )
  const discountByPromo = new Map<string, { amount: number; uses: number }>()
  for (const s of rows) {
    const discount = Number(s.discount ?? 0)
    if (discount <= 0) continue
    const key = promoKey(s.coupon_promo)
    const promoId = promoIdByKey.get(key)
    const name =
      (promoId ? promoNameById.get(promoId) : null) ??
      (s.coupon_promo?.trim() || "ไม่ระบุโปรโมชั่น")
    const agg = discountByPromo.get(name) ?? { amount: 0, uses: 0 }
    agg.amount += discount
    agg.uses += 1
    discountByPromo.set(name, agg)
  }
  const promoBreakdown = [...discountByPromo.entries()].sort(
    (a, b) => b[1].amount - a[1].amount
  )

  // การ์ดเขียว/ม่วงแบบ Thai Hand — ตัวเลขทุกตัวจากสูตรกลางเดิม ไม่นิยามใหม่
  // สมการที่ต้องลงตัวเสมอ: ยอดรับจริง − เครดิตแถมที่ใช้ = รายได้ที่รับรู้
  const volumeTotal = rows.reduce((sum, s) => sum + Number(s.net_amount ?? 0), 0)
  const bonusUsedTotal = rows.reduce((sum, s) => sum + Number(s.bonus_used ?? 0), 0)
  const creditUsedTotal = rows.reduce((sum, s) => sum + Number(s.credit_used ?? 0), 0)
  // มูลค่าเต็มตามเมนูก่อนหักส่วนลด — จุดตั้งต้นของ waterfall รายรับ
  const grossTotal = volumeTotal + discountTotal
  const topupTotal = (topups ?? []).reduce(
    (sum, t) => sum + Number(t.cash_received ?? 0),
    0
  )
  const cashInTotal = (dailySummary ?? []).reduce(
    (sum, d) => sum + Number(d.cash_in ?? 0),
    0
  )
  // แยกช่องทางของเงินเข้าบัญชี: เงินจริงตามบรรทัดชำระ (v_bill_payments) + เงินเติมสมาชิกตามช่องทางที่จ่าย
  // เครดิตไม่ใช่เงินเข้า จึงไม่อยู่ใน v_bill_payments อยู่แล้ว (ตัด Member Credit ออกตั้งแต่ต้นทาง)
  const cashByChannel = new Map<string, number>()
  for (const p of paymentLines ?? []) {
    cashByChannel.set(p.method, (cashByChannel.get(p.method) ?? 0) + Number(p.amount))
  }
  for (const t of topups ?? []) {
    const m = t.payment_method
    cashByChannel.set(m, (cashByChannel.get(m) ?? 0) + Number(t.cash_received ?? 0))
  }

  const commissionCost = (therapistDaily ?? []).reduce(
    (sum, d) => sum + Number(d.total_income ?? 0),
    0
  )
  const guaranteeTopUp = (therapistDaily ?? []).reduce(
    (sum, d) =>
      sum + (Number(d.net_commission ?? 0) - Number(d.total_commission ?? 0)),
    0
  )

  const byTherapist = new Map<string, { income: number; days: number; sessions: number }>()
  for (const d of therapistDaily ?? []) {
    const id = d.therapist_id ?? ""
    const agg = byTherapist.get(id) ?? { income: 0, days: 0, sessions: 0 }
    agg.income += Number(d.total_income ?? 0)
    agg.days += 1
    agg.sessions += Number(d.sessions ?? 0)
    byTherapist.set(id, agg)
  }

  // รายจ่ายหมวด HR/payroll คือ "ค่ามือที่จ่ายจริง" ตัวเดียวกับ commissionCost
  // เอามารวมอีกรอบจะนับค่ามือซ้ำสอง กำไรติดลบทั้งที่ไม่ได้ขาดทุน
  const isPayroll = (c: string) => c.startsWith("HR / payroll")
  const payrollPaid = (expenses ?? [])
    .filter((e) => isPayroll(e.category))
    .reduce((sum, e) => sum + Number(e.amount), 0)
  const otherExpenses = (expenses ?? [])
    .filter((e) => !isPayroll(e.category))
    .reduce((sum, e) => sum + Number(e.amount), 0)
  const expenseTotal = payrollPaid + otherExpenses
  const grossProfit = revenue - commissionCost - otherExpenses

  // เงินจริงตามบรรทัดชำระ (บิลเก่า view สังเคราะห์ให้เท่าสูตรเดิมเป๊ะ) + เครดิตจาก credit_used เหมือนเดิม
  const byPayment: Record<string, number> = {}
  for (const p of paymentLines ?? []) {
    byPayment[p.method] = (byPayment[p.method] ?? 0) + Number(p.amount)
  }
  const creditTotal = rows.reduce((s, r) => s + Number(r.credit_used ?? 0), 0)
  if (creditTotal > 0) byPayment["Member Credit"] = creditTotal

  const byService = rows.reduce<Record<string, { count: number; revenue: number }>>(
    (acc, s) => {
      const name = s.service_name ?? "ไม่ระบุ"
      acc[name] ??= { count: 0, revenue: 0 }
      acc[name].count += 1
      acc[name].revenue += Number(s.net_amount)
      return acc
    },
    {}
  )
  const topServices = Object.entries(byService)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 8)

  // ลูกค้าตามช่วงเวลา (บิลที่มีเวลาเท่านั้น — ของ import เก่าบางส่วนไม่มี)
  const byHour = new Map<number, number>()
  for (const s of rows) {
    if (!s.sale_time) continue
    const h = Number(s.sale_time.slice(0, 2))
    byHour.set(h, (byHour.get(h) ?? 0) + 1)
  }
  const hourPoints = Array.from({ length: 12 }, (_, i) => {
    const h = i + 10
    return { label: String(h), value: byHour.get(h) ?? 0 }
  })

  // ยอดขาย/จำนวนบิลตามวัน — มีความหมายเมื่อช่วงเกิน 1 วัน
  const byDay = new Map<string, { revenue: number; bills: number }>()
  for (const s of rows) {
    const d = s.sale_date
    const agg = byDay.get(d) ?? { revenue: 0, bills: 0 }
    agg.revenue += Number(s.revenue_recognize ?? s.net_amount)
    agg.bills += 1
    byDay.set(d, agg)
  }
  const dayKeys = [...byDay.keys()].sort()
  const dayRevenuePoints = dayKeys.map((d) => ({
    label: d.slice(8, 10),
    value: byDay.get(d)!.revenue,
  }))
  const dayBillPoints = dayKeys.map((d) => ({
    label: d.slice(8, 10),
    value: byDay.get(d)!.bills,
  }))

  // ช่องทางการจอง: booking แยกย่อยตามช่องทาง · เรียงตามรายได้
  type ChannelAgg = { count: number; revenue: number }
  const bySource = new Map<string, ChannelAgg>()
  const byBookingChannel = new Map<string, ChannelAgg>()
  for (const s of rows) {
    const src = s.source && isCustomerSource(s.source) ? s.source : "unknown"
    const a = bySource.get(src) ?? { count: 0, revenue: 0 }
    a.count += 1
    a.revenue += Number(s.net_amount)
    bySource.set(src, a)
    if (src === "booking") {
      const ch =
        s.booking_channel && isBookingChannel(s.booking_channel)
          ? s.booking_channel
          : "unknown"
      const c = byBookingChannel.get(ch) ?? { count: 0, revenue: 0 }
      c.count += 1
      c.revenue += Number(s.net_amount)
      byBookingChannel.set(ch, c)
    }
  }
  const totalBills = rows.length
  const sourceOrder = ["booking", "walk_in", "agency", "unknown"] as const
  const sourceLabel = (k: string) =>
    k === "unknown" ? "ไม่ทราบ (บิลเก่า)" : SOURCE_LABEL[k as keyof typeof SOURCE_LABEL]
  const channelLabel = (k: string) =>
    k === "unknown" ? "ไม่ระบุช่องทาง" : CHANNEL_LABEL[k as keyof typeof CHANNEL_LABEL]

  // ลูกค้าในช่วง: ยูนีค · ใหม่ (มาครั้งแรกในช่วงนี้) · บิลไม่ระบุชื่อ · ปฏิเสธ
  const customerIds = [
    ...new Set(
      rows.map((s) => s.customer_id).filter((id): id is string => id !== null)
    ),
  ]
  const unnamedBills = rows.filter((s) => s.customer_id === null).length

  const [{ data: rangeCustomers }, { data: firstVisits }, { count: turnAways }] =
    await Promise.all([
      customerIds.length
        ? supabase
            .from("customers")
            .select("id, gender, nationality, birthday")
            .in("id", customerIds)
        : Promise.resolve({ data: [] as { id: string; gender: string | null; nationality: string | null; birthday: string | null }[] }),
      customerIds.length
        ? supabase
            .from("v_customer_ltv")
            .select("customer_id, first_visit")
            .in("customer_id", customerIds)
        : Promise.resolve({ data: [] as { customer_id: string | null; first_visit: string | null }[] }),
      supabase
        .from("turn_aways")
        .select("id", { count: "exact", head: true })
        .gte("queue_date", from)
        .lte("queue_date", to),
    ])

  const newCustomers = (firstVisits ?? []).filter(
    (v) => v.first_visit && v.first_visit >= from && v.first_visit <= to
  ).length

  // แจกแจงเพศ/สัญชาติ/ช่วงอายุของลูกค้ายูนีคในช่วง — ไม่ทราบ = ไม่เดา
  const tally = (vals: (string | null)[]) => {
    const m = new Map<string, number>()
    for (const v of vals) {
      const k = v ?? "ไม่ระบุ"
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }
  const genderTally = tally((rangeCustomers ?? []).map((c) => c.gender))
  const nationalityTally = tally(
    (rangeCustomers ?? []).map((c) => c.nationality?.trim() || null)
  ).slice(0, 5)
  const ageOf = (birthday: string | null): string | null => {
    if (!birthday) return null
    const age = Math.floor(
      (Date.parse(today) - Date.parse(birthday)) / (365.25 * 86_400_000)
    )
    if (!Number.isFinite(age) || age < 0 || age > 120) return null
    if (age < 20) return "ต่ำกว่า 20"
    if (age < 30) return "20-29"
    if (age < 40) return "30-39"
    if (age < 50) return "40-49"
    return "50 ขึ้นไป"
  }
  const ageTally = tally((rangeCustomers ?? []).map((c) => ageOf(c.birthday)))

  const rangeLabel = isSingleDay
    ? formatThaiDate(from)
    : `${formatThaiDate(from)} – ${formatThaiDate(to)}`

  const exportQs = new URLSearchParams({ type: "sales", from, to })
  const exportExpQs = new URLSearchParams({ type: "expenses", from, to })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">รายงาน</h1>
        <p className="text-sm text-slate-600">{rangeLabel}</p>
      </div>

      {/* เลือกช่วง: ปุ่มสำเร็จรูป + กำหนดเอง */}
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <Link
            key={p.key}
            href={`/reports?from=${p.from}&to=${p.to}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              activePreset === p.key
                ? "border-emerald-600 bg-emerald-50 font-medium text-emerald-900"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {p.label}
          </Link>
        ))}
        <form action="/reports" className="flex items-center gap-1">
          <Input type="date" name="from" defaultValue={from} className="h-9 w-auto text-sm" />
          <span className="text-slate-400">–</span>
          <Input type="date" name="to" defaultValue={to} className="h-9 w-auto text-sm" />
          <Button type="submit" size="sm" variant="outline">
            ดู
          </Button>
        </form>
      </div>

      {/* คู่การ์ดหลักแบบ Thai Hand: รายรับ (เขียว) · เงินเข้าบัญชี (ม่วง) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border-2 border-emerald-500 bg-white">
          <div className="flex items-baseline justify-between rounded-t-[10px] bg-emerald-600 px-4 py-2.5 text-white">
            <span className="flex items-center gap-1 text-sm font-semibold">
              รายรับทั้งหมด <InfoDot text={MONEY_INFO.netRevenue} light />
            </span>
            <span className="text-2xl font-extrabold">{formatBaht(revenue)}</span>
          </div>
          <div className="space-y-1.5 px-4 py-3 text-sm">
            <p className="text-xs text-slate-500">อิงตามวันที่ลูกค้าเข้าใช้บริการ</p>
            {/* waterfall เต็ม: มูลค่าเมนู − ส่วนลด = Volume − เครดิตแถม = รายรับที่รับรู้ */}
            <div className="flex justify-between">
              <span className="flex items-center gap-1 text-slate-600">
                มูลค่าเต็มตามเมนู{" "}
                <InfoDot text="ยอดถ้าทุกบิลจ่ายราคาเต็มตามเมนู ไม่หักส่วนลดใดๆ — ใช้ดูว่าร้านให้ส่วนลดไปกี่ % ของมูลค่างาน" />
              </span>
              <span className="font-medium">{formatBaht(grossTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-1 text-slate-600">
                − ส่วนลดที่ให้{" "}
                <InfoDot text="ส่วนลดโปรโมชั่นหน้าร้านทุกแบบ (Happy Hour, Gowabi, KOL ฯลฯ) — ไม่รวมเครดิตแถมสมาชิกซึ่งแยกบรรทัดข้างล่าง" />
              </span>
              <span className="font-medium text-rose-600">
                -{formatBaht(discountTotal)}
              </span>
            </div>
            <div className="flex justify-between border-t pt-1.5">
              <span className="flex items-center gap-1 text-slate-600">
                = ยอดรับจริง (Volume) <InfoDot text={MONEY_INFO.volume} />
              </span>
              <span className="font-medium">{formatBaht(volumeTotal)}</span>
            </div>
            <div className="flex justify-between pl-3 text-xs text-slate-500">
              <span>ในนี้จ่ายด้วยเครดิตสมาชิก</span>
              <span>{formatBaht(creditUsedTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-1 text-slate-600">
                − ส่วนลดจากเครดิตแถมสมาชิก{" "}
                <InfoDot text="เครดิตแถมจากแพ็กเกจสมาชิกที่ถูกใช้จ่ายในช่วงนี้ — คือส่วนลดที่ร้านให้เพราะเป็นเมมเบอร์ ไม่ใช่เงินที่ใครจ่ายมา จึงหักออกจากรายได้" />
              </span>
              <span className="font-medium text-rose-600">
                -{formatBaht(bonusUsedTotal)}
              </span>
            </div>
            <div className="flex justify-between border-t pt-1.5">
              <span className="font-semibold">= รายรับที่รับรู้</span>
              <span className="font-bold text-emerald-700">{formatBaht(revenue)}</span>
            </div>
            <div className="flex justify-between border-t pt-1.5">
              <span className="text-slate-600">เติมเงินสมาชิกในช่วงนี้</span>
              <span className="font-medium">{formatBaht(topupTotal)}</span>
            </div>
            <p className="pl-3 text-xs text-slate-400">
              ไม่นับเป็นรายได้ (เป็นภาระให้บริการ) — ไปโผล่ในเงินเข้าบัญชีแทน
            </p>
          </div>
        </div>

        <div className="rounded-xl border-2 border-violet-500 bg-white">
          <div className="flex items-baseline justify-between rounded-t-[10px] bg-violet-600 px-4 py-2.5 text-white">
            <span className="flex items-center gap-1 text-sm font-semibold">
              เงินเข้าบัญชี <InfoDot text={MONEY_INFO.cashIn} light />
            </span>
            <span className="text-2xl font-extrabold">{formatBaht(cashInTotal)}</span>
          </div>
          <div className="space-y-1.5 px-4 py-3 text-sm">
            <p className="text-xs text-slate-500">
              ยอดขายที่ไม่ใช่เครดิตสมาชิก + เงินเติมสมาชิก
            </p>
            {[...cashByChannel.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([method, amount]) => (
                <div key={method} className="flex justify-between">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${PAY_DOT[method] ?? PAY_DOT_DEFAULT}`}
                    />
                    {method}
                  </span>
                  <span className="font-medium">{formatBaht(amount)}</span>
                </div>
              ))}
            {cashByChannel.size === 0 && (
              <p className="py-2 text-center text-xs text-slate-400">
                ไม่มีเงินเข้าในช่วงนี้
              </p>
            )}
          </div>
        </div>
      </div>

      {/* สรุปกำไรหยาบ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">สรุป</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Line label="ยอดขายรวม (รายได้รับรู้)" value={revenue} />
          <Line label="ค่ามือหมอ (รวมประกัน + รีเควส)" value={-commissionCost} />
          <Line label="รายจ่ายอื่นๆ" value={-otherExpenses} />
          <div className="border-t pt-2">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">กำไรหยาบ</span>
              <span
                className={`text-2xl font-bold ${
                  grossProfit >= 0 ? "text-emerald-800" : "text-red-700"
                }`}
              >
                {formatBaht(grossProfit)} ฿
              </span>
            </div>
          </div>
          {guaranteeTopUp > 0 && (
            <p className="text-xs text-amber-700">
              ในนี้เป็นส่วนที่จ่ายเกินค่ามือจริงเพราะประกันมือ {formatBaht(guaranteeTopUp)} บาท
            </p>
          )}
          {payrollPaid > 0 && (
            <p className="text-xs text-slate-500">
              หมายเหตุ: รายจ่ายหมวด HR / payroll {formatBaht(payrollPaid)} บาท
              ไม่ถูกนำมาหักซ้ำ เพราะเป็นการจ่ายค่ามือก้อนเดียวกับด้านบน
              (รายจ่ายทั้งช่วงรวม {formatBaht(expenseTotal)} บาท)
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MiniStat label="จำนวนบิล" value={String(totalBills)} />
        <MiniStat
          label="เฉลี่ย/บิล"
          value={`${formatBaht(totalBills ? Math.round(revenue / totalBills) : 0)} ฿`}
        />
        <MiniStat
          label="ส่วนลดที่ให้"
          value={`${formatBaht(discountTotal)} ฿`}
          tone={discountTotal > 0 ? "warn" : "normal"}
          hint="ส่วนลดโปรฯ หน้าร้าน · ไม่รวมเครดิตแถมสมาชิก"
        />
        <MiniStat label="ค่ามือหมอนวด" value={`${formatBaht(commissionCost)} ฿`} />
        <MiniStat label="รายจ่ายในช่วง" value={`${formatBaht(expenseTotal)} ฿`} />
        <MiniStat
          label="ค่าคอมเอเจนซี่"
          value="—"
          hint="รอตั้งค่า % Gowabi"
        />
      </div>

      {/* ส่วนลดแยกตามโปรโมชั่น — เห็นว่าเงินส่วนลดไหลไปโปรไหนเท่าไหร่ */}
      {promoBreakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ส่วนลดตามโปรโมชั่น</CardTitle>
            <p className="text-xs text-slate-500">
              รวม {formatBaht(discountTotal)} ฿ · คุ้มไหมดูที่{" "}
              <Link href="/insights/promotions" className="text-emerald-700 underline">
                ROI ส่วนลด
              </Link>
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {promoBreakdown.map(([name, agg]) => {
              const pct = discountTotal > 0 ? (agg.amount / discountTotal) * 100 : 0
              return (
                <div key={name}>
                  <div className="flex justify-between text-sm">
                    <span className="min-w-0 truncate text-slate-600">
                      {name}{" "}
                      <span className="text-xs text-slate-400">× {agg.uses}</span>
                    </span>
                    <span className="font-medium whitespace-nowrap text-rose-600">
                      -{formatBaht(agg.amount)} ฿{" "}
                      <span className="text-xs font-normal text-slate-400">
                        ({pct.toFixed(0)}%)
                      </span>
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-rose-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {!isSingleDay && dayKeys.length > 1 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">ยอดขายตามวัน</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart points={dayRevenuePoints} unit=" ฿" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">จำนวนบิลตามวัน</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart points={dayBillPoints} unit=" บิล" color="#0284c7" />
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">ลูกค้าตามช่วงเวลา</CardTitle>
          <p className="text-xs text-slate-500">นับจากบิลที่บันทึกเวลาไว้ · แตะแท่งดูจำนวน</p>
        </CardHeader>
        <CardContent>
          <BarChart points={hourPoints} unit=" บิล" color="#7c3aed" />
        </CardContent>
      </Card>

      {/* ช่องทางการจอง — ข้อมูลจาก Phase A เริ่มเก็บ 22 ก.ค. เป็นต้นไป */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">ช่องทางการจอง</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sourceOrder
            .filter((k) => bySource.has(k))
            .map((k) => {
              const a = bySource.get(k)!
              const pct = totalBills > 0 ? (a.count / totalBills) * 100 : 0
              return (
                <div key={k}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{sourceLabel(k)}</span>
                    <span>
                      {a.count} บิล{" "}
                      <span className="text-xs text-slate-400">({pct.toFixed(0)}%)</span>{" "}
                      <span className="font-medium text-emerald-700">
                        {formatBaht(a.revenue)} ฿
                      </span>
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-violet-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {k === "booking" && byBookingChannel.size > 0 && (
                    <div className="mt-1 mb-2 space-y-0.5 pl-4">
                      {[...byBookingChannel.entries()]
                        .sort((x, y) => y[1].revenue - x[1].revenue)
                        .map(([ch, c]) => (
                          <div
                            key={ch}
                            className="flex justify-between text-xs text-slate-600"
                          >
                            <span>{channelLabel(ch)}</span>
                            <span>
                              {c.count} บิล · {formatBaht(c.revenue)} ฿
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )
            })}
          {totalBills === 0 && (
            <p className="py-3 text-center text-sm text-slate-500">ไม่มีบิลในช่วงนี้</p>
          )}
        </CardContent>
      </Card>

      {/* ลูกค้าในช่วง — เพศ/อายุ/สัญชาติมาจากโปรไฟล์ที่กรอกไว้ ไม่ทราบ = ไม่เดา */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">ลูกค้า</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">ลูกค้ายูนีค</p>
              <p className="text-lg font-bold">{customerIds.length} คน</p>
            </div>
            <div className="rounded-lg bg-emerald-50 px-3 py-2">
              <p className="text-xs text-slate-500">ลูกค้าใหม่</p>
              <p className="text-lg font-bold text-emerald-700">{newCustomers} คน</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">บิลไม่ระบุชื่อ</p>
              <p className="text-lg font-bold">{unnamedBills}</p>
            </div>
            <div className="rounded-lg bg-red-50 px-3 py-2">
              <p className="text-xs text-slate-500">ปฏิเสธลูกค้า</p>
              <p
                className={`text-lg font-bold ${(turnAways ?? 0) > 0 ? "text-red-700" : ""}`}
              >
                {turnAways ?? 0} ครั้ง
              </p>
            </div>
          </div>

          {customerIds.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <TallyBlock title="เพศ" data={genderTally} total={customerIds.length} />
              <TallyBlock title="ช่วงอายุ" data={ageTally} total={customerIds.length} />
              <TallyBlock
                title="สัญชาติ"
                data={nationalityTally}
                total={customerIds.length}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {byTherapist.size > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ค่ามือรายหมอ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(() => {
              const list = [...byTherapist.entries()].sort(
                (a, b) => b[1].income - a[1].income
              )
              const maxIncome = Math.max(...list.map(([, v]) => v.income), 1)
              return list.map(([id, v]) => (
                <div key={id}>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">
                      {therapistName.get(id) ?? "ไม่ระบุ"}{" "}
                      <span className="text-slate-400">
                        ({v.days} วัน · {v.sessions} เซสชัน)
                      </span>
                    </span>
                    <span className="font-medium">{formatBaht(v.income)} ฿</span>
                  </div>
                  <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${(v.income / maxIncome) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            })()}
          </CardContent>
        </Card>
      )}

      {Object.keys(byPayment).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ช่องทางชำระเงิน</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(() => {
              const entries = Object.entries(byPayment).sort((a, b) => b[1] - a[1])
              const totalPay = entries.reduce((s, [, v]) => s + v, 0)
              return entries.map(([method, amount]) => {
                const pct = totalPay > 0 ? (amount / totalPay) * 100 : 0
                return (
                  <div key={method}>
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-slate-600">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${PAY_DOT[method] ?? PAY_DOT_DEFAULT}`}
                        />
                        {method}
                      </span>
                      <span className="font-medium">
                        {formatBaht(amount)} ฿{" "}
                        <span className="text-xs text-slate-400">({pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${PAY_DOT[method] ?? PAY_DOT_DEFAULT}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })
            })()}
          </CardContent>
        </Card>
      )}

      {topServices.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">เมนูขายดี</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(() => {
              const maxRevenue = Math.max(...topServices.map(([, v]) => v.revenue), 1)
              return topServices.map(([name, v]) => (
                <div key={name}>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-slate-600">
                      {name} <span className="text-slate-400">×{v.count}</span>
                    </span>
                    <span className="font-medium whitespace-nowrap">
                      {formatBaht(v.revenue)} ฿
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-sky-500"
                      style={{ width: `${(v.revenue / maxRevenue) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            })()}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">ดาวน์โหลดข้อมูล (ตามช่วงที่เลือก)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={`/api/export?${exportQs.toString()}`}>ยอดขาย (CSV)</a>
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/export?${exportExpQs.toString()}`}>รายจ่าย (CSV)</a>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/history?from=${from}&to=${to}`}>🧾 ดูรายบิล (ประวัติบิล)</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={value < 0 ? "text-red-700" : "font-medium"}>
        {formatBaht(value)} ฿
      </span>
    </div>
  )
}

/** แจกแจงสัดส่วนแบบแถบ — ภาษาภาพเดียวกับการ์ดอื่นทั้งระบบ (ไม่ใช้ pie) */
function TallyBlock({
  title,
  data,
  total,
}: {
  title: string
  data: [string, number][]
  total: number
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-slate-600">{title}</p>
      <div className="space-y-1">
        {data.map(([label, count]) => {
          const pct = total > 0 ? (count / total) * 100 : 0
          return (
            <div key={label}>
              <div className="flex justify-between text-xs">
                <span
                  className={label === "ไม่ระบุ" ? "text-slate-400" : "text-slate-600"}
                >
                  {label}
                </span>
                <span className="font-medium">
                  {count} <span className="text-slate-400">({pct.toFixed(0)}%)</span>
                </span>
              </div>
              <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${
                    label === "ไม่ระบุ" ? "bg-slate-300" : "bg-violet-500"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MiniStat({
  label,
  value,
  tone = "normal",
  hint,
}: {
  label: string
  value: string
  tone?: "normal" | "warn"
  hint?: string
}) {
  return (
    <Card>
      <CardContent className="py-3.5">
        <p className="text-xs text-slate-500">{label}</p>
        <p
          className={`text-lg font-bold ${
            tone === "warn" ? "text-amber-600" : "text-slate-900"
          }`}
        >
          {value}
        </p>
        {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
      </CardContent>
    </Card>
  )
}
