"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { addMonths } from "@/lib/datetime"
import {
  LEFTOVER_CREDIT_TIER,
  MIN_OVERPAY_CREDIT,
  OVERPAY_CREDIT_MONTHS,
  overpayAmount,
  planPaymentReduction,
} from "@/lib/overpay-credit"

type Result = { ok: true; amount: number } | { ok: false; error: string }

/**
 * ย้ายยอดเกินรับของบิลไปเป็นเครดิตลูกค้า (ลูกค้าจ่ายล่วงหน้าแล้วใช้บริการไม่ครบ)
 * ลดบรรทัดชำระลงเท่ายอดเกิน แล้วออกใบ "เครดิตคงเหลือ" ยอดเท่ากัน
 * → เงินเข้าของวันนั้นรวมไม่เปลี่ยน แค่ย้ายจากช่องค่าบริการไปช่องเติมเครดิต
 *
 * ห้ามใช้กับยอดเกินที่เกิดจากคีย์ผิด (ต้องไปลบบรรทัดชำระแทน) — กล่องฝั่งหน้าจอถามสาเหตุก่อนเสมอ
 * ดู docs/superpowers/specs/2026-08-02-overpay-to-credit-design.md
 */
export async function keepOverpayAsCredit(billKey: string): Promise<Result> {
  const me = await getMyProfile()
  if (!me || !["admin", "manager"].includes(me.role ?? "")) {
    return { ok: false, error: "เฉพาะผู้จัดการขึ้นไปเก็บยอดเกินเป็นเครดิตได้" }
  }

  const supabase = await createClient()

  // อ่าน due สดเสมอ — ห้ามเชื่อค่าที่หน้าจอส่งมา (อาจค้างจากตอนโหลดหน้า)
  const { data: bill } = await supabase
    .from("v_bill_due")
    .select("due, credit_total")
    .eq("bill_key", billKey)
    .maybeSingle()
  if (!bill) return { ok: false, error: "ไม่พบบิลนี้ในระบบบรรทัดชำระ" }

  const amount = overpayAmount(Number(bill.due))
  if (amount <= 0) return { ok: false, error: "บิลนี้ไม่มียอดเกินรับแล้ว" }
  if (amount < MIN_OVERPAY_CREDIT) {
    return {
      ok: false,
      error: `เกินรับ ${amount} บาท ต่ำกว่าขั้นต่ำ ${MIN_OVERPAY_CREDIT} บาท — ถือเป็นเศษ ไม่ออกใบเครดิต`,
    }
  }

  // บิลที่จ่ายด้วยเครดิตอยู่แล้วแล้วยังเกิน = ต้องคืนเข้าเครดิตเดิม ไม่ใช่ออกใบใหม่ (ไม่งั้นนับเงินซ้ำ)
  if (Number(bill.credit_total ?? 0) > 0.005) {
    return {
      ok: false,
      error: "บิลนี้จ่ายด้วยเครดิตสมาชิกอยู่แล้ว — ต้องแก้ที่บรรทัดชำระ ไม่ใช่ออกใบเครดิตใหม่",
    }
  }

  // ลูกค้าของบิล — ต้องมีคนเดียวชัดเจน ไม่งั้นไม่รู้จะให้เครดิตใคร
  const { data: saleRows } = await supabase
    .from("sales")
    .select("customer_id")
    .or(`id.eq.${billKey},bill_id.eq.${billKey}`)
  const customerIds = [...new Set((saleRows ?? []).map((s) => s.customer_id))]
  if (customerIds.length !== 1 || !customerIds[0]) {
    return {
      ok: false,
      error: "บิลนี้ยังไม่ได้ผูกลูกค้า (หรือมีหลายคน) — ผูกชื่อลูกค้าก่อนจึงเก็บเป็นเครดิตได้",
    }
  }
  const customerId = customerIds[0]

  const { data: lines } = await supabase
    .from("bill_payments")
    .select("id, amount, method, received_date")
    .eq("bill_key", billKey)
    .order("created_at", { ascending: true })
  const paymentLines = (lines ?? []).map((l) => ({
    id: l.id,
    amount: Number(l.amount),
    method: l.method,
    received_date: l.received_date,
  }))
  if (paymentLines.length === 0) {
    return { ok: false, error: "บิลนี้ไม่มีบรรทัดชำระให้ลด" }
  }

  const steps = planPaymentReduction(
    paymentLines.map((l) => ({ id: l.id, amount: l.amount })),
    amount
  )

  // วันที่/ช่องทางของใบเครดิต = ของบรรทัดล่าสุดที่ถูกลด — ไม่ใช่วันที่กดปุ่ม
  // (ไม่งั้นเงินเข้าเด้งข้ามวัน งบรายวันย้อนหลังเพี้ยน)
  const touched = paymentLines.find((l) => l.id === steps[0]?.id) ?? paymentLines.at(-1)!
  const topupDate = touched.received_date

  for (const step of steps) {
    const { error } = step.remove
      ? await supabase.from("bill_payments").delete().eq("id", step.id)
      : await supabase.from("bill_payments").update({ amount: step.newAmount }).eq("id", step.id)
    if (error) return { ok: false, error: `ลดบรรทัดชำระไม่สำเร็จ: ${error.message}` }
  }

  const { error: topupError } = await supabase.from("member_topups").insert({
    topup_date: topupDate,
    customer_id: customerId,
    tier: LEFTOVER_CREDIT_TIER,
    payment_method: touched.method,
    cash_received: amount,
    credit_added: amount,
    bonus_added: 0,
    expiry_date: addMonths(topupDate, OVERPAY_CREDIT_MONTHS),
    notes: `ยอดจ่ายล่วงหน้าคงเหลือจากบิล ${billKey} — ลูกค้าใช้บริการไม่ครบตามที่จ่ายไว้ · ไม่มีโบนัส ไม่ใช่การสมัครสมาชิก (บันทึกโดย ${me.full_name ?? me.email ?? "ระบบ"})`,
  })
  if (topupError) {
    return { ok: false, error: `ออกใบเครดิตไม่สำเร็จ: ${topupError.message}` }
  }

  revalidatePath("/today")
  revalidatePath("/queue")
  revalidatePath("/history")
  revalidatePath("/members")
  revalidatePath(`/customers/${customerId}`)
  return { ok: true, amount }
}
