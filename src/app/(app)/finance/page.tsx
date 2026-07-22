import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { formatBaht } from "@/lib/constants"
import { todayInShopTz } from "@/lib/datetime"
import { isMonthIncomplete } from "@/lib/finance"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FinanceAccessDenied, FinanceMonthHeader, monthShortLabel } from "./shared"

export const metadata = { title: "การเงิน · สุขกายา POS" }

const n = (x: number | string | null | undefined) => Number(x ?? 0)

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const supabase = await createClient()
  const params = await searchParams

  const { data: profile } = await supabase.from("profiles").select("role").single()
  const role = profile?.role ?? "staff"

  if (role !== "admin") {
    return <FinanceAccessDenied />
  }

  const month = params.month ?? todayInShopTz().slice(0, 7)

  const [{ data: plRows }, { data: targetSetting }] = await Promise.all([
    supabase.from("v_monthly_pl").select("*").order("month"),
    supabase
      .from("settings")
      .select("value")
      .eq("key", "monthly_target")
      .maybeSingle(),
  ])

  const rows = (plRows ?? []).filter(
    (r): r is typeof r & { month: string } => r.month !== null
  )

  const selected = rows.find((r) => r.month === month) ?? null

  const netRevenue = n(selected?.net_revenue)
  const expenseTotal = n(selected?.expense_total)
  const profitCash = n(selected?.profit_cash)
  const commissionCost = n(selected?.commission_cost)
  const payrollPaid = n(selected?.payroll_paid)
  const profitAccrual = n(selected?.profit_accrual)
  const fixedCost = n(selected?.fixed_cost)
  const variableCost = n(selected?.variable_cost)
  const onetimeCost = n(selected?.onetime_cost)
  const nonPayrollExpense = expenseTotal - payrollPaid

  // เดือนก่อนหน้าที่มีข้อมูลจริง (สูงสุด 3 เดือน) ใช้เทียบว่าเดือนนี้บันทึกรายจ่ายครบหรือยัง
  const precedingFixedCosts = rows.filter((r) => r.month < month).slice(-3).map((r) => n(r.fixed_cost))
  const incomplete = isMonthIncomplete(fixedCost, precedingFixedCosts)
  const avgPrecedingFixed =
    precedingFixedCosts.length > 0
      ? precedingFixedCosts.reduce((s, v) => s + v, 0) / precedingFixedCosts.length
      : 0

  const target = Number(targetSetting?.value ?? 0)
  const targetPct = target > 0 ? (netRevenue / target) * 100 : 0
  const targetRemaining = target - netRevenue

  const last6 = rows.filter((r) => r.month <= month).slice(-6)

  return (
    <div className="space-y-4">
      <FinanceMonthHeader title="การเงิน" month={month} basePath="/finance" />

      {incomplete && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="space-y-1 py-4 text-sm">
            <p className="font-semibold text-amber-900">ยังบันทึกรายจ่ายไม่ครบ</p>
            <p className="text-amber-800">
              รายจ่ายก้อนใหญ่ เช่น ค่าเช่า เงินเดือน มักถูกบันทึกตอนสิ้นเดือน
              กำไรที่เห็นตอนนี้จึงอาจสูงกว่าความเป็นจริง เดือนนี้บันทึกต้นทุนคงที่ไปแล้ว{" "}
              {formatBaht(fixedCost)} บาท เทียบกับค่าเฉลี่ยของเดือนก่อนหน้าที่{" "}
              {formatBaht(Math.round(avgPrecedingFixed))} บาท
            </p>
          </CardContent>
        </Card>
      )}

      {!selected && (
        <p className="py-6 text-center text-sm text-slate-500">ยังไม่มีข้อมูลเดือนนี้</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">เงินสดจริง</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Line label="รายได้สุทธิ" value={netRevenue} />
            <Line label="รายจ่ายรวม" value={-expenseTotal} />
            <Total label="กำไรเงินสด" value={profitCash} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">กำไรเชิงบัญชี</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Line label="รายได้สุทธิ" value={netRevenue} />
            <Line label="ค่ามือหมอ" value={-commissionCost} />
            <Line label="รายจ่ายอื่น (ไม่รวมค่ามือที่จ่ายจริงแล้ว)" value={-nonPayrollExpense} />
            <Total label="กำไรเชิงบัญชี" value={profitAccrual} />
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-slate-500">
        ตัวเลขสองฝั่งต่างกันเพราะค่ามือหมอจ่ายคนละรอบเวลากับงานที่ค่ามือนั้นครอบคลุม
      </p>

      {target > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">เป้าหมายรายเดือน</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-600"
                style={{ width: `${Math.min(Math.max(targetPct, 0), 100)}%` }}
              />
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-slate-600">
                {formatBaht(netRevenue)} / {formatBaht(target)} บาท
              </span>
              <span className="font-semibold">{targetPct.toFixed(1)}%</span>
            </div>
            <p className="text-xs text-slate-500">
              {targetRemaining > 0
                ? `ขาดอีก ${formatBaht(targetRemaining)} บาทถึงเป้าหมาย`
                : `เกินเป้าหมาย ${formatBaht(-targetRemaining)} บาท`}
            </p>
          </CardContent>
        </Card>
      )}

      {last6.length > 0 && (
        <div>
          <h2 className="mb-2 text-base font-semibold">กำไรขาดทุน 6 เดือนล่าสุด</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">เดือน</th>
                  <th className="px-3 py-2 text-right">รายได้</th>
                  <th className="px-3 py-2 text-right">รายจ่าย</th>
                  <th className="px-3 py-2 text-right">กำไรเงินสด</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {last6.map((r) => {
                  const isSelected = r.month === month
                  const rowRevenue = n(r.net_revenue)
                  const rowExpense = n(r.expense_total)
                  const rowProfit = n(r.profit_cash)
                  return (
                    <tr key={r.month} className={isSelected ? "bg-emerald-50 font-semibold" : undefined}>
                      <td className="px-3 py-2 whitespace-nowrap">{monthShortLabel(r.month)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {formatBaht(rowRevenue)} ฿
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-orange-700">
                        {formatBaht(rowExpense)} ฿
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-medium whitespace-nowrap ${
                          rowProfit < 0 ? "text-red-700" : "text-emerald-700"
                        }`}
                      >
                        {formatBaht(rowProfit)} ฿
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">โครงสร้างรายจ่าย</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <ExpenseBreakdownRow
              label="คงที่ (ค่าเช่า เงินเดือนประจำ)"
              amount={fixedCost}
              total={expenseTotal}
            />
            <ExpenseBreakdownRow
              label="ผันแปร (ค่ามือ วัสดุตามงาน)"
              amount={variableCost}
              total={expenseTotal}
            />
            <ExpenseBreakdownRow
              label="ครั้งเดียว (ซื้อของ ซ่อมแซม)"
              amount={onetimeCost}
              total={expenseTotal}
            />
          </CardContent>
        </Card>
      )}

      <Button asChild className="w-full">
        <Link href={`/finance/unit-economics?month=${month}`}>ดูจุดคุ้มทุน</Link>
      </Button>
    </div>
  )
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={value < 0 ? "text-red-700" : "font-medium"}>{formatBaht(value)} ฿</span>
    </div>
  )
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-t pt-2">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">{label}</span>
        <span className={`text-xl font-bold ${value >= 0 ? "text-emerald-700" : "text-red-700"}`}>
          {formatBaht(value)} ฿
        </span>
      </div>
    </div>
  )
}

function ExpenseBreakdownRow({
  label,
  amount,
  total,
}: {
  label: string
  amount: number
  total: number
}) {
  const pct = total > 0 ? (amount / total) * 100 : 0
  return (
    <div>
      <div className="flex justify-between gap-2 text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium">
          {formatBaht(amount)} ฿ <span className="text-slate-400">({pct.toFixed(0)}%)</span>
        </span>
      </div>
      {/* แถบสัดส่วนให้เห็นน้ำหนักของก้อนรายจ่ายโดยไม่ต้องเทียบตัวเลขเอง */}
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-orange-400"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  )
}
