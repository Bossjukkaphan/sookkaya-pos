"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { isBookingChannel, isCustomerSource } from "@/lib/customer-source"
import { formatThaiDate, todayInShopTz } from "@/lib/datetime"
import { minToTime, timeToMin } from "@/lib/queue"
import { pushLineMessage } from "@/lib/line"
import { pushAssistantMessage } from "@/lib/line-assistant"
import {
  msgShopConfirmed,
  msgShopRejected,
  msgShopStaffCancelled,
} from "@/lib/line-assistant-messages"
import { msgConfirmed, msgRejected, type BookingInfo } from "@/lib/line-messages"

type Result = { ok: true; warning?: string } | { ok: false; error: string }

// paid ตั้งได้ทาง createSale เท่านั้น — หน้าคิวห้ามยิงสถานะนี้ตรงๆ
const STATUSES = ["waiting", "in_service", "cancelled"] as const

/**
 * นโยบายเดียวกับหน้าบันทึกขาย: พิมพ์ชื่อ+เบอร์ใหม่ในฟอร์มคิว → จับคู่ลูกค้าด้วยเบอร์
 * เจอ = ผูกคนเดิม (ประวัติ/แต้มต่อเนื่อง) · ไม่เจอ = สร้างลูกค้าใหม่ให้เลย
 * ไม่ต้องไปสร้างในหน้าข้อมูลลูกค้าก่อนแล้วค่อยกลับมาเพิ่มคิว
 * ไม่มีเบอร์ = ผูกไม่ได้ (เบอร์คือกุญแจกันสร้างคนซ้ำ) — คิวยังสร้างได้ตามปกติ
 */
async function linkOrCreateCustomer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  customerId: string | null,
  name: string | null,
  phone: string | null
): Promise<string | null> {
  if (customerId || !phone) return customerId
  const { data: byPhone } = await supabase
    .from("customers")
    .select("id")
    .eq("phone", phone)
    .limit(1)
    .maybeSingle()
  if (byPhone) return byPhone.id
  if (!name) return null
  const { data: created } = await supabase
    .from("customers")
    .insert({ name, phone })
    .select("id")
    .maybeSingle()
  return created?.id ?? null
}

/** เพิ่มคิวลงวันของบอร์ดที่แสดงอยู่ (จองล่วงหน้าได้) · service_name เอาจาก DB ไม่เชื่อ client */
export async function createQueueEntry(form: FormData): Promise<Result> {
  const supabase = await createClient()
  const serviceId = String(form.get("service_id") ?? "")
  const startTime = String(form.get("start_time") ?? "")
  const durationMin = Number(form.get("duration_min") ?? 0)
  const therapistId = String(form.get("therapist_id") ?? "") || null
  const customerId = String(form.get("customer_id") ?? "") || null
  const customerName = String(form.get("customer_name") ?? "").trim() || null
  // เบอร์มาได้สองช่อง: ลูกค้าเก่าจาก picker (customer_phone) หรือพิมพ์ใหม่ (customer_phone_new)
  const customerPhone =
    String(form.get("customer_phone") ?? "").trim() ||
    String(form.get("customer_phone_new") ?? "").trim() ||
    null
  const isRequest = form.get("is_request") === "on"
  const queueDateInput = String(form.get("queue_date") ?? "")
  const queueDate = /^\d{4}-\d{2}-\d{2}$/.test(queueDateInput)
    ? queueDateInput
    : todayInShopTz()
  const source = String(form.get("source") ?? "walk_in")
  const bedId = String(form.get("bed_id") ?? "") || null
  const notes = String(form.get("notes") ?? "").trim() || null
  // ช่องทางย่อยมีความหมายเฉพาะประเภท "จองล่วงหน้า" — ค่าอื่น/เพี้ยนเก็บเป็น null
  const channelInput = String(form.get("booking_channel") ?? "")
  const bookingChannel =
    source === "booking" && isBookingChannel(channelInput) ? channelInput : null

  if (!serviceId) return { ok: false, error: "เลือกเมนูก่อน" }
  if (!/^\d{2}:\d{2}$/.test(startTime))
    return { ok: false, error: "เวลาเริ่มไม่ถูกต้อง" }
  if (durationMin < 15 || durationMin > 240)
    return { ok: false, error: "ระยะเวลาไม่ถูกต้อง" }
  if (!isCustomerSource(source))
    return { ok: false, error: "ที่มาลูกค้าไม่ถูกต้อง" }

  const { data: service } = await supabase
    .from("services")
    .select("name")
    .eq("id", serviceId)
    .single()
  if (!service) return { ok: false, error: "ไม่พบเมนูนี้" }

  // กันบันทึกซ้ำฝั่ง server (กดรัว/เน็ตหน่วงแล้ว retry): ลูกค้า+วัน+เวลา+เมนูเดิม
  // ที่เพิ่งถูกสร้างภายใน 10 วิ = คำขอเดียวกัน → ตอบสำเร็จเงียบๆ ไม่สร้างแถวใหม่
  // (แนวเดียวกับ dup guard ของการจองผ่านไลน์ใน book/actions.ts)
  // เทียบหมอด้วย + ข้ามแถวที่ยกเลิก/ปฏิเสธ — วอล์กอินไม่ระบุชื่อสองคนติดกัน (คนละหมอ)
  // หรือสร้าง→ยกเลิก→สร้างใหม่ทันที ต้องยังทำได้ตามปกติ
  let dupQ = supabase
    .from("queue_entries")
    .select("id")
    .eq("queue_date", queueDate)
    .eq("start_time", startTime)
    .eq("service_id", serviceId)
    .not("status", "in", "(cancelled,rejected)")
    .gte("created_at", new Date(Date.now() - 10_000).toISOString())
    .limit(1)
  dupQ = customerName
    ? dupQ.eq("customer_name", customerName)
    : dupQ.is("customer_name", null)
  dupQ = therapistId
    ? dupQ.eq("therapist_id", therapistId)
    : dupQ.is("therapist_id", null)
  const { data: dup } = await dupQ
  if (dup && dup.length > 0) return { ok: true }

  const linkedCustomerId = await linkOrCreateCustomer(
    supabase,
    customerId,
    customerName,
    customerPhone
  )

  const { error } = await supabase.from("queue_entries").insert({
    queue_date: queueDate,
    therapist_id: therapistId,
    service_id: serviceId,
    service_name: service.name,
    duration_min: durationMin,
    customer_id: linkedCustomerId,
    customer_name: customerName,
    customer_phone: customerPhone,
    is_request: isRequest,
    start_time: startTime,
    source,
    bed_id: bedId,
    booking_channel: bookingChannel,
    notes,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath("/queue")
  return { ok: true }
}

/** คนหนึ่งในกลุ่ม — หมอ/เมนู/เตียง/รีเควสแยกรายคน ส่วนเวลา·ลูกค้าติดต่อ·ที่มา ใช้ร่วมกัน */
export type GroupPerson = {
  therapistId: string | null
  serviceId: string
  bedId: string | null
  isRequest?: boolean
  /** รายการต่อเวลาของลูกค้าคนเดิม (บิลชุด) — เริ่มต่อจากรายการก่อนหน้าจบ ไม่ใช่พร้อมกัน */
  sequential?: boolean
}

/**
 * จองเป็นกลุ่ม (ครอบครัว/เพื่อนมาด้วยกัน) — สร้างการ์ดคิวหลายใบผูก group_id เดียว
 * แต่ละใบยังลาก/แก้/ยกเลิกแยกอิสระได้เหมือนคิวปกติทุกอย่าง
 */
export async function createQueueGroup(
  shared: FormData,
  people: GroupPerson[]
): Promise<Result> {
  if (people.length < 2)
    return { ok: false, error: "กลุ่มต้องมีอย่างน้อย 2 คน" }
  if (people.some((p) => !p.serviceId))
    return { ok: false, error: "เลือกเมนูให้ครบทุกคนก่อน" }

  const supabase = await createClient()
  const startTime = String(shared.get("start_time") ?? "")
  const queueDateInput = String(shared.get("queue_date") ?? "")
  const queueDate = /^\d{4}-\d{2}-\d{2}$/.test(queueDateInput)
    ? queueDateInput
    : todayInShopTz()
  const customerId = String(shared.get("customer_id") ?? "") || null
  const customerName = String(shared.get("customer_name") ?? "").trim() || null
  const customerPhone =
    String(shared.get("customer_phone") ?? "").trim() ||
    String(shared.get("customer_phone_new") ?? "").trim() ||
    null
  const source = String(shared.get("source") ?? "walk_in")
  const notes = String(shared.get("notes") ?? "").trim() || null
  const channelInput = String(shared.get("booking_channel") ?? "")
  const bookingChannel =
    source === "booking" && isBookingChannel(channelInput) ? channelInput : null

  if (!/^\d{2}:\d{2}$/.test(startTime))
    return { ok: false, error: "เวลาเริ่มไม่ถูกต้อง" }
  if (!isCustomerSource(source))
    return { ok: false, error: "ที่มาลูกค้าไม่ถูกต้อง" }

  // ชื่อ/ระยะเวลาเมนูเอาจาก DB ไม่เชื่อ client — ดึงทีเดียวทุกเมนูที่ใช้ในกลุ่ม
  const serviceIds = [...new Set(people.map((p) => p.serviceId))]
  const { data: services } = await supabase
    .from("services")
    .select("id, name, duration_min")
    .in("id", serviceIds)
  const serviceById = new Map((services ?? []).map((s) => [s.id, s]))
  if (serviceById.size !== serviceIds.length)
    return { ok: false, error: "มีเมนูที่ไม่พบในระบบ" }

  const linkedCustomerId = await linkOrCreateCustomer(
    supabase,
    customerId,
    customerName,
    customerPhone
  )

  const groupId = crypto.randomUUID()
  // รายการ "ต่อเวลา" (ลูกค้าคนเดิมทำหลายคอร์สต่อกัน) เริ่มต่อจากรายการก่อนหน้าจบ
  // รายการปกติ (คนละคนมาพร้อมกัน) เริ่มเวลาเดียวกันทั้งกลุ่มแบบเดิม
  let chainEnd = timeToMin(startTime)
  const { error } = await supabase.from("queue_entries").insert(
    people.map((p) => {
      const service = serviceById.get(p.serviceId)!
      const duration = service.duration_min ?? 60
      const startMin = p.sequential ? chainEnd : timeToMin(startTime)
      chainEnd = startMin + duration
      return {
        queue_date: queueDate,
        therapist_id: p.therapistId || null,
        service_id: p.serviceId,
        service_name: service.name,
        duration_min: duration,
        customer_id: linkedCustomerId,
        customer_name: customerName,
        customer_phone: customerPhone,
        is_request: p.isRequest ?? false,
        start_time: minToTime(startMin),
        source,
        bed_id: p.bedId || null,
        booking_channel: bookingChannel,
        notes,
        group_id: groupId,
      }
    })
  )
  if (error) return { ok: false, error: error.message }
  revalidatePath("/queue")
  return { ok: true }
}

/** บันทึกปฏิเสธลูกค้า (คิวเต็ม/หมอไม่ว่าง) — ข้อมูลตัดสินใจจ้างหมอเพิ่ม */
export async function recordTurnAway(
  queueDate: string,
  note: string
): Promise<Result> {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(queueDate) ? queueDate : todayInShopTz()
  const supabase = await createClient()
  // ต้องกรอง id เอง — admin เห็นทุกโปรไฟล์ ถ้า .single() เฉยๆ จะเจอหลายแถวแล้ว error
  const profile = await getMyProfile()
  const { error } = await supabase.from("turn_aways").insert({
    queue_date: date,
    note: note.trim() || null,
    created_by: profile?.full_name ?? null,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath("/queue")
  return { ok: true }
}

/** แก้ไขคิวจากฟอร์ม (ทุก field ยกเว้นวัน/สถานะ) · คิวที่จ่ายแล้วแก้ไม่ได้ */
export async function updateQueueEntry(id: string, form: FormData): Promise<Result> {
  const supabase = await createClient()
  const serviceId = String(form.get("service_id") ?? "")
  const startTime = String(form.get("start_time") ?? "")
  const durationMin = Number(form.get("duration_min") ?? 0)
  const therapistId = String(form.get("therapist_id") ?? "") || null
  const customerId = String(form.get("customer_id") ?? "") || null
  const customerName = String(form.get("customer_name") ?? "").trim() || null
  const customerPhone =
    String(form.get("customer_phone") ?? "").trim() ||
    String(form.get("customer_phone_new") ?? "").trim() ||
    null
  const isRequest = form.get("is_request") === "on"
  const bedId = String(form.get("bed_id") ?? "") || null
  const notes = String(form.get("notes") ?? "").trim() || null
  const source = String(form.get("source") ?? "walk_in")
  const channelInput = String(form.get("booking_channel") ?? "")
  const bookingChannel =
    source === "booking" && isBookingChannel(channelInput) ? channelInput : null

  if (!serviceId) return { ok: false, error: "เลือกเมนูก่อน" }
  if (!/^\d{2}:\d{2}$/.test(startTime))
    return { ok: false, error: "เวลาเริ่มไม่ถูกต้อง" }
  if (durationMin < 15 || durationMin > 240)
    return { ok: false, error: "ระยะเวลาไม่ถูกต้อง" }
  if (!isCustomerSource(source))
    return { ok: false, error: "ที่มาลูกค้าไม่ถูกต้อง" }

  const { data: service } = await supabase
    .from("services")
    .select("name")
    .eq("id", serviceId)
    .single()
  if (!service) return { ok: false, error: "ไม่พบเมนูนี้" }

  const { error } = await supabase
    .from("queue_entries")
    .update({
      therapist_id: therapistId,
      service_id: serviceId,
      service_name: service.name,
      duration_min: durationMin,
      customer_id: customerId,
      customer_name: customerName,
      customer_phone: customerPhone,
      is_request: isRequest,
      start_time: startTime,
      source,
      bed_id: bedId,
      booking_channel: bookingChannel,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .neq("status", "paid")
  if (error) return { ok: false, error: error.message }
  revalidatePath("/queue")
  return { ok: true }
}

/** ลากการ์ด: ย้ายหมอ/เลื่อนเวลา · การ์ดที่จ่ายแล้วห้ามย้าย */
export async function moveQueueEntry(
  id: string,
  therapistId: string | null,
  startTime: string
): Promise<Result> {
  if (!/^\d{2}:\d{2}$/.test(startTime))
    return { ok: false, error: "เวลาไม่ถูกต้อง" }
  const supabase = await createClient()
  const { error } = await supabase
    .from("queue_entries")
    .update({
      therapist_id: therapistId,
      start_time: startTime,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .neq("status", "paid")
  if (error) return { ok: false, error: error.message }
  revalidatePath("/queue")
  return { ok: true }
}

/** เปลี่ยนสถานะ รอ ⇄ กำลังนวด · ยกเลิก
 * กัน pending ด้วย (ไม่ใช่แค่ paid) — คิวที่ยังไม่อนุมัติต้องผ่าน approveBooking เท่านั้น
 * ไม่งั้นลาก/เปลี่ยนสถานะตรงๆ จะข้ามขั้นตอนส่งไลน์ยืนยันลูกค้าไปได้
 * (หน้าจอปัจจุบันไม่มีปุ่มไหนเรียกด้วยสถานะ pending อยู่แล้ว — กันไว้อีกชั้นเผื่ออนาคต) */
export async function setQueueStatus(id: string, status: string): Promise<Result> {
  if (!STATUSES.includes(status as (typeof STATUSES)[number]))
    return { ok: false, error: "สถานะไม่ถูกต้อง" }
  const supabase = await createClient()

  // อ่านก่อนอัปเดต — ถ้าเป็นการยกเลิกคิวที่จองผ่านไลน์ ต้องแจ้งกลุ่มทีมร้าน
  // (อ่านหลังอัปเดตจะไม่รู้แล้วว่าสถานะเดิมคืออะไร)
  const { data: before } = status === "cancelled"
    ? await supabase
        .from("queue_entries")
        .select("booking_channel, customer_name, queue_date, start_time, service_name, status")
        .eq("id", id)
        .maybeSingle()
    : { data: null }

  const { error } = await supabase
    .from("queue_entries")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .not("status", "in", "(paid,pending)")
  if (error) return { ok: false, error: error.message }

  // ยกเลิกคิวที่ลูกค้าจองผ่านไลน์ → กลุ่มต้องเห็นว่าใครยกเลิก (คิวประเภทอื่นไม่รก group)
  if (
    status === "cancelled" &&
    before &&
    before.booking_channel === "line" &&
    !["paid", "pending", "cancelled", "rejected"].includes(before.status)
  ) {
    const staff = await getMyProfile()
    await notifyQueueGroup(
      msgShopStaffCancelled({ ...shopInfoOf([before]), staffName: staff?.full_name })
    )
  }

  if (status === "in_service") {
    // เวลาเริ่มนวดจริง — บันทึกครั้งแรกเท่านั้น กดย้อนไปมาไม่ทับค่าเดิม
    await supabase
      .from("queue_entries")
      .update({ started_at: new Date().toISOString() })
      .eq("id", id)
      .is("started_at", null)
  }

  revalidatePath("/queue")
  return { ok: true }
}

/** HH:MM (เวลาไทย) ของวันคิว → timestamptz — ใช้เก็บเวลาเริ่มนวดจริง */
function shopTimeToIso(queueDate: string, timeHHMM: string): string {
  return `${queueDate}T${timeHHMM}:00+07:00`
}

/**
 * กดเริ่มนวด — พนักงานยืนยัน/แก้เวลาเริ่มจริงก่อนบันทึก (เผื่อกดปุ่มช้ากว่าตอนเริ่มจริง)
 * เวลาเริ่มจริงอาจไม่ตรงเวลาจอง: ลูกค้ามาเร็วเริ่มก่อน หรือมาสายเริ่มทีหลัง
 */
export async function startMassage(id: string, timeHHMM: string): Promise<Result> {
  if (!/^\d{2}:\d{2}$/.test(timeHHMM))
    return { ok: false, error: "รูปแบบเวลาไม่ถูกต้อง" }
  const supabase = await createClient()
  const { data: entry } = await supabase
    .from("queue_entries")
    .select("queue_date")
    .eq("id", id)
    .maybeSingle()
  if (!entry) return { ok: false, error: "ไม่พบคิวนี้" }
  const { error } = await supabase
    .from("queue_entries")
    .update({
      status: "in_service",
      started_at: shopTimeToIso(entry.queue_date, timeHHMM),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .not("status", "in", "(paid,pending,cancelled,rejected)")
  if (error) return { ok: false, error: error.message }
  revalidatePath("/queue")
  return { ok: true }
}

/**
 * แก้/ใส่เวลาเริ่มนวดจริงย้อนหลัง — ไม่แตะสถานะ ใช้ได้แม้จ่ายเงินไปแล้ว
 * (เคสจ่ายก่อนนวดแล้วลืมกดเริ่ม หรือกดเริ่มด้วยเวลาที่ผิด)
 */
export async function setActualStartTime(id: string, timeHHMM: string): Promise<Result> {
  if (!/^\d{2}:\d{2}$/.test(timeHHMM))
    return { ok: false, error: "รูปแบบเวลาไม่ถูกต้อง" }
  const supabase = await createClient()
  const { data: entry } = await supabase
    .from("queue_entries")
    .select("queue_date")
    .eq("id", id)
    .maybeSingle()
  if (!entry) return { ok: false, error: "ไม่พบคิวนี้" }
  const { error } = await supabase
    .from("queue_entries")
    .update({
      started_at: shopTimeToIso(entry.queue_date, timeHHMM),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .not("status", "in", "(pending,cancelled,rejected)")
  if (error) return { ok: false, error: error.message }
  revalidatePath("/queue")
  return { ok: true }
}

/** โหลดคำขอ pending ทั้งชุด (ทั้งกลุ่มถ้ามี) — ใช้ร่วม approve/reject */
async function loadPendingSet(id: string) {
  const supabase = await createClient()
  const { data: one } = await supabase
    .from("queue_entries")
    .select(
      "id, group_id, queue_date, start_time, service_name, customer_name, line_user_id, status, notes"
    )
    .eq("id", id)
    .maybeSingle()
  if (!one || one.status !== "pending") return null
  if (!one.group_id) return { entries: [one] }
  const { data: all } = await supabase
    .from("queue_entries")
    .select(
      "id, group_id, queue_date, start_time, service_name, customer_name, line_user_id, status, notes"
    )
    .eq("group_id", one.group_id)
    .eq("status", "pending")
  return { entries: all && all.length > 0 ? all : [one] }
}

/** แจ้งกลุ่มทีมร้านผ่าน OA ผู้ช่วย — env ยังไม่ตั้ง/ส่งพลาด → ข้ามเงียบๆ ไม่กระทบงานหลัก */
const notifyQueueGroup = (text: string) =>
  pushAssistantMessage(process.env.LINE_ASSISTANT_QUEUE_GROUP_ID ?? "", text)

/** ข้อมูลคิวสำหรับข้อความแจ้งกลุ่ม — ชื่อลูกค้า วันเวลา และเมนูทุกคนในชุด */
const shopInfoOf = (
  entries: {
    queue_date: string
    start_time: string
    service_name: string
    customer_name?: string | null
  }[]
) => ({
  name: entries[0].customer_name?.trim() || "ลูกค้า LINE",
  dateLabel: formatThaiDate(entries[0].queue_date),
  time: entries[0].start_time.slice(0, 5),
  services: entries.map((e) => e.service_name),
})

const bookingInfoOf = (
  entries: { queue_date: string; start_time: string; service_name: string }[]
): BookingInfo => ({
  dateLabel: formatThaiDate(entries[0].queue_date),
  time: entries[0].start_time.slice(0, 5),
  services: entries.map((e) => e.service_name),
})

/** รับคำขอจากไลน์ — ทั้งกลุ่มพร้อมกัน + push ยืนยัน (ส่งไม่ผ่านไม่ทำให้รับคิวล้มเหลว — ต่อท้ายหมายเหตุแทนการเขียนทับ)
 * .select("id") ท้าย update เอาไว้เช็ค TOCTOU — ระหว่าง loadPendingSet เห็น pending กับตอน update จริง
 * อาจมีคนอื่นกด approve/reject ไปก่อนแล้ว (เช่นสองแท็บ/สองเครื่อง) ถ้า 0 แถวโดนอัปเดตคือโดนแซงไปแล้ว
 * ต้องหยุดตรงนี้ ห้าม push ไลน์ซ้ำหรือ push ข้อความขัดแย้งกับที่ระบบเพิ่งส่งไป */
export async function approveBooking(id: string): Promise<Result> {
  const set = await loadPendingSet(id)
  if (!set) return { ok: false, error: "คำขอนี้ถูกจัดการไปแล้ว" }
  const supabase = await createClient()
  const ids = set.entries.map((e) => e.id)
  const { data: updated, error } = await supabase
    .from("queue_entries")
    .update({ status: "waiting", updated_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "pending")
    .select("id")
  if (error) return { ok: false, error: error.message }
  if (!updated || updated.length === 0)
    return { ok: false, error: "คำขอนี้ถูกจัดการไปแล้ว" }
  const to = set.entries[0].line_user_id
  let warning: string | undefined
  if (to) {
    const sent = await pushLineMessage(to, msgConfirmed(bookingInfoOf(set.entries)))
    if (!sent) {
      warning = "รับจองแล้ว แต่ส่งไลน์ไม่ผ่าน — โทรแจ้งลูกค้าด้วยนะ"
      // ต่อท้ายหมายเหตุเดิม — ห้ามเขียนทับ เผื่อลูกค้าฝากข้อความพิเศษไว้ตอนจอง
      for (const e of set.entries) {
        await supabase
          .from("queue_entries")
          .update({
            notes: [e.notes, "⚠️ ส่งไลน์ไม่ผ่าน — โทรแจ้งลูกค้า"]
              .filter(Boolean)
              .join(" · "),
          })
          .eq("id", e.id)
      }
    }
  }
  // แจ้งกลุ่มทีมร้าน: คิวนี้ถูกรับแล้ว โดยใคร — ทุกคนเห็นสถานะเดียวกันไม่ต้องถามกันเอง
  const approver = await getMyProfile()
  await notifyQueueGroup(
    msgShopConfirmed({ ...shopInfoOf(set.entries), staffName: approver?.full_name })
  )
  revalidatePath("/queue")
  return { ok: true, warning }
}

/** ปฏิเสธ — เหตุผลแนบไปกับข้อความไลน์ · การ์ดหายจากบอร์ด */
export async function rejectBooking(id: string, reason: string): Promise<Result> {
  const set = await loadPendingSet(id)
  if (!set) return { ok: false, error: "คำขอนี้ถูกจัดการไปแล้ว" }
  const cleanReason = reason.trim() || "คิวช่วงเวลานั้นเต็ม"
  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from("queue_entries")
    .update({
      status: "rejected",
      reject_reason: cleanReason,
      updated_at: new Date().toISOString(),
    })
    .in(
      "id",
      set.entries.map((e) => e.id)
    )
    .eq("status", "pending")
    .select("id")
  if (error) return { ok: false, error: error.message }
  if (!updated || updated.length === 0)
    return { ok: false, error: "คำขอนี้ถูกจัดการไปแล้ว" }
  const to = set.entries[0].line_user_id
  let warning: string | undefined
  if (to) {
    const sent = await pushLineMessage(to, msgRejected(bookingInfoOf(set.entries), cleanReason))
    if (!sent) warning = "ปฏิเสธแล้ว แต่ส่งไลน์ไม่ผ่าน — โทรแจ้งลูกค้าด้วยนะ"
  }
  // แจ้งกลุ่มทีมร้าน: ปฏิเสธเพราะอะไร โดยใคร — เผื่อลูกค้าโทรมาถาม ทีมตอบได้ทันที
  const rejecter = await getMyProfile()
  await notifyQueueGroup(
    msgShopRejected({
      ...shopInfoOf(set.entries),
      reason: cleanReason,
      staffName: rejecter?.full_name,
    })
  )
  revalidatePath("/queue")
  return { ok: true, warning }
}
