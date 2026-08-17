import { NextResponse, type NextRequest } from "next/server"

import { createServiceClient } from "@/lib/supabase/service"
import { cronRequestAuthorized } from "@/lib/cron-auth"
import { pendingReminderPayload } from "@/lib/push-message"
import { sendPushToStaff } from "@/lib/web-push-send"

/** ค้างเกินเท่านี้ถือว่า "ยังไม่มีใครตอบ" — สั้นกว่านี้จะไปแย่งกับการเตือนตอนจองจริง */
const REMIND_AFTER_MIN = 5

/**
 * ตาข่ายกันคิวจองหลุด — เตือนซ้ำเข้ามือถือพนักงานทุก 10 นาทีจนกว่าจะกดรับ/ปฏิเสธ
 *
 * เหตุที่ต้องมีทั้งที่มีการเตือนตอนจองอยู่แล้ว: การเตือนครั้งเดียวมีทางตกได้หลายแบบ
 * (เครื่องปิดอยู่ตอนนั้น · push ตกหล่น · พนักงานปัดทิ้งโดยไม่ทันอ่าน)
 * 17/8/2569 คำขอค้าง 93 นาทีโดยไม่มีใครรู้ เพราะไม่มีอะไรถามซ้ำเลยสักครั้ง
 *
 * ใช้ tag เดียวกันทุกรอบ (ดู pendingReminderPayload) การเตือนรอบใหม่จึงทับอันเก่า
 * ไม่กองเป็นตับบนหน้าจอ · ตารางเวลาให้ยิงเฉพาะช่วงร้านเปิด ไม่กวนตอนดึก
 */
export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  if (!(await cronRequestAuthorized(supabase, request.headers.get("authorization")))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - REMIND_AFTER_MIN * 60_000).toISOString()
  const { data, error } = await supabase
    .from("queue_entries")
    .select("customer_name, queue_date, start_time, created_at")
    .eq("status", "pending")
    .lt("created_at", cutoff)
  if (error) return NextResponse.json({ ok: false, error: error.message })

  const now = Date.now()
  const payload = pendingReminderPayload(
    (data ?? []).map((e) => ({
      customerName: e.customer_name ?? "",
      queueDate: e.queue_date,
      startTime: e.start_time.slice(0, 5),
      waitedMin: Math.round((now - Date.parse(e.created_at)) / 60_000),
    }))
  )
  if (!payload) return NextResponse.json({ ok: true, pending: 0 })

  const result = await sendPushToStaff(payload)
  return NextResponse.json({ ok: true, pending: data?.length ?? 0, ...result })
}
