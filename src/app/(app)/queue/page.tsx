import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { formatThaiDate, todayInShopTz } from "@/lib/datetime"
import { Button } from "@/components/ui/button"
import { QueueBoard } from "./queue-board"

export const metadata = { title: "คิววันนี้ · สุขกายา POS" }

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const supabase = await createClient()
  const today = todayInShopTz()
  const params = await searchParams
  // วันที่ผิดรูปแบบ → เงียบๆ กลับมาวันนี้ (ลิงก์เก่า/พิมพ์เอง)
  const boardDate =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today
  const isToday = boardDate === today

  const [{ data: therapists }, { data: services }, { data: entries }, { data: beds }] =
    await Promise.all([
      supabase
        .from("therapists")
        .select("id, name")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("services")
        .select("id, name, duration_min")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("queue_entries")
        .select("*")
        .eq("queue_date", boardDate)
        .neq("status", "cancelled")
        .order("start_time"),
      supabase
        .from("beds")
        .select("id, room, name")
        .eq("is_active", true)
        .order("sort"),
    ])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">คิว{isToday ? "วันนี้" : ""}</h1>
          <p className="text-sm text-slate-600">
            {formatThaiDate(boardDate)}
            {!isToday && boardDate > today && " · ล่วงหน้า"}
            {!isToday && boardDate < today && " · ย้อนหลัง"}
          </p>
        </div>
        <div className="flex gap-1">
          <Link
            href={`/queue?date=${shiftDate(boardDate, -1)}`}
            className="rounded-md border px-3 py-2 text-sm hover:bg-slate-100"
            aria-label="วันก่อนหน้า"
          >
            ←
          </Link>
          {!isToday && (
            <Button asChild size="sm" variant="outline" className="h-auto">
              <Link href="/queue">วันนี้</Link>
            </Button>
          )}
          <Link
            href={`/queue?date=${shiftDate(boardDate, 1)}`}
            className="rounded-md border px-3 py-2 text-sm hover:bg-slate-100"
            aria-label="วันถัดไป"
          >
            →
          </Link>
        </div>
      </div>
      <QueueBoard
        therapists={therapists ?? []}
        services={services ?? []}
        beds={beds ?? []}
        initialEntries={entries ?? []}
        boardDate={boardDate}
        isToday={isToday}
      />
    </div>
  )
}
