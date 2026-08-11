import { NextResponse, type NextRequest } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { fetchAllRows } from "@/lib/fetch-all-rows"
import { todayInShopTz } from "@/lib/datetime"
import { ilikeOr } from "@/lib/search"
import { formatBaht } from "@/lib/constants"

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

/**
 * จำนวน bill_key ต่อหนึ่งคำขอ — UUID ยาว ถ้ายัดทีเดียวหมด URL จะยาวเกินจนคำขอพัง
 * ข้อมูลจริงมีบรรทัดชำระมากสุด 2 บรรทัดต่อบิล 200 คีย์จึงได้ราว 400 แถว ต่ำกว่าขนาดหน้า
 */
const KEY_CHUNK = 200

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
    let data: {
      expense_date: string
      item: string | null
      category: string | null
      amount: number | null
      paid_by: string | null
      notes: string | null
    }[]
    try {
      data = await fetchAllRows((offset, limit) =>
        supabase
          .from("expenses")
          .select("expense_date, item, category, amount, paid_by, notes", {
            count: "exact",
          })
          .gte("expense_date", from)
          .lte("expense_date", to)
          // id เป็นตัวตัดสินให้ลำดับคงที่ — ถ้าเรียงด้วยวันที่อย่างเดียว รายการวันเดียวกัน
          // อาจสลับตำแหน่งระหว่างหน้า ทำให้บางแถวถูกดึงซ้ำและบางแถวหายไป
          .order("expense_date")
          .order("id")
          .range(offset, offset + limit - 1)
      )
    } catch (e) {
      return NextResponse.json(
        { error: `ดาวน์โหลดรายจ่ายไม่สำเร็จ: ${(e as Error).message}` },
        { status: 500 }
      )
    }

    const csv = toCsv(
      ["วันที่", "รายการ", "หมวดหมู่", "จำนวนเงิน", "ผู้จ่าย", "หมายเหตุ"],
      data.map((e) => [
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

  const q = searchParams.get("q")?.trim()
  const therapistFilter = searchParams.get("therapist")
  const paymentFilter = searchParams.get("payment")

  // ตัวกรองชุดเดียวกับหน้าประวัติบิล — export ได้ตรงกับที่ตาเห็น
  const salesPage = (offset: number, limit: number) => {
    let qb = supabase
      .from("sales")
      .select("*", { count: "exact" })
      .gte("sale_date", from)
      .lte("sale_date", to)
      // id เป็นตัวตัดสินให้ลำดับคงที่ — วันและเวลาซ้ำกันได้ ถ้าลำดับไม่คงที่
      // การแบ่งหน้าจะทำให้บางบิลถูกดึงซ้ำและบางบิลหายไปจากไฟล์
      .order("sale_date")
      .order("sale_time")
      .order("id")
      .range(offset, offset + limit - 1)
    // ilikeOr ครอบคำค้นด้วยเครื่องหมายคำพูด — ห้ามต่อสตริงเอง
    // แค่ผู้ใช้พิมพ์จุลภาค PostgREST ก็อ่านเป็นตัวคั่นเงื่อนไขแล้วพังทั้ง query
    // ที่นี่ร้ายสุด: ได้ไฟล์ CSV ที่มีแต่หัวตาราง หน้าตาเหมือน export สำเร็จแต่ข้อมูลหายหมด
    if (q) qb = qb.or(ilikeOr(["customer_name", "customer_phone", "receipt_no"], q))
    if (therapistFilter) qb = qb.eq("therapist_id", therapistFilter)
    if (paymentFilter) qb = qb.eq("payment_method", paymentFilter)
    return qb
  }

  let sales: Awaited<ReturnType<typeof salesPage>>["data"] & object
  let paymentLines: { bill_key: string | null; method: string | null; amount: number | null }[]
  let therapists: { id: string; name: string }[] | null
  let beds: { id: string; room: string; name: string }[] | null
  try {
    const [salesRows, therapistRes, bedRes] = await Promise.all([
      fetchAllRows(salesPage),
      supabase.from("therapists").select("id, name"),
      supabase.from("beds").select("id, room, name"),
    ])
    sales = salesRows
    therapists = therapistRes.data
    beds = bedRes.data

    // สรุปบรรทัดชำระต่อบิล (bill_key = bill_id ?? id) — join แบบแบตช์ กัน N+1 ต่อแถวขาย
    // บิลเก่า/Gowabi/KOL ได้บรรทัดสังเคราะห์บรรทัดเดียวจาก v_bill_payments เหมือนกันหมด
    const billKeys = [...new Set(sales.map((s) => String(s.bill_id ?? s.id)))]
    paymentLines = []
    for (let i = 0; i < billKeys.length; i += KEY_CHUNK) {
      const chunk = billKeys.slice(i, i + KEY_CHUNK)
      const rows = await fetchAllRows((offset, limit) =>
        supabase
          .from("v_bill_payments")
          .select("bill_key, method, amount", { count: "exact" })
          .in("bill_key", chunk)
          .order("bill_key")
          .order("amount")
          .order("method")
          .range(offset, offset + limit - 1)
      )
      paymentLines.push(...rows)
    }
  } catch (e) {
    return NextResponse.json(
      { error: `ดาวน์โหลดรายการขายไม่สำเร็จ: ${(e as Error).message}` },
      { status: 500 }
    )
  }

  const linesByBillKey = new Map<string, { method: string; amount: number }[]>()
  for (const p of paymentLines) {
    const key = String(p.bill_key)
    const arr = linesByBillKey.get(key) ?? []
    arr.push({ method: p.method ?? "ไม่ระบุ", amount: Number(p.amount) }) // view types nullable แต่ข้อมูลจริงไม่เคย null
    linesByBillKey.set(key, arr)
  }
  const paymentSummaryByBillKey = new Map<string, string>()
  for (const [key, lines] of linesByBillKey) {
    const sorted = [...lines].sort((a, b) => b.amount - a.amount)
    paymentSummaryByBillKey.set(
      key,
      sorted.map((l) => `${l.method} ${formatBaht(l.amount)}`).join(" + ")
    )
  }

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
      "ค่ามือ", "ช่องทางชำระ", "บรรทัดชำระ", "รีเควส", "ค่ารีเควส", "เครดิตที่ใช้",
      "โบนัสที่ใช้", "ที่มาลูกค้า", "ช่องทางจอง", "เตียง", "หมายเหตุ",
      "ผู้บันทึก", "ผู้แก้ไข",
    ],
    sales.map((s) => [
      s.receipt_no, s.sale_date, s.sale_time, s.customer_name, s.customer_phone,
      therapistName.get(s.therapist_id ?? "") ?? "",
      s.service_name, s.price_normal, s.coupon_promo, s.discount, s.net_amount,
      s.commission, s.payment_method,
      paymentSummaryByBillKey.get(String(s.bill_id ?? s.id)) ?? "",
      s.is_request ? "ใช่" : "ไม่",
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
