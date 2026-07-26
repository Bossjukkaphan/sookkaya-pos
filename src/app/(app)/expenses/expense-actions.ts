"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { todayInShopTz } from "@/lib/datetime"

export type ExpenseResult = { ok: true } | { ok: false; error: string }

/**
 * รายจ่ายไหลเข้าการคำนวณหลายหน้า (กำไรเงินสด/เชิงบัญชี คิดสดจากตาราง expenses)
 * เพิ่ม/แก้/ลบ ต้องรีเฟรชให้ครบทุกหน้า ไม่งั้นหน้าการเงินโชว์เลขค้างของเก่า
 */
function revalidateFinancePages() {
  revalidatePath("/expenses")
  revalidatePath("/reports")
  revalidatePath("/finance")
  revalidatePath("/overview")
}

/** เดือนก่อนหน้าปิดงบแล้ว — แก้/ลบได้เฉพาะรายจ่ายของเดือนปัจจุบัน (นโยบายเดียวกับบิลขาย/ใบเติมเงิน) */
function isCurrentMonth(date: string): boolean {
  return date.slice(0, 7) === todayInShopTz().slice(0, 7)
}

/** ตรวจฟิลด์ร่วมของฟอร์มเพิ่ม/แก้ — คืนค่าที่พร้อมเขียน หรือข้อความ error */
function parseExpenseForm(formData: FormData):
  | { ok: true; values: { item: string; category: string; amount: number; expense_date: string; paid_by: string | null; notes: string | null } }
  | { ok: false; error: string } {
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

  return {
    ok: true,
    values: {
      item,
      category,
      amount,
      expense_date: expenseDate,
      paid_by: String(formData.get("paid_by") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  }
}

export async function createExpense(formData: FormData): Promise<ExpenseResult> {
  const supabase = await createClient()

  const parsed = parseExpenseForm(formData)
  if (!parsed.ok) return parsed

  const { error } = await supabase.from("expenses").insert(parsed.values)

  if (error) {
    // RLS ปฏิเสธเมื่อ staff พยายามบันทึกรายจ่าย
    if (error.code === "42501") {
      return { ok: false, error: "คุณไม่มีสิทธิ์บันทึกรายจ่าย (เฉพาะผู้จัดการขึ้นไป)" }
    }
    return { ok: false, error: `บันทึกไม่สำเร็จ: ${error.message}` }
  }

  revalidateFinancePages()
  return { ok: true }
}

/**
 * แก้รายละเอียดรายจ่าย — กำไรเงินสด/เชิงบัญชี/รายงาน คำนวณใหม่เองทันที
 * (ทุกหน้าคิดสดจากตาราง ไม่มียอดสะสมค้าง) · เดือนที่ปิดงบแล้วห้ามแตะ
 * และห้ามย้ายวันที่ข้ามไปเดือนที่ปิดแล้วด้วย — ไม่งั้นงบเดือนเก่าถูกแก้เงียบๆ
 */
export async function updateExpense(
  id: string,
  formData: FormData
): Promise<ExpenseResult> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("expenses")
    .select("expense_date")
    .eq("id", id)
    .maybeSingle()
  if (!existing) return { ok: false, error: "ไม่พบรายจ่ายนี้" }
  if (!isCurrentMonth(existing.expense_date)) {
    return { ok: false, error: "แก้ได้เฉพาะรายจ่ายของเดือนปัจจุบัน (เดือนก่อนปิดงบแล้ว)" }
  }

  const parsed = parseExpenseForm(formData)
  if (!parsed.ok) return parsed
  if (!isCurrentMonth(parsed.values.expense_date)) {
    return { ok: false, error: "เปลี่ยนวันที่ได้ภายในเดือนปัจจุบันเท่านั้น (เดือนอื่นปิดงบแล้ว)" }
  }

  const { data: updated, error } = await supabase
    .from("expenses")
    .update(parsed.values)
    .eq("id", id)
    .select("id")

  if (error) {
    if (error.code === "42501") {
      return { ok: false, error: "คุณไม่มีสิทธิ์แก้รายจ่าย (เฉพาะผู้จัดการขึ้นไป)" }
    }
    return { ok: false, error: `แก้ไขไม่สำเร็จ: ${error.message}` }
  }
  // RLS กรอง UPDATE แบบเงียบ (0 แถว ไม่มี error) — ห้ามรายงานสำเร็จทั้งที่ไม่มีอะไรเปลี่ยน
  if (!updated || updated.length === 0) {
    return { ok: false, error: "แก้ไม่สำเร็จ — คุณอาจไม่มีสิทธิ์ (เฉพาะผู้จัดการขึ้นไป)" }
  }

  revalidateFinancePages()
  return { ok: true }
}

export async function deleteExpense(id: string): Promise<ExpenseResult> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("expenses")
    .select("expense_date")
    .eq("id", id)
    .maybeSingle()
  if (!existing) return { ok: false, error: "ไม่พบรายจ่ายนี้" }
  if (!isCurrentMonth(existing.expense_date)) {
    return { ok: false, error: "ลบได้เฉพาะรายจ่ายของเดือนปัจจุบัน (เดือนก่อนปิดงบแล้ว)" }
  }

  const { data: deleted, error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", id)
    .select("id")
  if (error) {
    if (error.code === "42501") {
      return { ok: false, error: "คุณไม่มีสิทธิ์ลบรายจ่าย (เฉพาะผู้จัดการขึ้นไป)" }
    }
    return { ok: false, error: error.message }
  }
  if (!deleted || deleted.length === 0) {
    return { ok: false, error: "ลบไม่สำเร็จ — คุณอาจไม่มีสิทธิ์ (เฉพาะผู้จัดการขึ้นไป)" }
  }

  revalidateFinancePages()
  return { ok: true }
}
