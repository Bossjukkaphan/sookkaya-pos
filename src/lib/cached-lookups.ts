import { unstable_cache } from "next/cache"

import { createServiceClient } from "@/lib/supabase/service"
import type { Tables } from "@/types/database"

/**
 * ตัวอ่านข้อมูลกึ่งนิ่งที่ทุกหน้าใช้ซ้ำ — cache ข้ามผู้ใช้ ล้างด้วย updateTag ตอนกดบันทึก
 * (ไม่ตั้งเวลาหมดอายุ: ความสดผูกกับปุ่มบันทึกโดยตรง จึงไม่มีทางเห็นข้อมูลเก่า)
 *
 * ใช้ service client เพราะฟังก์ชันใน unstable_cache ห้ามอ่าน cookies (ข้อจำกัด Next)
 * ปลอดภัยเพราะ: สามตารางนี้ staff อ่านได้ตาม RLS อยู่แล้ว · เรียกได้จากหน้าในโซน (app)
 * ที่ proxy บังคับ login เท่านั้น · module นี้เป็น server-only ผ่าน service.ts
 */
export const getTherapistsCached = unstable_cache(
  async (): Promise<Tables<"therapists">[]> => {
    const { data, error } = await createServiceClient()
      .from("therapists").select("*").order("name")
    if (error) throw error
    return data
  },
  ["therapists-all"],
  { tags: ["therapists"] }
)

export const getServicesCached = unstable_cache(
  async (): Promise<Tables<"services">[]> => {
    const { data, error } = await createServiceClient()
      .from("services").select("*").order("name")
    if (error) throw error
    return data
  },
  ["services-all"],
  { tags: ["services"] }
)

export const getShopSettingsCached = unstable_cache(
  async (): Promise<Tables<"settings">[]> => {
    const { data, error } = await createServiceClient().from("settings").select("*")
    if (error) throw error
    return data
  },
  ["settings-all"],
  { tags: ["settings"] }
)
