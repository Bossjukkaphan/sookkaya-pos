import { NextResponse, type NextRequest } from "next/server"

import { createServiceClient } from "@/lib/supabase/service"
import { pushAssistantMessage } from "@/lib/line-assistant"
import { cronRequestAuthorized } from "@/lib/cron-auth"

/** ท่อพรีวิวร่างข้อความเข้ากลุ่ม Sookkaya Management — ให้เจ้าของร้านตรวจก่อนส่งจริง
 *  ไม่ใช่ cron ตามเวลา แต่พักใต้ /api/cron เพื่อใช้ด่านตรวจสิทธิ์ชุดเดียวกัน (cron-auth)
 *  ยิงจาก SQL Editor: สร้าง vault entry เก็บ URL ที่ encode ?text= แล้ว
 *  select public.trigger_cron_route('<ชื่อ entry>') — เสร็จแล้วลบ entry ทิ้ง
 *  ส่งได้เฉพาะกลุ่มผู้บริหารเท่านั้น จงใจไม่รับ userId ปลายทาง — กันท่อนี้กลายเป็นช่องยิงหาลูกค้า */
export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  if (!(await cronRequestAuthorized(supabase, request.headers.get("authorization")))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const text = request.nextUrl.searchParams.get("text") ?? ""
  // LINE จำกัด text message ที่ 5000 ตัวอักษร — ตัดตั้งแต่ต้นทางพร้อมบอกเหตุผล
  if (!text.trim() || text.length > 5000) {
    return NextResponse.json({ ok: false, error: "text ว่างหรือยาวเกิน 5000 ตัวอักษร" })
  }

  const sent = await pushAssistantMessage(process.env.LINE_MANAGEMENT_GROUP_ID ?? "", text)
  return NextResponse.json({ ok: sent, chars: text.length })
}
