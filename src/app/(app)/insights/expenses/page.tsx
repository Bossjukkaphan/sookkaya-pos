import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { InsightsAccessDenied, canSeeInsights } from "../shared"
import { formatBaht } from "@/lib/constants"
import { todayInShopTz } from "@/lib/datetime"
import { daysInMonth, monthLabel, monthShortLabel, shiftMonth } from "@/lib/month"
import {
  compareRange,
  detectAnomalies,
  monthlySeries,
  projectMonthEnd,
  type CategoryDelta,
  type ExpenseRow,
} from "@/lib/expense-analytics"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart } from "@/components/charts/line-chart"
import Link from "next/link"

export const metadata = { title: "วิเคราะห์รายจ่าย · สุขกายา POS" }

function toDailyMap(
  rows: { date: string | null; value: number | null }[]
): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    if (!r.date) continue
    m.set(r.date, (m.get(r.date) ?? 0) + Number(r.value ?? 0))
  }
  return m
}

export default async function ExpenseInsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const profile = await getMyProfile()
  if (!canSeeInsights(profile?.role)) {
    return <InsightsAccessDenied title="วิเคราะห์รายจ่าย" />
  }

  const supabase = await createClient()
  const today = todayInShopTz()
  const params = await searchParams
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : today.slice(0, 7)

  const isCurrentMonth = month === today.slice(0, 7)
  // เดือนที่ยังไม่จบดูถึงวันนี้ · เดือนที่ปิดแล้วดูทั้งเดือน
  const throughDay = isCurrentMonth ? Number(today.slice(8, 10)) : daysInMonth(month)

  const [{ data: expenseRows }, { data: dailyRows }, { data: commissionRows }] =
    await Promise.all([
      supabase.from("expenses").select("expense_date, category, item, amount"),
      supabase.from("v_daily_summary").select("sale_date, net_revenue"),
      supabase.from("v_commission_daily").select("work_date, commission"),
    ])

  const rows: ExpenseRow[] = (expenseRows ?? []).map((r) => ({
    expense_date: r.expense_date,
    category: r.category,
    item: r.item,
    amount: Number(r.amount),
  }))

  const revenueByDate = toDailyMap(
    (dailyRows ?? []).map((r) => ({ date: r.sale_date, value: r.net_revenue }))
  )
  const commissionByDate = toDailyMap(
    (commissionRows ?? []).map((r) => ({ date: r.work_date, value: r.commission }))
  )

  const cmp = compareRange({ rows, revenueByDate, month, throughDay })
  const anomalies = detectAnomalies({
    rows,
    revenueByDate,
    commissionByDate,
    month,
    throughDay,
    monthClosed: !isCurrentMonth,
  })

  const revenueByMonth = new Map<string, number>()
  for (const [date, value] of revenueByDate) {
    const m = date.slice(0, 7)
    revenueByMonth.set(m, (revenueByMonth.get(m) ?? 0) + value)
  }

  const series = monthlySeries({ rows, revenueByMonth, currentMonth: today.slice(0, 7) })
  const projection = projectMonthEnd({ rows, month, throughDay })

  // กราฟเส้นเอาเฉพาะเดือนที่ปิดแล้ว — เดือนที่ยังไม่จบมีแต่รายจ่ายที่คีย์ทันแล้ว
  // (เงินเดือน ค่าเช่า และงวดค่ามือท้ายเดือนยังไม่เข้า) ถ้าต่อท้ายกราฟ เส้นจะดิ่งลง
  // ทุกเดือนเหมือนต้นทุนลดฮวบ ทั้งที่ยังไม่มีอะไรเกิดขึ้นจริง
  const costPoints = series.months
    .map((m, i) => ({ month: m, value: series.costPer100Revenue[i] }))
    .filter((p) => p.month < today.slice(0, 7))
    .map((p) => ({
      label: monthShortLabel(p.month),
      value: Math.round(p.value * 10) / 10,
    }))

  const latestClosed = series.months.filter((m) => m < today.slice(0, 7)).slice(-1)[0]
  const latestIndex = latestClosed ? series.months.indexOf(latestClosed) : -1
  const latestRevenue = latestClosed ? (revenueByMonth.get(latestClosed) ?? 0) : 0
  const shareRows =
    latestIndex < 0 || latestRevenue <= 0
      ? []
      : series.byCategory
          .map((c) => ({
            category: c.category,
            per100: (c.amounts[latestIndex] / latestRevenue) * 100,
          }))
          .filter((c) => c.per100 > 0)
          .sort((a, b) => b.per100 - a.per100)
  const profitPer100 = 100 - shareRows.reduce((s, c) => s + c.per100, 0)

  const expenseDelta = cmp.current.expense - cmp.previous.expense
  const revenueDelta = cmp.current.revenue - cmp.previous.revenue
  const pct = (delta: number, base: number) => (base === 0 ? 0 : (delta / base) * 100)
  const maxBar = Math.max(1, ...cmp.byCategory.map((c) => Math.abs(c.deltaBaht)))

  const rangeLabel = isCurrentMonth
    ? `1–${throughDay} ${monthLabel(month)}`
    : monthLabel(month)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">วิเคราะห์รายจ่าย</h1>
          <p className="text-sm text-slate-600">
            {rangeLabel}
            {isCurrentMonth && " · เดือนนี้ยังไม่จบ เทียบช่วงวันเท่ากันกับเดือนที่แล้ว"}
          </p>
        </div>
        <div className="flex gap-1">
          <Link
            href={`/insights/expenses?month=${shiftMonth(month, -1)}`}
            className="rounded-md border px-3 py-2 text-sm hover:bg-slate-100"
          >
            ←
          </Link>
          <Link
            href={`/insights/expenses?month=${shiftMonth(month, 1)}`}
            className="rounded-md border px-3 py-2 text-sm hover:bg-slate-100"
          >
            →
          </Link>
        </div>
      </div>

      {/* บล็อก 1 — ต่างจากคราวที่แล้วเพราะอะไร */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">ต่างจากเดือนที่แล้วเพราะอะไร</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <SummaryLine
              label="รายจ่าย"
              value={cmp.current.expense}
              delta={expenseDelta}
              pct={pct(expenseDelta, cmp.previous.expense)}
              goodWhenDown
            />
            <SummaryLine
              label="รายได้"
              value={cmp.current.revenue}
              delta={revenueDelta}
              pct={pct(revenueDelta, cmp.previous.revenue)}
            />
          </div>

          <div className="space-y-1.5 border-t pt-3">
            {cmp.byCategory.length === 0 && (
              <p className="py-2 text-center text-sm text-slate-500">
                ไม่มีความเปลี่ยนแปลงระหว่างสองช่วง
              </p>
            )}
            {cmp.byCategory.map((c) => (
              <div key={c.category} className="flex items-center gap-2 text-sm">
                <span className="w-40 shrink-0 truncate text-slate-600">{c.category}</span>
                <span
                  className={`h-2 rounded-full ${c.deltaBaht > 0 ? "bg-red-400" : "bg-emerald-400"}`}
                  style={{ width: `${(Math.abs(c.deltaBaht) / maxBar) * 100}%` }}
                />
                <span
                  className={`ml-auto shrink-0 font-medium ${c.deltaBaht > 0 ? "text-red-700" : "text-emerald-700"}`}
                >
                  {c.deltaBaht > 0 ? "+" : "−"}
                  {formatBaht(Math.abs(c.deltaBaht))}
                </span>
              </div>
            ))}
          </div>

          {cmp.topItems.length > 0 && (
            <div className="border-t pt-3">
              <p className="mb-1 text-xs font-semibold text-slate-600">
                รายการใหญ่สุดของช่วงนี้ — ยอดที่พุ่งมักมาจากรายการเดียว
              </p>
              <ul className="space-y-0.5 text-sm text-slate-600">
                {cmp.topItems.map((t, i) => (
                  <li key={`${t.item}-${i}`} className="flex justify-between gap-2">
                    <span className="truncate">{t.item}</span>
                    <span className="shrink-0 font-medium">{formatBaht(t.amount)} ฿</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* บล็อก 2 — ผิดปกติไหม (ฐานคนละตัวกับบล็อก 1 โดยตั้งใจ) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">มีอะไรผิดปกติบ้าง</CardTitle>
          <p className="text-xs text-slate-500">
            เทียบกับค่าปกติ (ค่ากลาง 3 เดือนย้อนหลัง) ไม่ใช่เทียบเดือนที่แล้ว —
            ตัวเลข % จึงไม่เท่ากับด้านบน
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {anomalies.filter((d) => d.level === "alert" || d.level === "warn").length === 0 && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              ตรวจแล้ว ตอนนี้ไม่มีหมวดไหนผิดปกติ
            </p>
          )}
          {anomalies
            .filter((d) => d.level !== "ok" && d.level !== "unknown")
            .map((d) => (
              <AnomalyCard key={d.category} delta={d} />
            ))}

          {/* spec กำหนดว่าต้องบอกผู้ใช้ว่าหมวดไหนยังตัดสินไม่ได้ ไม่ใช่เงียบไปเฉยๆ
              ไม่งั้นจะเข้าใจผิดว่า "ไม่ขึ้นเตือน = ตรวจแล้วปกติ" */}
          {anomalies.some((d) => d.level === "unknown") && (
            <p className="text-xs text-slate-500">
              ยังตัดสินไม่ได้เพราะมีประวัติไม่ครบ 3 เดือน:{" "}
              {anomalies
                .filter((d) => d.level === "unknown")
                .map((d) => d.category)
                .join(" · ")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* บล็อก 3 — ขายได้ 100 บาท หายไปไหน */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            ขายได้ 100 บาท หายไปไหน{latestClosed ? ` · ${monthLabel(latestClosed)}` : ""}
          </CardTitle>
          <p className="text-xs text-slate-500">
            ใช้เดือนที่ปิดแล้วล่าสุด เพราะเดือนที่ยังไม่จบยอดยังไม่ครบ
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {shareRows.length === 0 ? (
            <p className="py-2 text-center text-sm text-slate-500">ยังไม่มีเดือนที่ปิดแล้ว</p>
          ) : (
            <>
              <div className="space-y-1.5">
                {shareRows.map((c) => (
                  <div key={c.category} className="flex items-center gap-2 text-sm">
                    <span className="w-40 shrink-0 truncate text-slate-600">{c.category}</span>
                    <span
                      className="h-2 rounded-full bg-orange-400"
                      style={{ width: `${Math.min(c.per100, 100)}%` }}
                    />
                    <span className="ml-auto shrink-0 font-medium">{c.per100.toFixed(1)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-1.5 text-sm font-semibold">
                  <span>เหลือเป็นกำไร</span>
                  <span className={profitPer100 >= 0 ? "text-emerald-700" : "text-red-700"}>
                    {profitPer100.toFixed(1)} บาท
                  </span>
                </div>
              </div>
              <div className="border-t pt-3">
                <p className="mb-1 text-xs font-semibold text-slate-600">
                  ต้นทุนรวมต่อรายได้ 100 บาท — ต่ำกว่า 100 คือมีกำไร
                </p>
                <LineChart points={costPoints} unit=" บาท" color="#ea580c" />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* บล็อก 4 — ตารางวางงบ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">รายจ่ายรายเดือนแยกหมวด</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-2 text-left whitespace-nowrap">หมวด</th>
                  {series.months.map((m) => (
                    <th key={m} className="px-2 py-2 text-right whitespace-nowrap">
                      {monthShortLabel(m)}
                      {m === today.slice(0, 7) && <span className="text-amber-600"> *</span>}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right whitespace-nowrap">ค่าปกติ</th>
                  <th className="px-2 py-2 text-right">แนวโน้ม</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {series.byCategory.map((c) => (
                  <tr key={c.category}>
                    <td className="px-4 py-2 whitespace-nowrap">{c.category}</td>
                    {c.amounts.map((a, i) => (
                      <td key={series.months[i]} className="px-2 py-2 text-right">
                        {a === 0 ? "—" : formatBaht(a)}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right text-slate-500">
                      {c.median3 === null ? "—" : formatBaht(c.median3)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {c.trend === "up" ? "↗" : c.trend === "down" ? "↘" : c.trend === "flat" ? "→" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-1 px-4 pt-3 text-xs text-slate-500">
            <p>* เดือนนี้ยังไม่จบ ยอดยังไม่ครบ · ลูกศรแนวโน้มคิดจากเดือนที่ปิดแล้ว 3 เดือนล่าสุด</p>
            {isCurrentMonth && (
              <p className="font-medium text-slate-700">
                ประมาณการรายจ่าย {monthLabel(month)} ทั้งเดือน ≈ {formatBaht(projection.total)} ฿
                {projection.assumedCategories.length > 0 &&
                  ` (เดาจากค่าปกติของ ${projection.assumedCategories.join(" · ")})`}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryLine({
  label,
  value,
  delta,
  pct,
  goodWhenDown = false,
}: {
  label: string
  value: number
  delta: number
  pct: number
  goodWhenDown?: boolean
}) {
  const good = goodWhenDown ? delta <= 0 : delta >= 0
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold">{formatBaht(value)} ฿</p>
      <p className={`text-xs ${good ? "text-emerald-700" : "text-red-700"}`}>
        {delta >= 0 ? "↑" : "↓"} {formatBaht(Math.abs(delta))} ฿ ({pct >= 0 ? "+" : "−"}
        {Math.abs(pct).toFixed(1)}%)
      </p>
    </div>
  )
}

const LEVEL_STYLE: Record<string, { box: string; icon: string }> = {
  alert: { box: "border-red-300 bg-red-50 text-red-900", icon: "🔴" },
  warn: { box: "border-amber-300 bg-amber-50 text-amber-900", icon: "🟡" },
  better: { box: "border-emerald-300 bg-emerald-50 text-emerald-900", icon: "🟢" },
}

function AnomalyCard({ delta }: { delta: CategoryDelta }) {
  const style = LEVEL_STYLE[delta.level] ?? LEVEL_STYLE.warn
  const isRatio = delta.ruler === "revenue_linked"
  const fmt = (v: number) => (isRatio ? `${v.toFixed(1)}% ของยอดขาย` : `${formatBaht(v)} ฿`)

  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${style.box}`}>
      <p className="font-semibold">
        {style.icon} {delta.category}{" "}
        {delta.level === "better" ? "ดีขึ้น" : "โตเร็วกว่าปกติ"}
      </p>
      <p className="mt-0.5 text-xs">
        ช่วงนี้ {fmt(delta.current)} · ค่าปกติ {fmt(delta.baseline)} ({delta.deltaPct >= 0 ? "+" : "−"}
        {Math.abs(delta.deltaPct).toFixed(1)}%)
      </p>
      <p className="mt-0.5 text-xs font-medium">
        {delta.impactBaht >= 0
          ? `ถ้าคุมได้เท่าค่าปกติ จะประหยัดได้ ${formatBaht(Math.abs(delta.impactBaht))} ฿`
          : `ประหยัดได้แล้ว ${formatBaht(Math.abs(delta.impactBaht))} ฿ เทียบค่าปกติ`}
      </p>
    </div>
  )
}
