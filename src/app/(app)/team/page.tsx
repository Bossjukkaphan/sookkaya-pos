import Link from "next/link"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { formatThaiDate, todayInShopTz } from "@/lib/datetime"
import { formatBaht } from "@/lib/constants"
import { pickStars, summarizeWorkdays, type AttendanceInput, type SaleInput } from "@/lib/hr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatCard } from "@/components/stat-card"
import { TeamTable } from "./team-table"
import { PagerLink } from "@/components/pager-link"

export const metadata = { title: "ทีมงาน · สุขกายา POS" }

const ESTIMATED_MARK = "ประมาณจากบิลย้อนหลัง"

/** ต้นเดือน/สิ้นเดือนของวันที่ให้มา (สตริงล้วน ไม่พึ่ง timezone เครื่อง) */
function monthRange(iso: string) {
  const [y, m] = iso.split("-").map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const mm = String(m).padStart(2, "0")
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${last}` }
}

function shiftMonth(iso: string, delta: number) {
  const [y, m] = iso.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`
}

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
]
function monthLabel(iso: string) {
  const [y, m] = iso.split("-").map(Number)
  return `${THAI_MONTHS[m - 1]} ${y + 543}`
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  // หน้านี้มีข้อมูลรายได้รายบุคคล — พนักงานทั่วไปไม่ควรเห็น
  const profile = await getMyProfile()
  if (!profile || !["admin", "manager"].includes(profile.role)) redirect("/")

  const params = await searchParams
  const today = todayInShopTz()
  const isDate = (s?: string) => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s))
  const defaultRange = monthRange(today)
  const from = isDate(params.from) ? params.from! : defaultRange.from
  const to = isDate(params.to) ? params.to! : defaultRange.to
  const isMonthView = from.endsWith("-01") && to === monthRange(from).to

  const supabase = await createClient()
  const [
    { data: therapists },
    { data: staff },
    { data: attendanceRows },
    { data: salesRows },
    { data: planRows },
  ] = await Promise.all([
      supabase.from("therapists").select("id, name, status").order("name"),
      supabase.from("staff_members").select("id, name, role").order("sort").order("name"),
      supabase
        .from("attendance")
        .select("work_date, therapist_id, staff_id, checked_in_at, checked_out_at, created_by")
        .gte("work_date", from)
        .lte("work_date", to),
      supabase
        .from("sales")
        .select("sale_date, therapist_id, commission, net_amount, is_request, customer_id")
        .gte("sale_date", from)
        .lte("sale_date", to),
      supabase
        .from("shift_plans")
        .select("work_date, therapist_id, staff_id")
        .gte("work_date", from)
        .lte("work_date", to),
    ])

  const attendance: AttendanceInput[] = (attendanceRows ?? []).map((a) => ({
    personId: (a.therapist_id ?? a.staff_id)!,
    workDate: a.work_date,
    checkedInAt: a.checked_in_at,
    checkedOutAt: a.checked_out_at,
    estimated: a.created_by === ESTIMATED_MARK,
  }))
  const sales: SaleInput[] = (salesRows ?? [])
    .filter((s) => s.therapist_id)
    .map((s) => ({
      therapistId: s.therapist_id!,
      saleDate: s.sale_date,
      commission: Number(s.commission ?? 0),
      netAmount: Number(s.net_amount ?? 0),
      isRequest: s.is_request ?? false,
      customerId: s.customer_id,
    }))
  // วันที่ร้านเปิด = วันที่มีบิล (ใช้เป็นฐานคำนวณ "ขาดงาน")
  const openDays = [...new Set((salesRows ?? []).map((s) => s.sale_date))].sort()

  // วันหยุดตามแผน (หน้า /shifts) — ไม่นับเป็นขาดงาน
  const plannedOffDays: Record<string, string[]> = {}
  for (const p of planRows ?? []) {
    const key = (p.therapist_id ?? p.staff_id)!
    ;(plannedOffDays[key] ??= []).push(p.work_date)
  }

  const therapistRows = summarizeWorkdays({
    people: (therapists ?? []).map((t) => ({ id: t.id, name: t.name })),
    attendance,
    sales,
    openDays,
    plannedOffDays,
  })
    // ตัดคนที่ไม่มีความเคลื่อนไหวในช่วงนี้ออก (เช่น หมอที่ลาออกไปนานแล้ว)
    .filter((r) => r.daysWorked > 0 || r.bills > 0)
    .sort((a, b) => b.commission - a.commission)

  const staffRows = summarizeWorkdays({
    people: (staff ?? []).map((s) => ({ id: s.id, name: s.name })),
    attendance,
    sales: [],
    openDays,
    plannedOffDays,
  }).sort((a, b) => b.daysWorked - a.daysWorked)

  const stars = pickStars(therapistRows)
  const roleOf = new Map((staff ?? []).map((s) => [s.id, s.role]))

  const totalDays = therapistRows.reduce((s, r) => s + r.daysWorked, 0) +
    staffRows.reduce((s, r) => s + r.daysWorked, 0)
  const totalHours = therapistRows.reduce((s, r) => s + r.hours, 0) +
    staffRows.reduce((s, r) => s + r.hours, 0)
  const totalCommission = therapistRows.reduce((s, r) => s + r.commission, 0)
  const totalAbsent = therapistRows.reduce((s, r) => s + r.daysAbsent, 0) +
    staffRows.reduce((s, r) => s + r.daysAbsent, 0)
  const attendanceRate =
    totalDays + totalAbsent > 0
      ? Math.round((totalDays / (totalDays + totalAbsent)) * 100)
      : 100

  const prevMonth = monthRange(shiftMonth(from, -1))
  const nextMonth = monthRange(shiftMonth(from, 1))

  const starCards: { title: string; icon: string; row: typeof stars.topCommission; detail: string }[] =
    [
      {
        title: "ค่ามือสูงสุด",
        icon: "🏆",
        row: stars.topCommission,
        detail: stars.topCommission ? `${formatBaht(stars.topCommission.commission)} ฿` : "",
      },
      {
        title: "โดนรีเควสมากสุด",
        icon: "💖",
        row: stars.topRequests,
        detail: stars.topRequests
          ? `${stars.topRequests.requests} ครั้ง (${stars.topRequests.requestPct}% ของบิล)`
          : "",
      },
      {
        title: "ขยันที่สุด",
        icon: "🎯",
        row: stars.mostDiligent,
        detail: stars.mostDiligent
          ? `มา ${stars.mostDiligent.daysWorked} วัน · ขาด ${stars.mostDiligent.daysAbsent}`
          : "",
      },
      {
        title: "ลูกค้ากลับมาหาซ้ำมากสุด",
        icon: "🔁",
        row: stars.topRepeat,
        detail: stars.topRepeat ? `${stars.topRepeat.repeatCustomers} คน` : "",
      },
    ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">ทีมงาน 👥</h1>
          <p className="text-sm text-slate-600">
            สรุปวันทำงาน ผลงาน และคุณภาพบริการ — ข้อมูลจากระบบเข้างานและบิลขาย
          </p>
        </div>
        <Link
          href="/checkin"
          className="rounded-full border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700"
        >
          ไปหน้าเข้างาน →
        </Link>
      </div>

      {/* เลือกช่วง: เดือนปัจจุบันเป็นค่าตั้งต้น เลื่อนเดือนหรือกรอกช่วงเองได้ */}
      <div className="flex flex-wrap items-center gap-2">
        <PagerLink href={`/team?from=${prevMonth.from}&to=${prevMonth.to}`}>←</PagerLink>
        <span className="min-w-40 text-center font-medium">
          {isMonthView ? monthLabel(from) : `${formatThaiDate(from)} – ${formatThaiDate(to)}`}
        </span>
        <PagerLink href={`/team?from=${nextMonth.from}&to=${nextMonth.to}`}>→</PagerLink>
        <form className="flex items-center gap-1.5" action="/team">
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="h-9 rounded-md border px-2 text-sm"
          />
          <span className="text-slate-400">–</span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="h-9 rounded-md border px-2 text-sm"
          />
          <button className="h-9 rounded-md border px-3 text-sm hover:bg-slate-100">ดู</button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="วัน-คนทำงาน" value={`${totalDays} วัน`} />
        <StatCard label="ชั่วโมงรวม" value={`${Math.round(totalHours).toLocaleString()} ชม.`} />
        <StatCard label="ค่ามือจ่ายรวม" value={`${formatBaht(totalCommission)} ฿`} />
        <StatCard
          label="อัตรามาทำงาน"
          value={`${attendanceRate}%`}
          hint={`ขาดรวม ${totalAbsent} วัน`}
          tone={attendanceRate >= 90 ? "good" : attendanceRate >= 75 ? "warn" : "bad"}
        />
      </div>

      {/* ดาวเด่น — เอาไปประกาศ/ให้รางวัลได้เลย */}
      {starCards.some((c) => c.row) && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {starCards.map(
            (c) =>
              c.row && (
                <Card key={c.title} className="border-amber-200 bg-amber-50/60">
                  <CardContent className="py-3">
                    <p className="text-xs text-amber-800">
                      {c.icon} {c.title}
                    </p>
                    <p className="truncate text-lg font-bold">{c.row.name}</p>
                    <p className="text-xs text-slate-600">{c.detail}</p>
                  </CardContent>
                </Card>
              )
          )}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            💆 หมอนวด ({therapistRows.length} คน)
          </CardTitle>
          <p className="text-xs text-slate-500">
            แตะหัวคอลัมน์เพื่อเรียงลำดับ · เครื่องหมาย ~ = เวลาประมาณจากบิลย้อนหลัง
            (ก่อนเริ่มใช้ระบบเข้างาน)
          </p>
        </CardHeader>
        <CardContent className="px-0">
          <TeamTable rows={therapistRows} showMoney />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">🧑‍💼 พนักงาน ({staffRows.length} คน)</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {staffRows.length === 0 ? (
            <p className="px-6 pb-3 text-sm text-slate-500">
              ยังไม่มีพนักงานในระบบ — เพิ่มได้ที่หน้า เข้างาน
            </p>
          ) : (
            <TeamTable
              rows={staffRows.map((r) => ({ ...r, name: `${r.name} · ${roleOf.get(r.personId) ?? ""}` }))}
              showMoney={false}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
