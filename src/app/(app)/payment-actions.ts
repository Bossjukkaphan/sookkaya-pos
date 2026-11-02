"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { PAYMENT_LINE_METHODS } from "@/lib/payments"
import { todayInShopTz } from "@/lib/datetime"
import { REAL_MONEY_METHODS } from "@/lib/constants"
import { canEditPaymentAmountOn, canEditPaymentMethodOn } from "@/lib/accounting-window"
import { PAYMENT_AMOUNT_EDIT_REASONS, type PaymentAmountEditReason } from "@/lib/payments"

/** เก็บเงินเพิ่มเข้าบิล (บิลค้างรับ/ต่อเวลา) — กันเกินยอดค้างด้วยการอ่าน due สดจาก view */
export async function addBillPayment(
  billKey: string, method: string, amount: number, note?: string
): Promise<{ ok: true; due: number } | { ok: false; error: string }> {
  if (!(PAYMENT_LINE_METHODS as readonly string[]).includes(method))
    return {
      ok: false,
      error: `ช่องทางต้องเป็น ${PAYMENT_LINE_METHODS.join(" / ")}`,
    }
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

/**
 * แก้ช่องทางชำระเงินของบรรทัดชำระหนึ่งบรรทัด แล้วอัปเดตวิธีหลักของบิลตาม
 *
 * ช่องทางจริงอยู่ที่ bill_payments ส่วน sales.payment_method เป็นป้ายสรุปของบิล
 * ถ้าเขียนแค่ที่เดียว ข้อตรวจ tracked_bill_method_mismatch ใน reconciliation.sql จะ FAIL
 * และบิลชุดมีได้หลายแถวใน sales จึงต้องอัปเดตครบทุกแถวของบิล ไม่ใช่แถวเดียว
 *
 * ไม่ตรวจ role — พนักงานทุกคนแก้ได้ ต่างจาก deleteBillPayment ที่จำกัด admin/manager
 * เพราะการลบทำให้บิลกลายเป็นค้างรับ (เงินหายจากยอดเงินเข้า) แต่การแก้ช่องทางไม่ขยับยอดใดเลย
 * ตัวที่ทำให้ตามรอยได้คือ edited_by / edited_at
 *
 * ห้ามแตะ amount / received_date / received_at / bill_key — เงินไม่ขยับ วันไม่ขยับ
 *
 * การเขียนทั้งสองตารางรวมเป็นทรานแซกชันเดียวใน RPC `update_bill_payment_method`
 * (migration 20261014060000) — เดิมเขียนสองจังหวะแยกกัน ถ้าจังหวะ sync หัวบิลล้ม
 * สองตารางจะค้างไม่ตรงกันจนกว่าพนักงานจะกดซ้ำ ซึ่งเกิดจริงกับบิล 2 ใบเมื่อ 13-14/10/2569
 */
export async function updateBillPaymentMethod(
  paymentId: string,
  method: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(REAL_MONEY_METHODS as readonly string[]).includes(method))
    return { ok: false, error: `ช่องทางต้องเป็น ${REAL_MONEY_METHODS.join(" / ")}` }

  const supabase = await createClient()

  const { data: line } = await supabase
    .from("bill_payments")
    .select("id, bill_key")
    .eq("id", paymentId)
    .maybeSingle()
  if (!line) return { ok: false, error: "ไม่พบบรรทัดชำระนี้" }

  const billKey = String(line.bill_key)

  // วันที่ของบิลใช้ตัดสินหน้าต่างเวลา — บิลชุดทุกแถวมี sale_date เดียวกัน หยิบแถวไหนก็ได้
  const { data: bill } = await supabase
    .from("sales")
    .select("sale_date")
    .or(`bill_id.eq.${billKey},id.eq.${billKey}`)
    .limit(1)
    .maybeSingle()
  if (!bill) return { ok: false, error: "ไม่พบบิลของบรรทัดชำระนี้" }

  const saleDate = String(bill.sale_date)
  if (!canEditPaymentMethodOn(saleDate, todayInShopTz())) {
    return {
      ok: false,
      error: `บิลเดือน ${saleDate.slice(0, 7)} ปิดงบแล้ว — แก้ช่องทางได้เฉพาะเดือนปัจจุบันและเดือนก่อนหน้าเท่านั้น`,
    }
  }

  const staff = await getMyProfile()
  const editedBy = staff?.full_name ?? null

  // ทรานแซกชันเดียว: แก้บรรทัด + คำนวณวิธีหลัก + อัปเดตทุกแถวของบิล — ล้มตรงไหนย้อนกลับทั้งหมด
  // (วิธีหลัก = บรรทัดยอดสูงสุด กติกาเดียวกับ primaryMethod ใน lib/payments.ts)
  const { error } = await supabase.rpc("update_bill_payment_method", {
    p_payment_id: paymentId,
    p_method: method,
    p_edited_by: editedBy,
  })
  if (error) {
    // RLS ปฏิเสธเงียบถูกแปลงเป็น exception ในฟังก์ชัน — ไม่มีสถานะครึ่งเดียวให้ต้อง "กดซ้ำ" อีก
    if (error.message.includes("LINE_NOT_UPDATED"))
      return { ok: false, error: "แก้ไม่สำเร็จ — สิทธิ์ไม่พอหรือบรรทัดนี้ถูกลบไปแล้ว (ยังไม่มีอะไรถูกเปลี่ยน)" }
    if (error.message.includes("SALE_NOT_UPDATED"))
      return { ok: false, error: "แก้ไม่สำเร็จ — ไม่พบแถวของบิลนี้ให้อัปเดตป้ายช่องทาง (ยังไม่มีอะไรถูกเปลี่ยน)" }
    return { ok: false, error: `แก้ไม่สำเร็จ ยังไม่มีอะไรถูกเปลี่ยน ลองใหม่อีกครั้ง (${error.message})` }
  }

  revalidatePath("/today")
  revalidatePath("/reports")
  revalidatePath("/history")
  revalidatePath("/queue")
  revalidatePath("/overview")
  return { ok: true }
}

/**
 * แก้ยอดเงินของบรรทัดรับเงินหนึ่งบรรทัด — วันรับเงินคงเดิม (ต่างจากลบแล้วเก็บเพิ่มใหม่ที่ลงเป็นวันนี้)
 *
 * ใช้เมื่อเงินที่เข้าจริงไม่ตรงกับบรรทัด: คีย์ยอดผิด หรือโอนคืนลูกค้าไปแล้ว
 * ลูกค้าจ่ายเกินแล้วอยากเก็บไว้ใช้ครั้งหน้า ไม่ใช่ที่นี่ — ใช้ keepOverpayAsCredit
 *
 * เฉพาะ admin/manager · เดือนที่ปิดงบแล้วแก้ไม่ได้ (canEditPaymentAmountOn ตัดสินจากวันรับเงิน)
 * ยอดใหม่ห้ามทำให้บิลเกินรับเพิ่ม — ถ้าเงินเข้าจริงมากกว่ายอดบิล ทางที่ถูกคือเก็บเป็นเครดิต
 * ตัวแก้ + sync ป้ายช่องทางหัวบิลอยู่ใน RPC `update_bill_payment_amount` (ทรานแซกชันเดียว)
 */
export async function updateBillPaymentAmount(
  paymentId: string,
  amount: number,
  reason: PaymentAmountEditReason
): Promise<{ ok: true; due: number } | { ok: false; error: string }> {
  const reasonLabel = PAYMENT_AMOUNT_EDIT_REASONS[reason]
  if (!reasonLabel) return { ok: false, error: "ต้องเลือกสาเหตุก่อน" }
  if (!Number.isFinite(amount) || amount <= 0)
    return { ok: false, error: "ยอดต้องมากกว่า 0 — ถ้าเงินไม่ได้เข้าเลยให้ลบบรรทัดแทน" }
  const newAmount = Math.round(amount * 100) / 100

  const profile = await getMyProfile()
  if (!profile || !["admin", "manager"].includes(profile.role ?? ""))
    return { ok: false, error: "เฉพาะผู้จัดการขึ้นไปแก้ยอดเงินได้" }

  const supabase = await createClient()
  const { data: line } = await supabase
    .from("bill_payments")
    .select("id, bill_key, amount, received_date")
    .eq("id", paymentId)
    .maybeSingle()
  if (!line) return { ok: false, error: "ไม่พบบรรทัดชำระนี้" }

  const receivedDate = String(line.received_date)
  if (!canEditPaymentAmountOn(receivedDate, todayInShopTz()))
    return {
      ok: false,
      error: `เงินเข้าเดือน ${receivedDate.slice(0, 7)} ปิดงบแล้ว — แก้ยอดไม่ได้ ติดต่อเจ้าของร้าน`,
    }

  const oldAmount = Number(line.amount)
  if (Math.abs(newAmount - oldAmount) < 0.005) return { ok: false, error: "ยอดใหม่เท่ากับยอดเดิม" }

  // อ่าน due สดเสมอ — ห้ามเชื่อค่าที่หน้าจอส่งมา
  const { data: bill } = await supabase
    .from("v_bill_due").select("due").eq("bill_key", String(line.bill_key)).maybeSingle()
  if (!bill) return { ok: false, error: "ไม่พบบิลนี้ในระบบบรรทัดชำระ" }
  const newDue = Math.round((Number(bill.due) + oldAmount - newAmount) * 100) / 100
  if (newAmount > oldAmount && newDue < -0.005)
    return { ok: false, error: `ยอดใหม่ทำให้บิลเกินรับ ${Math.abs(newDue)} บาท — ใส่ได้ไม่เกิน ${oldAmount + Number(bill.due)} บาท` }

  const { error } = await supabase.rpc("update_bill_payment_amount", {
    p_payment_id: paymentId,
    p_amount: newAmount,
    p_reason: reasonLabel,
    p_edited_by: profile.full_name ?? null,
  })
  if (error) {
    if (error.message.includes("NOT_MANAGER"))
      return { ok: false, error: "เฉพาะผู้จัดการขึ้นไปแก้ยอดเงินได้" }
    if (error.message.includes("LINE_NOT_UPDATED"))
      return { ok: false, error: "แก้ไม่สำเร็จ — บรรทัดนี้ถูกลบไปแล้ว (ยังไม่มีอะไรถูกเปลี่ยน)" }
    return { ok: false, error: `แก้ไม่สำเร็จ ยังไม่มีอะไรถูกเปลี่ยน ลองใหม่อีกครั้ง (${error.message})` }
  }

  revalidatePath("/today")
  revalidatePath("/reports")
  revalidatePath("/history")
  revalidatePath("/queue")
  revalidatePath("/overview")
  return { ok: true, due: newDue }
}
