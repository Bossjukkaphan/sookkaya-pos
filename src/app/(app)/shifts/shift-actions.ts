"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"

type Result = { ok: true } | { ok: false; error: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function requireManager() {
  const me = await getMyProfile()
  if (!me || !["admin", "manager"].includes(me.role)) return null
  return me
}

function refresh() {
  revalidatePath("/shifts")
  revalidatePath("/checkin")
  revalidatePath("/team")
}

/** ตั้ง/สลับแผนของคนในวันหนึ่ง — plan null = กลับเป็นทำงานปกติ (ลบแถว) */
export async function setShiftPlan(
  workDate: string,
  person: { therapistId?: string; staffId?: string },
  plan: "off" | "leave" | null
): Promise<Result> {
  if (!DATE_RE.test(workDate)) return { ok: false, error: "วันที่ไม่ถูกต้อง" }
  const hasTherapist = Boolean(person.therapistId)
  if (hasTherapist === Boolean(person.staffId)) {
    return { ok: false, error: "ระบุคนไม่ถูกต้อง" }
  }
  const me = await requireManager()
  if (!me) return { ok: false, error: "เฉพาะผู้จัดการ/แอดมินเท่านั้น" }

  const supabase = await createClient()
  const key = hasTherapist
    ? { column: "therapist_id" as const, id: person.therapistId! }
    : { column: "staff_id" as const, id: person.staffId! }

  // เขียนแบบลบก่อนใส่ใหม่ — กดสลับซ้ำๆ ได้ผลตรงตามที่เห็นเสมอ
  const { error: delError } = await supabase
    .from("shift_plans")
    .delete()
    .eq("work_date", workDate)
    .eq(key.column, key.id)
  if (delError) return { ok: false, error: delError.message }

  if (plan) {
    const { error } = await supabase.from("shift_plans").insert({
      work_date: workDate,
      therapist_id: hasTherapist ? person.therapistId! : null,
      staff_id: hasTherapist ? null : person.staffId!,
      plan,
      created_by: me.full_name ?? me.email ?? null,
    })
    if (error && error.code !== "23505") return { ok: false, error: error.message }
  }
  refresh()
  return { ok: true }
}

/** คัดลอกแผนของสัปดาห์ก่อนหน้า (7 วันก่อน) มาใส่สัปดาห์เป้าหมาย — เฉพาะช่องที่ยังว่าง */
export async function copyPreviousWeek(weekStart: string): Promise<Result> {
  if (!DATE_RE.test(weekStart)) return { ok: false, error: "วันที่ไม่ถูกต้อง" }
  const me = await requireManager()
  if (!me) return { ok: false, error: "เฉพาะผู้จัดการ/แอดมินเท่านั้น" }

  const supabase = await createClient()
  const shift = (iso: string, days: number) => {
    const d = new Date(iso + "T00:00:00Z")
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }
  const prevStart = shift(weekStart, -7)
  const prevEnd = shift(weekStart, -1)

  const { data: prevPlans, error } = await supabase
    .from("shift_plans")
    .select("work_date, therapist_id, staff_id, plan, note")
    .gte("work_date", prevStart)
    .lte("work_date", prevEnd)
  if (error) return { ok: false, error: error.message }
  if (!prevPlans || prevPlans.length === 0) {
    return { ok: false, error: "สัปดาห์ก่อนหน้าไม่มีแผนให้คัดลอก" }
  }

  // unique index กันซ้ำต่อคนต่อวันอยู่แล้ว — แถวที่ชน (ช่องที่จัดไว้แล้ว) ข้ามไปเงียบๆ
  for (const p of prevPlans) {
    await supabase.from("shift_plans").insert({
      work_date: shift(p.work_date, 7),
      therapist_id: p.therapist_id,
      staff_id: p.staff_id,
      plan: p.plan,
      note: p.note,
      created_by: me.full_name ?? me.email ?? null,
    })
  }
  refresh()
  return { ok: true }
}
