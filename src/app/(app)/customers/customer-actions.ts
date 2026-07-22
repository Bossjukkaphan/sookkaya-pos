"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"

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
