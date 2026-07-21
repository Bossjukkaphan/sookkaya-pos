import { createClient } from "@/lib/supabase/server"
import { formatThaiDate, todayInShopTz } from "@/lib/datetime"
import { formatBaht } from "@/lib/constants"
import { DeleteSaleButton } from "./sale-row-actions"
import { DateFilter } from "./date-filter"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export const metadata = { title: "ยอดขาย · สุขกายา POS" }

/** ดึงได้มากสุดเท่านี้ต่อหนึ่งช่วงวัน — supabase-js ตัดที่ 1,000 แถวเงียบๆ อยู่แล้ว */
const ROW_CAP = 500

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const supabase = await createClient()
  const today = todayInShopTz()
  const params = await searchParams

  // ค่าเริ่มต้นคือวันนี้ทั้งคู่ · ถ้าใส่กลับด้าน ให้สลับให้ถูก แทนที่จะคืนรายการว่าง
  const rawFrom = params.from ?? today
  const rawTo = params.to ?? rawFrom
  const from = rawFrom <= rawTo ? rawFrom : rawTo
  const to = rawFrom <= rawTo ? rawTo : rawFrom
  const isSingleDay = from === to

  // ยอดสรุปดึงจาก view รายวัน ไม่ได้บวกจากรายการที่แสดง
  // เพราะรายการถูกตัดที่ ROW_CAP แถว ถ้าบวกจากตรงนั้นตัวเลขจะต่ำกว่าจริงโดยไม่มีใครรู้
  // view คืนวันละแถว ช่วงเดือนหนึ่งจึงไม่เกิน ~31 แถว เพดานไม่มีผล
  const [
    { data: sales },
    { data: therapists },
    { data: dailySummary },
    { data: therapistDaily },
  ] = await Promise.all([
    supabase
      .from("sales")
      .select("*")
      .gte("sale_date", from)
      .lte("sale_date", to)
      .order("sale_date", { ascending: false })
      .order("sale_time", { ascending: false })
      .limit(ROW_CAP),
    supabase.from("therapists").select("id, name"),
    supabase
      .from("v_daily_summary")
      .select("sale_date, sessions, gross_sales")
      .gte("sale_date", from)
      .lte("sale_date", to),
    supabase
      .from("v_therapist_daily")
      .select("work_date, therapist_id, sessions, request_fee, total_income")
      .gte("work_date", from)
      .lte("work_date", to),
  ])

  const rows = sales ?? []
  const truncated = rows.length === ROW_CAP
  const therapistName = new Map((therapists ?? []).map((t) => [t.id, t.name]))

  // ทั้งสองปลายต้องอยู่ในเดือนปัจจุบัน เพราะ action ปฏิเสธรายการของเดือนก่อน
  const editable =
    from.slice(0, 7) === today.slice(0, 7) && to.slice(0, 7) === today.slice(0, 7)

  const summaryRows = dailySummary ?? []
  const totalRevenue = summaryRows.reduce((sum, d) => sum + Number(d.gross_sales ?? 0), 0)
  const totalSessions = summaryRows.reduce((sum, d) => sum + Number(d.sessions ?? 0), 0)
  const dayTotal = new Map(
    summaryRows.map((d) => [String(d.sale_date), Number(d.gross_sales ?? 0)])
  )

  // ค่ามือมาจาก v_therapist_daily เพราะประกันมือขั้นต่ำต่อวันคิดอยู่ในนั้น
  // บวก commission จากรายการขายเองจะได้ตัวเลขที่ทั้งต่ำกว่าจริงและไม่รวมประกัน
  const byTherapist = new Map<
    string,
    { income: number; requestFee: number; count: number }
  >()
  for (const d of therapistDaily ?? []) {
    const key = d.therapist_id ?? "unknown"
    const agg = byTherapist.get(key) ?? { income: 0, requestFee: 0, count: 0 }
    agg.income += Number(d.total_income ?? 0)
    agg.requestFee += Number(d.request_fee ?? 0)
    agg.count += Number(d.sessions ?? 0)
    byTherapist.set(key, agg)
  }
  const totalRequestFee = [...byTherapist.values()].reduce(
    (sum, v) => sum + v.requestFee,
    0
  )

  // ช่องทางชำระเงินไม่มี view รายวัน จึงต้องบวกจากรายการที่แสดง
  // ถ้าโดนตัดที่เพดานก็ซ่อนการ์ดไปเลย ดีกว่าโชว์ยอดที่ไม่ครบ
  const byPayment = rows.reduce<Record<string, number>>((acc, s) => {
    acc[s.payment_method] = (acc[s.payment_method] ?? 0) + Number(s.net_amount)
    return acc
  }, {})

  // โหมดช่วงวัน: จัดกลุ่มตามวัน เพื่อไม่ให้เผลอแก้รายการผิดวัน
  const byDate: { date: string; rows: typeof rows }[] = []
  for (const s of rows) {
    const date = String(s.sale_date)
    let group = byDate.at(-1)
    if (!group || group.date !== date) {
      group = { date, rows: [] }
      byDate.push(group)
    }
    group.rows.push(s)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-bold">ยอดขาย</h1>
          <p className="text-sm text-slate-600">
            {isSingleDay
              ? formatThaiDate(from)
              : `${formatThaiDate(from)} – ${formatThaiDate(to)}`}
          </p>
        </div>
        <DateFilter from={from} to={to} today={today} />
      </div>

      {truncated && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3 text-sm text-amber-900">
            ช่วงวันที่เลือกมีรายการเกิน {ROW_CAP} รายการ แสดงเฉพาะ {ROW_CAP} รายการล่าสุด
            — เลือกช่วงให้แคบลงเพื่อดูให้ครบ
          </CardContent>
        </Card>
      )}

      {!editable && (
        <Card className="border-slate-300 bg-slate-50">
          <CardContent className="py-3 text-sm text-slate-700">
            ข้อมูลเดือนก่อน ดูได้อย่างเดียว แก้หรือลบไม่ได้
          </CardContent>
        </Card>
      )}

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
            <p className="text-3xl font-bold">{totalSessions}</p>
          </CardContent>
        </Card>
      </div>

      {truncated ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">แยกตามช่องทางชำระเงิน</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-500">
            ช่วงกว้างเกินไป — ดูช่องทางชำระเงินได้เมื่อเลือกช่วงแคบลง
          </CardContent>
        </Card>
      ) : (
        Object.keys(byPayment).length > 0 && (
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
        )
      )}

      {byTherapist.size > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {isSingleDay ? "ค่ามือหมอวันนี้" : "ค่ามือหมอในช่วงที่เลือก"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {[...byTherapist.entries()]
              .sort((a, b) => b[1].income - a[1].income)
              .map(([id, v]) => (
                <div key={id} className="flex justify-between text-sm">
                  <span className="text-slate-600">
                    {therapistName.get(id) ?? "ไม่ระบุ"}{" "}
                    <span className="text-slate-400">({v.count} เซสชัน)</span>
                  </span>
                  <span className="font-medium">{formatBaht(v.income)} ฿</span>
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
          <CardTitle className="text-base">
            {isSingleDay ? "รายการขายวันนี้" : "รายการขายในช่วงที่เลือก"}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <p className="px-6 py-6 text-center text-sm text-slate-500">
              ไม่มีรายการขายในช่วงที่เลือก
            </p>
          ) : isSingleDay ? (
            <ul className="divide-y">
              {rows.map((s) => (
                <SaleRow
                  key={s.id}
                  sale={s}
                  therapistName={therapistName}
                  editable={editable}
                />
              ))}
            </ul>
          ) : (
            byDate.map((group) => (
              <div key={group.date}>
                <div className="sticky top-0 z-10 flex justify-between border-y bg-slate-100 px-4 py-2 text-sm font-semibold sm:px-6">
                  <span>{formatThaiDate(group.date)}</span>
                  <span>{formatBaht(dayTotal.get(group.date) ?? 0)} ฿</span>
                </div>
                <ul className="divide-y">
                  {group.rows.map((s) => (
                    <SaleRow
                      key={s.id}
                      sale={s}
                      therapistName={therapistName}
                      editable={editable}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

type SaleRecord = {
  id: string
  sale_time: string | null
  receipt_no: string | null
  service_name: string | null
  therapist_id: string | null
  customer_name: string | null
  price_normal: number | string | null
  discount: number | string | null
  coupon_promo: string | null
  net_amount: number | string | null
  commission: number | string | null
  request_fee: number | string | null
  payment_method: string
  is_request: boolean | null
  member_status: string | null
}

function SaleRow({
  sale: s,
  therapistName,
  editable,
}: {
  sale: SaleRecord
  therapistName: Map<string, string>
  editable: boolean
}) {
  const discount = Number(s.discount ?? 0)
  const netAmount = Number(s.net_amount ?? 0)
  const commission = Number(s.commission ?? 0)
  const requestFee = Number(s.request_fee ?? 0)

  return (
    <li className="flex items-start gap-3 px-4 py-3 sm:px-6">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{s.service_name}</span>
          {s.is_request && (
            <Badge variant="outline" className="text-xs">
              รีเควส
            </Badge>
          )}
          {s.member_status && <Badge className="text-xs">{s.member_status}</Badge>}
        </div>
        <p className="text-sm text-slate-600">
          {s.sale_time?.slice(0, 5)} ·{" "}
          {therapistName.get(s.therapist_id ?? "") ?? "ไม่ระบุ"}
          {s.customer_name && ` · ${s.customer_name}`}
        </p>
        <p className="text-xs text-slate-400">
          {s.receipt_no} · {s.payment_method}
        </p>
        {/* ราคาปกติกับส่วนลดโชว์เฉพาะเมื่อมีส่วนลด ไม่งั้นมันซ้ำกับยอดสุทธิ */}
        {discount > 0 && (
          <p className="text-xs text-slate-500">
            ราคาปกติ {formatBaht(Number(s.price_normal ?? 0))} ฿ · ลด{" "}
            {formatBaht(discount)} ฿
            {s.coupon_promo && ` (${s.coupon_promo})`}
          </p>
        )}
        <p className="text-xs text-slate-500">
          ค่ามือ {formatBaht(commission)} ฿
          {requestFee > 0 && ` · ค่ารีเควส ${formatBaht(requestFee)} ฿`}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <span className="font-semibold whitespace-nowrap">
          {formatBaht(netAmount)} ฿
        </span>
        {editable && (
          <DeleteSaleButton
            id={s.id}
            label={`${s.service_name} ${formatBaht(netAmount)} บาท`}
          />
        )}
      </div>
    </li>
  )
}
