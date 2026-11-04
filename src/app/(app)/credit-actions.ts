"use server"

import { createClient } from "@/lib/supabase/server"
import { mapTopupBucketRow, type TopupBucket } from "@/lib/topup-credit"

/**
 * ใบเครดิตของลูกค้า (ยอดรายใบจาก v_topup_balances) — ให้หน้า POS โชว์/แบ่งใบ
 * ด้วยตรรกะเดียวกับด่านฝั่ง server (lib/topup-credit) ตัวเลขจึงไม่มีทางขัดกัน
 */
export async function getCreditBuckets(customerId: string): Promise<TopupBucket[]> {
  if (!customerId) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from("v_topup_balances")
    .select("topup_id, tier, topup_date, expiry_date, remaining, recognize_ratio, is_active")
    .eq("customer_id", customerId)
    .order("expiry_date")
  return (data ?? []).map(mapTopupBucketRow)
}

/** บิลนี้เคยตัดจากใบไหนเท่าไหร่ — กล่องแก้บิลใช้คำนวณเพดาน/พรีวิวให้ตรง updateSale เป๊ะ */
export async function getSaleAllocations(
  saleId: string
): Promise<{ topupId: string; amount: number }[]> {
  if (!saleId) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from("sale_credit_allocations")
    .select("topup_id, amount")
    .eq("sale_id", saleId)
  return (data ?? []).map((r) => ({ topupId: String(r.topup_id), amount: Number(r.amount) }))
}
