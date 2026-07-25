"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { nowTimeInShopTz, todayInShopTz } from "@/lib/datetime"
import { GOWABI_METHOD, MEMBER_CREDIT_METHOD, PAYMENT_METHODS } from "@/lib/constants"
import { computeSaleAmounts } from "@/lib/sale-math"
import { pointExpiryDate, pointsForBaht } from "@/lib/points"

export type SaleResult =
  | {
      ok: true
      receiptNo: string
      /** เครดิตคงเหลือหลังบิลนี้ — มีค่าเฉพาะบิลที่จ่ายด้วยเครดิตสมาชิก */
      creditAfter: number | null
    }
  | { ok: false; error: string }

function toNumber(value: FormDataEntryValue | null, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * แต้มสะสมของบิล: ลบของเดิมแล้วใส่ใหม่ตามยอดปัจจุบัน — แก้บิลแล้วแต้มตามยอดใหม่เสมอ
 * ลบบิล → แต้มหายเองผ่าน FK cascade · เครดิตสมาชิกไม่ได้แต้ม (ได้ตอนเติมเงินแล้ว)
 * แต้มเป็นของแถม ไม่ใช่สมุดเงิน — พลาดก็ไม่กระทบบิล จึงไม่เช็ค error
 */
async function syncSalePoints(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sale: {
    id: string
    customer_id: string | null
    net_amount: number
    payment_method: string
    sale_date: string
  }
) {
  const points =
    sale.customer_id && sale.payment_method !== MEMBER_CREDIT_METHOD
      ? pointsForBaht(sale.net_amount)
      : 0
  await supabase.from("point_transactions").delete().eq("sale_id", sale.id)
  if (points > 0 && sale.customer_id) {
    await supabase.from("point_transactions").insert({
      customer_id: sale.customer_id,
      delta: points,
      reason: "แต้มจากบิลขาย",
      sale_id: sale.id,
      expires_at: pointExpiryDate(sale.sale_date),
    })
  }
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

  // อ่านราคา/ค่ามือจากฐานข้อมูล ไม่เชื่อค่าที่ส่งมาจากฟอร์ม (duration ใช้สร้างการ์ดคิว)
  const { data: service } = await supabase
    .from("services")
    .select("name, price, commission, duration_min")
    .eq("id", serviceId)
    .single()

  if (!service) return { ok: false, error: "ไม่พบเมนูบริการที่เลือก" }

  const priceNormal = service.price
  const isRequest = formData.get("is_request") === "on"
  const discountInput = Math.round(Math.max(0, toNumber(formData.get("discount")))) // กันเศษสตางค์หลุดเข้าบิล

  const rawCustomerId = String(formData.get("customer_id") ?? "").trim()
  const customerId = rawCustomerId === "" ? null : rawCustomerId

  // สัดส่วนรับรู้รายได้ของสมาชิก — อ่านก่อนคำนวณ เพราะสูตรต้องใช้
  let memberRatio: number | null = null
  // เครดิตคงเหลือหลังหักบิลนี้ — โชว์บนใบเสร็จให้ลูกค้าเห็นทันที (snapshot ณ ตอนขาย)
  let creditAfter: number | null = null
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
    creditAfter = credit - wanted
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

  // ต้องกรอง id เอง — admin เห็นได้ทุกโปรไฟล์ ถ้า .single() เฉยๆ จะเจอหลายแถวแล้ว error
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle()

  // วันที่ยอดขาย = วันที่ให้บริการ: บิลที่ผูกคิว (รวมจองล่วงหน้าจากไลน์) ใช้วันของคิว
  // ไม่ใช่วันที่คีย์บิล — ยอดขาย/ค่ามือหมอ/ประกันรายวัน ต้องตกวันเดียวกับที่นวดจริง
  const linkedQueueId = String(formData.get("queue_entry_id") ?? "")
  let saleDate = todayInShopTz()
  if (linkedQueueId) {
    const { data: linkedQueue } = await supabase
      .from("queue_entries")
      .select("queue_date")
      .eq("id", linkedQueueId)
      .maybeSingle()
    if (linkedQueue?.queue_date) saleDate = linkedQueue.queue_date
  }
  // sale_time = เวลาที่ลูกค้าใช้บริการ (พนักงานแก้ได้ เพราะบิลมักคีย์หลังนวดเสร็จ)
  // ส่วนเวลาที่บันทึกจริงอยู่ที่ created_at ซึ่งฐานข้อมูลประทับให้เองเสมอ
  const saleTime = /^\d{2}:\d{2}$/.test(String(formData.get("sale_time") ?? ""))
    ? String(formData.get("sale_time"))
    : nowTimeInShopTz()

  const { data: inserted, error } = await supabase
    .from("sales")
    .insert({
      sale_date: saleDate,
      sale_time: saleTime,
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
      credit_after: creditAfter,
      bonus_used: amounts.bonusUsed,
      revenue_recognize: amounts.revenueRecognize,
      created_by: profile?.full_name ?? user.email ?? null,
      // บิลกลุ่ม (ครอบครัวจ่ายพร้อมกัน) — ผูกไว้แค่ให้รู้ว่าบิลไหนมาด้วยกัน ไม่กระทบสูตรเงิน
      group_id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(formData.get("group_id") ?? "")
      )
        ? String(formData.get("group_id"))
        : null,
      // บิลชุด (ลูกค้าคนเดียวหลายรายการจ่ายรวม) — ไม่กระทบสูตรเงินเช่นกัน
      bill_id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(formData.get("bill_id") ?? "")
      )
        ? String(formData.get("bill_id"))
        : null,
      // metadata ของบิล (ที่มา/ช่องทางย่อย/เตียง/หมายเหตุ) — ไม่กระทบสูตรเงิน
      // ค่าเพี้ยนจาก client เก่า → null (ไม่ทราบ) ดีกว่าเดาผิด
      source: (() => {
        const s = String(formData.get("source") ?? "")
        return ["walk_in", "booking", "agency"].includes(s) ? s : null
      })(),
      booking_channel: (() => {
        const c = String(formData.get("booking_channel") ?? "")
        return ["line", "phone", "facebook"].includes(c) ? c : null
      })(),
      bed_id: String(formData.get("bed_id") ?? "") || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    })
    .select("id, receipt_no")
    .single()

  if (error) return { ok: false, error: `บันทึกไม่สำเร็จ: ${error.message}` }

  // แต้มสะสม: บิลผูกลูกค้า + จ่ายจริง → ทุก 100฿ = 1 แต้ม (เครดิตสมาชิกได้ตอนเติมไปแล้ว)
  await syncSalePoints(supabase, {
    id: inserted.id,
    customer_id: customerId,
    net_amount: amounts.netAmount,
    payment_method: paymentMethod,
    sale_date: saleDate,
  })

  // บิลจากคูปองแลกแต้ม → ปิดคูปองเป็นใช้แล้ว ผูกกับบิลนี้
  const redemptionId = String(formData.get("redemption_id") ?? "")
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(redemptionId)) {
    await supabase
      .from("point_redemptions")
      .update({
        status: "used",
        used_sale_id: inserted.id,
        used_by: profile?.full_name ?? user.email ?? null,
        used_at: new Date().toISOString(),
      })
      .eq("id", redemptionId)
      .eq("status", "issued")
  }

  // มาจากบอร์ดคิว → ปิดคิวเป็นชำระแล้ว + ผูกใบขาย
  // (สองคำสั่งแยกกัน ถ้าอัปเดตคิวพลาด ใบขายยังถูกต้อง การ์ดค้างสถานะเดิม
  //  พนักงานกดเก็บเงินซ้ำไม่เกิดใบขายซ้ำ เพราะหน้า POS กรอง status=paid ออกแล้ว)
  // กัน pending/rejected ด้วย — คิวที่ยังไม่อนุมัติ/ถูกปฏิเสธจากไลน์ ห้ามถูกผูกบิลจนกว่าจะรับจองก่อน
  // (cancelled ยังปล่อยผ่านเหมือนเดิม — พนักงานเปิดบิลให้คิวที่เคยยกเลิกได้ตั้งใจ ถ้าลูกค้ากลับมา)
  const queueEntryId = linkedQueueId
  if (queueEntryId) {
    await supabase
      .from("queue_entries")
      .update({
        status: "paid",
        sale_id: inserted.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", queueEntryId)
      .not("status", "in", "(paid,pending,rejected)")
  } else {
    // บิลที่คีย์ตรงไม่ผ่านคิว → สร้างการ์ดคิว "ชำระแล้ว" ให้อัตโนมัติ
    // บอร์ดคิวจะเห็นว่าหมอคนนี้มีงานช่วงเวลานั้นจริง จัดคิวไม่ทับซ้อน
    // (คิวเป็นผังงานไม่ใช่สมุดเงิน — พลาดก็ไม่กระทบบิล จึงไม่เช็ค error)
    await supabase.from("queue_entries").insert({
      queue_date: saleDate,
      therapist_id: therapistId,
      service_id: serviceId,
      service_name: service.name,
      duration_min: service.duration_min ?? 60,
      customer_id: customerId,
      customer_name: String(formData.get("customer_name") ?? "").trim() || null,
      customer_phone: String(formData.get("customer_phone") ?? "").trim() || null,
      is_request: isRequest,
      start_time: saleTime,
      status: "paid",
      sale_id: inserted.id,
      bed_id: String(formData.get("bed_id") ?? "") || null,
      source: (() => {
        const s = String(formData.get("source") ?? "")
        return ["walk_in", "booking", "agency"].includes(s) ? s : "walk_in"
      })(),
      group_id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(formData.get("group_id") ?? "")
      )
        ? String(formData.get("group_id"))
        : null,
    })
  }
  revalidatePath("/queue")

  revalidatePath("/")
  revalidatePath("/commission")

  return { ok: true, receiptNo: inserted.receipt_no ?? "", creditAfter }
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

  // บิลที่มาจากคิว: ถอยการ์ดกลับเป็น "กำลังให้บริการ" ให้เก็บเงินใหม่ได้
  // ไม่งั้นการ์ดค้างเป็น "ชำระแล้ว" ทั้งที่บิลถูกลบไปแล้ว (FK เป็น set null ก็จริง
  // แต่ set null ไม่ได้แก้สถานะให้) — ต้องทำก่อนลบ เพราะหลังลบจะหา sale_id ไม่เจอแล้ว
  await supabase
    .from("queue_entries")
    .update({ status: "in_service", sale_id: null })
    .eq("sale_id", id)
    .eq("status", "paid")

  const { error } = await supabase.from("sales").delete().eq("id", id)

  if (error) return { ok: false, error: error.message }

  revalidatePath("/today")
  revalidatePath("/")
  revalidatePath("/commission")
  revalidatePath("/overview")
  revalidatePath("/queue")
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
  // (duration_min ใช้ sync การ์ดคิวถ้าบิลนี้ผูกคิวอยู่ — เหมือน createSale)
  const { data: service } = await supabase
    .from("services")
    .select("name, price, commission, duration_min")
    .eq("id", serviceId)
    .single()

  if (!service) return { ok: false, error: "ไม่พบเมนูบริการที่เลือก" }

  const rawCustomerId = String(formData.get("customer_id") ?? "").trim()
  const customerId = rawCustomerId === "" ? null : rawCustomerId
  const discountInput = Math.round(Math.max(0, toNumber(formData.get("discount")))) // กันเศษสตางค์หลุดเข้าบิล

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

  // audit: ใครเป็นคนแก้บิลครั้งล่าสุด — ต้องกรอง id เอง เพราะ admin เห็นทุกโปรไฟล์
  const editorProfile = await getMyProfile()

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
      notes: String(formData.get("notes") ?? "").trim() || null,
      edited_by: editorProfile?.full_name ?? null,
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

  // ยอด/ลูกค้า/วิธีจ่ายอาจเปลี่ยน → คำนวณแต้มของบิลนี้ใหม่ทั้งก้อน
  await syncSalePoints(supabase, {
    id,
    customer_id: customerId,
    net_amount: amounts.netAmount,
    payment_method: paymentMethod,
    sale_date: existing.sale_date,
  })

  // บิลนี้อาจมีการ์ดคิวผูกอยู่ (คิววันนี้) — sync ฟิลด์ที่การ์ดคิว "มิเรอร์" มาจากบิลตอนสร้าง
  // (ดู createSale) ไม่งั้นแก้โปรแกรมนวดในบิลแล้วการ์ดคิวยังค้างค่าเก่า — เคสจริงที่พนักงานเจอ:
  // ลูกค้าเปลี่ยนโปรแกรม 60→90 นาที บิลถูกแล้วแต่การ์ดคิวยังโชว์ 60 นาที ต้องลบบิลทิ้งแล้วสร้างคิวใหม่
  // .eq("sale_id", id) ทำหน้าที่กรอง "มีคิวผูกอยู่จริงไหม" ในตัวเอง — ไม่มีคิวผูกก็ไม่มีแถวไหนถูกแก้
  // (คิวเป็นผังงานไม่ใช่สมุดเงิน — พลาดก็ไม่กระทบบิล จึงไม่เช็ค error เหมือน createSale)
  await supabase
    .from("queue_entries")
    .update({
      service_id: serviceId,
      service_name: service.name,
      duration_min: service.duration_min ?? 60,
      therapist_id: therapistId,
      customer_name: String(formData.get("customer_name") ?? "").trim() || null,
      customer_phone: String(formData.get("customer_phone") ?? "").trim() || null,
      is_request: formData.get("is_request") === "on",
      updated_at: new Date().toISOString(),
    })
    .eq("sale_id", id)

  revalidatePath("/today")
  revalidatePath("/")
  revalidatePath("/commission")
  revalidatePath("/overview")
  revalidatePath("/queue")
  return { ok: true }
}

export type CouponCheck =
  | {
      ok: true
      redemptionId: string
      rewardName: string
      customerId: string
      customerName: string
      customerPhone: string
      /** เมนูที่ผูกกับรางวัล (ถ้ามี) — POS จะเลือกเมนู+ส่วนลดเต็มให้เอง */
      serviceId: string | null
    }
  | { ok: false; error: string }

/** ตรวจรหัสคูปองแลกแต้มจากลูกค้า — ใช้ในหน้า POS ก่อนบันทึกบิล 0 บาท */
export async function checkPointCoupon(codeRaw: string): Promise<CouponCheck> {
  const supabase = await createClient()
  const code = codeRaw.trim().toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return { ok: false, error: "รหัสคูปองต้องเป็นตัวอักษร/ตัวเลข 6 ตัว" }
  }

  const { data: coupon } = await supabase
    .from("point_redemptions")
    .select("id, status, expires_at, reward_name, reward_id, customer_id, customers(name, phone)")
    .eq("code", code)
    .maybeSingle()

  if (!coupon) return { ok: false, error: "ไม่พบคูปองรหัสนี้" }
  if (coupon.status === "used") return { ok: false, error: "คูปองนี้ถูกใช้ไปแล้ว" }
  if (coupon.status !== "issued") return { ok: false, error: "คูปองนี้ถูกยกเลิก/หมดอายุแล้ว" }
  if (coupon.expires_at < todayInShopTz()) {
    return { ok: false, error: `คูปองหมดอายุแล้ว (${coupon.expires_at})` }
  }

  const { data: reward } = await supabase
    .from("point_rewards")
    .select("service_id")
    .eq("id", coupon.reward_id)
    .maybeSingle()

  const customer = (
    coupon as unknown as { customers: { name: string; phone: string | null } | null }
  ).customers

  return {
    ok: true,
    redemptionId: coupon.id,
    rewardName: coupon.reward_name,
    customerId: coupon.customer_id,
    customerName: customer?.name ?? "",
    customerPhone: customer?.phone ?? "",
    serviceId: reward?.service_id ?? null,
  }
}
