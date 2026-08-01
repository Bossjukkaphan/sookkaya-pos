import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"
import { daysUntilBirthday } from "@/lib/crm"

export type BirthdayCustomer = { id: string; name: string; nickname: string | null }

/** ลูกค้าที่ "วันเกิดวันนี้" ตามกติกาเดียวกับลิสต์ /crm เป๊ะ:
 *  เดือน-วันตรงวันนี้ (เวลาไทย) · มีเบอร์ · ยังไม่ถูกบันทึกผล birthday ใน 30 วัน
 *  รับ client เป็นพารามิเตอร์ — layout ใช้สิทธิ์พนักงาน, cron ใช้ service ได้ทั้งคู่
 *  (ตัวเลขนี้โชว์บนกระดิ่ง + ข้อความเข้ากลุ่มทีมร้าน ถ้ากติกาไม่ตรง /crm พนักงานจะงงว่าหายไปไหน) */
export async function birthdayTodayCustomers(
  supabase: SupabaseClient<Database>,
  todayIso: string
): Promise<BirthdayCustomer[]> {
  const cooldownSince = new Date(
    Date.parse(`${todayIso}T00:00:00Z`) - 30 * 86400000
  ).toISOString()

  const [{ data: customers }, { data: contacts }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, nickname, birthday")
      .not("birthday", "is", null)
      .not("phone", "is", null),
    supabase
      .from("crm_contacts")
      .select("customer_id")
      .eq("list_type", "birthday")
      .gte("created_at", cooldownSince),
  ])

  const contacted = new Set((contacts ?? []).map((c) => c.customer_id))
  return (customers ?? [])
    .filter(
      (c) =>
        c.birthday &&
        daysUntilBirthday(c.birthday, todayIso) === 0 &&
        !contacted.has(c.id)
    )
    .map((c) => ({ id: c.id, name: c.name, nickname: c.nickname }))
}
