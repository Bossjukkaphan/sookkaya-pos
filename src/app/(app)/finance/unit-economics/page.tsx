import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { formatBaht } from "@/lib/constants"
import { todayInShopTz } from "@/lib/datetime"
import { breakEvenSessions, unitEconomics } from "@/lib/finance"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FinanceAccessDenied, FinanceMonthHeader } from "../shared"

export const metadata = { title: "จุดคุ้มทุน · สุขกายา POS" }

const n = (x: number | string | null | undefined) => Number(x ?? 0)

export default async function UnitEconomicsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const supabase = await createClient()
  const params = await searchParams

  const profile = await getMyProfile()
  const role = profile?.role ?? "staff"

  if (role !== "admin") {
    return <FinanceAccessDenied />
  }

  const month = params.month ?? todayInShopTz().slice(0, 7)

  const [{ data: plRows }, { data: services }] = await Promise.all([
    supabase.from("v_monthly_pl").select("*").eq("month", month).maybeSingle(),
    supabase
      .from("services")
      .select("name, price, commission, material_cost, is_active")
      .eq("is_active", true),
  ])

  const netRevenue = n(plRows?.net_revenue)
  const sessions = n(plRows?.sessions)
  const variableCost = n(plRows?.variable_cost)
  const fixedCost = n(plRows?.fixed_cost)
  const onetimeCost = n(plRows?.onetime_cost)

  const unit = unitEconomics({ netRevenue, sessions, variableCost, fixedCost, onetimeCost })
  const breakEvenFixed = breakEvenSessions(fixedCost, unit.contributionMargin)
  const breakEvenReal = breakEvenSessions(fixedCost + onetimeCost, unit.contributionMargin)

  const allServices = services ?? []
  const skippedCount = allServices.filter((s) => s.material_cost === null).length
  const menuProfit = allServices
    .filter((s): s is typeof s & { material_cost: number } => s.material_cost !== null)
    .map((s) => {
      const materialCost = Number(s.material_cost)
      const price = Number(s.price)
      const commission = Number(s.commission)
      const profit = price - commission - materialCost
      const margin = price > 0 ? profit / price : 0
      return { name: s.name, price, commission, materialCost, profit, margin }
    })
    .sort((a, b) => a.profit - b.profit)

  return (
    <div className="space-y-4">
      <FinanceMonthHeader title="จุดคุ้มทุน" month={month} basePath="/finance/unit-economics" />

      {!plRows && (
        <p className="py-6 text-center text-sm text-slate-500">ยังไม่มีข้อมูลเดือนนี้</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="รายได้เฉลี่ย/เซสชัน" value={unit.revenuePerSession} />
        <StatCard label="ต้นทุนผันแปร/เซสชัน" value={unit.variableCostPerSession} />
        <StatCard label="กำไรที่ได้เพิ่มทุกเซสชัน" value={unit.contributionMargin} highlight />
        <StatCard label="เซสชันที่ทำได้จริง" value={sessions} isCount />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">จุดคุ้มทุน</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <BreakEvenRow label="คุ้มต้นทุนคงที่" breakEven={breakEvenFixed} actual={sessions} />
          <BreakEvenRow
            label="คุ้มทุนจริง (รวม One-time)"
            breakEven={breakEvenReal}
            actual={sessions}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">กำไรต่อเมนู</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {skippedCount > 0 && (
            <p className="text-xs text-amber-700">
              ข้าม {skippedCount} เมนูที่ยังไม่ได้กรอกต้นทุนวัสดุ
            </p>
          )}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">เมนู</th>
                  <th className="px-2 py-2 text-right">ราคา</th>
                  <th className="px-2 py-2 text-right">ค่ามือ</th>
                  <th className="px-2 py-2 text-right">วัสดุ</th>
                  <th className="px-2 py-2 text-right">กำไร</th>
                  <th className="px-2 py-2 text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {menuProfit.map((m) => (
                  <tr key={m.name}>
                    <td className="px-3 py-2">{m.name}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {formatBaht(m.price)} ฿
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {formatBaht(m.commission)} ฿
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {formatBaht(m.materialCost)} ฿
                    </td>
                    <td
                      className={`px-2 py-2 text-right font-medium whitespace-nowrap ${
                        m.profit < 0 ? "text-red-700" : "text-emerald-700"
                      }`}
                    >
                      {formatBaht(m.profit)} ฿
                    </td>
                    <td
                      className={`px-2 py-2 text-right whitespace-nowrap ${
                        m.margin < 0
                          ? "font-medium text-red-700"
                          : m.margin < 0.3
                            ? "text-amber-700"
                            : ""
                      }`}
                    >
                      {(m.margin * 100).toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Button asChild variant="outline" className="w-full">
        <Link href={`/finance?month=${month}`}>กลับไปหน้าการเงิน</Link>
      </Button>
    </div>
  )
}

function StatCard({
  label,
  value,
  highlight,
  isCount,
}: {
  label: string
  value: number
  highlight?: boolean
  isCount?: boolean
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-sm text-slate-600">{label}</p>
        <p className={`text-2xl font-bold ${highlight ? "text-emerald-700" : ""}`}>
          {formatBaht(value)}
          {isCount ? "" : " ฿"}
        </p>
      </CardContent>
    </Card>
  )
}

function BreakEvenRow({
  label,
  breakEven,
  actual,
}: {
  label: string
  breakEven: number | null
  actual: number
}) {
  const reached = breakEven !== null && actual >= breakEven
  // ความกว้างแถบ = สัดส่วนเซสชันจริงต่อจุดคุ้มทุน (เต็มหลอดเมื่อถึงแล้ว)
  const pct =
    breakEven === null || breakEven === 0
      ? 100
      : Math.min((actual / breakEven) * 100, 100)

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-slate-600">{label}</span>
        <span className="text-lg font-bold">
          {breakEven === null ? "—" : `${breakEven} เซสชัน`}
        </span>
      </div>
      {breakEven !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${reached ? "bg-emerald-500" : "bg-amber-400"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {breakEven === null ? (
        <p className="text-xs text-red-700">กำไรต่อเซสชันไม่เป็นบวก — ยังไม่มีจุดคุ้มทุน</p>
      ) : reached ? (
        <p className="text-xs text-emerald-700">
          {breakEven > 0
            ? `เกินจุดคุ้มทุน ${(actual / breakEven).toFixed(1)} เท่า`
            : "เกินจุดคุ้มทุนแล้ว"}
        </p>
      ) : (
        <p className="text-xs text-amber-700">ยังขาดอีก {breakEven - actual} เซสชัน</p>
      )}
    </div>
  )
}
