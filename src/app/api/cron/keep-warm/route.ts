import { NextResponse, type NextRequest } from "next/server"

import { createServiceClient } from "@/lib/supabase/service"
import { cronRequestAuthorized } from "@/lib/cron-auth"

/** กัน cold start ของ Vercel serverless — pg_cron ping ทุก 5 นาทีช่วงเวลาร้าน
 *  (job keep-warm-5min-ict, 08:00-23:55 ไทย) ให้ function ตื่นอยู่เสมอ
 *  ตอนพนักงาน/เจ้าของร้านเปิดระบบครั้งแรกของวันจะได้ไม่เจอจอขาวหลายวินาที
 *
 *  เหตุที่แก้ที่นี่: วัดแล้วฐานข้อมูลเร็วมาก (query หนักสุด ~21ms) — ความช้าตอนเปิดใหม่
 *  มาจากการ boot function ล้วนๆ ดู docs/ops/exact-time-crons.md
 *
 *  จงใจไม่แตะ cron_sends (ไม่มีอะไรต้องกันซ้ำ) และไม่ยิง query เพิ่ม —
 *  แค่ผ่านด่านตรวจสิทธิ์ (ซึ่งอุ่นเส้นทางเชื่อม Supabase ให้ด้วยในตัว) แล้วจบ */
export async function GET(request: NextRequest) {
  // route อยู่ใต้ /api/cron ซึ่ง PUBLIC_ROUTES ปล่อยผ่าน จึงต้องกันคนนอกเอง
  const supabase = createServiceClient()
  if (!(await cronRequestAuthorized(supabase, request.headers.get("authorization")))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  return NextResponse.json({ ok: true, warmedAt: new Date().toISOString() })
}
