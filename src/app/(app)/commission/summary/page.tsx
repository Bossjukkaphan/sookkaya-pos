import Link from "next/link"
import { Suspense } from "react"

import { createClient } from "@/lib/supabase/server"
import { todayInShopTz } from "@/lib/datetime"
import { formatBaht } from "@/lib/constants"
import { type DateRange, rangeFromPreset } from "@/lib/date-range"
import { DateRangePicker } from "@/components/date-range-picker"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MatrixView } from "./matrix-view"

export const metadata = { title: "สรุปค่ามือ · สุขกายา POS" }

export default async function CommissionSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; view?: string }>
}) {
  const supabase = await createClient()
  const params = await searchParams

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .single()

  const role = profile?.role ?? "staff"
  const canView = role === "admin" || role === "manager"

  if (!canView) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">สรุปค่ามือข้ามวัน</h1>
        <Card>
          <CardContent className="space-y-3 py-6 text-sm text-slate-600">
            <p>
              หน้านี้แสดงรายได้ของหมอทุกคนรวมกัน จึงจำกัดให้เฉพาะผู้จัดการขึ้นไป
              เท่านั้นที่ดูได้
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href="/commission">กลับไปหน้าค่ามือรายวัน</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const today = todayInShopTz()
  const range: DateRange =
    params.from && params.to
      ? { from: params.from, to: params.to }
      : rangeFromPreset("thisMonth", today)
  const view = params.view === "matrix" ? "matrix" : "summary"

  const [{ data: dailyRows }, { data: therapists }] = await Promise.all([
    supabase
      .from("v_therapist_daily")
      .select("work_date, therapist_id, sessions, total_commission, total_income, status")
      .gte("work_date", range.from)
      .lte("work_date", range.to)
      .order("work_date"),
    supabase.from("therapists").select("id, name"),
  ])

  const rows = (dailyRows ?? []).filter(
    (r): r is typeof r & { work_date: string; therapist_id: string } =>
      r.work_date !== null && r.therapist_id !== null
  )

  const nameOf: Record<string, string> = Object.fromEntries(
    (therapists ?? []).map((t) => [t.id, t.name])
  )

  const qs = new URLSearchParams({ from: range.from, to: range.to })

  type TherapistSummary = {
    therapistId: string
    name: string
    days: number
    sessions: number
    commission: number
    guaranteeDays: number
    income: number
  }

  const byTherapist = new Map<string, TherapistSummary>()
  for (const r of rows) {
    const existing = byTherapist.get(r.therapist_id) ?? {
      therapistId: r.therapist_id,
      name: nameOf[r.therapist_id] ?? "ไม่ระบุ",
      days: 0,
      sessions: 0,
      commission: 0,
      guaranteeDays: 0,
      income: 0,
    }
    existing.days += 1
    existing.sessions += Number(r.sessions ?? 0)
    existing.commission += Number(r.total_commission ?? 0)
    existing.income += Number(r.total_income ?? 0)
    if (r.status === "ใช้ประกัน") existing.guaranteeDays += 1
    byTherapist.set(r.therapist_id, existing)
  }

  const summary = [...byTherapist.values()].sort((a, b) => b.income - a.income)

  const grandTotal = summary.reduce((sum, s) => sum + s.income, 0)
  const totalCommission = summary.reduce((sum, s) => sum + s.commission, 0)
  const guaranteeTopUp = grandTotal - totalCommission
  const hasGuaranteeDays = summary.some((s) => s.guaranteeDays > 0)

  const matrixRows = rows.map((r) => ({
    work_date: r.work_date,
    therapist_id: r.therapist_id,
    total_income: Number(r.total_income ?? 0),
    status: r.status ?? "",
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">สรุปค่ามือข้ามวัน</h1>
        <Button asChild size="sm" variant="outline">
          <Link href="/commission">ดูรายวัน</Link>
        </Button>
      </div>

      <Suspense fallback={null}>
        <DateRangePicker range={range} today={today} />
      </Suspense>

      <div className="flex gap-2">
        <Button asChild size="sm" variant={view === "summary" ? "default" : "outline"}>
          <Link href={`/commission/summary?${qs.toString()}`}>สรุปรายหมอ</Link>
        </Button>
        <Button asChild size="sm" variant={view === "matrix" ? "default" : "outline"}>
          <Link href={`/commission/summary?${qs.toString()}&view=matrix`}>
            ตารางรายวัน
          </Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          ไม่มีข้อมูลในช่วงที่เลือก
        </p>
      ) : view === "matrix" ? (
        <MatrixView rows={matrixRows} nameOf={nameOf} />
      ) : (
        <>
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="flex items-baseline justify-between py-4">
              <span className="font-medium">รวมต้องจ่าย</span>
              <span className="text-2xl font-bold text-emerald-800">
                {formatBaht(grandTotal)} <span className="text-base font-normal">บาท</span>
              </span>
            </CardContent>
          </Card>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">หมอ</th>
                  <th className="px-2 py-2 text-right">วัน</th>
                  <th className="px-2 py-2 text-right">งาน</th>
                  <th className="px-3 py-2 text-right">ค่ามือจริง</th>
                  <th className="px-3 py-2 text-right">ใช้ประกัน</th>
                  <th className="px-3 py-2 text-right">รวมจ่าย</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {summary.map((s) => (
                  <tr key={s.therapistId}>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{s.name}</td>
                    <td className="px-2 py-2 text-right">{s.days}</td>
                    <td className="px-2 py-2 text-right">{s.sessions}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {formatBaht(s.commission)} ฿
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {s.guaranteeDays > 0 ? (
                        <span className="text-amber-700">{s.guaranteeDays} วัน</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                      {formatBaht(s.income)} ฿
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 bg-slate-50 font-semibold">
                <tr>
                  <td className="px-3 py-2">รวม</td>
                  <td className="px-2 py-2 text-right">
                    {summary.reduce((sum, s) => sum + s.days, 0)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {summary.reduce((sum, s) => sum + s.sessions, 0)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {formatBaht(totalCommission)} ฿
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {summary.reduce((sum, s) => sum + s.guaranteeDays, 0)} วัน
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {formatBaht(grandTotal)} ฿
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {hasGuaranteeDays && (
            <p className="text-xs text-amber-700">
              จ่ายเกินค่ามือจริงเพราะประกันขั้นต่ำ {formatBaht(guaranteeTopUp)} บาท
            </p>
          )}
        </>
      )}
    </div>
  )
}
