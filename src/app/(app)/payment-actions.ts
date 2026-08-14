"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { PAYMENT_LINE_METHODS, primaryMethod } from "@/lib/payments"
import { todayInShopTz } from "@/lib/datetime"
import { REAL_MONEY_METHODS } from "@/lib/constants"
import { canEditPaymentMethodOn } from "@/lib/accounting-window"

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
  const editedAt = new Date().toISOString()

  const { data: updated, error } = await supabase
    .from("bill_payments")
    .update({ method, edited_by: editedBy, edited_at: editedAt })
    .eq("id", paymentId)
    .select("id")
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  // อัปเดต 0 แถวแต่ไม่มี error = RLS ปฏิเสธเงียบ ถ้าไม่ดักตรงนี้หน้าจอจะขึ้นว่าสำเร็จทั้งที่ไม่มีอะไรเปลี่ยน
  if (!updated) return { ok: false, error: "แก้ไม่สำเร็จ — สิทธิ์ไม่พอหรือบรรทัดนี้ถูกลบไปแล้ว" }

  // วิธีหลักของบิล = วิธีของบรรทัดที่ยอดสูงสุด — อ่านสดหลังแก้แล้วให้ primaryMethod ตัดสิน
  // (ห้ามเดาจากบรรทัดที่เพิ่งแก้ บิลแบ่งจ่ายอาจมีบรรทัดอื่นที่ใหญ่กว่า)
  const { data: allLines } = await supabase
    .from("bill_payments")
    .select("method, amount")
    .eq("bill_key", billKey)
  const lines = (allLines ?? []).map((l) => ({
    method: String(l.method),
    amount: Number(l.amount),
  }))
  const primary = primaryMethod(lines)

  if (primary) {
    const { error: saleError } = await supabase
      .from("sales")
      .update({ payment_method: primary, edited_by: editedBy })
      .or(`bill_id.eq.${billKey},id.eq.${billKey}`)
    // บรรทัดชำระเปลี่ยนไปแล้วแต่ป้ายช่องทางของบิลยังไม่ตาม — สองที่ไม่ตรงกันจนกว่าจะลองใหม่
    // (กดซ้ำได้ปลอดภัย ฟังก์ชันนี้เขียนค่าเดิมซ้ำได้ไม่เสียหาย)
    if (saleError)
      return {
        ok: false,
        error: `เปลี่ยนช่องทางของบรรทัดแล้ว แต่อัปเดตป้ายช่องทางของบิลไม่สำเร็จ กรุณากดใหม่อีกครั้ง (${saleError.message})`,
      }
  }

  revalidatePath("/today")
  revalidatePath("/reports")
  revalidatePath("/history")
  revalidatePath("/queue")
  revalidatePath("/overview")
  return { ok: true }
}
