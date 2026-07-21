import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { formatBaht } from "@/lib/constants"
import { todayInShopTz } from "@/lib/datetime"
import { isMonthIncomplete } from "@/lib/finance"
import { BarChart } from "@/components/charts/bar-chart"
import { LineChart } from "@/components/charts/line-chart"
import { StatCard } from "@/components/stat-card"
import { InsightsAccessDenied, canSeeInsights } from "../insights/shared"
import { monthLabel, monthShortLabel, shiftMonth } from "../finance/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export const metadata = { title: "ภาพรวม · สุขกายา POS" }

const n = (x: number | string | null | undefined) => Number(x ?? 0)

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const supabase = await createClient()
  const { data: profile } = await supabase.from("profiles").select("role").single()

  if (!canSeeInsights(profile?.role)) {
    return <InsightsAccessDenied title="ภาพรวม" />
  }

  const params = await searchParams
  const month = params.month ?? todayInShopTz().slice(0, 7)

  const [{ data: plRows }, { data: targetSetting }, { count: memberCount }] =
    await Promise.all([
      supabase.from("v_monthly_pl").select("*").order("month"),
      supabase
        .from("settings")
        .select("value")
        .eq("key", "monthly_target")
        .maybeSingle(),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("customer_type", "สมาชิก"),
    ])

  const rows = (plRows ?? []).filter(
    (r): r is typeof r & { month: string } => r.month !== null
  )
  // ทุกตัวเลขบนหน้านี้ต้องมาจากแถวเดียวกันแถวนี้ ห้ามไปหยิบแถวอื่นมาผสม
  const selected = rows.find((r) => r.month === month) ?? null

  const netRevenue = n(selected?.net_revenue)
  const profitCash = n(selected?.profit_cash)
  const cashIn = n(selected?.cash_in)
  const sessions = n(selected?.sessions)
  const prevRevenue = n(selected?.prev_net_revenue)
  const ytdRevenue = n(selected?.ytd_net_revenue)
  const ytdProfit = n(selected?.ytd_profit_cash)
  const fixedCost = n(selected?.fixed_cost)

  // margin เป็นการหารเลขสองตัวที่ view ให้มาแล้ว ไม่ใช่การนิยามสูตรเงินใหม่
  const margin = netRevenue > 0 ? (profitCash / netRevenue) * 100 : 0
  const deltaPct = prevRevenue > 0 ? ((netRevenue - prevRevenue) / prevRevenue) * 100 : 0

  const target = Number(targetSetting?.value ?? 0)
  const targetPct = target > 0 ? Math.min((netRevenue / target) * 100, 100) : 0
  const targetRemaining = target - netRevenue

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
        <p className="text-xs text-emerald-300">รายได้เดือนนี้</p>
        <p className="text-3xl font-extrabold">{formatBaht(netRevenue)} ฿</p>
        {prevRevenue > 0 && (
          <p className="text-xs text-emerald-200">
            {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(Math.round(deltaPct))}% จากเดือนก่อน (
            {formatBaht(prevRevenue)} ฿)
          </p>
        )}

        {target > 0 && (
          <>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-emerald-300"
                style={{ width: `${targetPct}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-emerald-100">
              เป้า {formatBaht(target)} ฿ · ทำได้ {Math.round(targetPct)}%
              {targetRemaining > 0 && ` · เหลืออีก ${formatBaht(targetRemaining)} ฿`}
            </p>
          </>
        )}

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] text-emerald-300">กำไรเงินสด</p>
            <p className="text-base font-bold">{formatBaht(profitCash)} ฿</p>
          </div>
          <div>
            <p className="text-[10px] text-emerald-300">Margin</p>
            <p className="text-base font-bold">{margin.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-[10px] text-emerald-300">เงินเข้าจริง</p>
            <p className="text-base font-bold">{formatBaht(cashIn)} ฿</p>
          </div>
        </div>
      </div>

      {incomplete && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3 text-sm text-amber-900">
            <p className="font-semibold">เดือนนี้ยังบันทึกรายจ่ายไม่ครบ</p>
            <p className="text-amber-800">
              ค่าเช่าและเงินเดือนมักบันทึกตอนสิ้นเดือน กำไรและ margin ที่เห็นข้างบน
              จึงสูงกว่าความจริง — อย่าเพิ่งใช้ตัวเลขนี้ตัดสินใจ
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
          tone={ytdProfit < 0 ? "bad" : "normal"}
        />
        <StatCard label="เซสชันเดือนนี้" value={String(sessions)} />
        <StatCard label="สมาชิก" value={`${memberCount ?? 0} คน`} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">รายได้ 6 เดือนล่าสุด</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart points={revenuePoints} format={(v) => `${formatBaht(v)} ฿`} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Margin 6 เดือนล่าสุด</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart points={marginPoints} format={(v) => `${v}%`} />
          </CardContent>
        </Card>
      </div>

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
                  <td
                    className={`px-4 py-1.5 text-right ${
                      n(r.profit_cash) < 0 ? "text-red-700" : ""
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
