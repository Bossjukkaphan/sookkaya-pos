import Link from "next/link"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { todayInShopTz } from "@/lib/datetime"
import { ShiftGrid } from "./shift-grid"

export const metadata = { title: "จัดวันหยุด · สุขกายา POS" }

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
]

function shiftMonth(iso: string, delta: number) {
  const [y, m] = iso.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const profile = await getMyProfile()
  if (!profile || !["admin", "manager"].includes(profile.role)) redirect("/")

  const params = await searchParams
  const today = todayInShopTz()
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : today.slice(0, 7)
  const [y, m] = month.split("-").map(Number)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const from = `${month}-01`
  const to = `${month}-${String(daysInMonth).padStart(2, "0")}`

  const supabase = await createClient()
  const [{ data: therapists }, { data: staff }, { data: plans }] = await Promise.all([
    supabase.from("therapists").select("id, name").eq("status", "active").order("name"),
    supabase
      .from("staff_members")
      .select("id, name, role")
      .eq("is_active", true)
      .order("sort")
      .order("name"),
    supabase
      .from("shift_plans")
      .select("work_date, therapist_id, staff_id, plan")
      .gte("work_date", from)
      .lte("work_date", to),
  ])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">จัดวันหยุดล่วงหน้า 📅</h1>
          <p className="text-sm text-slate-600">
            แตะช่องเพื่อสลับ: ทำงาน → หยุด → ลา — จองไลน์และหน้าทีมงานปรับตามอัตโนมัติ
          </p>
        </div>
        <Link
          href="/checkin"
          className="rounded-full border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700"
        >
          ไปหน้าเข้างาน →
        </Link>
      </div>

      <div className="flex items-center justify-center gap-2">
        <Link
          href={`/shifts?month=${shiftMonth(month, -1)}`}
          className="rounded-md border px-3 py-2 text-sm hover:bg-slate-100"
        >
          ←
        </Link>
        <span className="min-w-40 text-center font-semibold">
          {THAI_MONTHS[m - 1]} {y + 543}
        </span>
        <Link
          href={`/shifts?month=${shiftMonth(month, 1)}`}
          className="rounded-md border px-3 py-2 text-sm hover:bg-slate-100"
        >
          →
        </Link>
      </div>

      <ShiftGrid
        month={month}
        daysInMonth={daysInMonth}
        today={today}
        therapists={therapists ?? []}
        staff={staff ?? []}
        plans={plans ?? []}
      />
    </div>
  )
}
