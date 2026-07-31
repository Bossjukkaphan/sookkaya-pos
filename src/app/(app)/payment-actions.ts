"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { PAYMENT_LINE_METHODS } from "@/lib/payments"
import { todayInShopTz } from "@/lib/datetime"

/** เก็บเงินเพิ่มเข้าบิล (บิลค้างรับ/ต่อเวลา) — กันเกินยอดค้างด้วยการอ่าน due สดจาก view */
export async function addBillPayment(
  billKey: string, method: string, amount: number, note?: string
): Promise<{ ok: true; due: number } | { ok: false; error: string }> {
  if (!(PAYMENT_LINE_METHODS as readonly string[]).includes(method))
    return { ok: false, error: "ช่องทางต้องเป็น เงินสด / QR Code / บัตรเครดิต" }
  if (!Number.isFinite(amount) || amount <= 0)
    return { ok: false, error: "ยอดต้องมากกว่า 0" }

  const supabase = await createClient()
  const { data: bill } = await supabase
    .from("v_bill_due").select("due").eq("bill_key", billKey).maybeSingle()
  if (!bill) return { ok: false, error: "ไม่พบบิลนี้ หรือบิลไม่ได้อยู่ในระบบบรรทัดชำระ" }
  if (amount > Number(bill.due) + 0.001)
    return { ok: false, error: `ยอดเกินที่ค้างรับ (ค้าง ${bill.due} บาท)` }

  const staff = await getMyProfile()
  const { error } = await supabase.from("bill_payments").insert({
    bill_key: billKey, method, amount,
    received_date: todayInShopTz(),
    note: note?.trim() || null,
    created_by: staff?.full_name ?? null,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath("/today"); revalidatePath("/queue"); revalidatePath("/history")
  return { ok: true, due: Math.round((Number(bill.due) - amount) * 100) / 100 }
}

/** ลบบรรทัดที่บันทึกผิด — RLS จำกัด admin/manager อยู่แล้ว แต่เช็ค role ซ้ำให้ error อ่านรู้เรื่อง */
export async function deleteBillPayment(
  paymentId: string
): Promise<{ ok: boolean; error?: string }> {
  const profile = await getMyProfile()
  if (!profile || !["admin", "manager"].includes(profile.role))
    return { ok: false, error: "เฉพาะผู้จัดการขึ้นไปลบบรรทัดชำระได้" }
  const supabase = await createClient()
  const { error } = await supabase.from("bill_payments").delete().eq("id", paymentId)
  if (error) return { ok: false, error: error.message }
  revalidatePath("/today"); revalidatePath("/queue"); revalidatePath("/history")
  return { ok: true }
}
