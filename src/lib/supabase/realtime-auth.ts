import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"

/**
 * ต้อง await ตัวนี้ก่อน channel.subscribe() เสมอ — subscribe ตอน mount
 * จะแข่งกับการโหลด session จากคุกกี้ ทำให้ channel join ด้วยสิทธิ์ anon
 * แล้ว RLS ฝั่ง realtime กรองทุก event ทิ้งเงียบๆ (สถานะยัง SUBSCRIBED ปกติ
 * เลยมองไม่เห็นว่าพัง) — token ที่ supabase-js ส่งตามระหว่าง join ไปไม่ถึง server
 */
export async function setRealtimeAuth(supabase: SupabaseClient<Database>) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session) await supabase.realtime.setAuth(session.access_token)
}
