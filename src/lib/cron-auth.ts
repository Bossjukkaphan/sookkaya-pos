import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"

/** ของกลางสำหรับทุก cron route (daily-report, birthday-reminder, ...)
 *  แพตเทิร์น: pg_cron ยิงตรงเวลา + Vercel cron ตัวสำรอง + ตาราง cron_sends กันส่งซ้ำ
 *  ไม่ import "server-only" เพราะฟังก์ชันล้วนต้องเทสได้ใน vitest (แบบเดียวกับ daily-report.ts) */

/** ตัวจับเวลาที่ยิง cron route ได้ — ต้องตรงกับ CHECK constraint ของ cron_sends.source
 *  pg_cron = ตัวหลัก ยิงตรงเวลา · vercel_cron = ตัวสำรอง (Hobby เลื่อนได้ถึง 1 ชม.) · manual = ยิงมือตอนตรวจ */
export const TRIGGER_SOURCES = ["pg_cron", "vercel_cron", "manual"] as const

export type TriggerSource = (typeof TRIGGER_SOURCES)[number]

/** อ่านค่า ?source= จาก query string — ค่าแปลกปลอมตกเป็น vercel_cron
 *  ห้ามส่งค่าดิบเข้าฐานข้อมูล CHECK constraint จะปัดตกแล้วข้อความจะไม่ถูกส่งทั้งรอบ */
export function triggerSourceOf(raw: string | null | undefined): TriggerSource {
  const found = TRIGGER_SOURCES.find((s) => s === raw)
  return found ?? "vercel_cron"
}

/** สองประตูตรวจสิทธิ์ เพราะสองระบบถือ secret คนละที่ที่ sync กันด้วยมือไม่ได้:
 *    Vercel cron → env CRON_SECRET ที่ Vercel ใส่ header ให้เองตอนยิง
 *    pg_cron     → vault secret pos_cron_secret ตรวจผ่าน RPC (migration 20260808185232) */
export async function cronRequestAuthorized(
  supabase: SupabaseClient<Database>,
  authorizationHeader: string | null
): Promise<boolean> {
  const auth = authorizationHeader ?? ""
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : ""
  if (Boolean(process.env.CRON_SECRET) && bearer === process.env.CRON_SECRET) {
    return true
  }
  // เช็ครูปแบบก่อนยิง RPC — ไม่ให้ request มั่วๆ จากอินเทอร์เน็ตเผาคิวรีฐานข้อมูลฟรี
  // (secret ใน Vault มาจาก gen_random_bytes(32) เป็น hex 64 ตัวเสมอ)
  if (!/^[0-9a-f]{64}$/.test(bearer)) return false
  const check = await supabase.rpc("cron_secret_matches", { candidate: bearer })
  return check.data === true
}
