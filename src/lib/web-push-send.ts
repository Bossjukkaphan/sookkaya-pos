import "server-only"

import webpush from "web-push"

import { createServiceClient } from "@/lib/supabase/service"
import type { PushPayload } from "./push-message"

/** ตั้งค่า VAPID ครั้งเดียวต่อ instance — ไม่มีคีย์ = ฟีเจอร์หลับ (ไม่ throw)
 *  คีย์สาธารณะต้องเป็น NEXT_PUBLIC_ เพราะฝั่งเบราว์เซอร์ใช้ตอนสมัครรับการแจ้งเตือน */
function vapidReady(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return false
  try {
    // setVapidDetails โยน exception แบบ sync ถ้าคีย์/subject รูปแบบผิด
    // (เช่น subject ไม่มี mailto: หรือคีย์ติดขึ้นบรรทัดใหม่ตอน paste เข้า env)
    // ปล่อยให้หลุดออกไปไม่ได้เด็ดขาด — ผู้เรียกคือเส้นทางจองของลูกค้าและ cron
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:boss.jukkaphan@gmail.com",
      publicKey,
      privateKey
    )
    return true
  } catch (e) {
    console.error("web-push: VAPID keys ไม่ถูกต้อง — ข้ามการส่ง", e)
    return false
  }
}

export type PushResult = { sent: number; failed: number; removed: number }

/**
 * ส่งการแจ้งเตือนถึง "ทุกเครื่องที่พนักงานเปิดไว้" — ใช้ได้แม้ไม่มีใครเปิดหน้าเว็บ
 *
 * ทำไมต้องมี: เดิมการเตือนคิวจองใหม่พึ่งสองทางที่พังพร้อมกันได้ —
 * เสียง/ป้ายในเว็บ (ต้องมีคนเปิดจอค้างไว้) กับข้อความเข้ากลุ่มไลน์ (โควตา OA เต็ม)
 * 17/8/2569 พังทั้งคู่พร้อมกัน คิวจึงเงียบไป 93 นาที
 *
 * ห้าม throw เด็ดขาด — การจองของลูกค้าต้องสำเร็จเสมอแม้ส่งเตือนไม่ได้
 * เครื่องที่ผู้ให้บริการตอบ 404/410 = ถอนการติดตั้ง/ล้างข้อมูลไปแล้ว ลบทิ้งเลย
 * ไม่งั้นแถวตายค้างสะสมและถูกยิงซ้ำทุกครั้งไปเรื่อยๆ
 */
export async function sendPushToStaff(payload: PushPayload): Promise<PushResult> {
  try {
    return await sendPushToStaffInner(payload)
  } catch (e) {
    // ห้าม throw ออกไปเด็ดขาด — ผู้เรียกคือการจองของลูกค้า (ต้องสำเร็จเสมอ)
    // และ cron ที่จองสิทธิ์ส่งไว้ก่อนแล้ว (throw = วันนั้นไม่มีใครได้รับอะไรเลย)
    console.error("web-push: ส่งล้มเหลวแบบไม่คาดคิด", e)
    return { sent: 0, failed: 0, removed: 0 }
  }
}

async function sendPushToStaffInner(payload: PushPayload): Promise<PushResult> {
  const empty: PushResult = { sent: 0, failed: 0, removed: 0 }
  if (!vapidReady()) {
    console.error("web-push: ยังไม่ได้ตั้ง VAPID keys — ข้ามการส่ง")
    return empty
  }
  const db = createServiceClient()
  const { data: subs, error } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
  if (error) {
    console.error("web-push: อ่านรายชื่อเครื่องไม่สำเร็จ", error.message)
    return empty
  }
  if (!subs || subs.length === 0) return empty

  const body = JSON.stringify(payload)
  const deadIds: string[] = []
  const aliveIds: string[] = []

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body
      )
    )
  )

  results.forEach((r, i) => {
    const sub = subs[i]
    if (r.status === "fulfilled") {
      aliveIds.push(sub.id)
      return
    }
    const status = (r.reason as { statusCode?: number })?.statusCode
    if (status === 404 || status === 410) {
      deadIds.push(sub.id)
    } else {
      console.error("web-push: ส่งไม่สำเร็จ", status ?? "unknown", sub.endpoint.slice(0, 40))
    }
  })

  if (aliveIds.length > 0) {
    await db
      .from("push_subscriptions")
      .update({ last_success_at: new Date().toISOString() })
      .in("id", aliveIds)
  }
  if (deadIds.length > 0) {
    await db.from("push_subscriptions").delete().in("id", deadIds)
  }

  return {
    sent: aliveIds.length,
    failed: results.length - aliveIds.length - deadIds.length,
    removed: deadIds.length,
  }
}
