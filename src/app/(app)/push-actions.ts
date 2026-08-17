"use server"

import { createClient } from "@/lib/supabase/server"

type Result = { ok: true } | { ok: false; error: string }

/** เก็บ/อัปเดตการสมัครรับแจ้งเตือนของ "เครื่องนี้" ผูกกับผู้ใช้ที่ล็อกอินอยู่
 *
 *  endpoint คือรหัสประจำเครื่อง — ผู้ให้บริการ push อาจออกให้ใหม่ได้ (ล้างข้อมูล/ติดตั้งใหม่)
 *  จึง upsert ตาม endpoint: เครื่องเดิมสมัครซ้ำไม่เกิดแถวซ้ำ และถ้าเปลี่ยนคนล็อกอิน
 *  บนเครื่องเดียวกัน เจ้าของแถวจะย้ายตามคนล่าสุด (การแจ้งเตือนจะไปหาคนที่ใช้เครื่องอยู่จริง)
 */
export async function savePushSubscription(sub: {
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string
}): Promise<Result> {
  if (!sub.endpoint || !sub.p256dh || !sub.auth)
    return { ok: false, error: "ข้อมูลการสมัครไม่ครบ" }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "ต้องเข้าสู่ระบบก่อน" }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: (sub.userAgent ?? "").slice(0, 300) || null,
    },
    { onConflict: "endpoint" }
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** ปิดแจ้งเตือนบนเครื่องนี้ — ลบเฉพาะแถวของ endpoint นี้ เครื่องอื่นของคนเดียวกันไม่กระทบ */
export async function removePushSubscription(endpoint: string): Promise<Result> {
  if (!endpoint) return { ok: false, error: "ไม่พบเครื่องนี้" }
  const supabase = await createClient()
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
