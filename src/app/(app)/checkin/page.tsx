import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { formatThaiDate, todayInShopTz } from "@/lib/datetime"
import { CheckinList } from "./checkin-list"

export const metadata = { title: "เข้างาน · สุขกายา POS" }

/** เลื่อนวันแบบสตริง ISO ตรงๆ — ไม่พึ่ง timezone เครื่อง */
function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export default async function CheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams
  const today = todayInShopTz()
  const workDate = /^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ? date! : today
  const monthStart = workDate.slice(0, 8) + "01"

  const supabase = await createClient()
  const [
    { data: therapists },
    { data: staff },
    { data: attendance },
    { data: monthRows },
    { data: dayPlans },
  ] = await Promise.all([
      supabase
        .from("therapists")
        .select("id, name")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("staff_members")
        .select("id, name, role")
        .eq("is_active", true)
        .order("sort")
        .order("name"),
      supabase
        .from("attendance")
        .select("id, therapist_id, staff_id, checked_in_at, checked_out_at")
        .eq("work_date", workDate),
      supabase
        .from("attendance")
        .select("therapist_id, staff_id")
        .gte("work_date", monthStart)
        .lte("work_date", workDate.slice(0, 8) + "31"),
      supabase
        .from("shift_plans")
        .select("therapist_id, staff_id, plan")
        .eq("work_date", workDate),
    ])

  // นับวันทำงานเดือนนี้ต่อคน — ฐานข้อมูลค่าแรง/OT ในอนาคต
  const monthCount = new Map<string, number>()
  for (const row of monthRows ?? []) {
    const key = row.therapist_id ?? row.staff_id
    if (key) monthCount.set(key, (monthCount.get(key) ?? 0) + 1)
  }

  const label =
    workDate === today
      ? "วันนี้"
      : workDate === shiftDate(today, -1)
        ? "เมื่อวาน"
        : workDate === shiftDate(today, 1)
          ? "พรุ่งนี้"
          : ""

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">บันทึกเข้างาน ✅</h1>
          <p className="text-sm text-slate-600">
            ติ๊กก่อนเปิดร้านทุกวัน — หมอที่ไม่มา ระบบปิดรับคิวให้อัตโนมัติ
          </p>
        </div>
        <Link
          href="/queue"
          className="rounded-full border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700"
        >
          ไปหน้าคิววันนี้ →
        </Link>
      </div>

      {/* เลื่อนวัน: เมื่อวาน ← วันนี้ → พรุ่งนี้ (เช็คอินพรุ่งนี้ = แผนล่วงหน้า คุมสลอตจองไลน์) */}
      <div className="flex items-center justify-center gap-2">
        <Link
          href={`/checkin?date=${shiftDate(workDate, -1)}`}
          className="rounded-full border px-4 py-2 text-sm"
        >
          ←
        </Link>
        <div className="min-w-44 text-center">
          <p className="font-semibold">
            {formatThaiDate(workDate)}
            {label && <span className="ml-1 text-emerald-700">({label})</span>}
          </p>
          {workDate !== today && (
            <Link href="/checkin" className="text-xs text-slate-500 underline">
              กลับวันนี้
            </Link>
          )}
        </div>
        <Link
          href={`/checkin?date=${shiftDate(workDate, 1)}`}
          className="rounded-full border px-4 py-2 text-sm"
        >
          →
        </Link>
      </div>

      <CheckinList
        workDate={workDate}
        therapists={therapists ?? []}
        staff={staff ?? []}
        attendance={attendance ?? []}
        monthCount={Object.fromEntries(monthCount)}
        planOf={Object.fromEntries(
          (dayPlans ?? []).map((p) => [(p.therapist_id ?? p.staff_id)!, p.plan])
        )}
      />
    </div>
  )
}
