import "server-only"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

/**
 * Client สิทธิ์เต็ม (service role) — ใช้เฉพาะ server actions ของโซน /book
 * ที่ตรวจ LINE idToken แล้วเท่านั้น ห้าม import จากที่อื่น
 * (ลูกค้าไลน์ไม่ใช่ผู้ใช้ Supabase auth จึงผ่าน RLS แบบพนักงานไม่ได้)
 */
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
