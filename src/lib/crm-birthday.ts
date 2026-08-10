import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"
import { daysUntilBirthday } from "@/lib/crm"

export type BirthdayCustomer = { id: string; name: string; nickname: string | null }

/** กติกาวันเกิดถูก replicate ไว้ใน SQL เดียวกับ `expenseReminders()`
 *  (supabase/migrations/20260809134246_layout_bootstrap.sql) — ไฟล์นี้ยังมี caller จริงที่ cron
 *
 *  ลูกค้าที่ "วันเกิดวันนี้" ตามกติกาเดียวกับลิสต์ /crm เป๊ะ:
 *  เดือน-วันตรงวันนี้ (เวลาไทย) · มีเบอร์ · ยังไม่ถูกบันทึกผล birthday ใน 30 วัน
 *  รับ client เป็นพารามิเตอร์ — layout ใช้สิทธิ์พนักงาน, cron ใช้ service ได้ทั้งคู่
 *  (ตัวเลขนี้โชว์บนกระดิ่ง + ข้อความเข้ากลุ่มทีมร้าน ถ้ากติกาไม่ตรง /crm พนักงานจะงงว่าหายไปไหน) */

/** Shared fetch: ดึง customers และ crm_contacts ตามกติกา 30 วัน cooldown */
async function fetchBirthdayData(
  supabase: SupabaseClient<Database>,
  todayIso: string
) {
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

  return {
    customers: customers ?? [],
    contacted: new Set((contacts ?? []).map((c) => c.customer_id)),
  }
}

export async function birthdayTodayCustomers(
  supabase: SupabaseClient<Database>,
  todayIso: string
): Promise<BirthdayCustomer[]> {
  const { customers, contacted } = await fetchBirthdayData(supabase, todayIso)

  return customers
    .filter(
      (c) =>
        c.birthday &&
        daysUntilBirthday(c.birthday, todayIso) === 0 &&
        !contacted.has(c.id)
    )
    .map((c) => ({ id: c.id, name: c.name, nickname: c.nickname }))
}

export async function birthdayUpcomingCustomers(
  supabase: SupabaseClient<Database>,
  todayIso: string
): Promise<(BirthdayCustomer & { daysUntil: 0 | 1 })[]> {
  const { customers, contacted } = await fetchBirthdayData(supabase, todayIso)

  return customers
    .filter(
      (c) =>
        c.birthday &&
        daysUntilBirthday(c.birthday, todayIso) <= 1 &&
        !contacted.has(c.id)
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      nickname: c.nickname,
      // birthday รับประกันไม่ null แล้วจาก .filter() ด้านบน แต่ TS ไม่สืบทอด narrowing
      // ข้าม callback คนละตัว — ยืนยันด้วย non-null assertion แทนการเช็กซ้ำ
      daysUntil: daysUntilBirthday(c.birthday!, todayIso) as 0 | 1,
    }))
    .sort((a, b) => a.daysUntil - b.daysUntil)
}
