"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { todayInShopTz } from "@/lib/datetime"

export type ExpenseResult = { ok: true } | { ok: false; error: string }

export async function createExpense(formData: FormData): Promise<ExpenseResult> {
  const supabase = await createClient()

  const item = String(formData.get("item") ?? "").trim()
  const category = String(formData.get("category") ?? "").trim()
  const amount = Number(formData.get("amount"))

  if (!item) return { ok: false, error: "กรุณากรอกรายการ" }
  if (!category) return { ok: false, error: "กรุณาเลือกหมวดหมู่" }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "กรุณากรอกจำนวนเงินให้ถูกต้อง" }
  }

  const expenseDate =
    String(formData.get("expense_date") ?? "").trim() || todayInShopTz()

  const { error } = await supabase.from("expenses").insert({
    expense_date: expenseDate,
    item,
    category,
    amount,
    paid_by: String(formData.get("paid_by") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  })

  if (error) {
    // RLS ปฏิเสธเมื่อ staff พยายามบันทึกรายจ่าย
    if (error.code === "42501") {
      return { ok: false, error: "คุณไม่มีสิทธิ์บันทึกรายจ่าย (เฉพาะผู้จัดการขึ้นไป)" }
    }
    return { ok: false, error: `บันทึกไม่สำเร็จ: ${error.message}` }
  }

  revalidatePath("/expenses")
  revalidatePath("/reports")
  return { ok: true }
}

export async function deleteExpense(id: string): Promise<ExpenseResult> {
  const supabase = await createClient()
  const { error } = await supabase.from("expenses").delete().eq("id", id)
  if (error) return { ok: false, error: error.message }

  revalidatePath("/expenses")
  revalidatePath("/reports")
  return { ok: true }
}
