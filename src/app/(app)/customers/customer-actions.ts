"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { todayInShopTz } from "@/lib/datetime"
import { pointExpiryDate } from "@/lib/points"

export type CustomerResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

function clean(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? "").trim()
  return s === "" ? null : s
}

export async function saveCustomer(formData: FormData): Promise<CustomerResult> {
  const supabase = await createClient()

  const name = String(formData.get("name") ?? "").trim()
  if (!name) return { ok: false, error: "กรุณากรอกชื่อลูกค้า" }

  // เพศรับเฉพาะค่าในชุดที่กำหนด — ค่าเพี้ยนเก็บเป็น null (ไม่ทราบ) ไม่เดา
  const genderInput = String(formData.get("gender") ?? "")
  const payload = {
    name,
    nickname: clean(formData.get("nickname")),
    phone: clean(formData.get("phone")),
    line_id: clean(formData.get("line_id")),
    birthday: clean(formData.get("birthday")),
    notes: clean(formData.get("notes")),
    gender: ["ชาย", "หญิง", "อื่นๆ"].includes(genderInput) ? genderInput : null,
    nationality: clean(formData.get("nationality")),
    updated_at: new Date().toISOString(),
  }

  const id = clean(formData.get("id"))

  if (id) {
    const { error } = await supabase.from("customers").update(payload).eq("id", id)
    if (error) return { ok: false, error: `บันทึกไม่สำเร็จ: ${error.message}` }
    revalidatePath(`/customers/${id}`)
    revalidatePath("/customers")
    return { ok: true, id }
  }

  const { data, error } = await supabase
    .from("customers")
    .insert(payload)
    .select("id")
    .single()

  if (error) return { ok: false, error: `บันทึกไม่สำเร็จ: ${error.message}` }

  revalidatePath("/customers")
  return { ok: true, id: data.id }
}

/** ปรับแต้มมือ — เหตุผลบังคับ ตรวจย้อนได้จากสมุดบัญชีแต้มเสมอ */
export async function adjustPoints(
  customerId: string,
  delta: number,
  reasonRaw: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const reason = reasonRaw.trim()
  const rounded = Math.round(delta)
  if (!reason) return { ok: false, error: "กรุณากรอกเหตุผล" }
  if (!Number.isFinite(rounded) || rounded === 0) {
    return { ok: false, error: "จำนวนแต้มต้องไม่เป็นศูนย์" }
  }

  // ห้ามหักจนติดลบ
  if (rounded < 0) {
    const { data: balanceRow } = await supabase
      .from("v_point_balances")
      .select("balance")
      .eq("customer_id", customerId)
      .maybeSingle()
    if ((balanceRow?.balance ?? 0) + rounded < 0) {
      return {
        ok: false,
        error: `หักไม่ได้ แต้มคงเหลือ ${balanceRow?.balance ?? 0} แต้ม`,
      }
    }
  }

  const me = await getMyProfile()
  const { error } = await supabase.from("point_transactions").insert({
    customer_id: customerId,
    delta: rounded,
    reason: `ปรับมือ: ${reason}`,
    created_by: me?.full_name ?? me?.email ?? null,
    ...(rounded > 0 ? { expires_at: pointExpiryDate(todayInShopTz()) } : {}),
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/customers/${customerId}`)
  return { ok: true }
}
