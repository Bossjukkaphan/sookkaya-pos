"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { nowTimeInShopTz, todayInShopTz } from "@/lib/datetime"
import {
  GOWABI_METHOD,
  MEMBER_CREDIT_METHOD,
  PAYMENT_METHODS,
  PRIVATE_ROOM_FEE,
} from "@/lib/constants"
import { computeSaleAmounts } from "@/lib/sale-math"
import { parsePaymentLines, primaryMethod } from "@/lib/payments"
import { pointExpiryDate, pointsForSale } from "@/lib/points"
import { queueMirrorFromSale } from "@/lib/queue"

export type SaleResult =
  | {
      ok: true
      receiptNo: string
      /** เครดิตคงเหลือหลังบิลนี้ — มีค่าเฉพาะบิลที่จ่ายด้วยเครดิตสมาชิก */
      creditAfter: number | null
      /** บันทึกบิลสำเร็จแต่มีบางอย่างพลาด (เช่น เขียนบรรทัดชำระไม่สำเร็จ) — ไม่ถึงขั้นล้มทั้งบิล แต่พนักงานควรรู้ */
      warning?: string
    }
  | { ok: false; error: string }

function toNumber(value: FormDataEntryValue | null, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * แต้มสะสมของบิล: ลบของเดิมแล้วใส่ใหม่ตามยอดปัจจุบัน — แก้บิลแล้วแต้มตามยอดใหม่เสมอ
 * ลบบิล → แต้มหายเองผ่าน FK cascade
 * ได้แต้มเฉพาะ เงินสด/QR/บัตรเครดิต — Gowabi/KOL ไม่ใช่เงินตรงจากลูกค้า
 * เครดิตสมาชิกไม่ได้แต้มซ้ำ (ได้ไปแล้วตอนเติมเงิน)
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
    credit_used: number
  }
) {
  const points = sale.customer_id
    ? pointsForSale({
        paymentMethod: sale.payment_method,
        netAmount: sale.net_amount,
        creditUsed: sale.credit_used,
      })
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
  // ปกติเป็นค่าคงที่ตลอดฟังก์ชัน — แต่ normalize เป็น Member Credit ได้ทีหลังถ้าแบ่งจ่ายตัดเครดิตเต็มบิลพอดี
  // (ดูจุด normalize ด้านล่างหลัง computeSaleAmounts)
  let paymentMethod = String(formData.get("payment_method") ?? "")

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
  // ห้องสปาส่วนตัว: ราคาล็อกตายตัวฝั่ง server — ไม่เชื่อตัวเลขจากฟอร์ม (กันคีย์ผิด/ปลอมค่า)
  const privateRoom = formData.get("private_room") === "on"
  const roomFee = privateRoom ? PRIVATE_ROOM_FEE : 0
  const discountInput = Math.round(Math.max(0, toNumber(formData.get("discount")))) // กันเศษสตางค์หลุดเข้าบิล

  const rawCustomerId = String(formData.get("customer_id") ?? "").trim()
  let customerId = rawCustomerId === "" ? null : rawCustomerId

  // นโยบายร้าน: ทุกคนเป็นสมาชิกสะสมแต้ม — บิลที่พิมพ์ชื่อ+เบอร์ใหม่ (ไม่ได้เลือกจากระบบ)
  // ให้จับคู่ลูกค้าด้วยเบอร์: เจอ = ผูกคนเดิม (แต้มสะสมต่อเนื่อง) · ไม่เจอ = สร้างลูกค้าใหม่ให้
  // ไม่มีเบอร์ = ผูกไม่ได้ (เบอร์คือกุญแจกันสร้างคนซ้ำ) — บิลยังบันทึกได้ แค่ไม่ได้แต้ม
  const typedName = String(formData.get("customer_name") ?? "").trim()
  const typedPhone = String(formData.get("customer_phone") ?? "").trim()
  //
  // หนึ่งเบอร์มีได้หลายคนจริง — คู่รักและครอบครัวใช้เบอร์เดียวกัน (ตรวจ 28/7/2569 เจอ 32 เบอร์
  // เช่น "อาร์ม/ชาแนล" "ยูมี/แบงค์" "พี พีรดา กับ แมน") ปนกับคนเดียวกันที่สะกดชื่อคนละแบบ
  // เดิมหยิบ .limit(1) เฉยๆ ซึ่งไม่มีลำดับ = ได้ระเบียนไหนก็ไม่รู้ แต้มกับประวัติเลยกระจายคนละที่
  // ตอนนี้เลือกคนที่ "ชื่อตรงกับที่พิมพ์" ก่อน ถ้าไม่มีชื่อตรงค่อยใช้ระเบียนที่เก่าที่สุด
  // (เก่าที่สุด = ตัวจริงที่สะสมประวัติไว้มากกว่า และสำคัญกว่านั้นคือให้ผลเหมือนเดิมทุกครั้ง)
  if (!customerId && typedPhone) {
    const { data: samePhone } = await supabase
      .from("customers")
      .select("id, name")
      .eq("phone", typedPhone)
      .order("created_at", { ascending: true })

    const byPhone =
      samePhone?.find((c) => c.name?.trim() === typedName) ?? samePhone?.[0] ?? null

    if (byPhone) {
      customerId = byPhone.id
    } else if (typedName) {
      const { data: created } = await supabase
        .from("customers")
        .insert({ name: typedName, phone: typedPhone })
        .select("id")
        .maybeSingle()
      customerId = created?.id ?? null
    }
  }

  // แบ่งชำระ: เครดิตบางส่วน + ช่องทางเงินจริง (สเปก 2026-07-31)
  // ช่องทาง "Member Credit" = เครดิตเต็มบิล ไม่ใช้ค่านี้ (เดินด่านเดิมด้านล่าง)
  const creditRequested =
    paymentMethod === MEMBER_CREDIT_METHOD ? 0 : toNumber(formData.get("credit_requested"))

  // แบ่งชำระใช้ได้กับช่องทางเงินจริงจากลูกค้าเท่านั้น — Gowabi/KOL เงินไม่ได้มาจากลูกค้าตรงๆ
  if (creditRequested > 0 && (paymentMethod === GOWABI_METHOD || paymentMethod === "KOL")) {
    return { ok: false, error: "ช่องทางนี้ใช้ร่วมกับเครดิตสมาชิกไม่ได้" }
  }

  // สัดส่วนรับรู้รายได้ของสมาชิก — อ่านก่อนคำนวณ เพราะสูตรต้องใช้
  let memberRatio: number | null = null
  // เครดิตคงเหลือหลังหักบิลนี้ — โชว์บนใบเสร็จให้ลูกค้าเห็นทันที (snapshot ณ ตอนขาย)
  let creditAfter: number | null = null
  if (paymentMethod === MEMBER_CREDIT_METHOD || creditRequested > 0) {
    if (!customerId) {
      return { ok: false, error: "ชำระด้วยเครดิตสมาชิกต้องเลือกลูกค้าที่เป็นสมาชิก" }
    }

    const { data: balance } = await supabase
      .from("member_balances")
      .select("credit_balance, credit_granted, cash_paid")
      .eq("customer_id", customerId)
      .single()

    const granted = balance?.credit_granted ?? 0
    memberRatio = granted > 0 ? (balance?.cash_paid ?? 0) / granted : 1

    const credit = balance?.credit_balance ?? 0
    // เครดิตเต็มบิลต้องพอทั้งบิล (เดิม) · แบ่งจ่ายต้องพอเท่าที่ขอตัด
    const wanted =
      paymentMethod === MEMBER_CREDIT_METHOD
        ? priceNormal - discountInput + roomFee
        : creditRequested
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
    roomFee,
    serviceCommission: service.commission,
    memberRatio,
    creditRequested,
  })

  if (amounts.netAmount < 0) {
    return { ok: false, error: "ยอดรับจริงติดลบ กรุณาตรวจสอบส่วนลด" }
  }

  if (creditRequested > amounts.netAmount) {
    return { ok: false, error: "เครดิตที่ตัดเกินยอดบิล กรุณาตรวจสอบ" }
  }

  // บิลชุด (ลูกค้าคนเดียวหลายรายการจ่ายรวม) — ต้องรู้ก่อนตรวจบรรทัดชำระด้านล่าง (ดูคอมเมนต์ mustCollect)
  // ใช้เป็นกุญแจเขียนบรรทัดชำระร่วมกันทั้งบิลด้วย (ดูจุด insert bill_payments ท้ายฟังก์ชัน)
  const billId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(formData.get("bill_id") ?? "")
  )
    ? String(formData.get("bill_id"))
    : null

  // บรรทัดชำระ (สเปก 2026-08-01): มี field payments = บิลระบบใหม่ (tracked)
  // ไม่มี = โค้ดเก่า/Gowabi/KOL/เครดิตเต็มบิล → พฤติกรรมเดิมทุกอย่าง
  const paymentsRaw = formData.get("payments")
  const wantsTracking =
    paymentsRaw !== null && paymentMethod !== GOWABI_METHOD && paymentMethod !== "KOL"
  const mustCollect = amounts.netAmount - amounts.creditUsed
  // บิลชุด (billId ไม่ null): client ส่ง payments เป็นยอดรวม "ทั้งบิล" (รายการหลัก+รายการเสริม) มาที่แถว
  // แรกแถวเดียว แต่ mustCollect ข้างบนรู้แค่ราคาของแถวนี้แถวเดียว (createSale ไม่รู้จักรายการเสริมที่ยังไม่ insert)
  // เพดาน mustCollect เดิมจึงเตี้ยเกินไปเสมอสำหรับบิลชุดที่มีรายการเสริมยอดจริง → ปฏิเสธทุกบิลชุดที่แบ่งจ่าย
  // ทางแก้: บิลชุดยกเว้น cap (ตรวจแค่วิธี/จำนวน>0/ไม่เกิน 3 บรรทัดเหมือนเดิม) แล้วให้ด่านหลังบ้านจับยอดเกินแทน
  // — reconciliation.sql เช็ค 'bill_overpaid' (v_bill_due.due < 0) เป็นตาข่ายรองรับความถูกต้องของยอดรวมทั้งบิล
  const parsedLines: ReturnType<typeof parsePaymentLines> = wantsTracking
    ? parsePaymentLines(String(paymentsRaw), billId ? Number.POSITIVE_INFINITY : mustCollect)
    : { ok: true, lines: [] }
  if (!parsedLines.ok) return { ok: false, error: parsedLines.error }
  // วิธีหลักจากบรรทัด — บรรทัดว่าง (ค้างรับเต็มยอด/เครดิตเต็มบิล) คงวิธีที่ฟอร์มส่งมา
  const linePrimary = wantsTracking ? primaryMethod(parsedLines.lines) : null
  if (linePrimary) paymentMethod = linePrimary

  // แบ่งจ่ายที่ขอตัดเครดิตพอดีเต็มบิล (creditUsed === netAmount) แต่ช่องทางที่เลือกยังเป็นเงินจริง
  // (เช่น QR) — ต้อง normalize เป็น "Member Credit" เพื่อรักษากติกาเดิม "Member Credit = เครดิตเต็มบิล
  // เท่านั้น" ที่ข้อมูลเก่า/รายงานพึ่งพาไว้แปะป้ายช่องทาง ไม่งั้นบิลจะถูกนับเป็นช่องทางเงินจริงทั้งที่ไม่มี
  // เงินจริงเข้าร้านเลยสักบาท (แต้มไม่ได้รับผลกระทบ — pointsForSale หักด้วย netAmount-creditUsed = 0 อยู่แล้ว
  // แต่ normalize ให้ paymentMethod ตรงกับความจริงไว้ด้วย เพราะทุกจุดข้างล่างอ่านจากตัวแปรนี้ตัวเดียว)
  if (
    creditRequested > 0 &&
    amounts.creditUsed === amounts.netAmount &&
    paymentMethod !== MEMBER_CREDIT_METHOD
  ) {
    paymentMethod = MEMBER_CREDIT_METHOD
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
      room_fee: amounts.roomFee,
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
      bill_id: billId,
      // บรรทัดชำระ (สเปก 2026-08-01): มี field payments (แม้ "[]") และไม่ใช่ Gowabi/KOL → tracked
      payments_tracked: wantsTracking,
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

  // เขียนบรรทัดชำระครั้งเดียวต่อบิล — บิลชุด (bill_id ซ้ำกันหลายแถว) ให้แถวแรกของบิลเป็นผู้เขียน
  // แถวถัดไปของบิลเดียวกันเช็คแล้วพบบรรทัดของ bill_key นี้อยู่แล้ว จึงข้าม ไม่เขียนซ้ำ
  let paymentsWarning: string | undefined
  if (wantsTracking) {
    const billKey = billId ?? inserted.id
    const isFirstOfBill =
      !billId ||
      !(
        await supabase
          .from("bill_payments")
          .select("id")
          .eq("bill_key", billKey)
          .limit(1)
          .maybeSingle()
      ).data
    if (isFirstOfBill && parsedLines.lines.length > 0) {
      const { error: linesError } = await supabase.from("bill_payments").insert(
        parsedLines.lines.map((l) => ({
          bill_key: billKey,
          method: l.method,
          amount: l.amount,
          received_date: todayInShopTz(),
          created_by: profile?.full_name ?? user.email ?? null,
        }))
      )
      if (linesError) {
        // เขียนบรรทัดไม่สำเร็จ (RLS/ชั่วคราว) — ถ้าปล่อย payments_tracked=true ค้างไว้ บิลนี้จะโชว์
        // ค้างรับเต็มยอดถาวรใน v_bill_due ทั้งที่ไม่มีใครรู้ ต้องถอนกลับเป็น false (best-effort)
        // ถอนเฉพาะแถวนี้ (row ปัจจุบัน) — แถวถัดไปของบิลชุดเดียวกันไม่ retry ให้ เพราะส่ง payments="[]"
        // (parsedLines.lines.length===0 ที่แถวนั้น เงื่อนไข isFirstOfBill && length>0 เลยข้ามไปเฉยๆ)
        // โอกาสเกิดจริงต่ำ เพราะ insert นี้ใช้ RLS เดียวกับ insert บิล (sales) ที่เพิ่งผ่านไปหมาดๆ ข้างบน
        // ถ้าพลาดขึ้นจริง ด่าน recon 'bill_overpaid'/'tracked_bill_method_mismatch' จับบิล phantom ค้างรับได้อยู่ดี
        await supabase.from("sales").update({ payments_tracked: false }).eq("id", inserted.id)
        paymentsWarning = "บันทึกบิลแล้ว แต่บันทึกบรรทัดชำระไม่สำเร็จ — ยอดช่องทางอาจไม่ตรง แจ้งผู้ดูแล"
      }
    }
  }

  // แต้มสะสม: บิลผูกลูกค้า + จ่ายจริง → ทุก 100฿ = 1 แต้ม (เครดิตสมาชิกได้ตอนเติมไปแล้ว)
  await syncSalePoints(supabase, {
    id: inserted.id,
    customer_id: customerId,
    net_amount: amounts.netAmount,
    payment_method: paymentMethod,
    sale_date: saleDate,
    credit_used: amounts.creditUsed,
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
        // การ์ดต้องเดินตามบิลทุกช่อง ไม่ใช่แค่ปิดสถานะ — พนักงานมักเลือกหมอ/เตียง
        // และเปลี่ยนเมนูตอนกดเก็บเงิน ไม่ใช่ตอนสร้างการ์ด ขาดตรงนี้การ์ดที่จ่ายเงินแล้ว
        // จะค้างแถว "ยังไม่ระบุหมอ" หรือค้างเมนูเดิม ทั้งที่บิลถูกต้อง (เจอจริง 28/7/2569)
        //
        // เขียนทับได้ปลอดภัย เพราะฟอร์มหน้าชำระเงินตั้งค่าเริ่มต้นทุกช่องจากการ์ดใบนี้อยู่แล้ว
        // (pos-form.tsx: useState(initial?.therapistId) / useState(initial?.bedId) ฯลฯ)
        // ถ้าพนักงานไม่แก้ ค่าที่ส่งกลับมาก็คือค่าเดิมของการ์ด
        ...queueMirrorFromSale(formData, serviceId, service, therapistId),
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
      private_room: privateRoom,
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

  return {
    ok: true,
    receiptNo: inserted.receipt_no ?? "",
    creditAfter,
    warning: paymentsWarning,
  }
}

export type SalePointsImpact = {
  /** แต้มที่บิลนี้เคยให้ลูกค้า — 0 = ไม่มีอะไรต้องเตือน */
  points: number
  /** ยอดแต้มคงเหลือของลูกค้าหลังถอนแต้มบิลนี้ — ติดลบ = ลูกค้าแลกแต้มไปแล้ว */
  balanceAfter: number
}

/**
 * ผลกระทบต่อแต้มถ้าลบบิลนี้ — ใช้เตือนใน dialog ก่อนพนักงานกดลบ
 * เคสสำคัญ: ลูกค้าแลกแต้มเป็นคูปองไปแล้ว การถอนแต้มบิลนี้จะทำยอดติดลบ
 */
export async function getSalePointsImpact(
  id: string
): Promise<SalePointsImpact | null> {
  const supabase = await createClient()
  const { data: rows } = await supabase
    .from("point_transactions")
    .select("customer_id, delta")
    .eq("sale_id", id)
    .gt("delta", 0)
  if (!rows || rows.length === 0) return null
  const points = rows.reduce((sum, r) => sum + r.delta, 0)
  const { data: balance } = await supabase
    .from("v_point_balances")
    .select("balance")
    .eq("customer_id", rows[0].customer_id)
    .maybeSingle()
  return { points, balanceAfter: (balance?.balance ?? 0) - points }
}

/** ยอดแต้มลูกค้าหลัง sync — ติดลบ = ต้องบอกพนักงาน (ลูกค้าแลกแต้มไปก่อนแล้ว) */
async function pointsWarningAfterSync(
  supabase: Awaited<ReturnType<typeof createClient>>,
  customerId: string | null
): Promise<string | undefined> {
  if (!customerId) return undefined
  const { data } = await supabase
    .from("v_point_balances")
    .select("balance")
    .eq("customer_id", customerId)
    .maybeSingle()
  const balance = data?.balance ?? 0
  return balance < 0
    ? `แต้มลูกค้าติดลบ ${Math.abs(balance)} แต้ม (แลกไปก่อนแล้ว) — จะหักกลบจากแต้มที่ได้ครั้งถัดไป`
    : undefined
}

export async function deleteSale(
  id: string,
  /** true (ค่าเริ่มต้น) = ยกเลิกการ์ดคิวที่ผูกกับบิลนี้ให้ด้วย ไม่ต้องไปกดยกเลิกซ้ำที่หน้าคิว
   *  false = คงคิวไว้ (ถอยเป็น "กำลังให้บริการ") สำหรับเคสลบบิลผิดแล้วจะเก็บเงินใหม่ */
  cancelQueue = true
): Promise<{ ok: boolean; error?: string; warning?: string }> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("sales")
    .select("sale_date, customer_id, bill_id")
    .eq("id", id)
    .single()

  if (!existing) return { ok: false, error: "ไม่พบรายการขายนี้" }
  if (!isCurrentMonth(existing.sale_date)) {
    return { ok: false, error: "ลบได้เฉพาะรายการของเดือนปัจจุบัน" }
  }

  // บิลที่มาจากคิว: จัดการการ์ดก่อนลบ เพราะหลังลบจะหา sale_id ไม่เจอแล้ว
  // (FK เป็น set null ก็จริง แต่ set null ไม่ได้แก้สถานะให้ การ์ดจะค้าง "ชำระแล้ว")
  await supabase
    .from("queue_entries")
    .update(
      cancelQueue
        ? { status: "cancelled", sale_id: null }
        : { status: "in_service", sale_id: null }
    )
    .eq("sale_id", id)
    .eq("status", "paid")

  const { error } = await supabase.from("sales").delete().eq("id", id)

  if (error) return { ok: false, error: error.message }

  // แถวสุดท้ายของบิลถูกลบ → บรรทัดชำระของบิลต้องไปด้วย (กัน orphan)
  // bill_key เดียวกับที่ createSale ใช้เขียน: บิลชุดใช้ bill_id · บิลเดี่ยวใช้ id ตัวเอง
  const billKey = existing.bill_id ?? id
  const { data: remain } = await supabase
    .from("sales")
    .select("id")
    .or(`bill_id.eq.${billKey},id.eq.${billKey}`)
    .limit(1)
  if (!remain || remain.length === 0) {
    await supabase.from("bill_payments").delete().eq("bill_key", billKey)
  }

  // แต้มบิลนี้ถูกถอนไปพร้อมการลบ (FK cascade) — ถ้ายอดลูกค้าติดลบต้องบอกพนักงาน
  const warning = await pointsWarningAfterSync(supabase, existing.customer_id)

  revalidatePath("/today")
  revalidatePath("/")
  revalidatePath("/commission")
  revalidatePath("/overview")
  revalidatePath("/queue")
  return { ok: true, warning }
}

export type UpdateResult = { ok: true; warning?: string } | { ok: false; error: string }

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
  // ปกติเป็นค่าคงที่ตลอดฟังก์ชัน — แต่ normalize เป็น Member Credit ได้ทีหลังถ้าแบ่งจ่ายตัดเครดิตเต็มบิลพอดี
  // (ดูจุด normalize ด้านล่างหลัง computeSaleAmounts)
  let paymentMethod = String(formData.get("payment_method") ?? "")

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

  // แบ่งชำระ: เครดิตบางส่วน + ช่องทางเงินจริง (สเปก 2026-07-31)
  // ช่องทาง "Member Credit" = เครดิตเต็มบิล ไม่ใช้ค่านี้ (เดินด่านเดิมด้านล่าง)
  const creditRequested =
    paymentMethod === MEMBER_CREDIT_METHOD ? 0 : toNumber(formData.get("credit_requested"))

  // แบ่งชำระใช้ได้กับช่องทางเงินจริงจากลูกค้าเท่านั้น — Gowabi/KOL เงินไม่ได้มาจากลูกค้าตรงๆ
  if (creditRequested > 0 && (paymentMethod === GOWABI_METHOD || paymentMethod === "KOL")) {
    return { ok: false, error: "ช่องทางนี้ใช้ร่วมกับเครดิตสมาชิกไม่ได้" }
  }

  let memberRatio: number | null = null
  // เครดิตคงเหลือหลังหักบิลนี้ — snapshot ใหม่ตามยอดที่แก้ (null = บิลนี้ไม่เกี่ยวกับเครดิตแล้ว)
  let creditAfter: number | null = null
  if (paymentMethod === MEMBER_CREDIT_METHOD || creditRequested > 0) {
    if (!customerId) {
      return { ok: false, error: "ชำระด้วยเครดิตสมาชิกต้องเลือกลูกค้าที่เป็นสมาชิก" }
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
    // (headroom นี้ใช้กับทั้งสองโหมด — เครดิตเต็มบิล และแบ่งจ่ายบางส่วน)
    const sameCustomer = existing.customer_id === customerId
    const headroom =
      Number(balance?.credit_balance ?? 0) +
      (sameCustomer ? Number(existing.credit_used ?? 0) : 0)

    // เครดิตเต็มบิลต้องพอทั้งบิล (เดิม) · แบ่งจ่ายต้องพอเท่าที่ขอตัด
    const wanted =
      paymentMethod === MEMBER_CREDIT_METHOD
        ? service.price -
          discountInput +
          (formData.get("private_room") === "on" ? PRIVATE_ROOM_FEE : 0)
        : creditRequested
    if (headroom < wanted) {
      return {
        ok: false,
        error: `เครดิตคงเหลือไม่พอ (แก้เป็นได้สูงสุด ${headroom} บาท ต้องใช้ ${wanted} บาท)`,
      }
    }
    creditAfter = headroom - wanted
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
    roomFee: formData.get("private_room") === "on" ? PRIVATE_ROOM_FEE : 0,
    serviceCommission: service.commission,
    memberRatio,
    creditRequested,
  })

  if (amounts.netAmount < 0) {
    return { ok: false, error: "ยอดรับจริงติดลบ กรุณาตรวจสอบส่วนลด" }
  }

  if (creditRequested > amounts.netAmount) {
    return { ok: false, error: "เครดิตที่ตัดเกินยอดบิล กรุณาตรวจสอบ" }
  }

  // แบ่งจ่ายที่ขอตัดเครดิตพอดีเต็มบิล (creditUsed === netAmount) แต่ช่องทางที่เลือกยังเป็นเงินจริง
  // (เช่น QR) — ต้อง normalize เป็น "Member Credit" เพื่อรักษากติกาเดิม "Member Credit = เครดิตเต็มบิล
  // เท่านั้น" ที่ข้อมูลเก่า/รายงานพึ่งพาไว้แปะป้ายช่องทาง ไม่งั้นบิลจะถูกนับเป็นช่องทางเงินจริงทั้งที่ไม่มี
  // เงินจริงเข้าร้านเลยสักบาท (แต้มไม่ได้รับผลกระทบ — pointsForSale หักด้วย netAmount-creditUsed = 0 อยู่แล้ว
  // แต่ normalize ให้ paymentMethod ตรงกับความจริงไว้ด้วย เพราะทุกจุดข้างล่างอ่านจากตัวแปรนี้ตัวเดียว)
  if (
    creditRequested > 0 &&
    amounts.creditUsed === amounts.netAmount &&
    paymentMethod !== MEMBER_CREDIT_METHOD
  ) {
    paymentMethod = MEMBER_CREDIT_METHOD
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
      room_fee: amounts.roomFee,
      member_status: paymentMethod === MEMBER_CREDIT_METHOD ? "💳 Member" : null,
      credit_used: amounts.creditUsed,
      credit_after: creditAfter,
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
    credit_used: amounts.creditUsed,
  })

  // บิลนี้อาจมีการ์ดคิวผูกอยู่ (คิววันนี้) — sync ฟิลด์ที่การ์ดคิว "มิเรอร์" มาจากบิลตอนสร้าง
  // (ดู createSale) ไม่งั้นแก้โปรแกรมนวดในบิลแล้วการ์ดคิวยังค้างค่าเก่า — เคสจริงที่พนักงานเจอ:
  // ลูกค้าเปลี่ยนโปรแกรม 60→90 นาที บิลถูกแล้วแต่การ์ดคิวยังโชว์ 60 นาที ต้องลบบิลทิ้งแล้วสร้างคิวใหม่
  // .eq("sale_id", id) ทำหน้าที่กรอง "มีคิวผูกอยู่จริงไหม" ในตัวเอง — ไม่มีคิวผูกก็ไม่มีแถวไหนถูกแก้
  // (คิวเป็นผังงานไม่ใช่สมุดเงิน — พลาดก็ไม่กระทบบิล จึงไม่เช็ค error เหมือน createSale)
  await supabase
    .from("queue_entries")
    .update(queueMirrorFromSale(formData, serviceId, service, therapistId))
    .eq("sale_id", id)

  // แต้มถูก sync ตามยอดใหม่แล้ว — ถ้ายอดลูกค้าติดลบ (แลกแต้มไปก่อนแล้ว) ต้องบอกพนักงาน
  const warning = await pointsWarningAfterSync(supabase, customerId)

  revalidatePath("/today")
  revalidatePath("/")
  revalidatePath("/commission")
  revalidatePath("/overview")
  revalidatePath("/queue")
  return { ok: true, warning }
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
