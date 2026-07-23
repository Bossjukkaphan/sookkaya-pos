"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { addMonths, todayInShopTz } from "@/lib/datetime"
import { MEMBER_TIERS } from "@/lib/constants"

export type TopupResult = { ok: true } | { ok: false; error: string }

export async function createTopup(formData: FormData): Promise<TopupResult> {
  const supabase = await createClient()

  const customerId = String(formData.get("customer_id") ?? "").trim()
  const tierName = String(formData.get("tier") ?? "")
  const paymentMethod = String(formData.get("payment_method") ?? "")

  if (!customerId) return { ok: false, error: "กรุณาเลือกลูกค้า" }

  const tier = MEMBER_TIERS.find((t) => t.tier === tierName)
  if (!tier) return { ok: false, error: "กรุณาเลือกแพ็กเกจสมาชิก" }

  if (!["QR Code", "เงินสด", "บัตรเครดิต"].includes(paymentMethod)) {
    return { ok: false, error: "กรุณาเลือกช่องทางชำระเงิน" }
  }

  const topupDate = todayInShopTz()

  const { error } = await supabase.from("member_topups").insert({
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

  if (error) return { ok: false, error: `บันทึกไม่สำเร็จ: ${error.message}` }

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
export async function deleteTopup(id: string): Promise<TopupResult> {
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

  // ถ้าเครดิตคงเหลือปัจจุบันน้อยกว่าเครดิตของใบนี้ = ส่วนหนึ่งถูกใช้จ่ายไปแล้ว
  // ลบทั้งใบจะทำยอดคงเหลือติดลบ — ให้ไปลบบิลที่ใช้เครดิตก่อน (หรือปล่อยไว้)
  const { data: balance } = await supabase
    .from("member_balances")
    .select("credit_balance")
    .eq("customer_id", topup.customer_id)
    .maybeSingle()
  const remaining = Number(balance?.credit_balance ?? 0)
  if (remaining < Number(topup.credit_added)) {
    return {
      ok: false,
      error: `ลบไม่ได้ — เครดิตจากใบนี้ถูกใช้ไปแล้วบางส่วน (คงเหลือ ${remaining} จาก ${topup.credit_added} บาท) ต้องลบบิลที่จ่ายด้วยเครดิตของลูกค้าคนนี้ก่อน`,
    }
  }

  const { error } = await supabase.from("member_topups").delete().eq("id", id)
  if (error) return { ok: false, error: error.message }

  revalidatePath("/members")
  revalidatePath("/today")
  revalidatePath(`/customers/${topup.customer_id}`)
  return { ok: true }
}
