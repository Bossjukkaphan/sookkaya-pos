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
  const month = searchParams.get("month") ?? todayInShopTz().slice(0, 7)

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "invalid month" }, { status: 400 })
  }

  const from = `${month}-01`
  const to = lastDayOfMonth(month)

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
        "Content-Disposition": `attachment; filename="expenses-${month}.csv"`,
      },
    })
  }

  const [{ data: sales }, { data: therapists }] = await Promise.all([
    supabase
      .from("sales")
      .select("*")
      .gte("sale_date", from)
      .lte("sale_date", to)
      .order("sale_date")
      .order("sale_time"),
    supabase.from("therapists").select("id, name"),
  ])

  const therapistName = new Map((therapists ?? []).map((t) => [t.id, t.name]))

  const csv = toCsv(
    [
      "เลขที่ใบเสร็จ", "วันที่", "เวลา", "ลูกค้า", "เบอร์โทร", "หมอนวด",
      "บริการ", "ราคาปกติ", "คูปอง/โปรโมชั่น", "ส่วนลด", "ยอดรับจริง",
      "ค่ามือ", "ช่องทางชำระ", "รีเควส", "ค่ารีเควส", "เครดิตที่ใช้",
      "โบนัสที่ใช้", "ผู้บันทึก",
    ],
    (sales ?? []).map((s) => [
      s.receipt_no, s.sale_date, s.sale_time, s.customer_name, s.customer_phone,
      therapistName.get(s.therapist_id ?? "") ?? "",
      s.service_name, s.price_normal, s.coupon_promo, s.discount, s.net_amount,
      s.commission, s.payment_method, s.is_request ? "ใช่" : "ไม่",
      s.request_fee, s.credit_used, s.bonus_used, s.created_by,
    ])
  )

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sales-${month}.csv"`,
    },
  })
}
