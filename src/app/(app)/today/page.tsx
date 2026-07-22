import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { formatThaiDate, todayInShopTz } from "@/lib/datetime"
import { formatBaht } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { SaleRowActions } from "./sale-row-actions"
import type {
  EditableSale,
  MemberBalance,
  Promotion,
  Service,
  Therapist,
} from "./edit-sale-dialog"
import { DateFilter } from "./date-filter"
import { StatCard } from "@/components/stat-card"
import {
  PAY_COLOR,
  PAY_COLOR_DEFAULT,
  PAY_DOT,
  PAY_DOT_DEFAULT,
} from "@/lib/payment-colors"
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

  // ทั้งสองปลายต้องอยู่ในเดือนปัจจุบัน เพราะ action ปฏิเสธรายการของเดือนก่อน
  // คำนวณก่อนดึงข้อมูล เพราะยอดเครดิตสมาชิกใช้เฉพาะในกล่องแก้ไข ถ้าแก้ไม่ได้ก็ไม่ต้องดึง
  const editable =
    from.slice(0, 7) === today.slice(0, 7) && to.slice(0, 7) === today.slice(0, 7)

  // ยอดสรุปดึงจาก view รายวัน ไม่ได้บวกจากรายการที่แสดง
  // เพราะรายการถูกตัดที่ ROW_CAP แถว ถ้าบวกจากตรงนั้นตัวเลขจะต่ำกว่าจริงโดยไม่มีใครรู้
  // view คืนวันละแถว ช่วงเดือนหนึ่งจึงไม่เกิน ~31 แถว เพดานไม่มีผล
  const [
    { data: sales },
    { data: therapists },
    { data: dailySummary },
    { data: therapistDaily },
    { data: services },
    { data: promotions },
    { data: memberBalances },
    { data: topups },
  ] = await Promise.all([
    supabase
      .from("sales")
      .select("*")
      .gte("sale_date", from)
      .lte("sale_date", to)
      .order("sale_date", { ascending: false })
      .order("sale_time", { ascending: false })
      .limit(ROW_CAP),
    // ไม่กรอง status — หมอที่ลาออกแล้วยังต้องมีชื่อบนรายการเก่า
    supabase.from("therapists").select("id, name, status").order("name"),
    supabase
      .from("v_daily_summary")
      .select("sale_date, sessions, volume, net_revenue, cash_in")
      .gte("sale_date", from)
      .lte("sale_date", to),
    supabase
      .from("v_therapist_daily")
      .select("work_date, therapist_id, sessions, request_fee, total_income")
      .gte("work_date", from)
      .lte("work_date", to),
    supabase
      .from("services")
      .select("id, name, price, commission")
      .eq("is_active", true)
      .order("name"),
    // ใช้ภายใน (Member / ถ่ายคอนเทนต์) ไม่ต้องขึ้นเป็นตัวเลือกให้พนักงานเลือกผิด
    supabase
      .from("promotions")
      .select("id, name")
      .eq("is_active", true)
      .neq("kind", "internal")
      .order("name"),
    editable
      ? supabase
          .from("member_balances")
          .select("customer_id, credit_balance, credit_granted, cash_paid")
      : Promise.resolve({ data: null }),
    supabase
      .from("member_topups")
      .select("cash_received")
      .gte("topup_date", from)
      .lte("topup_date", to),
  ])

  const rows = sales ?? []
  const truncated = rows.length === ROW_CAP
  const therapistName = new Map((therapists ?? []).map((t) => [t.id, t.name]))

  // ตัวเลือกในฟอร์มแก้ไขใช้เฉพาะหมอที่ยังทำงานอยู่ ส่วนการแสดงผลใช้ map ด้านบนที่ครบทุกคน
  const activeTherapists: Therapist[] = (therapists ?? [])
    .filter((t) => t.status === "active")
    .map((t) => ({ id: t.id, name: t.name }))

  const balanceByCustomer = new Map<string, MemberBalance>(
    (memberBalances ?? []).map((b) => [
      String(b.customer_id),
      {
        credit_balance: Number(b.credit_balance ?? 0),
        credit_granted: Number(b.credit_granted ?? 0),
        cash_paid: Number(b.cash_paid ?? 0),
      },
    ])
  )

  const editOptions = {
    therapists: activeTherapists,
    services: (services ?? []) as Service[],
    promotions: (promotions ?? []) as Promotion[],
    balanceByCustomer,
  }

  // ยอดสรุปทุกตัวเป็นผลรวมของยอดรายวัน จึงบวกข้ามวันได้ตรงๆ ไม่ซ้ำซ้อน
  // (volume, net_revenue, cash_in, sessions ต่างเป็นยอดต่อวันที่ไม่ทับกัน)
  const summaryRows = dailySummary ?? []
  const totalVolume = summaryRows.reduce((sum, d) => sum + Number(d.volume ?? 0), 0)
  const totalNetRevenue = summaryRows.reduce((sum, d) => sum + Number(d.net_revenue ?? 0), 0)
  const totalCashIn = summaryRows.reduce((sum, d) => sum + Number(d.cash_in ?? 0), 0)
  const totalSessions = summaryRows.reduce((sum, d) => sum + Number(d.sessions ?? 0), 0)
  // เงินเติมสมาชิกในช่วงที่เลือก — เป็นส่วนหนึ่งของ "เงินเข้าจริง" จึงโชว์ให้ตามรอยได้
  const totalTopup = (topups ?? []).reduce((s, t) => s + Number(t.cash_received ?? 0), 0)
  const dayTotal = new Map(
    summaryRows.map((d) => [String(d.sale_date), Number(d.volume ?? 0)])
  )

  // ลูกค้าไม่ซ้ำ: นับข้ามวันไม่ได้ (คนเดิมมาสองวันยังคือหนึ่งคน) และผลรวมรายวันก็บวกกันไม่ได้
  // โหมดวันเดียวรายการไม่โดนตัด (วันหนึ่งแทบไม่ถึง ROW_CAP) จึงนับจากแถวที่โหลดมาได้ครบ
  // โหมดช่วงวันเลยไม่โชว์ เพราะทั้งโดนเพดานตัดและ distinct บวกข้ามวันไม่ได้อยู่แล้ว
  const distinctCustomers = isSingleDay
    ? new Set(
        rows.map((s) => s.customer_id).filter((id): id is string => Boolean(id))
      ).size
    : null

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
  // ค่ามือรวมมาจาก total_income ซึ่งรวมประกันมือ 500/วันแล้ว — เป็นยอดรายวันจึงบวกข้ามวันได้
  // ห้ามบวก sales.commission แทน เพราะจะขาดประกันและได้ต่ำกว่าจริง
  const totalCommission = [...byTherapist.values()].reduce(
    (sum, v) => sum + v.income,
    0
  )
  const grossProfit = totalNetRevenue - totalCommission
  // หารด้วย net_revenue เสมอ — วันที่มีแต่เติมเงินไม่มีขาย net_revenue=0 ต้องกันหารศูนย์
  // ไม่งั้น hint จะเป็น NaN%/Infinity% ให้โชว์ — แทน
  const hrPct = totalNetRevenue > 0 ? (totalCommission / totalNetRevenue) * 100 : null
  const marginPct = totalNetRevenue > 0 ? (grossProfit / totalNetRevenue) * 100 : null

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

      {/* ทุกการ์ดผูกกับช่วงวันที่เลือก · ยอดสรุปมาจาก view รายวัน ไม่ใช่รายการที่ถูกตัด */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="เงินเข้าจริง"
          value={`${formatBaht(totalCashIn)} ฿`}
          hint={
            totalTopup > 0
              ? `รวมเติมสมาชิก ${formatBaht(totalTopup)} ฿`
              : "เงินสด+QR+บัตร"
          }
          info="เงินที่เข้าบัญชีร้านจริงในวันนั้น = ยอดขายที่ไม่ได้จ่ายด้วยเครดิตสมาชิก บวกเงินที่ลูกค้ามาเติมสมาชิกวันนั้น · ใช้ดูสภาพคล่องว่ามีเงินเข้าจริงเท่าไหร่"
        />
        <StatCard
          label="รายได้ที่รับรู้"
          value={`${formatBaht(totalNetRevenue)} ฿`}
          hint="รับรู้รายได้ (P&L)"
          info="รายได้จริงของร้านตามบัญชี = ยอดที่ลูกค้าจ่าย หักส่วนที่เป็นเครดิตแถมออก (ของแถมไม่ใช่เงินที่ใครจ่ายมา) · ใช้คิดกำไรและแบ่งหุ้นส่วน"
        />
        <StatCard
          label="ยอดรับจริง"
          value={`${formatBaht(totalVolume)} ฿`}
          hint="ลูกค้าจ่ายจริง รวมเครดิต"
          info="ยอดที่ลูกค้าจ่ายจริงหลังหักส่วนลด รวมที่จ่ายด้วยเครดิตสมาชิกด้วย · ใช้ดูว่าวันนี้ร้านขายได้เท่าไหร่ และเป็นฐานคิดค่ามือหมอ"
        />
        <StatCard
          label="เซสชัน"
          value={String(totalSessions)}
          hint={distinctCustomers !== null ? `${distinctCustomers} ลูกค้า` : undefined}
        />
        <StatCard
          label="ค่ามือรวม"
          value={`${formatBaht(totalCommission)} ฿`}
          hint={hrPct === null ? "— ของ Net Rev" : `${hrPct.toFixed(1)}% ของ Net Rev`}
        />
        <StatCard
          label="กำไรขั้นต้น"
          value={`${formatBaht(grossProfit)} ฿`}
          hint={marginPct === null ? "Margin —" : `Margin ${marginPct.toFixed(1)}%`}
          tone={grossProfit < 0 ? "bad" : "good"}
        />
      </div>

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
                  editOptions={editOptions}
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
                      editOptions={editOptions}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
        </CardContent>
      </Card>

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
            <CardContent className="space-y-2">
              {(() => {
                const entries = Object.entries(byPayment).sort((a, b) => b[1] - a[1])
                const totalPay = entries.reduce((s, [, v]) => s + v, 0)
                return entries.map(([method, amount]) => {
                  const pct = totalPay > 0 ? (amount / totalPay) * 100 : 0
                  return (
                    <div key={method}>
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-slate-600">
                          {/* จุดสีเดียวกับ badge ในรายการขายด้านบน */}
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${PAY_DOT[method] ?? PAY_DOT_DEFAULT}`}
                          />
                          {method}
                        </span>
                        <span className="font-medium">
                          {formatBaht(amount)} ฿{" "}
                          <span className="text-xs text-slate-400">
                            ({pct.toFixed(0)}%)
                          </span>
                        </span>
                      </div>
                      <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${PAY_DOT[method] ?? PAY_DOT_DEFAULT}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })
              })()}
            </CardContent>
          </Card>
        )
      )}

      {/* บริการยอดนิยม/ค่ามือรายหมอ ย้ายไปหน้ารายงาน — หน้านี้เหลือเฉพาะงานประจำวัน */}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/reports?from=${from}&to=${to}`}>
            📊 ดูรายงานช่วงนี้ (เมนูขายดี · ค่ามือรายหมอ · กราฟ)
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/history?from=${from}&to=${to}`}>
            🧾 ค้นหาบิล (ประวัติบิล)
          </Link>
        </Button>
      </div>
    </div>
  )
}

type SaleRecord = {
  id: string
  sale_time: string | null
  receipt_no: string | null
  service_id: string | null
  service_name: string | null
  therapist_id: string | null
  customer_id: string | null
  customer_name: string | null
  customer_phone: string | null
  price_normal: number | string | null
  discount: number | string | null
  coupon_promo: string | null
  net_amount: number | string | null
  commission: number | string | null
  request_fee: number | string | null
  payment_method: string
  is_request: boolean | null
  member_status: string | null
  credit_used: number | string | null
  revenue_recognize: number | string | null
  notes: string | null
  updated_at: string
}

type EditOptions = {
  therapists: Therapist[]
  services: Service[]
  promotions: Promotion[]
  balanceByCustomer: Map<string, MemberBalance>
}

function SaleRow({
  sale: s,
  therapistName,
  editable,
  editOptions,
}: {
  sale: SaleRecord
  therapistName: Map<string, string>
  editable: boolean
  editOptions: EditOptions
}) {
  const discount = Number(s.discount ?? 0)
  const netAmount = Number(s.net_amount ?? 0)
  const commission = Number(s.commission ?? 0)
  const requestFee = Number(s.request_fee ?? 0)

  // numeric ของ postgres มาเป็น string — แปลงให้ครบก่อนส่งเข้าฟอร์ม
  // ไม่งั้นการบวกในกล่องแก้ไขจะกลายเป็นการต่อสตริง
  const editableSale: EditableSale = {
    id: s.id,
    receipt_no: s.receipt_no,
    sale_time: s.sale_time,
    service_id: s.service_id,
    service_name: s.service_name,
    therapist_id: s.therapist_id,
    customer_id: s.customer_id,
    customer_name: s.customer_name,
    customer_phone: s.customer_phone,
    coupon_promo: s.coupon_promo,
    discount,
    net_amount: netAmount,
    payment_method: s.payment_method,
    is_request: s.is_request ?? false,
    request_fee: requestFee,
    credit_used: Number(s.credit_used ?? 0),
    revenue_recognize: Number(s.revenue_recognize ?? 0),
    notes: s.notes,
    // ส่งดิบๆ ตามที่ PostgREST คืนมา ห้ามแปลงรูปแบบ ไม่งั้นจะเทียบกับฝั่ง server ไม่ตรง
    updated_at: s.updated_at,
  }

  return (
    <li className="flex items-start gap-3 px-4 py-3 sm:px-6">
      <span className="mt-0.5 text-sm font-semibold tabular-nums text-slate-400">
        {s.sale_time?.slice(0, 5) ?? "--:--"}
      </span>

      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{s.service_name}</span>
          {s.is_request && (
            <Badge variant="outline" className="text-[10px]">
              รีเควส
            </Badge>
          )}
          {s.member_status && (
            <Badge className="bg-violet-600 text-[10px]">{s.member_status}</Badge>
          )}
        </div>

        <p className="text-sm text-slate-600">
          👤 {s.customer_name ? `${s.customer_name} · ` : ""}
          {therapistName.get(s.therapist_id ?? "") ?? "ไม่ระบุ"}
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs">
          <span
            className={`rounded-full px-2 py-0.5 font-medium ${
              PAY_COLOR[s.payment_method] ?? PAY_COLOR_DEFAULT
            }`}
          >
            {s.payment_method}
          </span>
          <span className="text-slate-400">ค่ามือ {formatBaht(commission)} ฿</span>
          {requestFee > 0 && (
            <span className="text-slate-400">ค่ารีเควส {formatBaht(requestFee)} ฿</span>
          )}
          {discount > 0 && (
            <span className="text-rose-500">
              ลด {formatBaht(discount)} ฿{s.coupon_promo ? ` (${s.coupon_promo})` : ""}
            </span>
          )}
        </div>

        {s.notes && <p className="text-xs text-slate-400">📝 {s.notes}</p>}
      </div>

      <div className="flex items-start gap-1">
        <span className="mt-0.5 text-lg font-bold whitespace-nowrap text-emerald-800">
          {formatBaht(netAmount)} ฿
        </span>
        {editable && (
          <SaleRowActions
            sale={editableSale}
            therapists={editOptions.therapists}
            services={editOptions.services}
            promotions={editOptions.promotions}
            balance={
              s.customer_id
                ? editOptions.balanceByCustomer.get(s.customer_id) ?? null
                : null
            }
            currentTherapistName={therapistName.get(s.therapist_id ?? "") ?? null}
            label={`${s.service_name} ${formatBaht(netAmount)} บาท`}
          />
        )}
      </div>
    </li>
  )
}
