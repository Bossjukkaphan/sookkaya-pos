"use server"

import { createClient } from "@/lib/supabase/server"
import type { TopupBucket } from "@/lib/topup-credit"

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
  return (data ?? []).map((r) => ({
    topupId: String(r.topup_id),
    tier: String(r.tier ?? ""),
    topupDate: String(r.topup_date ?? ""),
    expiryDate: String(r.expiry_date ?? ""),
    remaining: Number(r.remaining ?? 0),
    recognizeRatio: Number(r.recognize_ratio ?? 1),
    isActive: Boolean(r.is_active),
  }))
}
