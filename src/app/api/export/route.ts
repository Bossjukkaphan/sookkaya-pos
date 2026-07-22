import { NextResponse, type NextRequest } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { todayInShopTz } from "@/lib/datetime"

function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

/** ครอบค่าให้ปลอดภัยสำหรับ CSV และกัน formula injection ใน Excel */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value)
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return `"${guarded.replace(/"/g, '""')}"`
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((r) => r.map(csvCell).join(",")),
  ]
  // BOM ให้ Excel อ่านภาษาไทยไม่เป็นตัวต่างดาว
  return "﻿" + lines.join("\r\n")
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const type = searchParams.get("type") ?? "sales"

  // สองโหมด: from/to รายวัน (หน้าประวัติบิล) หรือ month แบบเดิม (หน้ารายงาน)
  const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
  const fromParam = searchParams.get("from")
  const toParam = searchParams.get("to")

  let from: string
  let to: string
  let fileTag: string
  if (isDate(fromParam) && isDate(toParam)) {
    from = fromParam
    to = toParam
    fileTag = `${from}_${to}`
  } else {
    const month = searchParams.get("month") ?? todayInShopTz().slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "invalid month" }, { status: 400 })
    }
    from = `${month}-01`
    to = lastDayOfMonth(month)
    fileTag = month
  }

  if (type === "expenses") {
    const { data } = await supabase
      .from("expenses")
      .select("expense_date, item, category, amount, paid_by, notes")
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("expense_date")

    const csv = toCsv(
      ["วันที่", "รายการ", "หมวดหมู่", "จำนวนเงิน", "ผู้จ่าย", "หมายเหตุ"],
      (data ?? []).map((e) => [
        e.expense_date, e.item, e.category, e.amount, e.paid_by, e.notes,
      ])
    )

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="expenses-${fileTag}.csv"`,
      },
    })
  }

  // ตัวกรองชุดเดียวกับหน้าประวัติบิล — export ได้ตรงกับที่ตาเห็น
  let salesQuery = supabase
    .from("sales")
    .select("*")
    .gte("sale_date", from)
    .lte("sale_date", to)
    .order("sale_date")
    .order("sale_time")
  const q = searchParams.get("q")?.trim()
  if (q) {
    salesQuery = salesQuery.or(
      `customer_name.ilike.%${q}%,customer_phone.ilike.%${q}%,receipt_no.ilike.%${q}%`
    )
  }
  const therapistFilter = searchParams.get("therapist")
  if (therapistFilter) salesQuery = salesQuery.eq("therapist_id", therapistFilter)
  const paymentFilter = searchParams.get("payment")
  if (paymentFilter) salesQuery = salesQuery.eq("payment_method", paymentFilter)

  const [{ data: sales }, { data: therapists }, { data: beds }] = await Promise.all([
    salesQuery,
    supabase.from("therapists").select("id, name"),
    supabase.from("beds").select("id, room, name"),
  ])

  const therapistName = new Map((therapists ?? []).map((t) => [t.id, t.name]))
  const bedName = new Map((beds ?? []).map((b) => [b.id, `${b.room} ${b.name}`]))
  const SOURCE_TH: Record<string, string> = {
    walk_in: "Walk-in", booking: "จองล่วงหน้า", agency: "Agency",
  }
  const CHANNEL_TH: Record<string, string> = {
    line: "ไลน์", phone: "โทรศัพท์", facebook: "Facebook",
  }

  const csv = toCsv(
    [
      "เลขที่ใบเสร็จ", "วันที่", "เวลา", "ลูกค้า", "เบอร์โทร", "หมอนวด",
      "บริการ", "ราคาปกติ", "คูปอง/โปรโมชั่น", "ส่วนลด", "ยอดรับจริง",
      "ค่ามือ", "ช่องทางชำระ", "รีเควส", "ค่ารีเควส", "เครดิตที่ใช้",
      "โบนัสที่ใช้", "ที่มาลูกค้า", "ช่องทางจอง", "เตียง", "หมายเหตุ",
      "ผู้บันทึก", "ผู้แก้ไข",
    ],
    (sales ?? []).map((s) => [
      s.receipt_no, s.sale_date, s.sale_time, s.customer_name, s.customer_phone,
      therapistName.get(s.therapist_id ?? "") ?? "",
      s.service_name, s.price_normal, s.coupon_promo, s.discount, s.net_amount,
      s.commission, s.payment_method, s.is_request ? "ใช่" : "ไม่",
      s.request_fee, s.credit_used, s.bonus_used,
      s.source ? (SOURCE_TH[s.source] ?? s.source) : "",
      s.booking_channel ? (CHANNEL_TH[s.booking_channel] ?? s.booking_channel) : "",
      s.bed_id ? (bedName.get(s.bed_id) ?? "") : "",
      s.notes, s.created_by, s.edited_by,
    ])
  )

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sales-${fileTag}.csv"`,
    },
  })
}
