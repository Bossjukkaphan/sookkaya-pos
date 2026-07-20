"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import type { TablesInsert } from "@/types/database"

export type ActionResult = { ok: true } | { ok: false; error: string }

function fail(error: unknown): ActionResult {
  const e = error as { code?: string; message?: string }
  if (e?.code === "42501") {
    return { ok: false, error: "คุณไม่มีสิทธิ์แก้ไขข้อมูลส่วนนี้" }
  }
  return { ok: false, error: e?.message ?? "บันทึกไม่สำเร็จ" }
}

function refresh() {
  revalidatePath("/settings")
  revalidatePath("/pos")
  revalidatePath("/commission")
}

/* ---------------- หมอนวด ---------------- */

export async function saveTherapist(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const id = String(formData.get("id") ?? "").trim()
  const name = String(formData.get("name") ?? "").trim()
  const status = String(formData.get("status") ?? "active")

  if (!name) return { ok: false, error: "กรุณากรอกชื่อหมอนวด" }
  if (!["active", "resigned"].includes(status)) {
    return { ok: false, error: "สถานะไม่ถูกต้อง" }
  }

  const { error } = id
    ? await supabase.from("therapists").update({ name, status }).eq("id", id)
    : await supabase.from("therapists").insert({ name, status })

  if (error) return fail(error)
  refresh()
  return { ok: true }
}

/* ---------------- เมนูบริการ ---------------- */

export async function saveService(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const id = String(formData.get("id") ?? "").trim()
  const name = String(formData.get("name") ?? "").trim()
  const price = Number(formData.get("price"))
  const commission = Number(formData.get("commission"))
  const isActive = formData.get("is_active") === "on"

  if (!name) return { ok: false, error: "กรุณากรอกชื่อเมนู" }
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, error: "ราคาไม่ถูกต้อง" }
  }
  if (!Number.isFinite(commission) || commission < 0) {
    return { ok: false, error: "ค่ามือไม่ถูกต้อง" }
  }
  if (commission > price) {
    return { ok: false, error: "ค่ามือมากกว่าราคาขาย กรุณาตรวจสอบอีกครั้ง" }
  }

  // เก็บราคาเดิมไว้ก่อนทับ เผื่อต้องย้อนดูว่าปรับราคาจากเท่าไหร่
  const payload: TablesInsert<"services"> = {
    name,
    price,
    commission,
    is_active: isActive,
  }

  if (id) {
    const { data: current } = await supabase
      .from("services")
      .select("price, commission")
      .eq("id", id)
      .single()

    if (current && (current.price !== price || current.commission !== commission)) {
      payload.price_old = current.price
      payload.commission_old = current.commission
    }
  }

  const { error } = id
    ? await supabase.from("services").update(payload).eq("id", id)
    : await supabase.from("services").insert(payload)

  if (error) return fail(error)
  refresh()
  return { ok: true }
}

/* ---------------- ผู้ใช้ที่อนุญาต ---------------- */

export async function saveAllowedUser(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const role = String(formData.get("role") ?? "staff")
  const fullName = String(formData.get("full_name") ?? "").trim()

  if (!email || !email.includes("@")) {
    return { ok: false, error: "กรุณากรอกอีเมลให้ถูกต้อง" }
  }
  if (!["admin", "manager", "staff"].includes(role)) {
    return { ok: false, error: "สิทธิ์ไม่ถูกต้อง" }
  }

  const { error } = await supabase
    .from("allowed_users")
    .upsert({ email, role, full_name: fullName || null }, { onConflict: "email" })

  if (error) return fail(error)

  // ถ้าคนนี้สมัครไว้แล้ว ให้ปรับ role ใน profile ตามด้วย
  await supabase.from("profiles").update({ role }).eq("email", email)

  revalidatePath("/settings")
  return { ok: true }
}

export async function removeAllowedUser(email: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: me } = await supabase.from("profiles").select("email").single()
  if (me?.email?.toLowerCase() === email.toLowerCase()) {
    return { ok: false, error: "ลบสิทธิ์ของตัวเองไม่ได้" }
  }

  const { error } = await supabase.from("allowed_users").delete().eq("email", email)
  if (error) return fail(error)

  revalidatePath("/settings")
  return { ok: true }
}

/* ---------------- จัดกลุ่มต้นทุน ---------------- */

const COST_TYPES = ["fixed", "variable", "onetime"] as const

export async function saveCategoryType(
  category: string,
  costType: string
): Promise<ActionResult> {
  if (!COST_TYPES.includes(costType as (typeof COST_TYPES)[number])) {
    return { ok: false, error: "ประเภทต้นทุนไม่ถูกต้อง" }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("expense_category_types")
    .upsert({ category, cost_type: costType }, { onConflict: "category" })

  if (error) return fail(error)

  revalidatePath("/settings")
  revalidatePath("/finance")
  revalidatePath("/finance/unit-economics")
  return { ok: true }
}

export async function saveExpenseCostType(
  id: string,
  costType: string
): Promise<ActionResult> {
  if (!COST_TYPES.includes(costType as (typeof COST_TYPES)[number])) {
    return { ok: false, error: "ประเภทต้นทุนไม่ถูกต้อง" }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("expenses")
    .update({ cost_type: costType })
    .eq("id", id)

  if (error) return fail(error)

  revalidatePath("/settings")
  revalidatePath("/finance")
  revalidatePath("/finance/unit-economics")
  return { ok: true }
}

/* ---------------- ตั้งค่าทั่วไป ---------------- */

export async function saveSetting(key: string, value: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("settings")
    .upsert({ key, value }, { onConflict: "key" })

  if (error) return fail(error)
  refresh()
  return { ok: true }
}
