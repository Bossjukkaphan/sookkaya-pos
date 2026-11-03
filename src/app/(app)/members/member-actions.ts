"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { addMonths, todayInShopTz } from "@/lib/datetime"
import { MEMBER_TIERS, REAL_MONEY_METHODS } from "@/lib/constants"
import { pointExpiryDate, pointsForBaht } from "@/lib/points"
import { getMyProfile } from "@/lib/auth"

export type TopupResult = { ok: true } | { ok: false; error: string }

export async function createTopup(formData: FormData): Promise<TopupResult> {
  const supabase = await createClient()

  const customerId = String(formData.get("customer_id") ?? "").trim()
  const tierName = String(formData.get("tier") ?? "")
  const paymentMethod = String(formData.get("payment_method") ?? "")

  if (!customerId) return { ok: false, error: "กรุณาเลือกลูกค้า" }

  const tier = MEMBER_TIERS.find((t) => t.tier === tierName)
  if (!tier) return { ok: false, error: "กรุณาเลือกแพ็กเกจสมาชิก" }

  if (!(REAL_MONEY_METHODS as readonly string[]).includes(paymentMethod)) {
    return { ok: false, error: "กรุณาเลือกช่องทางชำระเงิน" }
  }

  const topupDate = todayInShopTz()

  const { data: topup, error } = await supabase
    .from("member_topups")
    .insert({
      topup_date: topupDate,
      customer_id: customerId,
      tier: tier.tier,
      payment_method: paymentMethod,
      cash_received: tier.cash,
      credit_added: tier.credit,
      bonus_added: tier.bonus,
      expiry_date: addMonths(topupDate, tier.months),
      notes: String(formData.get("notes") ?? "").trim() || null,
    })
    .select("id")
    .single()

  if (error) return { ok: false, error: `บันทึกไม่สำเร็จ: ${error.message}` }

  // แต้มสะสมจากเงินสดรับจริงตอนเติม (ตอนใช้เครดิตจ่ายจะไม่ได้แต้มซ้ำ)
  // ลบใบเติม → แต้มหายเองผ่าน FK cascade · แต้มเป็นของแถม พลาดไม่กระทบใบเติม
  const topupPoints = pointsForBaht(tier.cash)
  if (topup && topupPoints > 0) {
    await supabase.from("point_transactions").insert({
      customer_id: customerId,
      delta: topupPoints,
      reason: "แต้มจากเติมเงินสมาชิก",
      topup_id: topup.id,
      expires_at: pointExpiryDate(topupDate),
    })
  }

  // ลูกค้าที่เติมเงินแล้วถือเป็นสมาชิก
  await supabase
    .from("customers")
    .update({ customer_type: "สมาชิก" })
    .eq("id", customerId)

  revalidatePath("/members")
  revalidatePath(`/customers/${customerId}`)
  return { ok: true }
}

/**
 * ลบใบเติมเงิน (คีย์ผิด/ลูกค้าเปลี่ยนใจ เช่นเปลี่ยน 5,000 → 10,000: ลบใบเดิมแล้วเติมใหม่)
 * กันสองเรื่อง: เดือนที่ปิดงบแล้วห้ามแตะ · เครดิตที่ลูกค้าใช้ไปแล้วดึงคืนไม่ได้
 */
export async function deleteTopup(
  id: string,
  confirmShorten = false
): Promise<TopupResult> {
  const supabase = await createClient()

  const { data: topup } = await supabase
    .from("member_topups")
    .select("id, topup_date, customer_id, credit_added, cash_received")
    .eq("id", id)
    .maybeSingle()
  if (!topup) return { ok: false, error: "ไม่พบใบเติมเงินนี้" }

  if (topup.topup_date.slice(0, 7) !== todayInShopTz().slice(0, 7)) {
    return { ok: false, error: "ลบได้เฉพาะใบเติมเงินของเดือนปัจจุบัน (เดือนก่อนปิดงบแล้ว)" }
  }

  // ระบบแยกก้อนตามใบเติม (2026-11-03): บิลระบุชัดว่าตัดจากใบไหน — ใบที่มีบิลตัดอยู่
  // ลบไม่ได้ตรงๆ (FK restrict กันชั้นสุดท้ายอยู่แล้ว เช็คก่อนเพื่อให้ข้อความอ่านรู้เรื่อง)
  // คำเตือน "วันหมดอายุกระปุกถอยหลัง" ของยุคกระปุกเดียวหมดความหมายแล้ว — ใบใครใบมัน
  const { data: allocated } = await supabase
    .from("sale_credit_allocations")
    .select("amount")
    .eq("topup_id", id)
  const usedFromThis = (allocated ?? []).reduce((a, r) => a + Number(r.amount), 0)
  if (usedFromThis > 0) {
    return {
      ok: false,
      error: `ลบไม่ได้ — ใบนี้ถูกบิลตัดเครดิตไปแล้ว ${usedFromThis} บาท ต้องลบ/แก้บิลเหล่านั้นก่อน (ดูได้จากการใช้แพ็กเกจในหน้าลูกค้า)`,
    }
  }
  void confirmShorten // คงลายเซ็นเดิมให้หน้าจอเก่าเรียกได้ — ไม่มีคำเตือนสองจังหวะแล้ว

  const { error } = await supabase.from("member_topups").delete().eq("id", id)
  if (error) return { ok: false, error: error.message }

  revalidatePath("/members")
  revalidatePath("/today")
  revalidatePath("/reports")
  revalidatePath(`/customers/${topup.customer_id}`)
  return { ok: true }
}

/**
 * แก้ช่องทางชำระเงินของใบเติมเงิน — เขียนคอลัมน์เดียว ไม่แตะยอดเงินหรือวันหมดอายุ
 *
 * ปลอดภัยเพราะไม่มีสูตรไหนในระบบอ่าน payment_method ไปคำนวณเครดิต
 * ยอดคงเหลือของลูกค้าจึงนิ่งสนิทหลังแก้
 *
 * **ไม่ล็อกเดือน** ต่างจาก deleteTopup เพราะช่องทางไม่ทำให้ยอดรวมขยับสักบาท
 * มีแต่ทำให้เดือนที่ปิดไปแล้วถูกต้องขึ้น (เคสจริง: ใบของ "โบว36" 10 ส.ค. 2026 คีย์เป็น
 * QR Code ทั้งที่ลูกค้ารูดบัตร กว่าจะรู้ตัวคือตอนเอาไปเทียบกับ ThaiHand)
 * ที่ตามรอยได้คือ edited_by / edited_at
 *
 * ถ้าจำนวนเงินผิด ห้ามแก้ที่นี่ — ให้ลบใบเดิมแล้วเติมใหม่ผ่าน deleteTopup
 * ซึ่งมีกันชนเรื่องเดือนปิดงบ เครดิตที่ถูกใช้ไปแล้ว และวันหมดอายุที่จะถอยหลัง
 */
export async function updateTopupPaymentMethod(
  id: string,
  method: string
): Promise<TopupResult> {
  if (!(REAL_MONEY_METHODS as readonly string[]).includes(method)) {
    return { ok: false, error: `ช่องทางต้องเป็น ${REAL_MONEY_METHODS.join(" / ")}` }
  }

  const supabase = await createClient()

  const { data: topup } = await supabase
    .from("member_topups")
    .select("id, customer_id")
    .eq("id", id)
    .maybeSingle()
  if (!topup) return { ok: false, error: "ไม่พบใบเติมเงินนี้" }

  const staff = await getMyProfile()
  const { data: updated, error } = await supabase
    .from("member_topups")
    .update({
      payment_method: method,
      edited_by: staff?.full_name ?? null,
      edited_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id")
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  // อัปเดต 0 แถวแต่ไม่มี error = สิทธิ์ไม่พอ (RLS ปิดเงียบ) หรือใบถูกลบไปก่อน
  // ถ้าไม่ดักตรงนี้ หน้าจอจะขึ้นว่าสำเร็จทั้งที่ไม่มีอะไรเปลี่ยน ซึ่งเป็นความผิดพลาดแบบเดียว
  // กับที่ระบบนี้ตั้งใจกำจัด
  if (!updated) {
    return { ok: false, error: "แก้ไม่สำเร็จ — สิทธิ์ไม่พอหรือใบเติมเงินนี้ถูกลบไปแล้ว" }
  }

  revalidatePath("/members")
  revalidatePath("/today")
  revalidatePath("/reports")
  revalidatePath(`/customers/${topup.customer_id}`)
  return { ok: true }
}

/** ผู้จัดการขึ้นไปเท่านั้น — การแก้ใบเครดิตคือการแก้เงิน */
async function requireManager(): Promise<
  { ok: true; name: string } | { ok: false; error: string }
> {
  const me = await getMyProfile()
  if (!me || !["admin", "manager"].includes(me.role ?? "")) {
    return { ok: false, error: "เฉพาะผู้จัดการขึ้นไปแก้ใบเครดิตได้" }
  }
  return { ok: true, name: me.full_name ?? "ผู้จัดการ" }
}

function revalidateTopupPages(customerId: string) {
  revalidatePath("/members")
  revalidatePath("/today")
  revalidatePath("/reports")
  revalidatePath(`/customers/${customerId}`)
}

/**
 * ยืดอายุใบเครดิต (ตั้งวันหมดอายุใหม่) — ทางเดียวที่ใบหมดอายุจะกลับมาใช้ได้
 * ภายใต้กติกาแยกก้อน (เติมใบใหม่ไม่ฟื้นใบเก่าแล้ว) · ลงประวัติการแก้ไขเสมอ
 */
export async function extendTopupExpiry(
  id: string,
  newExpiry: string
): Promise<TopupResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newExpiry)) {
    return { ok: false, error: "วันหมดอายุไม่ถูกต้อง" }
  }
  const staff = await requireManager()
  if (!staff.ok) return staff

  const supabase = await createClient()
  const { data: topup } = await supabase
    .from("member_topups")
    .select("id, customer_id, expiry_date")
    .eq("id", id)
    .maybeSingle()
  if (!topup) return { ok: false, error: "ไม่พบใบเครดิตนี้" }

  const { data: updated, error } = await supabase
    .from("member_topups")
    .update({ expiry_date: newExpiry })
    .eq("id", id)
    .select("id")
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!updated) return { ok: false, error: "แก้ไม่สำเร็จ — สิทธิ์ไม่พอหรือใบถูกลบไปแล้ว" }

  await supabase.from("member_topup_edits").insert({
    topup_id: id,
    field: "expiry_date",
    old_value: String(topup.expiry_date),
    new_value: newExpiry,
    edited_by: staff.name,
  })

  revalidateTopupPages(topup.customer_id)
  return { ok: true }
}

/**
 * ปรับยอดคงเหลือของใบ (บวก/ลบ) — เก็บเป็นรายการปรับปรุงพร้อมเหตุผล ไม่เขียนทับยอด
 * ยอดคงเหลือ = เติม + ปรับปรุง − ที่บิลตัด → ตรวจย้อนได้เสมอว่าตัวเลขมาจากไหน
 */
export async function adjustTopupBalance(
  id: string,
  delta: number,
  reason: string
): Promise<TopupResult> {
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false, error: "จำนวนที่ปรับต้องไม่เป็นศูนย์" }
  }
  if (!reason.trim()) {
    return { ok: false, error: "กรุณาระบุเหตุผลที่ปรับยอด (เก็บลงประวัติการแก้ไข)" }
  }
  const staff = await requireManager()
  if (!staff.ok) return staff

  const supabase = await createClient()
  const { data: topup } = await supabase
    .from("v_topup_balances")
    .select("topup_id, customer_id, remaining")
    .eq("topup_id", id)
    .maybeSingle()
  if (!topup) return { ok: false, error: "ไม่พบใบเครดิตนี้" }
  const newRemaining = Math.round((Number(topup.remaining ?? 0) + delta) * 100) / 100
  if (newRemaining < 0) {
    return {
      ok: false,
      error: `ปรับแล้วยอดจะติดลบ (${newRemaining}) — ใบนี้เหลือ ${topup.remaining} บาท`,
    }
  }

  const { error } = await supabase.from("member_topup_adjustments").insert({
    topup_id: id,
    delta: Math.round(delta * 100) / 100,
    reason: reason.trim(),
    edited_by: staff.name,
  })
  if (error) return { ok: false, error: error.message }

  await supabase.from("member_topup_edits").insert({
    topup_id: id,
    field: "remaining",
    old_value: String(topup.remaining ?? 0),
    new_value: String(newRemaining),
    edited_by: staff.name,
  })

  revalidateTopupPages(String(topup.customer_id))
  return { ok: true }
}

/** เปิด/ปิดใช้งานใบ — ปิดแล้วตัดไม่ได้ทันที (ยอดไม่หาย) · ลงประวัติเสมอ */
export async function setTopupActive(id: string, active: boolean): Promise<TopupResult> {
  const staff = await requireManager()
  if (!staff.ok) return staff

  const supabase = await createClient()
  const { data: topup } = await supabase
    .from("member_topups")
    .select("id, customer_id, is_active")
    .eq("id", id)
    .maybeSingle()
  if (!topup) return { ok: false, error: "ไม่พบใบเครดิตนี้" }
  if (Boolean(topup.is_active) === active) return { ok: true }

  const { data: updated, error } = await supabase
    .from("member_topups")
    .update({ is_active: active })
    .eq("id", id)
    .select("id")
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!updated) return { ok: false, error: "แก้ไม่สำเร็จ — สิทธิ์ไม่พอหรือใบถูกลบไปแล้ว" }

  await supabase.from("member_topup_edits").insert({
    topup_id: id,
    field: "is_active",
    old_value: String(Boolean(topup.is_active)),
    new_value: String(active),
    edited_by: staff.name,
  })

  revalidateTopupPages(topup.customer_id)
  return { ok: true }
}
