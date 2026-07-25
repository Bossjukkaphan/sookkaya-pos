"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"

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
