import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { DEFAULT_MIN_COMMISSION, formatBaht } from "@/lib/constants"
import { todayInShopTz } from "@/lib/datetime"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export const metadata = { title: "รายงาน · สุขกายา POS" }

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
]

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  return `${THAI_MONTHS[m - 1]} ${y + 543}`
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(Date.UTC(y, m, 0))
  return d.toISOString().slice(0, 10)
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const supabase = await createClient()
  const params = await searchParams
  const month = params.month ?? todayInShopTz().slice(0, 7)
  const from = `${month}-01`
  const to = lastDayOfMonth(month)

  const [
    { data: sales },
    { data: expenses },
    { data: therapists },
    { data: guaranteeSetting },
  ] = await Promise.all([
    supabase
      .from("sales")
      .select("sale_date, therapist_id, service_name, net_amount, commission, request_fee, payment_method")
      .gte("sale_date", from)
      .lte("sale_date", to),
    supabase
      .from("expenses")
      .select("amount, category")
      .gte("expense_date", from)
      .lte("expense_date", to),
    supabase.from("therapists").select("id, name"),
    supabase
      .from("settings")
      .select("value")
      .eq("key", "min_commission_guarantee")
      .single(),
  ])

  const rows = sales ?? []
  const guarantee = Number(guaranteeSetting?.value) || DEFAULT_MIN_COMMISSION
  const therapistName = new Map((therapists ?? []).map((t) => [t.id, t.name]))

  const revenue = rows.reduce((sum, s) => sum + Number(s.net_amount), 0)

  // ค่ามือต้องคิดประกันรายวันต่อคน ไม่ใช่รวมทั้งเดือนแล้วค่อยเทียบ
  const perDayTherapist = new Map<string, { commission: number; requestFee: number }>()
  for (const s of rows) {
    const key = `${s.sale_date}|${s.therapist_id}`
    const entry = perDayTherapist.get(key) ?? { commission: 0, requestFee: 0 }
    entry.commission += Number(s.commission ?? 0)
    entry.requestFee += Number(s.request_fee)
    perDayTherapist.set(key, entry)
  }

  let commissionCost = 0
  let guaranteeTopUp = 0
  const byTherapist = new Map<string, { income: number; days: number; sessions: number }>()

  for (const [key, v] of perDayTherapist) {
    const therapistId = key.split("|")[1]
    const net = Math.max(v.commission, guarantee)
    guaranteeTopUp += net - v.commission
    const income = net + v.requestFee
    commissionCost += income

    const agg = byTherapist.get(therapistId) ?? { income: 0, days: 0, sessions: 0 }
    agg.income += income
    agg.days += 1
    byTherapist.set(therapistId, agg)
  }

  for (const s of rows) {
    const agg = byTherapist.get(s.therapist_id ?? "")
    if (agg) agg.sessions += 1
  }

  // รายจ่ายหมวด HR/payroll คือ "ค่ามือที่จ่ายจริง" ซึ่งเป็นตัวเดียวกับ commissionCost
  // ที่คำนวณจากยอดขาย ถ้าเอามารวมด้วยจะนับค่ามือซ้ำสองรอบ กำไรจะติดลบทั้งที่ไม่ได้ขาดทุน
  const isPayroll = (c: string) => c.startsWith("HR / payroll")
  const payrollPaid = (expenses ?? [])
    .filter((e) => isPayroll(e.category))
    .reduce((sum, e) => sum + Number(e.amount), 0)
  const otherExpenses = (expenses ?? [])
    .filter((e) => !isPayroll(e.category))
    .reduce((sum, e) => sum + Number(e.amount), 0)
  const expenseTotal = payrollPaid + otherExpenses
  const grossProfit = revenue - commissionCost - otherExpenses

  const byPayment = rows.reduce<Record<string, number>>((acc, s) => {
    acc[s.payment_method] = (acc[s.payment_method] ?? 0) + Number(s.net_amount)
    return acc
  }, {})

  const byService = rows.reduce<Record<string, { count: number; revenue: number }>>(
    (acc, s) => {
      const name = s.service_name ?? "ไม่ระบุ"
      acc[name] ??= { count: 0, revenue: 0 }
      acc[name].count += 1
      acc[name].revenue += Number(s.net_amount)
      return acc
    },
    {}
  )

  const topServices = Object.entries(byService)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 8)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">รายงานรายเดือน</h1>
          <p className="text-sm text-slate-600">{monthLabel(month)}</p>
        </div>
        <div className="flex gap-1">
          <Link
            href={`/reports?month=${shiftMonth(month, -1)}`}
            className="rounded-md border px-3 py-2 text-sm hover:bg-slate-100"
          >
            ←
          </Link>
          <Link
            href={`/reports?month=${shiftMonth(month, 1)}`}
            className="rounded-md border px-3 py-2 text-sm hover:bg-slate-100"
          >
            →
          </Link>
        </div>
      </div>

      {/* สรุปกำไรหยาบ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">สรุป</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Line label="ยอดขายรวม" value={revenue} />
          <Line label="ค่ามือหมอ (รวมประกัน + รีเควส)" value={-commissionCost} />
          <Line label="รายจ่ายอื่นๆ" value={-otherExpenses} />
          <div className="border-t pt-2">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">กำไรหยาบ</span>
              <span
                className={`text-2xl font-bold ${
                  grossProfit >= 0 ? "text-emerald-800" : "text-red-700"
                }`}
              >
                {formatBaht(grossProfit)} ฿
              </span>
            </div>
          </div>
          {guaranteeTopUp > 0 && (
            <p className="text-xs text-amber-700">
              ในนี้เป็นส่วนที่จ่ายเกินค่ามือจริงเพราะประกันมือ{" "}
              {formatBaht(guaranteeTopUp)} บาท
            </p>
          )}
          {payrollPaid > 0 && (
            <p className="text-xs text-slate-500">
              หมายเหตุ: รายจ่ายหมวด HR / payroll {formatBaht(payrollPaid)} บาท
              ไม่ถูกนำมาหักซ้ำ เพราะเป็นการจ่ายค่ามือก้อนเดียวกับด้านบน
              (รายจ่ายทั้งเดือนรวม {formatBaht(expenseTotal)} บาท)
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-slate-600">จำนวนเซสชัน</p>
            <p className="text-2xl font-bold">{rows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-slate-600">ยอดเฉลี่ย/เซสชัน</p>
            <p className="text-2xl font-bold">
              {formatBaht(rows.length ? Math.round(revenue / rows.length) : 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {byTherapist.size > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ค่ามือรายหมอ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {[...byTherapist.entries()]
              .sort((a, b) => b[1].income - a[1].income)
              .map(([id, v]) => (
                <div key={id} className="flex justify-between text-sm">
                  <span className="text-slate-600">
                    {therapistName.get(id) ?? "ไม่ระบุ"}{" "}
                    <span className="text-slate-400">
                      ({v.days} วัน · {v.sessions} เซสชัน)
                    </span>
                  </span>
                  <span className="font-medium">{formatBaht(v.income)} ฿</span>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {Object.keys(byPayment).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ช่องทางชำระเงิน</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {Object.entries(byPayment)
              .sort((a, b) => b[1] - a[1])
              .map(([method, amount]) => (
                <div key={method} className="flex justify-between text-sm">
                  <span className="text-slate-600">{method}</span>
                  <span className="font-medium">{formatBaht(amount)} ฿</span>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {topServices.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">เมนูขายดี</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {topServices.map(([name, v]) => (
              <div key={name} className="flex justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-slate-600">
                  {name} <span className="text-slate-400">×{v.count}</span>
                </span>
                <span className="font-medium whitespace-nowrap">
                  {formatBaht(v.revenue)} ฿
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">ดาวน์โหลดข้อมูล</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={`/api/export?type=sales&month=${month}`}>ยอดขาย (CSV)</a>
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/export?type=expenses&month=${month}`}>รายจ่าย (CSV)</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={value < 0 ? "text-red-700" : "font-medium"}>
        {formatBaht(value)} ฿
      </span>
    </div>
  )
}
