import { createClient } from "@/lib/supabase/server"
import { formatThaiDate, todayInShopTz } from "@/lib/datetime"
import { formatBaht } from "@/lib/constants"
import { DeleteSaleButton } from "./sale-row-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export const metadata = { title: "ยอดวันนี้ · สุขกายา POS" }

export default async function TodayPage() {
  const supabase = await createClient()
  const today = todayInShopTz()

  const [{ data: sales }, { data: therapists }] = await Promise.all([
    supabase
      .from("sales")
      .select("*")
      .eq("sale_date", today)
      .order("sale_time", { ascending: false }),
    supabase.from("therapists").select("id, name"),
  ])

  const rows = sales ?? []
  const therapistName = new Map((therapists ?? []).map((t) => [t.id, t.name]))

  const totalRevenue = rows.reduce((sum, s) => sum + Number(s.net_amount), 0)
  const totalRequestFee = rows.reduce((sum, s) => sum + Number(s.request_fee), 0)

  const byPayment = rows.reduce<Record<string, number>>((acc, s) => {
    acc[s.payment_method] = (acc[s.payment_method] ?? 0) + Number(s.net_amount)
    return acc
  }, {})

  const byTherapist = rows.reduce<
    Record<string, { commission: number; requestFee: number; count: number }>
  >((acc, s) => {
    const key = s.therapist_id ?? "unknown"
    acc[key] ??= { commission: 0, requestFee: 0, count: 0 }
    acc[key].commission += Number(s.commission ?? 0)
    acc[key].requestFee += Number(s.request_fee)
    acc[key].count += 1
    return acc
  }, {})

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">ยอดวันนี้</h1>
        <p className="text-sm text-slate-600">{formatThaiDate(today)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-slate-600">ยอดขายรวม</p>
            <p className="text-3xl font-bold text-emerald-800">
              {formatBaht(totalRevenue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-slate-600">จำนวนเซสชัน</p>
            <p className="text-3xl font-bold">{rows.length}</p>
          </CardContent>
        </Card>
      </div>

      {Object.keys(byPayment).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">แยกตามช่องทางชำระเงิน</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {Object.entries(byPayment).map(([method, amount]) => (
              <div key={method} className="flex justify-between text-sm">
                <span className="text-slate-600">{method}</span>
                <span className="font-medium">{formatBaht(amount)} ฿</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {Object.keys(byTherapist).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ค่ามือหมอวันนี้</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {Object.entries(byTherapist).map(([id, v]) => (
              <div key={id} className="flex justify-between text-sm">
                <span className="text-slate-600">
                  {therapistName.get(id) ?? "ไม่ระบุ"}{" "}
                  <span className="text-slate-400">({v.count} เซสชัน)</span>
                </span>
                <span className="font-medium">
                  {formatBaht(v.commission + v.requestFee)} ฿
                </span>
              </div>
            ))}
            {totalRequestFee > 0 && (
              <p className="pt-1 text-xs text-slate-500">
                รวมค่ารีเควส {formatBaht(totalRequestFee)} บาท
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">รายการขายวันนี้</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <p className="px-6 py-6 text-center text-sm text-slate-500">
              ยังไม่มีรายการขายวันนี้
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((s) => (
                <li
                  key={s.id}
                  className="flex items-start gap-3 px-4 py-3 sm:px-6"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{s.service_name}</span>
                      {s.is_request && (
                        <Badge variant="outline" className="text-xs">
                          รีเควส
                        </Badge>
                      )}
                      {s.member_status && (
                        <Badge className="text-xs">{s.member_status}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-600">
                      {s.sale_time?.slice(0, 5)} ·{" "}
                      {therapistName.get(s.therapist_id ?? "") ?? "ไม่ระบุ"}
                      {s.customer_name && ` · ${s.customer_name}`}
                    </p>
                    <p className="text-xs text-slate-400">
                      {s.receipt_no} · {s.payment_method}
                      {Number(s.discount) > 0 &&
                        ` · ลด ${formatBaht(Number(s.discount))}฿`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-semibold whitespace-nowrap">
                      {formatBaht(Number(s.net_amount))} ฿
                    </span>
                    <DeleteSaleButton
                      id={s.id}
                      label={`${s.service_name} ${formatBaht(Number(s.net_amount))} บาท`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
