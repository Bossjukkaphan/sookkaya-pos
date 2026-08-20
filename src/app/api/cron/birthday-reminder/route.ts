import { NextResponse, type NextRequest } from "next/server"

import { createServiceClient } from "@/lib/supabase/service"
import { pushAssistantMessage } from "@/lib/line-assistant"
import { birthdayTodayCustomers } from "@/lib/crm-birthday"
import { msgBirthdayReminder } from "@/lib/crm"
import { cronRequestAuthorized, triggerSourceOf } from "@/lib/cron-auth"
import { birthdayPushPayload } from "@/lib/push-message"
import { sendPushToStaff } from "@/lib/web-push-send"
import { todayInShopTz } from "@/lib/datetime"

/** มีลูกค้าวันเกิดวันนี้ → เตือนพนักงานสองทาง: Web Push เข้ามือถือ (ทางหลัก)
 *  + ข้อความเข้ากลุ่มไลน์ผ่าน OA ผู้ช่วย (ทางเสริม)
 *  ไม่มี → จบเงียบ ไม่ส่งอะไร ไม่รบกวนกลุ่ม
 *
 *  มีตัวจับเวลาสองตัวยิง route นี้ (ตั้งใจให้ซ้ำซ้อน — ดู src/lib/cron-auth.ts):
 *    pg_cron 08:00 ตรง      = ตัวหลัก (job birthday-reminder-0800-ict)
 *    Vercel cron 08:00-08:59 = ตัวสำรอง เผื่อ pg_cron/pg_net ล่ม (ดู vercel.json)
 *  ตัวไหนจองแถวใน cron_sends ได้ก่อน = ตัวที่ส่ง อีกตัวจบเงียบ
 *  วันที่ไม่มีวันเกิดไม่จองแถวเลย — สองตัวเจอศูนย์ทั้งคู่แล้วจบเงียบเหมือนกัน ไม่มีอะไรให้ซ้ำ
 *
 *  ?force=1 ข้ามด่านกันซ้ำ ใช้ตอนยิงมือเพื่อตรวจข้อความ
 *  ?dry=1 จบทันทีหลังผ่านด่านตรวจสิทธิ์ — ไว้พิสูจน์ว่า secret ตรงโดยไม่ส่งข้อความจริง */
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
  const birthdays = await birthdayTodayCustomers(supabase, today)
  if (birthdays.length === 0) {
    return NextResponse.json({ ok: true, birthdays: 0 })
  }

  // จองสิทธิ์ส่ง "ก่อน" ยิง LINE — ถ้าจองทีหลังจะมีช่องให้สองตัวจับเวลาส่งพร้อมกันได้
  // ignoreDuplicates ทำให้ PostgREST ใช้ ON CONFLICT DO NOTHING แล้ว .select() คืนเฉพาะแถวที่ insert จริง
  const claim = await supabase
    .from("cron_sends")
    .upsert(
      { job: "birthday-reminder", run_date: today, source },
      { onConflict: "job,run_date", ignoreDuplicates: true }
    )
    .select("run_date")
  if (claim.error) {
    console.error("birthday-reminder claim failed", claim.error.message)
    return NextResponse.json({ ok: false, error: claim.error.message })
  }
  const claimed = (claim.data ?? []).length > 0
  if (!claimed && !force) {
    return NextResponse.json({ ok: true, skipped: "already-sent", birthdays: birthdays.length })
  }

  const names = birthdays.map((b) => b.nickname || b.name)

  // Web Push เป็นทางหลัก — ไม่พึ่งโควตา LINE และถึงมือถือแม้ไม่มีใครเปิดเว็บ
  // (ตรวจข้อมูลจริง 20/8/2569: 30 วันย้อนหลังส่งอวยพรจริงแค่ 3 จาก 10 คน
  //  ช่วงที่หลุดตรงกับตอนที่โควตา OA ผู้ช่วยเต็มพอดี — ข้อความเตือนเข้ากลุ่มไม่ออกเลย)
  const pushResult = await sendPushToStaff(birthdayPushPayload(names)!)
  const lineSent = await pushAssistantMessage(
    process.env.LINE_ASSISTANT_QUEUE_GROUP_ID ?? "",
    msgBirthdayReminder(names)
  )
  // ถือว่าสำเร็จเมื่อ "ถึงพนักงานอย่างน้อยหนึ่งทาง" — ไลน์ล้มแต่ push ถึงแล้ว
  // ห้ามคืนสิทธิ์ให้ตัวสำรองมายิงซ้ำ ไม่งั้นพนักงานโดนเตือนวันเกิดซ้ำทั้งวัน
  const sent = pushResult.sent > 0 || lineSent

  // ส่งไม่สำเร็จ = คืนสิทธิ์ให้ตัวสำรองลองใหม่ ไม่งั้นแถวที่จองค้างไว้จะบล็อกทั้งวัน
  // ลบเฉพาะแถวที่ "เราเป็นคนจอง" รอบนี้ — เคส force ที่ไปเจอแถวเดิมของคนอื่นต้องไม่โดนลบ
  if (!sent && claimed) {
    const rollback = await supabase
      .from("cron_sends")
      .delete()
      .eq("job", "birthday-reminder")
      .eq("run_date", today)
    if (rollback.error) {
      console.error("birthday-reminder rollback failed", rollback.error.message)
    }
  }

  return NextResponse.json({
    ok: sent,
    birthdays: birthdays.length,
    pushed: pushResult.sent,
    lineSent,
    source,
  })
}
