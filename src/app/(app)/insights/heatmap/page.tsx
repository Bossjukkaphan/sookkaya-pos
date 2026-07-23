import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { InsightsAccessDenied, canSeeInsights } from "../shared"
import { OPEN_HOURS, WEEKDAY_LABELS } from "@/lib/insights"
import { formatBaht } from "@/lib/constants"
import { todayInShopTz } from "@/lib/datetime"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { HeatmapGrid, type HeatCell } from "./heatmap-grid"

export const metadata = { title: "ชั่วโมงคนแน่น · สุขกายา POS" }

/**
 * ค่าเริ่มต้น 90 วัน: หนึ่งเดือนมีวันจันทร์แค่ ~4 วัน ตัวเลขต่อช่องจะแกว่งจนอ่านไม่ได้
 * ส่วนแบบทั้งหมดโดนช่วงเพิ่งเปิดร้าน (คนยังน้อย) ถ่วงภาพให้เก่ากว่าพฤติกรรมปัจจุบัน
 */
const RANGE_OPTIONS = [
  { key: "30", label: "30 วันล่าสุด", days: 30 },
  { key: "90", label: "90 วันล่าสุด", days: 90 },
  { key: "all", label: "ทั้งหมดตั้งแต่เปิดร้าน", days: null },
] as const

type RangeKey = (typeof RANGE_OPTIONS)[number]["key"]

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export default async function HeatmapPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const supabase = await createClient()
  const profile = await getMyProfile()

  if (!canSeeInsights(profile?.role)) {
    return <InsightsAccessDenied title="ชั่วโมงคนแน่น" />
  }

  const params = await searchParams
  const range: RangeKey =
    params.range === "all" || params.range === "30" ? params.range : "90"
  const option = RANGE_OPTIONS.find((o) => o.key === range)!
  const fromDate =
    option.days === null ? null : shiftDate(todayInShopTz(), -option.days)

  // นับจำนวนรายการในช่วงเดียวกันไว้บอกความครบของข้อมูล — บาง import เก่าไม่มีเวลาขาย
  let totalQuery = supabase
    .from("sales")
    .select("id", { count: "exact", head: true })
  let withTimeQuery = supabase
    .from("sales")
    .select("id", { count: "exact", head: true })
    .not("sale_time", "is", null)
  if (fromDate) {
    totalQuery = totalQuery.gte("sale_date", fromDate)
    withTimeQuery = withTimeQuery.gte("sale_date", fromDate)
  }

  const [{ data: density }, { count: totalSales }, { count: withTime }] =
    await Promise.all([
      // ฟังก์ชันใช้สูตรรายได้เดียวกับ v_hourly_density แต่กรองช่วงวันได้
      supabase.rpc("hourly_density", fromDate ? { from_date: fromDate } : {}),
      totalQuery,
      withTimeQuery,
    ])

  const rows = density ?? []
  const total = totalSales ?? 0
  const counted = withTime ?? 0

  // ช่องที่แน่นที่สุดคือฐานของสเกลสี — นับเฉพาะชั่วโมงที่ร้านเปิดจริง
  const cells: HeatCell[] = []
  let outsideHours = 0
  for (const r of rows) {
    const hour = Number(r.hour ?? -1)
    const sessions = Number(r.sessions ?? 0)
    if (!OPEN_HOURS.includes(hour)) {
      outsideHours += sessions
      continue
    }
    cells.push({
      weekday: Number(r.weekday ?? 0),
      hour,
      sessions,
      revenue: Number(r.revenue ?? 0),
    })
  }

  const busiest = [...cells].sort((a, b) => b.sessions - a.sessions)[0]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">ชั่วโมงคนแน่น</h1>
        <p className="text-sm text-slate-600">
          แยกตามวันในสัปดาห์และชั่วโมง · {option.label}
        </p>
      </div>

      <div className="flex gap-2">
        {RANGE_OPTIONS.map((o) => (
          <Link
            key={o.key}
            href={o.key === "90" ? "/insights/heatmap" : `/insights/heatmap?range=${o.key}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              o.key === range
                ? "border-emerald-600 bg-emerald-50 font-medium text-emerald-900"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {o.label}
          </Link>
        ))}
      </div>

      {/* ถ้าไม่บอกสัดส่วนนี้ จะเข้าใจว่าเป็นภาพรวมทั้งช่วง ทั้งที่ข้อมูลเก่าบางส่วนไม่มีเวลา */}
      {counted < total && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-3 text-xs text-amber-900">
            คำนวณจาก {counted.toLocaleString()} รายการที่บันทึกเวลาไว้ จากทั้งหมด{" "}
            {total.toLocaleString()} รายการในช่วงนี้ (
            {total > 0 ? Math.round((counted / total) * 100) : 0}%) —
            ข้อมูลที่ import จากไฟล์เก่าบางส่วนไม่มีเวลาขาย
            {outsideHours > 0 &&
              ` · ในจำนวนนี้มี ${outsideHours} รายการที่เวลาอยู่นอกเวลาทำการ ไม่ถูกนำมาแสดงในตาราง`}
          </CardContent>
        </Card>
      )}

      {busiest && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-slate-600">ช่วงที่แน่นที่สุด</p>
            <p className="text-2xl font-bold">
              {WEEKDAY_LABELS[busiest.weekday]} {busiest.hour}:00 น.
            </p>
            <p className="text-sm text-slate-600">
              {busiest.sessions} เซสชัน · {formatBaht(busiest.revenue)} บาท
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">ตารางความหนาแน่น</CardTitle>
        </CardHeader>
        <CardContent>
          {cells.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              ไม่มีข้อมูลในช่วงนี้
            </p>
          ) : (
            <HeatmapGrid cells={cells} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
