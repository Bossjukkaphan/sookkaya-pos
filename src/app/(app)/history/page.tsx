import { createClient } from "@/lib/supabase/server"
import { PAYMENT_METHODS, formatBaht } from "@/lib/constants"
import { billTotal, groupSalesByBill } from "@/lib/bill"
import { todayInShopTz } from "@/lib/datetime"
import { shortBedName } from "@/lib/beds"
import { ilikeOr } from "@/lib/search"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BillRow, type BillRecord } from "./bill-row"
import type { BillPaymentLine } from "../today/edit-sale-dialog"

export const metadata = { title: "ประวัติบิล · สุขกายา POS" }

/** เพดานผลลัพธ์ต่อหน้า — supabase-js ตัดที่ 1,000 เงียบๆ อยู่แล้ว ขอน้อยกว่าแล้วเตือนแทน */
const ROW_CAP = 200

const n = (x: number | string | null | undefined) => Number(x ?? 0)

/** กุญแจบิลของบรรทัดชำระ (ดู migration bill_payments): บิลชุดใช้ bill_id · บิลเดี่ยวใช้ id ตัวเอง */
const billKeyOf = (b: { id: string; bill_id: string | null }) => String(b.bill_id ?? b.id)

const SELECT_CLASS =
  "h-11 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none"

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    from?: string
    to?: string
    therapist?: string
    payment?: string
  }>
}) {
  const supabase = await createClient()
  const params = await searchParams
  const today = todayInShopTz()

  const isDate = (s: string | undefined): s is string =>
    !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
  // ค่าเริ่มต้น: ต้นเดือนถึงวันนี้ — ช่วงที่ถามบ่อยสุดตอนเช็คบิล
  const from = isDate(params.from) ? params.from : `${today.slice(0, 7)}-01`
  const to = isDate(params.to) ? params.to : today
  const q = params.q?.trim() ?? ""
  const therapist = params.therapist ?? ""
  const payment = params.payment ?? ""

  let query = supabase
    .from("sales")
    .select("*", { count: "exact" })
    .gte("sale_date", from)
    .lte("sale_date", to)
    .order("sale_date", { ascending: false })
    .order("sale_time", { ascending: false })
    .limit(ROW_CAP)

  // ilikeOr ครอบคำค้นด้วยเครื่องหมายคำพูด — ห้ามต่อสตริงเอง
  // แค่ผู้ใช้พิมพ์จุลภาค PostgREST ก็อ่านเป็นตัวคั่นเงื่อนไขแล้วพังทั้ง query
  // หน้านี้จะขึ้น "ไม่พบบิลตามเงื่อนไข" พร้อมยอดรวม 0 ฿ ซึ่งอ่านเหมือนวันนั้นไม่มีรายได้จริง
  if (q) {
    query = query.or(ilikeOr(["customer_name", "customer_phone", "receipt_no"], q))
  }
  if (therapist) query = query.eq("therapist_id", therapist)
  if (payment) query = query.eq("payment_method", payment)

  const [{ data: sales, count }, { data: therapists }, { data: beds }] =
    await Promise.all([
      query,
      supabase.from("therapists").select("id, name").order("name"),
      supabase.from("beds").select("id, room, name"),
    ])

  const therapistName = new Map((therapists ?? []).map((t) => [t.id, t.name]))
  const bedLabel = new Map(
    (beds ?? []).map((b) => [b.id, `${b.room} ${b.name} (${shortBedName(b)})`])
  )

  const rows = sales ?? []
  const total = count ?? rows.length
  const totalAmount = rows.reduce((s, r) => s + n(r.net_amount), 0)

  // บรรทัดชำระของบิล (bill_payments) + ยอดค้างรับ (v_bill_due) เฉพาะบิลที่แสดงอยู่ในหน้านี้ —
  // ต้องรู้ bill_key (bill_id ?? id) จาก rows ก่อน จึงดึงเป็นรอบสองต่อจาก sales (เหมือนหน้า /today)
  // ไม่ query รายแถว กันยิง N+1 ไปที่ view/ตารางนี้
  const billKeys = [...new Set(rows.map((s) => String(s.bill_id ?? s.id)))]
  const [{ data: billPayments }, { data: billDues }] = billKeys.length
    ? await Promise.all([
        supabase
          .from("bill_payments")
          .select("id, bill_key, method, amount, received_date")
          .in("bill_key", billKeys)
          .order("received_at"),
        supabase.from("v_bill_due").select("bill_key, due").in("bill_key", billKeys),
      ])
    : [{ data: [] }, { data: [] }]

  const paymentsByBillKey = new Map<string, BillPaymentLine[]>()
  for (const p of billPayments ?? []) {
    const key = String(p.bill_key)
    const arr = paymentsByBillKey.get(key) ?? []
    arr.push({
      id: p.id,
      method: p.method,
      amount: Number(p.amount),
      received_date: String(p.received_date),
    })
    paymentsByBillKey.set(key, arr)
  }
  const dueByBillKey = new Map<string, number>(
    (billDues ?? []).map((d) => [String(d.bill_key), Number(d.due)])
  )

  const bills: BillRecord[] = rows.map((s) => ({
    id: s.id,
    bill_id: s.bill_id,
    receipt_no: s.receipt_no,
    sale_date: s.sale_date,
    sale_time: s.sale_time,
    service_name: s.service_name,
    therapist_name: therapistName.get(s.therapist_id ?? "") ?? "ไม่ระบุ",
    customer_name: s.customer_name,
    customer_phone: s.customer_phone,
    price_normal: n(s.price_normal),
    discount: n(s.discount),
    coupon_promo: s.coupon_promo,
    net_amount: n(s.net_amount),
    commission: n(s.commission),
    request_fee: n(s.request_fee),
    room_fee: n(s.room_fee),
    is_request: s.is_request ?? false,
    payment_method: s.payment_method,
    credit_used: n(s.credit_used),
    credit_after: s.credit_after === null ? null : n(s.credit_after),
    bonus_used: n(s.bonus_used),
    revenue_recognize: n(s.revenue_recognize),
    source: s.source,
    booking_channel: s.booking_channel,
    bed_label: s.bed_id ? (bedLabel.get(s.bed_id) ?? null) : null,
    notes: s.notes,
    created_by: s.created_by,
    created_at: s.created_at,
    edited_by: s.edited_by,
  }))

  // ลิงก์ export พกตัวกรองปัจจุบันไปทั้งชุด
  const exportQs = new URLSearchParams({ type: "sales", from, to })
  if (q) exportQs.set("q", q)
  if (therapist) exportQs.set("therapist", therapist)
  if (payment) exportQs.set("payment", payment)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">ประวัติบิล</h1>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/export?${exportQs.toString()}`}>⬇ Export CSV</a>
        </Button>
      </div>

      {/* ฟอร์ม GET ธรรมดา — กดค้นหาแล้ว server กรองให้ ไม่ต้องมี JS */}
      <form action="/history" className="space-y-2">
        <div className="flex gap-2">
          <Input
            name="q"
            defaultValue={q}
            className="h-11"
            placeholder="ค้นหาด้วยชื่อลูกค้า เบอร์ หรือเลขที่บิล"
            aria-label="ค้นหาบิล"
          />
          <Button type="submit" className="h-11 shrink-0">
            ค้นหา
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Input
            type="date"
            name="from"
            defaultValue={from}
            className="h-11 w-auto"
            aria-label="ตั้งแต่วันที่"
          />
          <span className="text-slate-400">ถึง</span>
          <Input
            type="date"
            name="to"
            defaultValue={to}
            className="h-11 w-auto"
            aria-label="ถึงวันที่"
          />
          <select
            name="therapist"
            defaultValue={therapist}
            className={SELECT_CLASS}
            aria-label="กรองตามหมอนวด"
          >
            <option value="">หมอทุกคน</option>
            {(therapists ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            name="payment"
            defaultValue={payment}
            className={SELECT_CLASS}
            aria-label="กรองตามช่องทางชำระ"
          >
            <option value="">ทุกช่องทาง</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </form>

      <p className="text-sm text-slate-600">
        พบ <span className="font-semibold">{total.toLocaleString()}</span> บิล · ยอดรวมที่แสดง{" "}
        <span className="font-semibold text-emerald-700">
          {totalAmount.toLocaleString("th-TH")} ฿
        </span>
      </p>

      {total > rows.length && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          แสดง {rows.length} บิลแรกจากทั้งหมด {total.toLocaleString()} บิล — ยอดรวมข้างบนเป็นเฉพาะที่แสดง
          กรองช่วงให้แคบลงหรือกด Export CSV เพื่อเอาครบทุกบิล
        </p>
      )}

      <Card>
        <CardContent className="px-0">
          {bills.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-slate-500">
              ไม่พบบิลตามเงื่อนไข
            </p>
          ) : (
            <ul className="divide-y">
              {groupSalesByBill(bills).map((g) =>
                g.items.length === 1 ? (
                  <li key={g.key}>
                    <BillRow
                      bill={g.items[0]}
                      payments={paymentsByBillKey.get(billKeyOf(g.items[0])) ?? []}
                      due={dueByBillKey.get(billKeyOf(g.items[0])) ?? 0}
                    />
                  </li>
                ) : (
                  // บิลชุด: ลูกค้าคนเดียวหลายรายการจ่ายรวม
                  <li key={g.key} className="bg-emerald-50/50">
                    <div className="flex items-baseline justify-between px-4 pt-2 text-xs font-semibold text-emerald-800 sm:px-6">
                      <span>
                        🧾 บิลชุด {g.items.length} รายการ ·{" "}
                        {g.items[0].customer_name ?? "ลูกค้า"}
                      </span>
                      <span>รวม {formatBaht(billTotal(g.items))} ฿</span>
                    </div>
                    <ul className="divide-y">
                      {g.items.map((b) => (
                        <li key={b.id}>
                          <BillRow
                            bill={b}
                            payments={paymentsByBillKey.get(billKeyOf(b)) ?? []}
                            due={dueByBillKey.get(billKeyOf(b)) ?? 0}
                          />
                        </li>
                      ))}
                    </ul>
                  </li>
                )
              )}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
