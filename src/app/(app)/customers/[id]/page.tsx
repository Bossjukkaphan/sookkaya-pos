import Link from "next/link"
import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { formatThaiDate } from "@/lib/datetime"
import { formatBaht } from "@/lib/constants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CustomerForm } from "../customer-form"

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: customer }, { data: balance }, { data: sales }] =
    await Promise.all([
      supabase.from("customers").select("*").eq("id", id).single(),
      supabase
        .from("member_balances")
        .select("credit_balance, credit_granted, bonus_granted, cash_paid, next_expiry")
        .eq("customer_id", id)
        .single(),
      supabase
        .from("sales")
        .select("id, sale_date, service_name, net_amount, payment_method")
        .eq("customer_id", id)
        .order("sale_date", { ascending: false })
        .limit(50),
    ])

  if (!customer) notFound()

  const credit = balance?.credit_balance ?? 0
  const bonusGranted = balance?.bonus_granted ?? 0
  const totalSpent = (sales ?? []).reduce(
    (sum, s) => sum + Number(s.net_amount),
    0
  )

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/customers" className="text-sm text-slate-600 hover:underline">
        ← กลับไปรายชื่อลูกค้า
      </Link>

      <div>
        <h1 className="text-xl font-bold">
          {customer.name}
          {customer.nickname && (
            <span className="font-normal text-slate-500"> ({customer.nickname})</span>
          )}
        </h1>
        <p className="text-sm text-slate-600">
          {customer.phone ?? "ไม่มีเบอร์โทร"}
          {customer.line_id && ` · LINE ${customer.line_id}`}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="secondary">{customer.customer_type}</Badge>
          <CustomerForm customer={customer} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-slate-600">เครดิตคงเหลือ</p>
            <p className="text-2xl font-bold text-emerald-800">
              {formatBaht(credit)} ฿
            </p>
            {bonusGranted > 0 && (
              <p className="text-xs text-slate-500">
                (เคยได้โบนัสรวม {formatBaht(bonusGranted)} ฿ — รวมอยู่ในเครดิตแล้ว)
              </p>
            )}
            {balance?.next_expiry && (
              <p className="text-xs text-amber-700">
                หมดอายุ {formatThaiDate(balance.next_expiry)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-slate-600">ยอดใช้จ่ายสะสม</p>
            <p className="text-2xl font-bold">{formatBaht(totalSpent)} ฿</p>
            <p className="text-xs text-slate-500">
              {(sales ?? []).length} ครั้ง
            </p>
          </CardContent>
        </Card>
      </div>

      {customer.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">บันทึกเพิ่มเติม</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{customer.notes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">ประวัติการใช้บริการ</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {(sales ?? []).length === 0 ? (
            <p className="px-6 py-6 text-center text-sm text-slate-500">
              ยังไม่มีประวัติการใช้บริการ
            </p>
          ) : (
            <ul className="divide-y">
              {(sales ?? []).map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{s.service_name}</p>
                    <p className="text-xs text-slate-500">
                      {formatThaiDate(s.sale_date)} · {s.payment_method}
                    </p>
                  </div>
                  <span className="text-sm font-semibold whitespace-nowrap">
                    {formatBaht(Number(s.net_amount))} ฿
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
