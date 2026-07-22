"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { nowTimeInShopTz, todayInShopTz } from "@/lib/datetime"
import { GOWABI_METHOD, MEMBER_CREDIT_METHOD, PAYMENT_METHODS } from "@/lib/constants"
import { computeSaleAmounts } from "@/lib/sale-math"

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
  const isRequest = formData.get("is_request") === "on"
  const discountInput = Math.max(0, toNumber(formData.get("discount")))

  const rawCustomerId = String(formData.get("customer_id") ?? "").trim()
  const customerId = rawCustomerId === "" ? null : rawCustomerId

  // สัดส่วนรับรู้รายได้ของสมาชิก — อ่านก่อนคำนวณ เพราะสูตรต้องใช้
  let memberRatio: number | null = null
  if (paymentMethod === MEMBER_CREDIT_METHOD) {
    if (!customerId) {
      return { ok: false, error: "ชำระด้วย Member Credit ต้องเลือกลูกค้าที่เป็นสมาชิก" }
    }

    const { data: balance } = await supabase
      .from("member_balances")
      .select("credit_balance, credit_granted, cash_paid")
      .eq("customer_id", customerId)
      .single()

    const granted = balance?.credit_granted ?? 0
    memberRatio = granted > 0 ? (balance?.cash_paid ?? 0) / granted : 1

    const credit = balance?.credit_balance ?? 0
    const wanted = priceNormal - discountInput
    if (credit < wanted) {
      return {
        ok: false,
        error: `เครดิตคงเหลือไม่พอ (มี ${credit} บาท ต้องใช้ ${wanted} บาท)`,
      }
    }
  }

  const amounts = computeSaleAmounts({
    priceNormal,
    discount: discountInput,
    paymentMethod,
    gowabiNet:
      paymentMethod === GOWABI_METHOD
        ? toNumber(formData.get("net_amount"), priceNormal)
        : null,
    isRequest,
    requestFee: toNumber(formData.get("request_fee")),
    serviceCommission: service.commission,
    memberRatio,
  })

  if (amounts.netAmount < 0) {
    return { ok: false, error: "ยอดรับจริงติดลบ กรุณาตรวจสอบส่วนลด" }
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
      discount: amounts.discount,
      net_amount: amounts.netAmount,
      commission: amounts.commission,
      payment_method: paymentMethod,
      is_request: isRequest,
      request_fee: amounts.requestFee,
      member_status: paymentMethod === MEMBER_CREDIT_METHOD ? "💳 Member" : null,
      credit_used: amounts.creditUsed,
      bonus_used: amounts.bonusUsed,
      revenue_recognize: amounts.revenueRecognize,
      created_by: profile?.full_name ?? user.email ?? null,
    })
    .select("id, receipt_no")
    .single()

  if (error) return { ok: false, error: `บันทึกไม่สำเร็จ: ${error.message}` }

  // มาจากบอร์ดคิว → ปิดคิวเป็นชำระแล้ว + ผูกใบขาย
  // (สองคำสั่งแยกกัน ถ้าอัปเดตคิวพลาด ใบขายยังถูกต้อง การ์ดค้างสถานะเดิม
  //  พนักงานกดเก็บเงินซ้ำไม่เกิดใบขายซ้ำ เพราะหน้า POS กรอง status=paid ออกแล้ว)
  const queueEntryId = String(formData.get("queue_entry_id") ?? "")
  if (queueEntryId) {
    await supabase
      .from("queue_entries")
      .update({
        status: "paid",
        sale_id: inserted.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", queueEntryId)
      .neq("status", "paid")
    revalidatePath("/queue")
  }

  revalidatePath("/")
  revalidatePath("/commission")

  return { ok: true, receiptNo: inserted.receipt_no ?? "" }
}

export async function deleteSale(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("sales")
    .select("sale_date")
    .eq("id", id)
    .single()

  if (!existing) return { ok: false, error: "ไม่พบรายการขายนี้" }
  if (!isCurrentMonth(existing.sale_date)) {
    return { ok: false, error: "ลบได้เฉพาะรายการของเดือนปัจจุบัน" }
  }

  const { error } = await supabase.from("sales").delete().eq("id", id)

  if (error) return { ok: false, error: error.message }

  revalidatePath("/today")
  revalidatePath("/")
  revalidatePath("/commission")
  revalidatePath("/overview")
  return { ok: true }
}

export type UpdateResult = { ok: true } | { ok: false; error: string }

/** แก้ได้เฉพาะเดือนปัจจุบัน — เดือนที่ปิดงบไปแล้วห้ามขยับ ไม่งั้นรายงานที่ส่งไปแล้วจะไม่ตรง */
function isCurrentMonth(saleDate: string): boolean {
  return saleDate.slice(0, 7) === todayInShopTz().slice(0, 7)
}

export async function updateSale(
  id: string,
  formData: FormData
): Promise<UpdateResult> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("sales")
    .select("sale_date, credit_used, customer_id, updated_at")
    .eq("id", id)
    .single()

  if (!existing) return { ok: false, error: "ไม่พบรายการขายนี้" }
  if (!isCurrentMonth(existing.sale_date)) {
    return { ok: false, error: "แก้ได้เฉพาะรายการของเดือนปัจจุบัน" }
  }

  // ฟอร์มส่งค่า updated_at ที่มันเห็นตอนเปิดกลับมาด้วย ถ้าไม่ตรงกับของจริงในฐานข้อมูล
  // แปลว่ามีคนอื่นแก้รายการนี้ไปแล้วหลังจากหน้านี้ถูก render — ต้องหยุดก่อนเขียนทับ
  // เพราะฟอร์มส่งกลับมาทุกช่อง การบันทึกทับจะลบงานของคนแรกทิ้งทั้งแถว
  // ตรวจตรงนี้ก่อนการเขียนทุกอย่าง (แต่หลังเช็คว่ามีแถวจริงและอยู่ในเดือนปัจจุบัน)
  //
  // ไม่ส่งมา = บั๊กของฟอร์ม ไม่ใช่ของเก่าที่ยังไม่อัปเดต — ต้องไม่ปล่อยผ่าน
  // เพราะการปล่อยผ่านคือการกลับไปเป็นบั๊กเงียบๆ ตัวเดิมที่กำลังแก้อยู่นี่แหละ
  const seenUpdatedAt = String(formData.get("updated_at") ?? "")
  if (!seenUpdatedAt) {
    return { ok: false, error: "ฟอร์มไม่ได้ส่งเวอร์ชันของรายการมาด้วย กรุณาปิดแล้วเปิดใหม่" }
  }
  if (seenUpdatedAt !== existing.updated_at) {
    return {
      ok: false,
      error: "มีคนแก้รายการนี้ไปแล้วระหว่างที่คุณเปิดฟอร์มอยู่ กรุณาปิดแล้วเปิดใหม่เพื่อดูข้อมูลล่าสุด",
    }
  }

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

  const rawCustomerId = String(formData.get("customer_id") ?? "").trim()
  const customerId = rawCustomerId === "" ? null : rawCustomerId
  const discountInput = Math.max(0, toNumber(formData.get("discount")))

  let memberRatio: number | null = null
  if (paymentMethod === MEMBER_CREDIT_METHOD) {
    if (!customerId) {
      return { ok: false, error: "ชำระด้วย Member Credit ต้องเลือกลูกค้าที่เป็นสมาชิก" }
    }

    const { data: balance } = await supabase
      .from("member_balances")
      .select("credit_balance, credit_granted, cash_paid")
      .eq("customer_id", customerId)
      .single()

    const granted = balance?.credit_granted ?? 0
    memberRatio = granted > 0 ? (balance?.cash_paid ?? 0) / granted : 1

    // ยอดคงเหลือปัจจุบันหักรายการนี้ไปแล้ว การแก้จะคืนของเดิมก่อนตัดใหม่
    // เพดานจึงเป็นคงเหลือ + ที่รายการนี้เคยตัด — แต่คืนได้เฉพาะเมื่อยังเป็นลูกค้าคนเดิม
    const sameCustomer = existing.customer_id === customerId
    const headroom =
      Number(balance?.credit_balance ?? 0) +
      (sameCustomer ? Number(existing.credit_used ?? 0) : 0)

    const wanted = service.price - discountInput
    if (headroom < wanted) {
      return {
        ok: false,
        error: `เครดิตคงเหลือไม่พอ (แก้เป็นได้สูงสุด ${headroom} บาท ต้องใช้ ${wanted} บาท)`,
      }
    }
  }

  const amounts = computeSaleAmounts({
    priceNormal: service.price,
    discount: discountInput,
    paymentMethod,
    gowabiNet:
      paymentMethod === GOWABI_METHOD
        ? toNumber(formData.get("net_amount"), service.price)
        : null,
    isRequest: formData.get("is_request") === "on",
    requestFee: toNumber(formData.get("request_fee")),
    serviceCommission: service.commission,
    memberRatio,
  })

  if (amounts.netAmount < 0) {
    return { ok: false, error: "ยอดรับจริงติดลบ กรุณาตรวจสอบส่วนลด" }
  }

  const { data: updated, error } = await supabase
    .from("sales")
    .update({
      customer_id: customerId,
      customer_name: String(formData.get("customer_name") ?? "").trim() || null,
      customer_phone: String(formData.get("customer_phone") ?? "").trim() || null,
      therapist_id: therapistId,
      service_id: serviceId,
      service_name: service.name,
      price_normal: service.price,
      coupon_promo: String(formData.get("coupon_promo") ?? "").trim() || null,
      discount: amounts.discount,
      net_amount: amounts.netAmount,
      commission: amounts.commission,
      payment_method: paymentMethod,
      is_request: formData.get("is_request") === "on",
      request_fee: amounts.requestFee,
      member_status: paymentMethod === MEMBER_CREDIT_METHOD ? "💳 Member" : null,
      credit_used: amounts.creditUsed,
      bonus_used: amounts.bonusUsed,
      revenue_recognize: amounts.revenueRecognize,
    })
    .eq("id", id)
    // กันการแก้ชนกันจริงๆ อยู่ตรงนี้ — ถ้ามีคนบันทึกแทรกระหว่างที่เราอ่านกับเขียน
    // เงื่อนไขนี้จะไม่ match แล้วไม่มีแถวไหนถูกเขียน แทนที่จะทับของเขาเงียบๆ
    // ใช้ค่าที่ผู้ใช้เห็นจริงในฟอร์ม เพราะนั่นคือเวอร์ชันที่เรากำลังยืนยันว่ายังไม่เก่า
    .eq("updated_at", seenUpdatedAt)
    .select("id")

  if (error) return { ok: false, error: `แก้ไขไม่สำเร็จ: ${error.message}` }
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error: "มีคนแก้รายการนี้ไปแล้วระหว่างที่คุณกดบันทึก กรุณาปิดแล้วเปิดใหม่",
    }
  }

  revalidatePath("/today")
  revalidatePath("/")
  revalidatePath("/commission")
  revalidatePath("/overview")
  return { ok: true }
}
