import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { formatThaiDate, todayInShopTz } from "@/lib/datetime"
import { Button } from "@/components/ui/button"
import { QueueBoard } from "./queue-board"
import { PagerLink } from "@/components/pager-link"

export const metadata = { title: "คิววันนี้ · สุขกายา POS" }

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; add?: string; from?: string }>
}) {
  const supabase = await createClient()
  const today = todayInShopTz()
  const params = await searchParams
  // วันที่ผิดรูปแบบ → เงียบๆ กลับมาวันนี้ (ลิงก์เก่า/พิมพ์เอง)
  const boardDate =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today
  const isToday = boardDate === today

  const [
    { data: therapists },
    { data: services },
    { data: entries },
    { data: beds },
    { data: attendanceRows },
  ] = await Promise.all([
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
        .not("status", "in", "(cancelled,rejected)")
        .order("start_time"),
      supabase
        .from("beds")
        .select("id, room, name")
        .eq("is_active", true)
        .order("sort"),
      supabase
        .from("attendance")
        .select("therapist_id")
        .eq("work_date", boardDate)
        .not("therapist_id", "is", null),
    ])

  const { count: turnAwayCount } = await supabase
    .from("turn_aways")
    .select("id", { count: "exact", head: true })
    .eq("queue_date", boardDate)

  // ค้างรับต่อการ์ด (เฉพาะการ์ดที่จ่ายแล้วและผูกบิลขาย) — โหลดเป็น batch เดียวจากบิลของวันนี้เท่านั้น
  // ห้าม query ต่อการ์ด: การ์ดคิวมีเป็นสิบใบต่อวัน ยิงทีละใบจะช้าและถล่ม DB โดยไม่จำเป็น
  const paidSaleIds = [
    ...new Set(
      (entries ?? [])
        .filter((e) => e.status === "paid" && e.sale_id)
        .map((e) => e.sale_id as string)
    ),
  ]
  const dueBySaleId: Record<string, number> = {}
  if (paidSaleIds.length) {
    const { data: paidSales } = await supabase
      .from("sales")
      .select("id, bill_id")
      .in("id", paidSaleIds)
    const billKeyBySaleId = new Map(
      (paidSales ?? []).map((s) => [s.id, String(s.bill_id ?? s.id)])
    )
    const billKeys = [...new Set(billKeyBySaleId.values())]
    const { data: billDues } = billKeys.length
      ? await supabase.from("v_bill_due").select("bill_key, due").in("bill_key", billKeys)
      : { data: [] }
    const dueByBillKey = new Map(
      (billDues ?? []).map((d) => [String(d.bill_key), Number(d.due)])
    )
    for (const saleId of paidSaleIds) {
      const billKey = billKeyBySaleId.get(saleId)
      dueBySaleId[saleId] = billKey ? (dueByBillKey.get(billKey) ?? 0) : 0
    }
  }

  return (
    <div className="space-y-4">
      {/* ถูกพากลับมาจากหน้าบันทึกขายเดิม — บอกขั้นตอนใหม่ให้ชัดว่าต้องเริ่มจากคิว */}
      {params.from === "pos" && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          การขายทุกบิลเริ่มจากคิว — กด <span className="font-semibold">+ เพิ่มคิว</span>{" "}
          (เวลาจอง = เวลาที่ลูกค้ามาถึง) แล้วเก็บเงินจากปุ่ม 💰 บนการ์ดคิว
          ระบบจะเก็บเวลาจอง เวลาเริ่มนวดจริง และเวลาบันทึกให้ครบทุกบิล
        </p>
      )}
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
          <PagerLink href={`/queue?date=${shiftDate(boardDate, -1)}`} aria-label="วันก่อนหน้า">←</PagerLink>
          {!isToday && (
            <Button asChild size="sm" variant="outline" className="h-auto">
              <Link href="/queue">วันนี้</Link>
            </Button>
          )}
          <PagerLink href={`/queue?date=${shiftDate(boardDate, 1)}`} aria-label="วันถัดไป">→</PagerLink>
        </div>
      </div>
      <QueueBoard
        therapists={therapists ?? []}
        services={services ?? []}
        beds={beds ?? []}
        initialEntries={entries ?? []}
        boardDate={boardDate}
        isToday={isToday}
        checkedInTherapistIds={(attendanceRows ?? [])
          .map((a) => a.therapist_id)
          .filter((id): id is string => Boolean(id))}
        turnAwayCount={turnAwayCount ?? 0}
        autoOpenAdd={params.add === "1"}
        dueBySaleId={dueBySaleId}
      />
    </div>
  )
}
