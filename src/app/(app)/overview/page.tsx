import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { formatBaht } from "@/lib/constants"
import { formatThaiDate, todayInShopTz } from "@/lib/datetime"
import { isMonthIncomplete, targetRunRate } from "@/lib/finance"
import {
  BUCKET_CLASS,
  BUCKET_LABEL,
  creditBucket,
  summarizeCredit,
  type CreditBucket,
} from "@/lib/member-credit"
import { GroupedBarChart } from "@/components/charts/grouped-bar-chart"
import { LineChart } from "@/components/charts/line-chart"
import { InfoDot } from "@/components/info-dot"
import { MONEY_INFO } from "@/lib/money-info"
import { StatCard } from "@/components/stat-card"
import { InsightsAccessDenied, canSeeInsights } from "../insights/shared"
import { monthLabel, monthShortLabel, shiftMonth } from "../finance/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export const metadata = { title: "ภาพรวม · สุขกายา POS" }

const n = (x: number | string | null | undefined) => Number(x ?? 0)

/**
 * เพดาน 1000 แถวของ supabase-js ตัดผลลัพธ์เงียบๆ — ขอมาน้อยกว่านั้นแล้วเทียบกับ
 * count จริง จะได้รู้ตัวว่าโดนตัดและบอกผู้ใช้ได้ แทนที่จะแสดงตัวเลขที่ขาดไปเฉยๆ
 */
const MEMBER_LIMIT = 500

/** ห่างกันกี่วัน · ทั้งสองค่าเป็น YYYY-MM-DD ตามเวลาไทยแล้ว */
function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const supabase = await createClient()
  const profile = await getMyProfile()

  if (!canSeeInsights(profile?.role)) {
    return <InsightsAccessDenied title="ภาพรวม" />
  }

  const params = await searchParams
  const today = todayInShopTz()
  const month = params.month ?? today.slice(0, 7)

  // เดือนถัดไปแบบ exclusive — ใช้กรองช่วงวันของ view รายวัน
  const monthStart = `${month}-01`
  const nextMonthStart = `${shiftMonth(month, 1)}-01`

  const [
    { data: plRows },
    { data: memberActivityRows },
    { data: targetSetting },
    { data: memberRows, count: memberCount },
    { data: therapistDays },
  ] = await Promise.all([
    supabase.from("v_monthly_pl").select("*").order("month"),
    supabase.from("v_monthly_member_activity").select("*").order("month"),
    supabase
      .from("settings")
      .select("value")
      .eq("key", "monthly_target")
      .maybeSingle(),
    // member_balances มีหนึ่งแถวต่อ "ลูกค้าทุกคน" (พันกว่าแถว) ไม่ใช่ต่อสมาชิก
    // ถ้าดึงทั้ง view supabase-js จะตัดที่ 1000 แถวเงียบๆ แล้วยอดคงค้างจะขาด
    // และ 960 กว่าคนที่ยอดศูนย์คือลูกค้าเดินเข้าร้านที่ไม่เคยเติมเงิน
    // ไม่ใช่ "สมาชิกที่เครดิตหมด" — จึงต้องคัดจากรายชื่อสมาชิกก่อน
    supabase
      .from("customers")
      .select("id", { count: "exact" })
      .eq("customer_type", "สมาชิก")
      .limit(MEMBER_LIMIT),
    // หนึ่งเดือนมี ~31 วัน × จำนวนหมอนวด (ปัจจุบัน 6 คน) — ห่างจากเพดาน 1000 มาก
    supabase
      .from("v_therapist_daily")
      .select("therapist_id")
      .gte("work_date", monthStart)
      .lt("work_date", nextMonthStart)
      .limit(1000),
  ])

  const memberIds = (memberRows ?? [])
    .map((m) => m.id)
    .filter((id): id is string => id !== null)
  const memberTruncated = (memberCount ?? 0) > memberIds.length

  const { data: balanceRows } =
    memberIds.length > 0
      ? await supabase
          .from("member_balances")
          .select("customer_id, name, nickname, credit_balance")
          .in("customer_id", memberIds)
      : { data: [] }

  const balances = (balanceRows ?? []).map((b) => ({
    customerId: b.customer_id,
    name: b.nickname || b.name || "ไม่ระบุชื่อ",
    // ยอดมาจาก view ล้วนๆ — หน้านี้ไม่คิดสูตรเครดิตเอง
    balance: n(b.credit_balance),
  }))

  const creditSummary = summarizeCredit(balances)
  const lowest = balances
    .filter((b) => b.balance > 0)
    .sort((a, b) => a.balance - b.balance)
    .slice(0, 10)

  const lowestIds = lowest
    .map((b) => b.customerId)
    .filter((id): id is string => id !== null)

  // ระดับสมาชิกไม่มีใน member_balances จึงหยิบจากใบเติมเงินล่าสุดของ 10 คนนี้
  const [{ data: lastVisits }, { data: tierRows }] =
    lowestIds.length > 0
      ? await Promise.all([
          supabase
            .from("v_customer_ltv")
            .select("customer_id, last_visit")
            .in("customer_id", lowestIds),
          supabase
            .from("member_topups")
            .select("customer_id, tier, topup_date")
            .in("customer_id", lowestIds)
            .order("topup_date", { ascending: false }),
        ])
      : [{ data: [] }, { data: [] }]

  const lastVisitOf = new Map(
    (lastVisits ?? []).map((v) => [v.customer_id, v.last_visit])
  )
  // เรียงจากใหม่ไปเก่าแล้ว — ใบแรกของแต่ละคนคือระดับล่าสุด
  const tierOf = new Map<string, string>()
  for (const t of tierRows ?? []) {
    if (!tierOf.has(t.customer_id)) tierOf.set(t.customer_id, t.tier)
  }

  // จำนวนหมอนวดที่มีงานในเดือนนั้น — นับหัวจาก view เดียวกับที่คิดค่ามือ
  const therapistHeads = new Set(
    (therapistDays ?? []).map((t) => t.therapist_id)
  ).size

  const rows = (plRows ?? []).filter(
    (r): r is typeof r & { month: string } => r.month !== null
  )
  // ทุกตัวเลขบนหน้านี้ต้องมาจากแถวเดียวกันแถวนี้ ห้ามไปหยิบแถวอื่นมาผสม
  const selected = rows.find((r) => r.month === month) ?? null

  // กิจกรรม Member ของเดือนที่เลือก — หยิบแถวเดียวจาก view แบบเดียวกับ v_monthly_pl
  const activity =
    (memberActivityRows ?? []).find((r) => r.month === month) ?? null
  // creditPct หารเลขสองตัวที่ view ให้มาแล้ว (ตัวหารคือ "ยอดรับจริง" ไม่ใช่ net_revenue)
  // ทั้งเศษและส่วนรวมเครดิตโบนัส จึงเป็นฐานเดียวกัน — ไม่ใช่การนิยามสูตรเงินใหม่
  const activityVolume = Number(activity?.volume ?? 0)
  const creditPct =
    activityVolume > 0
      ? Math.round((Number(activity?.credit_used ?? 0) / activityVolume) * 1000) / 10
      : 0

  const netRevenue = n(selected?.net_revenue)
  const profitCash = n(selected?.profit_cash)
  const cashIn = n(selected?.cash_in)
  const sessions = n(selected?.sessions)
  const prevRevenue = n(selected?.prev_net_revenue)
  const ytdRevenue = n(selected?.ytd_net_revenue)
  const ytdProfit = n(selected?.ytd_profit_cash)
  const fixedCost = n(selected?.fixed_cost)
  const expenseTotal = n(selected?.expense_total)
  // commission_cost มาจาก v_therapist_daily ซึ่งรวมประกันมือ 500/วันไว้แล้ว
  // ถ้าไปบวก sales.commission เองจะได้ต่ำกว่าจริงทุกครั้งที่มีคนทำไม่ถึงประกัน
  const commissionCost = n(selected?.commission_cost)

  const expensePct = netRevenue > 0 ? (expenseTotal / netRevenue) * 100 : null
  const hrPct = netRevenue > 0 ? (commissionCost / netRevenue) * 100 : null

  // margin เป็นการหารเลขสองตัวที่ view ให้มาแล้ว ไม่ใช่การนิยามสูตรเงินใหม่
  // เดือนที่มีแต่รายจ่ายไม่มียอดขาย หาร margin ไม่ได้ — 0.0% จะอ่านเป็น "เท่าทุน" ซึ่งตรงข้ามกับความจริง
  const margin = netRevenue > 0 ? (profitCash / netRevenue) * 100 : null
  const deltaPct = prevRevenue > 0 ? ((netRevenue - prevRevenue) / prevRevenue) * 100 : 0

  const target = Number(targetSetting?.value ?? 0)
  // เปอร์เซ็นต์จริงไว้แสดงเป็นข้อความ · หนีบเฉพาะความกว้างแถบ ไม่งั้นแถบล้นกล่อง
  const targetPct = target > 0 ? (netRevenue / target) * 100 : 0
  const targetRemaining = target - netRevenue
  // วันคิดจากเวลาไทยเท่านั้น · แสดงเฉพาะเดือนปัจจุบันที่ยังไม่ถึงเป้า
  const runRate = target > 0 ? targetRunRate(today, month, targetRemaining) : null

  const precedingFixed = rows
    .filter((r) => r.month < month)
    .slice(-3)
    .map((r) => n(r.fixed_cost))
  const incomplete = isMonthIncomplete(fixedCost, precedingFixed)

  const last6 = rows.filter((r) => r.month <= month).slice(-6)
  const revenuePoints = last6.map((r) => ({
    label: monthShortLabel(r.month),
    value: n(r.net_revenue),
  }))
  const expensePoints = last6.map((r) => ({
    label: monthShortLabel(r.month),
    value: n(r.expense_total),
  }))
  const profitPoints = last6.map((r) => ({
    label: monthShortLabel(r.month),
    value: n(r.profit_cash),
  }))
  const marginPoints = last6.map((r) => ({
    label: monthShortLabel(r.month),
    value: n(r.net_revenue) > 0 ? Math.round((n(r.profit_cash) / n(r.net_revenue)) * 100) : 0,
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">ภาพรวม</h1>
          <p className="text-sm text-slate-600">{monthLabel(month)}</p>
        </div>
        <div className="flex gap-1">
          <Link
            href={`/overview?month=${shiftMonth(month, -1)}`}
            className="rounded-md border px-3 py-2 text-sm hover:bg-slate-100"
          >
            ←
          </Link>
          <Link
            href={`/overview?month=${shiftMonth(month, 1)}`}
            className="rounded-md border px-3 py-2 text-sm hover:bg-slate-100"
          >
            →
          </Link>
        </div>
      </div>

      {/* การ์ดใหญ่โทนเข้ม — ตัวเลขที่เจ้าของร้านต้องเห็นก่อนอย่างอื่น */}
      <div className="rounded-xl bg-gradient-to-br from-emerald-800 to-emerald-950 p-5 text-white">
        <p className="flex items-center gap-1 text-xs text-emerald-300">
          รายได้เดือนนี้ <InfoDot text={MONEY_INFO.netRevenue} light />
        </p>
        <p className="text-3xl font-extrabold">{formatBaht(netRevenue)} ฿</p>
        {prevRevenue > 0 && (
          <p className="text-xs text-emerald-200">
            {/* ทิศทางต้องอ่านออกจากสีได้ทันที ไม่ต้องเพ่งลูกศร */}
            <span className={deltaPct >= 0 ? "text-emerald-300" : "text-red-300"}>
              {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(Math.round(deltaPct))}%
            </span>{" "}
            จากเดือนก่อน ({formatBaht(prevRevenue)} ฿)
          </p>
        )}

        {target > 0 && (
          <>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-emerald-300"
                style={{ width: `${Math.min(targetPct, 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-emerald-100">
              เป้า {formatBaht(target)} ฿ · ทำได้ {targetPct.toFixed(1)}%
              {targetRemaining >= 0
                ? ` · เหลืออีก ${formatBaht(targetRemaining)} ฿`
                : ` · เกินเป้า ${formatBaht(-targetRemaining)} ฿`}
            </p>
            {runRate && (
              <p className="text-[11px] text-emerald-100">
                ต้องทำอีกวันละ{" "}
                <span className="font-semibold text-white">
                  {formatBaht(runRate.perDay)} ฿
                </span>{" "}
                · เหลือ {runRate.daysLeft} วัน
              </p>
            )}
          </>
        )}

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <p className="flex items-center gap-1 text-[10px] text-emerald-300">
              กำไรเงินสด <InfoDot text={MONEY_INFO.profitCash} light />
            </p>
            {/* ขาดทุนต้องสะดุดตาแม้อยู่บนการ์ดเขียวเข้ม */}
            <p className={`text-base font-bold ${profitCash < 0 ? "text-red-300" : ""}`}>
              {formatBaht(profitCash)} ฿
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[10px] text-emerald-300">
              Margin <InfoDot text={MONEY_INFO.margin} light />
            </p>
            <p
              className={`text-base font-bold ${
                margin !== null && margin < 0 ? "text-red-300" : ""
              }`}
            >
              {margin === null ? "—" : `${margin.toFixed(1)}%`}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[10px] text-emerald-300">
              เงินเข้าจริง <InfoDot text={MONEY_INFO.cashIn} light />
            </p>
            <p className="text-base font-bold">{formatBaht(cashIn)} ฿</p>
          </div>
        </div>
      </div>

      {incomplete && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3 text-sm text-amber-900">
            <p className="font-semibold">เดือนนี้ยังบันทึกรายจ่ายไม่ครบ</p>
            <p className="text-amber-800">
              ค่าเช่าและเงินเดือนมักบันทึกตอนสิ้นเดือน กำไรและ margin ข้างบน
              รวมถึงยอดสะสมข้างล่าง จึงสูงกว่าความจริงทั้งหมด — อย่าเพิ่งใช้ตัวเลขนี้ตัดสินใจ
            </p>
          </CardContent>
        </Card>
      )}

      {!selected && (
        <p className="py-6 text-center text-sm text-slate-500">ยังไม่มีข้อมูลเดือนนี้</p>
      )}

      {/* ทุกตัวเลขในแถวนี้มาจากแถวเดือนเดียวกับการ์ดใหญ่ — ห้ามผสมเดือน */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label={`รายได้สะสมถึง ${monthShortLabel(month)}`}
          value={`${formatBaht(ytdRevenue)} ฿`}
        />
        <StatCard
          label={`กำไรสะสมถึง ${monthShortLabel(month)}`}
          value={`${formatBaht(ytdProfit)} ฿`}
          tone={ytdProfit < 0 ? "bad" : "good"}
        />
        <StatCard label="เซสชันเดือนนี้" value={String(sessions)} />
        <StatCard label="สมาชิก" value={`${memberCount ?? 0} คน`} />
      </div>

      {/* กิจกรรม Member เดือนนี้ — คนละเรื่องกับเครดิตคงเหลือด้านล่าง (นั่นคือยอด ณ ปัจจุบัน)
          ทุกตัวเลขมาจากแถวเดือนเดียวกันของ v_monthly_member_activity */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-600">
          กิจกรรมสมาชิก · {monthShortLabel(month)}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="TopUp รับเข้า"
            value={`${formatBaht(n(activity?.topup_in))} ฿`}
            hint="เงินเติมเข้าเดือนนี้"
          />
          <StatCard
            label="Credit ใช้"
            value={`${formatBaht(n(activity?.credit_used))} ฿`}
            hint="เครดิตสมาชิกที่ใช้"
          />
          <StatCard
            label="Bonus แถมไป"
            value={`${formatBaht(n(activity?.bonus_used))} ฿`}
            hint="ของแถมที่ใช้"
          />
          <StatCard
            label="% ของยอดรับจริง"
            value={`${creditPct}%`}
            hint="สัดส่วนที่จ่ายด้วยเครดิต"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard
          label={`รายจ่าย ${monthShortLabel(month)}`}
          value={`${formatBaht(expenseTotal)} ฿`}
          hint={
            expensePct === null
              ? "ยังไม่มีรายได้ให้เทียบสัดส่วน"
              : `${expensePct.toFixed(1)}% ของรายได้`
          }
          // เกิน 100% = กินทุนแล้ว (แดง) · 90-100% = จวนเจียน (ส้มเตือน)
          tone={
            expensePct === null
              ? "normal"
              : expensePct > 100
                ? "bad"
                : expensePct > 90
                  ? "warn"
                  : "normal"
          }
        />
        <StatCard
          label={`ค่ามือหมอนวด ${monthShortLabel(month)}`}
          value={`${formatBaht(commissionCost)} ฿`}
          hint={`HR ${hrPct === null ? "—" : hrPct.toFixed(1)}% ของรายได้ · ${therapistHeads} คน`}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">รายได้ · รายจ่าย · กำไร 6 เดือน</CardTitle>
          </CardHeader>
          <CardContent>
            <GroupedBarChart
              series={[
                { name: "รายได้", color: "#059669", points: revenuePoints },
                { name: "รายจ่าย", color: "#f97316", points: expensePoints },
              ]}
              line={{ name: "กำไรเงินสด", color: "#1e293b", points: profitPoints }}
              unit=" ฿"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Margin 6 เดือนล่าสุด</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart points={marginPoints} unit="%" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">เครดิตสมาชิกที่ต้องจับตา</CardTitle>
          {/* บล็อกนี้ไม่ได้ผูกกับเดือนที่เลือก — ยอดเครดิตมีค่าเดียวคือ ณ ตอนนี้
              ต้องเขียนบอกให้ชัด ไม่งั้นคนที่กดย้อนไป มี.ค. จะอ่านว่าเป็นยอดของ มี.ค. */}
          <p className="text-xs text-slate-500">
            ยอด ณ วันนี้ ({formatThaiDate(today)}) ไม่ใช่ยอดของ{" "}
            {monthLabel(month)} — เครดิตคงเหลือมีค่าเดียวคือค่าปัจจุบัน
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {memberTruncated && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              แสดงเฉพาะสมาชิก {memberIds.length} คนแรกจากทั้งหมด {memberCount} คน
              ตัวเลขในบล็อกนี้จึงยังไม่ครบ
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["empty", "low", "mid", "ok"] as CreditBucket[]).map((b) => (
              <div key={b} className={`rounded-lg border px-3 py-2 ${BUCKET_CLASS[b]}`}>
                <p className="text-xs">{BUCKET_LABEL[b]}</p>
                <p className="text-lg font-bold">{creditSummary.counts[b]} คน</p>
              </div>
            ))}
          </div>

          <div className="flex items-baseline justify-between rounded-lg bg-slate-50 px-3 py-2">
            <span className="text-sm">เครดิตคงค้างทั้งหมด</span>
            <span className="text-lg font-bold">
              {formatBaht(creditSummary.liability)} ฿
            </span>
          </div>
          <p className="text-xs text-slate-500">
            คือภาระที่ร้านต้องให้บริการในอนาคต ไม่ใช่รายได้
          </p>

          {lowest.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">
              ไม่มีสมาชิกที่ยังมีเครดิตเหลือ
            </p>
          ) : (
            <div>
              <p className="mb-1 text-xs text-slate-500">
                10 คนที่เครดิตเหลือน้อยที่สุด — ควรชวนเติมก่อนหมด
              </p>
              <ul className="divide-y text-sm">
                {lowest.map((m) => {
                  const tier = m.customerId ? tierOf.get(m.customerId) : undefined
                  const lastVisit = m.customerId
                    ? lastVisitOf.get(m.customerId)
                    : undefined
                  const gap = lastVisit ? daysBetween(lastVisit, today) : null
                  return (
                    <li
                      key={m.customerId ?? m.name}
                      className="flex items-center justify-between gap-3 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {m.name}
                          {tier && (
                            <span className="ml-1.5 text-[11px] font-normal text-slate-500">
                              {tier}
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {gap === null
                            ? "ยังไม่เคยมาใช้บริการ"
                            : `มาล่าสุด ${gap} วันก่อน`}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 font-semibold ${
                          creditBucket(m.balance) === "low"
                            ? "text-amber-700"
                            : "text-slate-700"
                        }`}
                      >
                        {formatBaht(m.balance)} ฿
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">สรุปรายเดือน</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500">
                <th className="px-4 py-1 text-left font-normal">เดือน</th>
                <th className="px-4 py-1 text-right font-normal">รายได้</th>
                <th className="px-4 py-1 text-right font-normal">รายจ่าย</th>
                <th className="px-4 py-1 text-right font-normal">กำไรเงินสด</th>
              </tr>
            </thead>
            <tbody>
              {last6.map((r) => (
                <tr
                  key={r.month}
                  className={r.month === month ? "bg-emerald-50 font-medium" : ""}
                >
                  <td className="px-4 py-1.5">{monthShortLabel(r.month)}</td>
                  <td className="px-4 py-1.5 text-right">{formatBaht(n(r.net_revenue))}</td>
                  <td className="px-4 py-1.5 text-right text-orange-700">
                    {formatBaht(n(r.expense_total))}
                  </td>
                  <td
                    className={`px-4 py-1.5 text-right font-medium ${
                      n(r.profit_cash) < 0 ? "text-red-700" : "text-emerald-700"
                    }`}
                  >
                    {formatBaht(n(r.profit_cash))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/finance?month=${month}`}>ดูการเงินละเอียด</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/insights/customers">ลูกค้าและคนที่หายไป</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/members">สมาชิก</Link>
        </Button>
      </div>
    </div>
  )
}
