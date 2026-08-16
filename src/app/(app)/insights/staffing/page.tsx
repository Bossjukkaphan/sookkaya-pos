import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { InsightsAccessDenied, canSeeInsights } from "../shared"
import {
  DAY_CLASS_LABEL, STAFFING, criterionStatus, hireVerdict, recommendedTherapists,
  type CriterionStatus, type DayClass, type StaffingDayRow,
} from "@/lib/staffing"
import { formatBaht } from "@/lib/constants"
import { todayInShopTz } from "@/lib/datetime"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sparkline } from "./sparkline"
import type { Database } from "@/types/database"

export const metadata = { title: "จัดกำลังหมอ · สุขกายา POS" }

const STATUS_ICON: Record<CriterionStatus, string> = {
  pass: "🟢", near: "🟡", fail: "🔴",
}

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

type DailyViewRow = Database["public"]["Views"]["v_staffing_daily"]["Row"]

/**
 * map แถว view เป็น StaffingDayRow ที่ตรรกะต้องการ — type generate ให้ทุกคอลัมน์เป็น
 * nullable แต่ตรรกะในสเปกไม่รองรับ null เลย จึงต้อง coalesce ทุกฟิลด์ที่นี่ที่เดียว
 */
function toDayRow(row: DailyViewRow): StaffingDayRow {
  const dc = row.day_class
  const dayClass: DayClass = dc === "fri" || dc === "weekend" ? dc : "mon_thu"
  return {
    day_class: dayClass,
    therapists_checked_in: Number(row.therapists_checked_in ?? 0),
    revenue: Number(row.revenue ?? 0),
    peak_concurrent_therapists: Number(row.peak_concurrent_therapists ?? 0),
    idle_therapists: Number(row.idle_therapists ?? 0),
    is_estimated: Boolean(row.is_estimated ?? false),
  }
}

export default async function StaffingPage() {
  const supabase = await createClient()
  const profile = await getMyProfile()
  if (!canSeeInsights(profile?.role)) {
    return <InsightsAccessDenied title="จัดกำลังหมอ" />
  }

  const today = todayInShopTz()
  // 8 สัปดาห์ล่าสุดสำหรับการ์ดจำนวนแนะนำ — สั้นกว่านี้ข้อมูลต่อ n ไม่พอ ยาวกว่านี้โดนช่วงร้านยังเล็กถ่วง
  const from8w = shiftDate(today, -56)

  const [dailyRes, monthlyRes] = await Promise.all([
    supabase.from("v_staffing_daily").select("*").gte("work_date", from8w)
      .order("work_date"),
    supabase.from("v_staffing_monthly").select("*").order("month", { ascending: false })
      .limit(6),
  ])
  const daily = (dailyRes.data ?? []).map(toDayRow)
  const monthly = monthlyRes.data ?? []

  // ---------- ส่วนบน: จัดกี่คนต่อประเภทวัน ----------
  const classes: DayClass[] = ["mon_thu", "fri", "weekend"]
  const recs = classes.map((c) => ({
    dayClass: c,
    rec: recommendedTherapists(daily.filter((r) => r.day_class === c)),
  }))

  // ---------- ส่วนล่าง: เกณฑ์ 4 ข้อจากเดือนล่าสุด + sparkline 6 เดือน ----------
  const newest = monthly[0]
  const numbersOf = (m: (typeof monthly)[number]) => ({
    weekendFullPct: Number(m.weekend_full_pct ?? 0),
    friSunPerTherapist: Number(m.fri_sun_revenue_per_therapist ?? 0),
    turnAways: Number(m.turn_away_total ?? 0),
    shortfallPct: Number(m.guarantee_shortfall_pct ?? 0),
  })
  const criteria = newest
    ? [
        {
          label: "วันเสาร์-อาทิตย์ที่หมอยุ่งเต็มพร้อมกัน",
          value: `${numbersOf(newest).weekendFullPct}%`,
          threshold: `≥ ${STAFFING.weekendFullPctPass}%`,
          status: criterionStatus(numbersOf(newest).weekendFullPct,
            STAFFING.weekendFullPctPass, "gte"),
          trend: monthly.map((m) => numbersOf(m).weekendFullPct).reverse(),
        },
        {
          label: "ยอดต่อหมอต่อวัน (ศุกร์-อาทิตย์)",
          value: formatBaht(numbersOf(newest).friSunPerTherapist),
          threshold: `≥ ${formatBaht(STAFFING.fridaySundayPerTherapistPass)}`,
          status: criterionStatus(numbersOf(newest).friSunPerTherapist,
            STAFFING.fridaySundayPerTherapistPass, "gte"),
          trend: monthly.map((m) => numbersOf(m).friSunPerTherapist).reverse(),
        },
        {
          label: "ลูกค้าที่ปฏิเสธ",
          value: `${numbersOf(newest).turnAways} ครั้ง`,
          threshold: `≥ ${STAFFING.turnAwaysPerMonthPass} ครั้ง/เดือน`,
          status: criterionStatus(numbersOf(newest).turnAways,
            STAFFING.turnAwaysPerMonthPass, "gte"),
          trend: monthly.map((m) => numbersOf(m).turnAways).reverse(),
          trustNote: numbersOf(newest).turnAways < STAFFING.turnAwayTrustMin
            ? `ตัวเลขนี้เชื่อได้ต่อเมื่อพนักงานกดปุ่มปฏิเสธทุกครั้งที่รับลูกค้าไม่ได้ — เดือนนี้บันทึกเพียง ${numbersOf(newest).turnAways} ครั้ง`
            : null,
        },
        {
          label: "หมอ-วันที่ต่ำกว่าการันตี 500฿",
          value: `${numbersOf(newest).shortfallPct}%`,
          threshold: `≤ ${STAFFING.guaranteeShortfallPctPass}%`,
          status: criterionStatus(numbersOf(newest).shortfallPct,
            STAFFING.guaranteeShortfallPctPass, "lte"),
          trend: monthly.map((m) => numbersOf(m).shortfallPct).reverse(),
        },
      ]
    : []
  const passCount = criteria.filter((c) => c.status === "pass").length
  const allPassByMonth = monthly.map((m) => {
    const n = numbersOf(m)
    return {
      allPass:
        criterionStatus(n.weekendFullPct, STAFFING.weekendFullPctPass, "gte") === "pass" &&
        criterionStatus(n.friSunPerTherapist, STAFFING.fridaySundayPerTherapistPass, "gte") === "pass" &&
        criterionStatus(n.turnAways, STAFFING.turnAwaysPerMonthPass, "gte") === "pass" &&
        criterionStatus(n.shortfallPct, STAFFING.guaranteeShortfallPctPass, "lte") === "pass",
    }
  })
  const { verdict } = hireVerdict(allPassByMonth)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">จัดกำลังหมอ</h1>
        <p className="text-sm text-slate-600">
          แต่ละวันควรจัดหมอกี่คน และถึงเวลาจ้างเพิ่มหรือยัง
        </p>
      </div>

      {/* เส้นแบ่งข้อมูล — ก่อน 27 ก.ค. เป็นข้อมูลเติมย้อนหลัง (ดูสเปก) */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="py-3 text-xs text-amber-900">
          การเช็คอินจริงเริ่ม 27 ก.ค. 2569 — ก่อนหน้านั้นประมาณจากบิลย้อนหลัง
          ตัวเลขที่พึ่งการเช็คอินตรง ๆ (เช่น หมอว่างทั้งวัน)
          คำนวณจากช่วงข้อมูลจริงเท่านั้น
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="font-semibold">สัปดาห์นี้จัดกี่คนดี</h2>
        <p className="text-xs text-slate-500">จากข้อมูล 8 สัปดาห์ล่าสุด</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {recs.map(({ dayClass: c, rec }) => (
            <Card key={c}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{DAY_CLASS_LABEL[c]}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {rec.count === null || rec.inconclusive ? (
                  <p className="text-2xl font-bold text-slate-400">
                    {rec.count === null ? "ข้อมูลยังไม่พอ" : `~${rec.count} คน?`}
                  </p>
                ) : (
                  <p className="text-3xl font-bold">{rec.count} คน</p>
                )}
                <p className="text-sm text-slate-600">
                  ยอดเฉลี่ย {formatBaht(rec.avgRevenue)}/วัน · ต่อหมอ{" "}
                  {formatBaht(rec.avgPerTherapist)}
                </p>
                <p className="text-sm text-slate-600">
                  วันที่หมอเต็มพร้อมกัน {rec.fullDayPct}%
                </p>
                <p className="text-sm text-slate-600">
                  หมอว่างทั้งวัน {rec.idleCount} ครั้ง
                  <span className="text-xs text-slate-400"> (นับจากเช็คอินจริง)</span>
                </p>
                {c === "weekend" && (
                  <p className="pt-1 text-xs text-slate-500">
                    วันหยุดนักขัตฤกษ์จัดตามการ์ดนี้
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">ถึงเวลาจ้างคนที่ 8 หรือยัง</h2>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              ผ่าน {passCount} จาก 4 เกณฑ์ —{" "}
              {verdict === "ready" ? (
                <span className="text-emerald-700">ถึงเวลาพิจารณา (ผ่านครบ 2 เดือนติด)</span>
              ) : (
                <span className="text-slate-600">ยังไม่ถึงเวลา</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-500">
                  <th className="py-1.5 font-medium">เกณฑ์</th>
                  <th className="py-1.5 font-medium">เดือนนี้</th>
                  <th className="py-1.5 font-medium">ต้องการ</th>
                  <th className="py-1.5 font-medium">สถานะ</th>
                  <th className="py-1.5 font-medium">6 เดือน</th>
                </tr>
              </thead>
              <tbody>
                {criteria.map((c) => (
                  <tr key={c.label} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-2">
                      {c.label}
                      {"trustNote" in c && c.trustNote && (
                        <p className="pt-1 text-xs text-amber-700">{c.trustNote}</p>
                      )}
                    </td>
                    <td className="py-2 pr-2 font-medium">{c.value}</td>
                    <td className="py-2 pr-2 text-slate-500">{c.threshold}</td>
                    <td className="py-2 pr-2">{STATUS_ICON[c.status]}</td>
                    <td className="py-2"><Sparkline values={c.trend} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!newest && (
              <p className="py-4 text-center text-sm text-slate-500">ยังไม่มีข้อมูล</p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
