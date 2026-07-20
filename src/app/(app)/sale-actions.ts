"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { nowTimeInShopTz, todayInShopTz } from "@/lib/datetime"
import { GOWABI_METHOD, MEMBER_CREDIT_METHOD, PAYMENT_METHODS } from "@/lib/constants"

export type SaleResult = { ok: true; receiptNo: string } | { ok: false; error: string }

function toNumber(value: FormDataEntryValue | null, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export async function createSale(formData: FormData): Promise<SaleResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "กรุณาเข้าสู่ระบบใหม่" }

  const therapistId = String(formData.get("therapist_id") ?? "")
  const serviceId = String(formData.get("service_id") ?? "")
  const paymentMethod = String(formData.get("payment_method") ?? "")

  if (!therapistId) return { ok: false, error: "กรุณาเลือกหมอนวด" }
  if (!serviceId) return { ok: false, error: "กรุณาเลือกเมนูบริการ" }
  if (!PAYMENT_METHODS.includes(paymentMethod as never)) {
    return { ok: false, error: "กรุณาเลือกช่องทางชำระเงิน" }
  }

  // อ่านราคา/ค่ามือจากฐานข้อมูล ไม่เชื่อค่าที่ส่งมาจากฟอร์ม
  const { data: service } = await supabase
    .from("services")
    .select("name, price, commission")
    .eq("id", serviceId)
    .single()

  if (!service) return { ok: false, error: "ไม่พบเมนูบริการที่เลือก" }

  const priceNormal = service.price
  const discount = Math.max(0, toNumber(formData.get("discount")))
  const isRequest = formData.get("is_request") === "on"
  const requestFee = isRequest ? Math.max(0, toNumber(formData.get("request_fee"))) : 0

  // Gowabi จ่ายตามดีลของเขา ยอดรับจริงอาจไม่เท่าราคาปกติ จึงกรอกยอดเองได้
  let netAmount: number
  if (paymentMethod === GOWABI_METHOD) {
    netAmount = Math.max(0, toNumber(formData.get("net_amount"), priceNormal))
  } else {
    netAmount = priceNormal - discount
  }

  if (netAmount < 0) return { ok: false, error: "ยอดรับจริงติดลบ กรุณาตรวจสอบส่วนลด" }

  const rawCustomerId = String(formData.get("customer_id") ?? "").trim()
  const customerId = rawCustomerId === "" ? null : rawCustomerId

  let creditUsed = 0
  let bonusUsed = 0
  let revenueRecognize = netAmount

  if (paymentMethod === MEMBER_CREDIT_METHOD) {
    if (!customerId) {
      return { ok: false, error: "ชำระด้วย Member Credit ต้องเลือกลูกค้าที่เป็นสมาชิก" }
    }

    const { data: balance } = await supabase
      .from("member_balances")
      .select("credit_balance, credit_granted, cash_paid")
      .eq("customer_id", customerId)
      .single()

    const credit = balance?.credit_balance ?? 0

    if (credit < netAmount) {
      return {
        ok: false,
        error: `เครดิตคงเหลือไม่พอ (มี ${credit} บาท ต้องใช้ ${netAmount} บาท)`,
      }
    }

    // ตัดเครดิตเต็มจำนวน — bonus รวมอยู่ในเครดิตแล้ว ไม่ใช่กระเป๋าแยก
    creditUsed = netAmount

    // รับรู้รายได้เฉพาะส่วนที่มีเงินสดหนุนหลัง ส่วนที่แถมไม่ใช่รายได้
    // เช่น Silver จ่าย 5,000 ได้เครดิต 6,000 -> ใช้ 690 รับรู้รายได้ 575 ที่เหลือ 115 คือของแถม
    const granted = balance?.credit_granted ?? 0
    const cashPaid = balance?.cash_paid ?? 0
    const ratio = granted > 0 ? cashPaid / granted : 1
    revenueRecognize = Math.round(netAmount * ratio * 100) / 100
    bonusUsed = Math.round((netAmount - revenueRecognize) * 100) / 100
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .single()

  const { data: inserted, error } = await supabase
    .from("sales")
    .insert({
      sale_date: todayInShopTz(),
      sale_time: nowTimeInShopTz(),
      customer_id: customerId,
      customer_name: String(formData.get("customer_name") ?? "").trim() || null,
      customer_phone: String(formData.get("customer_phone") ?? "").trim() || null,
      therapist_id: therapistId,
      service_id: serviceId,
      service_name: service.name,
      price_normal: priceNormal,
      coupon_promo: String(formData.get("coupon_promo") ?? "").trim() || null,
      discount: paymentMethod === GOWABI_METHOD ? priceNormal - netAmount : discount,
      net_amount: netAmount,
      commission: service.commission,
      payment_method: paymentMethod,
      is_request: isRequest,
      request_fee: requestFee,
      member_status: paymentMethod === MEMBER_CREDIT_METHOD ? "💳 Member" : null,
      credit_used: creditUsed,
      bonus_used: bonusUsed,
      revenue_recognize: revenueRecognize,
      created_by: profile?.full_name ?? user.email ?? null,
    })
    .select("receipt_no")
    .single()

  if (error) return { ok: false, error: `บันทึกไม่สำเร็จ: ${error.message}` }

  revalidatePath("/")
  revalidatePath("/commission")

  return { ok: true, receiptNo: inserted.receipt_no ?? "" }
}

export async function deleteSale(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from("sales").delete().eq("id", id)

  if (error) return { ok: false, error: error.message }

  revalidatePath("/")
  revalidatePath("/commission")
  return { ok: true }
}
