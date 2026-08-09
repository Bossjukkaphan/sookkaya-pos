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

/** แปลง jsonb จาก RPC — เพี้ยนตรงไหนคืนค่าว่างส่วนนั้น layout ต้องไม่ล้มเพราะแจ้งเตือน */
export function parseLayoutBootstrap(raw: unknown): LayoutBootstrap {
  if (!raw || typeof raw !== "object") return EMPTY
  const o = raw as Record<string, unknown>
  const reminders = Array.isArray(o.expense_reminders) ? o.expense_reminders : []
  return {
    profile: (o.profile as MyProfile | null) ?? null,
    pendingCount: typeof o.pending_count === "number" ? o.pending_count : 0,
    birthdays: Array.isArray(o.birthdays)
      ? (o.birthdays as LayoutBootstrap["birthdays"])
      : [],
    // SQL ส่ง duty+due ดิบ — ประกอบ label ไทยที่นี่ด้วยฟังก์ชันเดิม จะได้ไม่ก๊อปข้อความลง SQL
    expenseReminders: reminders.map((r) => {
      const { duty, due } = r as { duty: ExpenseDuty; due: string }
      return { duty, label: expenseReminderLabel(duty, due) }
    }),
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
