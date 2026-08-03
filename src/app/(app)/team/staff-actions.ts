"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"

/**
 * แก้เงินเดือนตั้งต้น + สถานะยังทำงานของพนักงานประจำ
 *
 * base_salary ใช้เป็นยอดคาดหวังตอนยืนยันการจ่ายเงินเดือน (ดู payout-amounts.ts)
 * ปิด is_active = ลาออก → หลุดจากยอดคาดหวังเดือนถัดไปเอง งวดเก่าไม่กระทบเพราะยอดถูกแช่แข็งแล้ว
 *
 * ตาราง staff_members RLS เปิดกว้างให้ authenticated (จำเป็นสำหรับหน้าเช็คอิน)
 * จึงต้องกันสิทธิ์ใน action นี้แทน — เฉพาะผู้จัดการ/เจ้าของร้าน
 */
export async function updateStaffMember(
  id: string,
  input: { baseSalary: number; isActive: boolean }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getMyProfile()
  if (!me || !["admin", "manager"].includes(me.role)) {
    return { ok: false, error: "เฉพาะผู้จัดการ/เจ้าของร้านเท่านั้น" }
  }
  if (!Number.isFinite(input.baseSalary) || input.baseSalary < 0) {
    return { ok: false, error: "เงินเดือนต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป" }
  }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from("staff_members")
    .update({ base_salary: input.baseSalary, is_active: input.isActive })
    .eq("id", id)
    .select("id")
  if (error) return { ok: false, error: error.message }
  if (!updated || updated.length === 0) return { ok: false, error: "ไม่พบพนักงานคนนี้" }

  revalidatePath("/team")
  revalidatePath("/commission") // ยอดคาดหวังงวดเงินเดือนเปลี่ยนตาม
  return { ok: true }
}
