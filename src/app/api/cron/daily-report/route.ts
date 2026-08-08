import { NextResponse, type NextRequest } from "next/server"

import { createServiceClient } from "@/lib/supabase/service"
import { pushAssistantFlex } from "@/lib/line-assistant"
import { cronRequestAuthorized, triggerSourceOf } from "@/lib/cron-auth"
import { buildDailyReport, CREDIT_LOW_BAHT, PRIOR_DAYS } from "@/lib/daily-report"
import type {
  DailySummaryRow,
  ExpenseEntryRow,
  TopTherapist,
  TopupRow,
  TopupHistoryRow,
} from "@/lib/daily-report"
import { dailyReportFlex } from "@/lib/daily-report-flex"
import { addMonths, shopDateOf, todayInShopTz } from "@/lib/datetime"
import { addDays } from "@/lib/date-range"

/** สรุปยอดขายวันนี้เป็นการ์ด Flex เข้ากลุ่ม Sookkaya Management ผ่าน OA ผู้ช่วย
 *  แทน Google Apps Script ตัวเดิม
 *
 *  มีตัวจับเวลาสองตัวยิง route นี้ (ตั้งใจให้ซ้ำซ้อน — ดู src/lib/cron-auth.ts):
 *    pg_cron 22:00 ตรง      = ตัวหลัก (job daily-report-2200-ict)
 *    Vercel cron 22:00-22:59 = ตัวสำรอง เผื่อ pg_cron/pg_net ล่ม (ดู vercel.json)
 *  ตัวไหนจองแถวใน cron_sends ได้ก่อน = ตัวที่ส่ง อีกตัวจบเงียบ
 *
 *  ?force=1 ข้ามด่านกันซ้ำ ใช้ตอนยิงมือเพื่อตรวจการ์ด
 *  ?dry=1 จบทันทีหลังผ่านด่านตรวจสิทธิ์ — ไว้พิสูจน์ว่า secret ตรงโดยไม่ส่งการ์ดจริง
 *  spec: docs/superpowers/specs/2026-08-05-line-daily-report-design.md */
export async function GET(request: NextRequest) {
  // route นี้อยู่ใต้ /api/cron ซึ่ง PUBLIC_ROUTES ปล่อยผ่าน จึงต้องกันคนนอกเอง
  const supabase = createServiceClient()
  if (!(await cronRequestAuthorized(supabase, request.headers.get("authorization")))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const source = triggerSourceOf(request.nextUrl.searchParams.get("source"))
  const force = request.nextUrl.searchParams.get("force") === "1"
  if (request.nextUrl.searchParams.get("dry") === "1") {
    return NextResponse.json({ ok: true, dry: true, source })
  }

  const today = todayInShopTz()
  const tomorrow = addDays(today, 1)
  // ต้นเดือนของเดือนที่แล้ว — ครอบทั้งฐานเฉลี่ย 7 วันและ MTD เดือนที่แล้วในคิวรีเดียว
  const from = `${addMonths(today, -1).slice(0, 7)}-01`

  const [
    daily,
    commission,
    customerRows,
    therapistTop,
    bookings,
    creditEmpty,
    creditLow,
    topups,
    expenseRows,
  ] = await Promise.all([
      supabase
        .from("v_daily_summary")
        .select("sale_date, sessions, net_revenue, cash_in")
        .gte("sale_date", from)
        .lte("sale_date", today),
      supabase.from("v_commission_daily").select("commission").eq("work_date", today).maybeSingle(),
      supabase.from("sales").select("customer_id").eq("sale_date", today).not("customer_id", "is", null),
      supabase
        .from("v_therapist_daily")
        .select("therapist_id, sessions, total_income")
        .eq("work_date", today)
        .order("total_income", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("queue_entries")
        .select("*", { count: "exact", head: true })
        .eq("queue_date", tomorrow)
        .not("status", "in", "(cancelled,rejected)"),
      // member_balances เกิน 1,000 แถว ห้ามดึงมานับเอง ต้องให้ฐานข้อมูลนับให้
      supabase
        .from("member_balances")
        .select("*", { count: "exact", head: true })
        .gt("credit_granted", 0)
        .lte("credit_balance", 0),
      supabase
        .from("member_balances")
        .select("*", { count: "exact", head: true })
        .gt("credit_balance", 0)
        .lte("credit_balance", CREDIT_LOW_BAHT),
      // ห้ามใช้ .neq("tier", EXCLUDED_TIER) ที่นี่ — ใน Postgres tier <> 'x' ให้ผล NULL
      // เมื่อ tier เป็น NULL แถวจะถูกตัดทิ้งไปด้วย ทั้งที่ต้องรอดแล้วโชว์เป็น "ไม่ระบุ"
      // ปล่อยดิบๆ ไปให้สูตรกรอง EXCLUDED_TIER เอง (buildMemberSignups)
      // เรียงตาม created_at เพราะสูตร buildMemberSignups ตัดสิน "ใหม่ vs ต่ออายุ" จากลำดับแถว
      // แถวแรกของลูกค้าคนเดียวกัน = ครั้งแรกของวัน (ตามสเปก) — ไม่มี order by ตรงนี้
      // PostgREST ไม่การันตีลำดับ แพ็กเกจไหนกลายเป็น "ใหม่" กับ "ต่ออายุ" จะสลับกันได้ทุกครั้งที่รัน
      supabase
        .from("member_topups")
        .select("customer_id, tier, cash_received")
        .eq("topup_date", today)
        .order("created_at"),
      // นับรายจ่ายตาม "วันที่บันทึกเข้าระบบ" (created_at) ไม่ใช่วันที่บนใบเสร็จ (expense_date)
      // เจ้าของร้านย้ำสองรอบ — ของจริงมีวันที่พนักงานคีย์ย้อนหลังทั้งเดือนในวันเดียว
      // กรองด้วยช่วง UTC ที่ประกอบจากวันที่ไทยตรงๆ (+07:00) เพื่อให้ index บน created_at ทำงาน
      // ห้ามดึงทั้งตารางมากรองใน JS และห้ามใช้ SQL date-cast expression ซึ่ง index ใช้ไม่ได้
      supabase
        .from("expenses")
        .select("expense_date, amount, created_at")
        .gte("created_at", `${today}T00:00:00+07:00`)
        .lt("created_at", `${tomorrow}T00:00:00+07:00`),
    ])

  // ตัวเลขไม่ครบ = ไม่ส่ง ดีกว่าส่งการ์ดที่ผิดเข้ากลุ่มผู้บริหาร
  const failed = [
    daily,
    commission,
    customerRows,
    therapistTop,
    bookings,
    creditEmpty,
    creditLow,
    topups,
    expenseRows,
  ]
    .map((r) => r.error?.message)
    .filter(Boolean)
  if (failed.length > 0) {
    console.error("daily-report query failed", failed)
    return NextResponse.json({ ok: false, error: failed[0] })
  }

  // แมปทีละฟิลด์แทนการ cast ตรงๆ — ถ้าใครแก้ select แล้วเผลอตัดคอลัมน์ออก ตรงนี้จะ error
  // ตอน compile แทนที่จะปล่อยผ่านเงียบๆ แล้วไปพังตอนรัน (as จะบังคับ type ได้เสมอไม่ว่า field จะขาด)
  const topupRows: TopupRow[] = (topups.data ?? []).map((r) => ({
    customer_id: r.customer_id,
    tier: r.tier,
    cash_received: r.cash_received,
  }))
  const topupCustomerIds = [...new Set(topupRows.map((r) => r.customer_id))]
  let topupHistory: TopupHistoryRow[] = []
  // ยิงเฉพาะวันที่มีคนเติม — วันที่ไม่มีใครเติมเลยไม่เสีย round trip ประวัติเปล่าๆ
  if (topupCustomerIds.length > 0) {
    const history = await supabase
      .from("member_topups")
      .select("customer_id, topup_date, tier")
      .in("customer_id", topupCustomerIds)
    if (history.error) {
      console.error("daily-report topup history failed", history.error.message)
      return NextResponse.json({ ok: false, error: history.error.message })
    }
    // ส่งดิบๆ เข้าสูตร — ไม่กรอง tier ที่นี่เช่นกัน สูตรตัด EXCLUDED_TIER เองแล้ว
    topupHistory = (history.data ?? []).map((r) => ({
      customer_id: r.customer_id,
      topup_date: r.topup_date,
      tier: r.tier,
    }))
  }

  // created_at เป็น timestamptz — แปลงเป็นวันที่ไทยที่นี่ ให้สูตรยังบริสุทธิ์ (ไม่แตะ Intl/timezone)
  // expense_date และ created_at ไม่มี null ได้ตาม schema จึงไม่ต้องมี fallback/cast กันเหนียว
  const expenseEntries: ExpenseEntryRow[] = (expenseRows.data ?? []).map((r) => ({
    expense_date: r.expense_date,
    amount: r.amount === null ? null : Number(r.amount),
    recorded_date: shopDateOf(new Date(r.created_at)),
  }))

  let topTherapist: TopTherapist | null = null
  if (therapistTop.data?.therapist_id) {
    const { data: therapist } = await supabase
      .from("therapists")
      .select("name")
      .eq("id", therapistTop.data.therapist_id)
      .maybeSingle()
    if (therapist) {
      topTherapist = {
        name: therapist.name,
        income: Number(therapistTop.data.total_income ?? 0),
        sessions: Number(therapistTop.data.sessions ?? 0),
      }
    }
  }

  const report = buildDailyReport({
    today,
    daily: (daily.data ?? []).map(
      (r): DailySummaryRow => ({
        sale_date: r.sale_date ?? "",
        sessions: Number(r.sessions ?? 0),
        net_revenue: Number(r.net_revenue ?? 0),
        cash_in: Number(r.cash_in ?? 0),
      })
    ),
    commission: Number(commission.data?.commission ?? 0),
    customers: new Set((customerRows.data ?? []).map((r) => r.customer_id)).size,
    topTherapist,
    bookingsTomorrow: bookings.count ?? 0,
    memberCreditEmpty: creditEmpty.count ?? 0,
    memberCreditLow: creditLow.count ?? 0,
    topups: topupRows,
    topupHistory,
    expenseEntries,
  })

  // จองสิทธิ์ส่ง "ก่อน" ยิง LINE — ถ้าจองทีหลังจะมีช่องให้สองตัวจับเวลาส่งพร้อมกันได้
  // ignoreDuplicates ทำให้ PostgREST ใช้ ON CONFLICT DO NOTHING แล้ว .select() คืนเฉพาะแถวที่ insert จริง
  // แถวว่าง = วันนี้มีคนส่งไปแล้ว
  const claim = await supabase
    .from("cron_sends")
    .upsert(
      { job: "daily-report", run_date: report.date, source },
      { onConflict: "job,run_date", ignoreDuplicates: true }
    )
    .select("run_date")
  if (claim.error) {
    console.error("daily-report claim failed", claim.error.message)
    return NextResponse.json({ ok: false, error: claim.error.message })
  }
  const claimed = (claim.data ?? []).length > 0
  if (!claimed && !force) {
    return NextResponse.json({ ok: true, date: report.date, skipped: "already-sent" })
  }

  const sent = await pushAssistantFlex(
    process.env.LINE_MANAGEMENT_GROUP_ID ?? "",
    dailyReportFlex(report)
  )

  // ส่งไม่สำเร็จ = คืนสิทธิ์ให้ตัวสำรองลองใหม่ ไม่งั้นแถวที่จองค้างไว้จะบล็อกการ์ดทั้งคืน
  // ลบเฉพาะแถวที่ "เราเป็นคนจอง" รอบนี้ — เคส force ที่ไปเจอแถวเดิมของคนอื่นต้องไม่โดนลบ
  if (!sent && claimed) {
    const rollback = await supabase
      .from("cron_sends")
      .delete()
      .eq("job", "daily-report")
      .eq("run_date", report.date)
    if (rollback.error) {
      console.error("daily-report rollback failed", rollback.error.message)
    }
  }

  // ตอบ 200 เสมอแม้ส่งไม่สำเร็จ — ให้ Vercel เลิกยิงซ้ำ ไม่งั้นกลุ่มโดนสแปม
  return NextResponse.json({
    ok: sent,
    date: report.date,
    empty: report.empty,
    netRevenue: report.netRevenue,
    priorDays: PRIOR_DAYS,
    source,
  })
}
