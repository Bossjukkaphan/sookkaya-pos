"use server"

import { revalidatePath } from "next/cache"

import { promoKey } from "@/lib/promo"
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

/* ---------------- โปรโมชั่น ---------------- */

const PROMO_KINDS = ["promotion", "channel", "giveaway", "internal"] as const

function refreshPromo() {
  revalidatePath("/settings")
  revalidatePath("/pos")
  revalidatePath("/insights/promotions")
}

export async function savePromotion(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const id = String(formData.get("id") ?? "").trim()
  const name = String(formData.get("name") ?? "").trim()
  const kind = String(formData.get("kind") ?? "promotion")
  const isActive = formData.get("is_active") === "on"

  if (!name) return { ok: false, error: "กรุณากรอกชื่อโปรโมชั่น" }
  if (!PROMO_KINDS.includes(kind as (typeof PROMO_KINDS)[number])) {
    return { ok: false, error: "ประเภทโปรโมชั่นไม่ถูกต้อง" }
  }

  // ชื่อสองชื่อที่ต่างกันแค่ช่องว่างหรือตัวพิมพ์ (เช่น "ลด 15%" กับ "ลด15%") ให้คีย์เดียวกัน
  // ถ้าปล่อยผ่าน การจับคู่เดิมจะถูกแย่งไปเงียบๆ แล้วยอดเก่าทั้งก้อนจะย้ายไปโปรฯ ใหม่
  const key = promoKey(name)
  const { data: clash } = await supabase
    .from("promotion_aliases")
    .select("promotion_id")
    .eq("raw_key", key)
    .maybeSingle()

  if (clash?.promotion_id && clash.promotion_id !== id) {
    const { data: owner } = await supabase
      .from("promotions")
      .select("name")
      .eq("id", clash.promotion_id)
      .maybeSingle()

    return {
      ok: false,
      error: `ชื่อนี้ซ้ำกับ "${owner?.name ?? "โปรโมชั่นที่มีอยู่"}" เมื่อตัดช่องว่างและตัวพิมพ์ใหญ่-เล็กออก กรุณาใช้ชื่ออื่น`,
    }
  }

  const { data: saved, error } = id
    ? await supabase
        .from("promotions")
        .update({ name, kind, is_active: isActive })
        .eq("id", id)
        .select("id")
        .single()
    : await supabase
        .from("promotions")
        .insert({ name, kind, is_active: isActive })
        .select("id")
        .single()

  if (error) return fail(error)
  if (!saved) return { ok: false, error: "บันทึกไม่สำเร็จ" }

  // ชื่อมาตรฐานต้องจับคู่กับตัวเองเสมอ ไม่งั้นรายการที่บันทึกผ่าน dropdown
  // จะกลายเป็น "ยังไม่จับคู่" ทันทีที่บันทึก
  const { error: aliasError } = await supabase
    .from("promotion_aliases")
    .upsert(
      { raw_key: key, promotion_id: saved.id, sample_text: name },
      { onConflict: "raw_key" }
    )

  if (aliasError) return fail(aliasError)

  refreshPromo()
  return { ok: true }
}

/** `promotionId` = null แปลว่า "ตรวจแล้ว ข้อความนี้ไม่ใช่โปรโมชั่น" */
export async function saveAlias(
  rawKey: string,
  promotionId: string | null,
  sampleText: string
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("promotion_aliases")
    .upsert(
      {
        raw_key: rawKey,
        promotion_id: promotionId,
        sample_text: sampleText,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "raw_key" }
    )

  if (error) return fail(error)
  refreshPromo()
  return { ok: true }
}
