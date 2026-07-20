import { createClient } from "@/lib/supabase/server"
import { InsightsAccessDenied, canSeeInsights } from "../shared"
import { OPEN_HOURS, WEEKDAY_LABELS, heatIntensity } from "@/lib/insights"
import { formatBaht } from "@/lib/constants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = { title: "ชั่วโมงคนแน่น · สุขกายา POS" }

const HEAT_CLASSES = [
  "bg-slate-50 text-slate-300",
  "bg-emerald-50 text-emerald-900",
  "bg-emerald-100 text-emerald-900",
  "bg-emerald-300 text-emerald-950",
  "bg-emerald-600 font-semibold text-white",
] as const

export default async function HeatmapPage() {
  const supabase = await createClient()
  const { data: profile } = await supabase.from("profiles").select("role").single()

  if (!canSeeInsights(profile?.role)) {
    return <InsightsAccessDenied title="ชั่วโมงคนแน่น" />
  }

  const [{ data: density }, { count: totalSales }] = await Promise.all([
    supabase.from("v_hourly_density").select("weekday, hour, sessions, revenue"),
    supabase.from("sales").select("id", { count: "exact", head: true }),
  ])

  const rows = density ?? []
  const counted = rows.reduce((sum, r) => sum + Number(r.sessions ?? 0), 0)
  const total = totalSales ?? 0

  // ช่องที่แน่นที่สุดคือฐานของสเกลสี — นับเฉพาะชั่วโมงที่ร้านเปิดจริง
  const cells = new Map<string, { sessions: number; revenue: number }>()
  let max = 0
  let outsideHours = 0
  for (const r of rows) {
    const hour = Number(r.hour ?? -1)
    const sessions = Number(r.sessions ?? 0)
    if (!OPEN_HOURS.includes(hour)) {
      outsideHours += sessions
      continue
    }
    cells.set(`${r.weekday}-${hour}`, {
      sessions,
      revenue: Number(r.revenue ?? 0),
    })
    if (sessions > max) max = sessions
  }

  const busiest = [...cells.entries()].sort(
    (a, b) => b[1].sessions - a[1].sessions
  )[0]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">ชั่วโมงคนแน่น</h1>
        <p className="text-sm text-slate-600">
          รวมทุกวันตั้งแต่เปิดร้าน แยกตามวันในสัปดาห์และชั่วโมง
        </p>
      </div>

      {/* ถ้าไม่บอกสัดส่วนนี้ จะเข้าใจว่าเป็นภาพรวมทั้งร้าน ทั้งที่ข้อมูลเก่ามีเวลาแค่ 70% */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="py-3 text-xs text-amber-900">
          คำนวณจาก {counted.toLocaleString()} รายการที่บันทึกเวลาไว้ จากทั้งหมด{" "}
          {total.toLocaleString()} รายการ (
          {total > 0 ? Math.round((counted / total) * 100) : 0}%) —
          ข้อมูลที่ import จากไฟล์เก่าบางส่วนไม่มีเวลาขาย
          {outsideHours > 0 &&
            ` · ในจำนวนนี้มี ${outsideHours} รายการที่เวลาอยู่นอกเวลาทำการ ไม่ถูกนำมาแสดงในตาราง`}
        </CardContent>
      </Card>

      {busiest && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-slate-600">ช่วงที่แน่นที่สุด</p>
            <p className="text-2xl font-bold">
              {WEEKDAY_LABELS[Number(busiest[0].split("-")[0])]}{" "}
              {busiest[0].split("-")[1]}:00 น.
            </p>
            <p className="text-sm text-slate-600">
              {busiest[1].sessions} เซสชัน · {formatBaht(busiest[1].revenue)} บาท
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">ตารางความหนาแน่น</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-separate border-spacing-0.5 text-center text-xs">
            <thead>
              <tr>
                <th className="w-8" />
                {OPEN_HOURS.map((h) => (
                  <th key={h} className="font-normal text-slate-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WEEKDAY_LABELS.map((label, weekday) => (
                <tr key={label}>
                  <th className="pr-1 text-right font-normal text-slate-500">
                    {label}
                  </th>
                  {OPEN_HOURS.map((hour) => {
                    const cell = cells.get(`${weekday}-${hour}`)
                    const sessions = cell?.sessions ?? 0
                    return (
                      <td
                        key={hour}
                        className={`rounded py-1.5 ${HEAT_CLASSES[heatIntensity(sessions, max)]}`}
                        title={`${label} ${hour}:00 — ${sessions} เซสชัน`}
                      >
                        {sessions || "·"}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
