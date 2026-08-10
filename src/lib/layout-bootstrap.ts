import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"
import type { MyProfile } from "@/lib/auth"
import {
  expenseReminderLabel,
  type ExpenseDuty,
  type ExpenseReminder,
} from "@/lib/expense-reminders"

export type LayoutBootstrap = {
  profile: MyProfile | null
  pendingCount: number
  birthdays: { id: string; name: string; nickname: string | null }[]
  expenseReminders: ExpenseReminder[]
}

const EMPTY: LayoutBootstrap = {
  profile: null,
  pendingCount: 0,
  birthdays: [],
  expenseReminders: [],
}

/** แปลง jsonb จาก RPC — เพี้ยนตรงไหนคืนค่าว่างส่วนนั้น layout ต้องไม่ล้มเพราะแจ้งเตือน
 *  รวมถึงสมาชิกใน array ที่เพี้ยนเป็นรายตัว (เช่น null, ไม่ใช่ object) — คัดทิ้งก่อน map
 *  ไม่งั้น destructure ตัวที่เพี้ยนจะ throw ทั้งที่สมาชิกตัวอื่นในลิสต์ยังดีอยู่ */
export function parseLayoutBootstrap(raw: unknown): LayoutBootstrap {
  if (!raw || typeof raw !== "object") return EMPTY
  const o = raw as Record<string, unknown>
  const reminders = Array.isArray(o.expense_reminders) ? o.expense_reminders : []
  const birthdaysRaw = Array.isArray(o.birthdays) ? o.birthdays : []
  return {
    profile: (o.profile as MyProfile | null) ?? null,
    pendingCount: typeof o.pending_count === "number" ? o.pending_count : 0,
    birthdays: birthdaysRaw.filter(
      (b): b is LayoutBootstrap["birthdays"][number] =>
        !!b &&
        typeof b === "object" &&
        typeof (b as Record<string, unknown>).id === "string" &&
        typeof (b as Record<string, unknown>).name === "string"
    ),
    // SQL ส่ง duty+due ดิบ — ประกอบ label ไทยที่นี่ด้วยฟังก์ชันเดิม จะได้ไม่ก๊อปข้อความลง SQL
    // คัดตัวที่ไม่ใช่ object หรือไม่มี duty/due เป็น string ทิ้งก่อน ป้องกัน throw ตอน destructure
    expenseReminders: reminders
      .filter(
        (r): r is { duty: ExpenseDuty; due: string } =>
          !!r &&
          typeof r === "object" &&
          typeof (r as Record<string, unknown>).duty === "string" &&
          typeof (r as Record<string, unknown>).due === "string"
      )
      .map((r) => ({ duty: r.duty, label: expenseReminderLabel(r.duty, r.due) })),
  }
}

/**
 * ข้อมูล layout ทั้งชุดใน round trip เดียว — แทน getMyProfile + 3 query เดิม
 * error → degrade เงียบ (ทุกอย่างว่าง role ตก "staff") เท่าพฤติกรรมเดิมตอน query ล้ม
 */
export async function layoutBootstrap(
  supabase: SupabaseClient<Database>,
  todayIso: string
): Promise<LayoutBootstrap> {
  const { data, error } = await supabase.rpc("layout_bootstrap", { p_today: todayIso })
  if (error) {
    console.error("layout_bootstrap ล้ม — แจ้งเตือนบนกระดิ่งจะว่างชั่วคราว:", error)
    return EMPTY
  }
  return parseLayoutBootstrap(data)
}
