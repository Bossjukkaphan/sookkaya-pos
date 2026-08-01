"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { pushLineMessage } from "@/lib/line"
import { validateCrmLineText, type CrmListType } from "@/lib/crm"

export type ContactResult = "contacted" | "booked" | "declined" | "wrong_number"

/** บันทึกผลการติดต่อ — แถวจะหลุดจากลิสต์ทันที กันติดต่อซ้ำซ้อน 30 วัน */
export async function saveCrmContact(
  customerId: string,
  listType: "birthday" | "winback" | "new_follow",
  result: ContactResult
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const me = await getMyProfile()
  const { error } = await supabase.from("crm_contacts").insert({
    customer_id: customerId,
    list_type: listType,
    result,
    created_by: me?.full_name ?? me?.email ?? null,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath("/crm")
  revalidatePath(`/customers/${customerId}`)
  return { ok: true }
}

/** ส่งข้อความหาลูกค้าผ่าน OA ไลน์ร้าน แล้วบันทึกผล "ติดต่อแล้ว" อัตโนมัติ
 *  ลำดับกันพลาด: ตรวจ login → ตรวจข้อความ → ตรวจว่าไลน์ผูกกับลูกค้าคนนี้จริง → push → insert
 *  (push ไม่สำเร็จ = ไม่บันทึกอะไรเลย ให้แถวอยู่ในลิสต์ต่อ) */
export async function sendCrmLineMessage(
  customerId: string,
  listType: CrmListType,
  lineUserId: string,
  text: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getMyProfile()
  if (!me) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" }

  const checked = validateCrmLineText(text)
  if (!checked.ok) return checked

  const supabase = await createClient()
  const { data: link } = await supabase
    .from("line_accounts")
    .select("line_user_id")
    .eq("line_user_id", lineUserId)
    .eq("customer_id", customerId)
    .maybeSingle()
  if (!link) return { ok: false, error: "ไลน์นี้ไม่ได้ผูกกับลูกค้าคนนี้" }

  const sent = await pushLineMessage(lineUserId, checked.text)
  if (!sent) return { ok: false, error: "ส่งไลน์ไม่สำเร็จ — ลองใหม่หรือโทรแทนนะคะ" }

  const { error } = await supabase.from("crm_contacts").insert({
    customer_id: customerId,
    list_type: listType,
    result: "contacted",
    note: "ส่งไลน์",
    created_by: me.full_name ?? me.email ?? null,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath("/crm")
  revalidatePath(`/customers/${customerId}`)
  return { ok: true }
}
