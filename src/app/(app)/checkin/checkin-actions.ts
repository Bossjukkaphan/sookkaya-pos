"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"

type Result = { ok: true } | { ok: false; error: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function refresh() {
  revalidatePath("/checkin")
  revalidatePath("/queue")
}

/** ติ๊กเข้างาน/ยกเลิก — ระบุ therapistId หรือ staffId อย่างใดอย่างหนึ่ง */
export async function toggleCheckin(
  workDate: string,
  person: { therapistId?: string; staffId?: string },
  checkedIn: boolean
): Promise<Result> {
  if (!DATE_RE.test(workDate)) return { ok: false, error: "วันที่ไม่ถูกต้อง" }
  const hasTherapist = Boolean(person.therapistId)
  const hasStaff = Boolean(person.staffId)
  if (hasTherapist === hasStaff) return { ok: false, error: "ระบุคนไม่ถูกต้อง" }

  const supabase = await createClient()
  const key = hasTherapist
    ? { column: "therapist_id" as const, id: person.therapistId! }
    : { column: "staff_id" as const, id: person.staffId! }

  if (checkedIn) {
    const me = await getMyProfile()
    const { error } = await supabase.from("attendance").insert({
      work_date: workDate,
      therapist_id: hasTherapist ? person.therapistId! : null,
      staff_id: hasStaff ? person.staffId! : null,
      created_by: me?.full_name ?? me?.email ?? null,
    })
    // กดซ้ำ/สองเครื่องพร้อมกัน → ชน unique = เช็คอินอยู่แล้ว ถือว่าสำเร็จ
    if (error && error.code !== "23505") return { ok: false, error: error.message }
  } else {
    const { error } = await supabase
      .from("attendance")
      .delete()
      .eq("work_date", workDate)
      .eq(key.column, key.id)
    if (error) return { ok: false, error: error.message }
  }
  refresh()
  return { ok: true }
}

/** บันทึกเวลาออกงาน */
export async function checkOut(attendanceId: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("attendance")
    .update({ checked_out_at: new Date().toISOString() })
    .eq("id", attendanceId)
  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true }
}

/** เพิ่มพนักงาน (ผู้จัดการ/ผู้ช่วยผู้จัดการ/พ่อบ้าน/อื่นๆ) */
export async function addStaffMember(name: string, role: string): Promise<Result> {
  const cleanName = name.trim()
  const cleanRole = role.trim()
  if (!cleanName) return { ok: false, error: "กรุณากรอกชื่อ" }
  if (!cleanRole) return { ok: false, error: "กรุณาระบุตำแหน่ง" }
  const supabase = await createClient()
  const { error } = await supabase
    .from("staff_members")
    .insert({ name: cleanName, role: cleanRole })
  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true }
}

/** ปิดพนักงานที่ลาออก — ไม่ลบ ประวัติเข้างานยังอยู่ */
export async function deactivateStaffMember(id: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("staff_members")
    .update({ is_active: false })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true }
}
