import { NextResponse, type NextRequest } from "next/server"

import { createServiceClient } from "@/lib/supabase/service"
import { pushAssistantMessage } from "@/lib/line-assistant"
import { cronRequestAuthorized, triggerSourceOf } from "@/lib/cron-auth"
import { creditExpiryPushPayload } from "@/lib/push-message"
import { sendPushToStaff } from "@/lib/web-push-send"
import { todayInShopTz, formatThaiDate } from "@/lib/datetime"
import {
  EXPIRY_WINDOW_DAYS,
  addDaysIso,
  daysLeft,
  dueThresholds,
  groupExpiringByCustomer,
  msgCreditExpiryStaff,
} from "@/lib/credit-expiry"

/** เครดิตสมาชิกแตะหลักไมล์ D-30/14/7/3 ก่อนหมดอายุ → เตือนพนักงานสองทาง
 *  (Web Push ทางหลัก + กลุ่มไลน์ทีมทางเสริม — แพตเทิร์นเดียวกับ birthday-reminder)
 *  ให้ชวนลูกค้ามาใช้เครดิตก่อนหมด · ไม่มีใครแตะหลักไมล์ = จบเงียบ ไม่กวนกลุ่ม
 *
 *  ตัวจับเวลา: pg_cron 08:30 ไทย ตัวเดียว (job credit-expiry-reminder-0830-ict)
 *  ไม่มี Vercel cron สำรอง — Hobby จำกัด 2 ตัวและใช้กับ daily-report/birthday ครบแล้ว
 *  (แบบเดียวกับ pending-queue-reminder) พลาดวันไหนหลักไมล์ค้างจะถูกเก็บรอบถัดไปเอง
 *  และหน้า /crm โชว์ลิสต์เต็มตลอดเวลาอยู่แล้ว
 *
 *  กันซ้ำสองชั้น: cron_sends กันยิงซ้ำในวันเดียว · credit_expiry_alerts กันเตือน
 *  หลักไมล์เดิมซ้ำข้ามวัน (key รวม expiry_date — ยืดอายุใบ = หลักไมล์นับใหม่)
 *
 *  ?force=1 ข้ามด่าน cron_sends ตอนยิงมือ (หลักไมล์ที่เตือนแล้วยังไม่ซ้ำ)
 *  ?dry=1 จบทันทีหลังผ่านด่านตรวจสิทธิ์ — พิสูจน์ secret โดยไม่ส่งจริง */
export async function GET(request: NextRequest) {
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

  // ใบที่ยังใช้ได้และจะหมดใน 30 วัน (รวมวันนี้ — เช้านี้คือโอกาสสุดท้าย)
  const { data: buckets, error: bucketsError } = await supabase
    .from("v_topup_balances")
    .select("topup_id, customer_id, expiry_date, remaining")
    .eq("is_active", true)
    .gt("remaining", 0)
    .gte("expiry_date", today)
    .lte("expiry_date", addDaysIso(today, EXPIRY_WINDOW_DAYS))
  if (bucketsError) {
    console.error("credit-expiry-reminder buckets failed", bucketsError.message)
    return NextResponse.json({ ok: false, error: bucketsError.message })
  }
  const rows = (buckets ?? [])
    .filter((b) => b.topup_id && b.customer_id && b.expiry_date)
    .map((b) => ({
      topupId: String(b.topup_id),
      customerId: String(b.customer_id),
      expiryDate: String(b.expiry_date),
      remaining: Number(b.remaining ?? 0),
    }))
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, expiring: 0 })
  }

  // หลักไมล์ที่เคยเตือนไปแล้วของใบชุดนี้ — นับเฉพาะแถวที่ expiry_date ตรงกับปัจจุบัน
  // (ใบที่ถูกยืดอายุ แถวเก่าจะ key ไม่ตรง = หลักไมล์เริ่มนับใหม่โดยไม่ต้องลบอะไร)
  const { data: alerts, error: alertsError } = await supabase
    .from("credit_expiry_alerts")
    .select("topup_id, threshold, expiry_date")
    .in("topup_id", rows.map((r) => r.topupId))
  if (alertsError) {
    console.error("credit-expiry-reminder alerts failed", alertsError.message)
    return NextResponse.json({ ok: false, error: alertsError.message })
  }
  const alertedByTopup = new Map<string, Set<number>>()
  const expiryByTopup = new Map(rows.map((r) => [r.topupId, r.expiryDate]))
  for (const a of alerts ?? []) {
    if (expiryByTopup.get(String(a.topup_id)) !== String(a.expiry_date)) continue
    const set = alertedByTopup.get(String(a.topup_id)) ?? new Set<number>()
    set.add(Number(a.threshold))
    alertedByTopup.set(String(a.topup_id), set)
  }

  // ใบที่ "เพิ่งแตะหลักไมล์ใหม่" เท่านั้นที่เข้าข้อความวันนี้
  const due = rows
    .map((r) => ({
      ...r,
      thresholds: dueThresholds(
        daysLeft(r.expiryDate, today),
        alertedByTopup.get(r.topupId) ?? new Set<number>()
      ),
    }))
    .filter((r) => r.thresholds.length > 0)
  if (due.length === 0) {
    return NextResponse.json({ ok: true, expiring: rows.length, due: 0 })
  }

  // จองสิทธิ์ส่ง "ก่อน" ยิงจริง — กันยิงมือ/ตั้งเวลาซ้อนกันส่งซ้ำในวันเดียว
  const claim = await supabase
    .from("cron_sends")
    .upsert(
      { job: "credit-expiry-reminder", run_date: today, source },
      { onConflict: "job,run_date", ignoreDuplicates: true }
    )
    .select("run_date")
  if (claim.error) {
    console.error("credit-expiry-reminder claim failed", claim.error.message)
    return NextResponse.json({ ok: false, error: claim.error.message })
  }
  const claimed = (claim.data ?? []).length > 0
  if (!claimed && !force) {
    return NextResponse.json({ ok: true, skipped: "already-sent", due: due.length })
  }

  // บันทึกหลักไมล์ก่อนส่ง (แบบเดียวกับการจอง claim) — แถวที่ insert จริงเก็บไว้เผื่อ rollback
  const alertRows = due.flatMap((r) =>
    r.thresholds.map((threshold) => ({
      topup_id: r.topupId,
      threshold,
      expiry_date: r.expiryDate,
      source,
    }))
  )
  const ins = await supabase
    .from("credit_expiry_alerts")
    .upsert(alertRows, {
      onConflict: "topup_id,threshold,expiry_date",
      ignoreDuplicates: true,
    })
    .select("topup_id, threshold, expiry_date")
  if (ins.error) {
    console.error("credit-expiry-reminder alert insert failed", ins.error.message)
    if (claimed) {
      await supabase
        .from("cron_sends")
        .delete()
        .eq("job", "credit-expiry-reminder")
        .eq("run_date", today)
    }
    return NextResponse.json({ ok: false, error: ins.error.message })
  }
  const inserted = ins.data ?? []

  // ชื่อลูกค้า — ชื่อเล่นก่อน อ่านในกลุ่มแล้วรู้ทันทีว่าใคร
  const grouped = groupExpiringByCustomer(due, today)
  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, nickname")
    .in("id", grouped.map((g) => g.customerId))
  const nameById = new Map(
    (customers ?? []).map((c) => [c.id, c.nickname || c.name || "ไม่ระบุชื่อ"])
  )
  const items = grouped.map((g) => ({
    name: nameById.get(g.customerId) ?? "ไม่ระบุชื่อ",
    total: g.total,
    daysLeft: g.daysLeft,
    expiryThai: formatThaiDate(g.nearestExpiry),
  }))

  // ยิงไลน์ก่อน push เสมอ — ทั้งคู่รับปากว่าไม่ throw (ดู line-assistant.ts / web-push-send.ts)
  const lineSent = await pushAssistantMessage(
    process.env.LINE_ASSISTANT_QUEUE_GROUP_ID ?? "",
    msgCreditExpiryStaff(items)
  )
  const pushResult = await sendPushToStaff(creditExpiryPushPayload(items)!)
  const sent = pushResult.sent > 0 || lineSent

  // ส่งไม่ถึงสักทาง = คืนทั้งสิทธิ์วันนี้และหลักไมล์ที่เพิ่งจอง ให้รอบถัดไปลองใหม่
  // ลบเฉพาะแถวที่ "เราเป็นคน insert รอบนี้" — เคส force ต้องไม่ลบหลักไมล์เก่าของคนอื่น
  if (!sent) {
    for (const r of inserted) {
      await supabase
        .from("credit_expiry_alerts")
        .delete()
        .eq("topup_id", r.topup_id)
        .eq("threshold", r.threshold)
        .eq("expiry_date", r.expiry_date)
    }
    if (claimed) {
      const rollback = await supabase
        .from("cron_sends")
        .delete()
        .eq("job", "credit-expiry-reminder")
        .eq("run_date", today)
      if (rollback.error) {
        console.error("credit-expiry-reminder rollback failed", rollback.error.message)
      }
    }
  }

  return NextResponse.json({
    ok: sent,
    expiring: rows.length,
    due: due.length,
    customers: items.length,
    pushed: pushResult.sent,
    lineSent,
    source,
  })
}
