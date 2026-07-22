import { Suspense } from "react"

import { createClient } from "@/lib/supabase/server"
import { todayInShopTz, formatThaiDate } from "@/lib/datetime"
import { formatBaht } from "@/lib/constants"
import {
  type DateRange,
  previousRange,
  rangeFromPreset,
  rangeLengthDays,
} from "@/lib/date-range"
import { DateRangePicker } from "@/components/date-range-picker"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = { title: "ยอดขายย้อนหลัง · สุขกายา POS" }

type Totals = { sessions: number; gross: number; net: number; cash: number }

function sum(
  rows: {
    sessions: number | null
    volume: number | null
    net_revenue: number | null
    cash_in: number | null
  }[]
): Totals {
  return rows.reduce<Totals>(
    (acc, r) => ({
      sessions: acc.sessions + Number(r.sessions),
      gross: acc.gross + Number(r.volume),
      net: acc.net + Number(r.net_revenue),
      cash: acc.cash + Number(r.cash_in),
    }),
    { sessions: 0, gross: 0, net: 0, cash: 0 }
  )
}

function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0) return null
  const pct = Math.round(((now - before) / before) * 100)
  const up = pct >= 0
  return (
    <span className={up ? "text-sm text-emerald-700" : "text-sm text-red-700"}>
      {up ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  )
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const supabase = await createClient()
  const today = todayInShopTz()
  const params = await searchParams

  const range: DateRange =
    params.from && params.to
      ? { from: params.from, to: params.to }
      : rangeFromPreset("today", today)
  const prev = previousRange(range)

  const [{ data: current }, { data: previous }] = await Promise.all([
    supabase
      .from("v_daily_summary")
      .select("sale_date, sessions, volume, net_revenue, cash_in")
      .gte("sale_date", range.from)
      .lte("sale_date", range.to)
      .order("sale_date", { ascending: false }),
    supabase
      .from("v_daily_summary")
      .select("sale_date, sessions, volume, net_revenue, cash_in")
      .gte("sale_date", prev.from)
      .lte("sale_date", prev.to),
  ])

  const rows = current ?? []
  const now = sum(rows)
  const before = sum(previous ?? [])
  const days = rangeLengthDays(range)
  const avgPerSession = now.sessions > 0 ? Math.round(now.net / now.sessions) : 0

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">ยอดขายย้อนหลัง</h1>

      <Suspense fallback={null}>
        <DateRangePicker range={range} today={today} />
      </Suspense>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          ไม่มีข้อมูลในช่วงที่เลือก
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="py-4">
                <p className="text-sm text-slate-600">รายได้ที่รับรู้</p>
                <p className="text-2xl font-bold text-emerald-800">
                  {formatBaht(now.net)}
                </p>
                <Delta now={now.net} before={before.net} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-sm text-slate-600">เงินสดเข้าจริง</p>
                <p className="text-2xl font-bold">{formatBaht(now.cash)}</p>
                <p className="text-xs text-slate-500">รวมเงินเติมสมาชิก</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-sm text-slate-600">จำนวนเซสชัน</p>
                <p className="text-2xl font-bold">{now.sessions}</p>
                <Delta now={now.sessions} before={before.sessions} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-sm text-slate-600">เฉลี่ยต่อเซสชัน</p>
                <p className="text-2xl font-bold">{formatBaht(avgPerSession)}</p>
                <p className="text-xs text-slate-500">
                  {days} วัน · เฉลี่ย {Math.round(now.sessions / days)} เซสชัน/วัน
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">รายวัน</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <ul className="divide-y">
                {rows.map((r) => (
                  <li
                    key={r.sale_date ?? ""}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6"
                  >
                    <span className="text-sm">{formatThaiDate(r.sale_date ?? "")}</span>
                    <span className="text-sm text-slate-500">
                      {r.sessions} เซสชัน
                    </span>
                    <span className="text-sm font-semibold">
                      {formatBaht(Number(r.net_revenue))} ฿
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
