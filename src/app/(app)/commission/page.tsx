import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { formatThaiDate, todayInShopTz } from "@/lib/datetime"
import { DEFAULT_MIN_COMMISSION, formatBaht } from "@/lib/constants"
import { PayToggle } from "./pay-toggle"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export const metadata = { title: "ค่ามือรายวัน · สุขกายา POS" }

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export default async function CommissionPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const supabase = await createClient()
  const params = await searchParams
  const workDate = params.date ?? todayInShopTz()

  const [
    { data: therapists },
    { data: therapistDaily },
    { data: records },
  ] = await Promise.all([
    supabase
      .from("therapists")
      .select("id, name")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("v_therapist_daily")
      .select(
        "therapist_id, sessions, total_commission, request_fee, guarantee_amount, net_commission, total_income, status, is_paid"
      )
      .eq("work_date", workDate),
    supabase
      .from("therapist_daily_commission")
      .select("therapist_id, is_paid")
      .eq("work_date", workDate),
  ])

  const dailyRows = therapistDaily ?? []
  const guarantee =
    dailyRows.length > 0
      ? Number(dailyRows[0].guarantee_amount ?? DEFAULT_MIN_COMMISSION)
      : DEFAULT_MIN_COMMISSION
  const paidMap = new Map((records ?? []).map((r) => [r.therapist_id, r.is_paid]))
  const dailyMap = new Map(dailyRows.map((d) => [d.therapist_id, d]))

  const summary = (therapists ?? []).map((t) => {
    const d = dailyMap.get(t.id)
    const worked = !!d
    const totalCommission = Number(d?.total_commission ?? 0)
    const requestFee = Number(d?.request_fee ?? 0)
    const netCommission = Number(d?.net_commission ?? 0)
    const totalIncome = Number(d?.total_income ?? 0)
    const usedGuarantee = worked && d?.status === "ใช้ประกัน"

    return {
      therapistId: t.id,
      name: t.name,
      sessions: Number(d?.sessions ?? 0),
      worked,
      totalCommission,
      requestFee,
      netCommission,
      totalIncome,
      status: !worked ? "ไม่ได้เข้างาน" : (d?.status ?? "ค่ามือจริง"),
      usedGuarantee,
      paid: paidMap.get(t.id) ?? d?.is_paid ?? false,
    }
  })

  const grandTotal = summary.reduce((sum, s) => sum + s.totalIncome, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">ค่ามือรายวัน</h1>
          <p className="text-sm text-slate-600">{formatThaiDate(workDate)}</p>
        </div>
        <div className="flex gap-1">
          <Link
            href={`/commission?date=${shiftDate(workDate, -1)}`}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border text-sm hover:bg-slate-100"
          >
            ← ก่อนหน้า
          </Link>
          <Link
            href={`/commission?date=${shiftDate(workDate, 1)}`}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border text-sm hover:bg-slate-100"
          >
            ถัดไป →
          </Link>
          <Button asChild size="sm" variant="outline">
            <Link href="/commission/summary">ดูสรุปข้ามวัน</Link>
          </Button>
        </div>
      </div>

      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="flex items-baseline justify-between py-4">
          <span className="font-medium">รวมต้องจ่ายทั้งหมด</span>
          <span className="text-2xl font-bold text-emerald-800">
            {formatBaht(grandTotal)} <span className="text-base font-normal">บาท</span>
          </span>
        </CardContent>
      </Card>

      <p className="text-xs text-slate-500">
        ประกันมือขั้นต่ำ {formatBaht(guarantee)} บาท/วัน — ถ้าค่ามือรวมน้อยกว่านี้
        จะจ่ายตามประกันแทน
      </p>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {summary.map((s) => (
          <li key={s.therapistId}>
            <Card className={s.worked ? undefined : "opacity-60"}>
              <CardContent className="space-y-2 py-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold">{s.name}</span>
                    {/* วันที่ใช้ประกันคือวันที่ร้านจ่ายเกินค่ามือจริง — ให้เป็นสีเตือน */}
                    <Badge
                      variant={s.worked && !s.usedGuarantee ? "secondary" : "outline"}
                      className={
                        s.usedGuarantee
                          ? "border-amber-300 bg-amber-100 text-amber-800"
                          : undefined
                      }
                    >
                      {s.status}
                    </Badge>
                  </div>
                  <span
                    className={`text-xl font-bold ${s.worked ? "text-emerald-800" : "text-slate-400"}`}
                  >
                    {formatBaht(s.totalIncome)} ฿
                  </span>
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-600">
                  <div className="flex justify-between">
                    <dt>เซสชัน</dt>
                    <dd>{s.sessions}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>ค่ามือจริง</dt>
                    <dd>{formatBaht(s.totalCommission)} ฿</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>ค่ารีเควส</dt>
                    <dd>{formatBaht(s.requestFee)} ฿</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>หลังประกัน</dt>
                    <dd>{formatBaht(s.netCommission)} ฿</dd>
                  </div>
                </dl>

                <div className="flex justify-end pt-1">
                  {s.worked && (
                  <PayToggle
                    paid={s.paid}
                    payload={{
                      workDate,
                      therapistId: s.therapistId,
                      totalCommission: s.totalCommission,
                      guaranteeAmount: guarantee,
                      netCommission: s.netCommission,
                      requestFee: s.requestFee,
                      totalIncome: s.totalIncome,
                      status: s.status,
                      isPaid: s.paid,
                    }}
                  />
                  )}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
