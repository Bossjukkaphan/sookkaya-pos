import { NextResponse, type NextRequest } from "next/server"

import { createServiceClient } from "@/lib/supabase/service"
import { broadcastLineMessage } from "@/lib/line"
import { cronRequestAuthorized, triggerSourceOf } from "@/lib/cron-auth"
import { todayInShopTz } from "@/lib/datetime"

/** broadcast ข้อความหาผู้ติดตาม OA ลูกค้า "ทุกคน" — เรียกคืนไม่ได้
 *  ใช้เฉพาะข้อความที่เจ้าของร้านตรวจผ่าน /api/cron/preview-message แล้วเท่านั้น
 *  ไม่ใช่ cron ตามเวลา แต่พักใต้ /api/cron เพื่อใช้ด่านตรวจสิทธิ์ชุดเดียวกัน (cron-auth)
 *
 *  กันส่งซ้ำด้วย cron_sends (job 'broadcast-message') — วันละครั้งพอสำหรับ broadcast
 *  การตลาด ยิงซ้ำวันเดียวกันคือสแปม ถ้าจงใจส่งสองข้อความในวันเดียวใช้ ?force=1 */
export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  if (!(await cronRequestAuthorized(supabase, request.headers.get("authorization")))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const source = triggerSourceOf(request.nextUrl.searchParams.get("source"))
  const force = request.nextUrl.searchParams.get("force") === "1"
  const text = request.nextUrl.searchParams.get("text") ?? ""
  // LINE จำกัด text message ที่ 5000 ตัวอักษร — ตัดตั้งแต่ต้นทางพร้อมบอกเหตุผล
  if (!text.trim() || text.length > 5000) {
    return NextResponse.json({ ok: false, error: "text ว่างหรือยาวเกิน 5000 ตัวอักษร" })
  }

  // จองสิทธิ์ก่อนยิงเสมอ — broadcast ซ้ำคือส่งสแปมหาลูกค้าทั้ง OA แก้อะไรไม่ได้แล้ว
  const today = todayInShopTz()
  const claim = await supabase
    .from("cron_sends")
    .upsert(
      { job: "broadcast-message", run_date: today, source },
      { onConflict: "job,run_date", ignoreDuplicates: true }
    )
    .select("run_date")
  if (claim.error) {
    console.error("broadcast-message claim failed", claim.error.message)
    return NextResponse.json({ ok: false, error: claim.error.message })
  }
  const claimed = (claim.data ?? []).length > 0
  if (!claimed && !force) {
    return NextResponse.json({ ok: true, skipped: "already-sent" })
  }

  const sent = await broadcastLineMessage(text)

  // ส่งไม่สำเร็จ = คืนสิทธิ์ให้ยิงใหม่ได้ — ลบเฉพาะแถวที่เราจองรอบนี้
  if (!sent && claimed) {
    const rollback = await supabase
      .from("cron_sends")
      .delete()
      .eq("job", "broadcast-message")
      .eq("run_date", today)
    if (rollback.error) {
      console.error("broadcast-message rollback failed", rollback.error.message)
    }
  }

  return NextResponse.json({ ok: sent, chars: text.length, source })
}
