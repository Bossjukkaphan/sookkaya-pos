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
