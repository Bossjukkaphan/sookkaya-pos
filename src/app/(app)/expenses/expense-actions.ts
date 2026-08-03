"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { todayInShopTz } from "@/lib/datetime"
import { CLOSE_GRACE_DAYS, canEditExpenseOn } from "@/lib/accounting-window"
import {
  DUPLICATE_WINDOW_DAYS,
  type ExpenseWarning,
  expenseWarnings,
} from "@/lib/expense-warnings"

export type ExpenseResult =
  | { ok: true }
  /** warnings มีค่า = ยังไม่บันทึก รอพนักงานยืนยันก่อน (ไม่ใช่ error) */
  | { ok: false; error?: string; warnings?: ExpenseWarning[] }

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

/** เดือนปัจจุบัน + เดือนก่อนหน้าจนถึงวันที่ 3 — กติกาอยู่ที่ lib/accounting-window.ts ที่เดียว */
function isOpenMonth(date: string): boolean {
  return canEditExpenseOn(date, todayInShopTz())
}

/** ข้อความบอกเหตุผลให้พนักงานเข้าใจว่าทำไมแก้ไม่ได้ และเส้นตายคือเมื่อไหร่ */
const CLOSED_MONTH_ERROR =
  `เดือนนี้ปิดงบแล้ว — รายจ่ายของเดือนก่อนหน้าแก้ได้ถึงวันที่ ${CLOSE_GRACE_DAYS} ของเดือนถัดไปเท่านั้น`

/**
 * ประเภทต้นทุน (คงที่/ผันแปร) ผูกกับหมวดหมู่เสมอ — อ่านจากตาราง expense_category_types
 *
 * ของเดิมฟอร์มไม่เคยเขียนช่องนี้เลย เปลี่ยนหมวดในหน้าเว็บแล้ว cost_type ค้างค่าเก่า
 * เช่นย้ายเงินเดือนพนักงานจากหมวดค่ามือหมอ (ผันแปร) ไปหมวดเงินเดือน (คงที่)
 * ตัวเลขในรายงานจะยังนับเป็นผันแปรอยู่ ทั้งที่หน้าจอโชว์หมวดใหม่แล้ว — เพี้ยนแบบเงียบ
 *
 * คืน null ถ้าหาไม่เจอ แล้วให้ฝั่งเรียกตัดสินใจ ดีกว่าเดาเป็น variable แล้วผิดเงียบๆ
 */
async function costTypeOfCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  category: string
): Promise<string | null> {
  const { data } = await supabase
    .from("expense_category_types")
    .select("cost_type")
    .eq("category", category)
    .maybeSingle()
  return data?.cost_type ?? null
}


/**
 * หาคำเตือนก่อนบันทึก — ดึงเฉพาะรายจ่ายที่ยอดเท่ากันและหมวดเดียวกันในช่วงที่สนใจ
 * แคบตั้งแต่ query เพื่อไม่ให้ดึงทั้งตารางมากรองในหน้าเว็บ (กับดัก 1,000 แถวของ PostgREST)
 * excludeId ใช้ตอนแก้ไข — ไม่งั้นรายการจะเตือนว่าซ้ำกับตัวเอง
 */
async function warningsFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  values: { item: string; amount: number; category: string; expense_date: string },
  excludeId?: string
): Promise<ExpenseWarning[]> {
  const d = Date.parse(`${values.expense_date}T00:00:00Z`)
  const span = DUPLICATE_WINDOW_DAYS * 86_400_000
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10)

  let q = supabase
    .from("expenses")
    .select("item, amount, category, expense_date")
    .eq("amount", values.amount)
    .eq("category", values.category)
    .gte("expense_date", iso(d - span))
    .lte("expense_date", iso(d + span))
  if (excludeId) q = q.neq("id", excludeId)

  const { data } = await q
  return expenseWarnings(values, data ?? [])
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

  // ตอนแรกด่านนี้มีแต่ที่แก้กับลบ ส่วนการเพิ่มไม่เคยตรวจเดือนเลย
  // แปลว่าย้อนไปเพิ่มรายจ่ายลงเดือนที่ปิดงบส่งไปแล้วได้เงียบๆ งบเดือนเก่าจึงขยับได้ตลอด
  // (3/8/2569 พนักงานเพิ่มค่ามือหมอเดือน ก.ค. ซ้ำเข้ามา 2 รายการผ่านช่องนี้)
  if (!isOpenMonth(parsed.values.expense_date)) {
    return { ok: false, error: `บันทึกลงเดือนนั้นไม่ได้ — ${CLOSED_MONTH_ERROR}` }
  }

  const costType = await costTypeOfCategory(supabase, parsed.values.category)
  if (!costType) return { ok: false, error: `ไม่รู้จักหมวดหมู่ "${parsed.values.category}"` }

  // เตือนก่อน ไม่บล็อก — กดยืนยันแล้วส่งกลับมาพร้อม confirm_warnings จึงบันทึกจริง
  if (formData.get("confirm_warnings") !== "on") {
    const warnings = await warningsFor(supabase, parsed.values)
    if (warnings.length > 0) return { ok: false, warnings }
  }

  const { error } = await supabase
    .from("expenses")
    .insert({ ...parsed.values, cost_type: costType })

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
  if (!isOpenMonth(existing.expense_date)) {
    return { ok: false, error: CLOSED_MONTH_ERROR }
  }

  const parsed = parseExpenseForm(formData)
  if (!parsed.ok) return parsed
  // ห้ามย้ายวันที่ไปลงเดือนที่ปิดแล้ว ไม่งั้นงบเดือนเก่าถูกแก้เงียบๆ
  if (!isOpenMonth(parsed.values.expense_date)) {
    return { ok: false, error: `ย้ายวันที่ไปเดือนนั้นไม่ได้ — ${CLOSED_MONTH_ERROR}` }
  }

  const costType = await costTypeOfCategory(supabase, parsed.values.category)
  if (!costType) return { ok: false, error: `ไม่รู้จักหมวดหมู่ "${parsed.values.category}"` }

  if (formData.get("confirm_warnings") !== "on") {
    const warnings = await warningsFor(supabase, parsed.values, id)
    if (warnings.length > 0) return { ok: false, warnings }
  }

  const { data: updated, error } = await supabase
    .from("expenses")
    .update({ ...parsed.values, cost_type: costType })
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
  if (!isOpenMonth(existing.expense_date)) {
    return { ok: false, error: CLOSED_MONTH_ERROR }
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
