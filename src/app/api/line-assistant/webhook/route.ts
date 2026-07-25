import { NextResponse } from "next/server"

import { verifyLineSignature } from "@/lib/line-signature"
import { createServiceClient } from "@/lib/supabase/service"

/** webhook ของ OA ผู้ช่วย — งานเดียว: จับ group_id ของกลุ่มที่ OA ถูกเชิญเข้า
 *  ลง line_groups ให้เจ้าของร้านคัดไปใส่ env LINE_ASSISTANT_QUEUE_GROUP_ID
 *  ไม่ตอบข้อความกลับ (OA ผู้ช่วยเป็นฝ่ายส่งอย่างเดียว) · route นี้ public (อยู่ใน PUBLIC_ROUTES ของ proxy) */

type LineEvent = { source?: { type?: string; groupId?: string } }

export async function POST(req: Request) {
  // ต้องอ่าน raw body ก่อน parse — ลายเซ็นคำนวณจาก byte ตรงๆ
  const raw = await req.text()
  const ok = verifyLineSignature(
    raw,
    req.headers.get("x-line-signature"),
    process.env.LINE_ASSISTANT_CHANNEL_SECRET
  )
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  // ลายเซ็นผ่านแล้วต้องตอบ 200 เสมอ — ถ้าตอบ error LINE จะ retry รัวๆ และอาจปิด webhook
  try {
    const body = JSON.parse(raw) as { events?: LineEvent[] }
    const groupIds = [
      ...new Set(
        (body.events ?? [])
          .filter((e) => e.source?.type === "group" && e.source.groupId)
          .map((e) => e.source!.groupId!)
      ),
    ]
    if (groupIds.length > 0) {
      const db = createServiceClient()
      const now = new Date().toISOString()
      await db
        .from("line_groups")
        .upsert(groupIds.map((groupId) => ({ group_id: groupId, last_seen_at: now })))
    }
  } catch (e) {
    console.error("line-assistant webhook failed:", e)
  }
  return NextResponse.json({})
}
