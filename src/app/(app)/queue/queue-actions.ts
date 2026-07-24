"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { isBookingChannel, isCustomerSource } from "@/lib/customer-source"
import { todayInShopTz } from "@/lib/datetime"

type Result = { ok: true } | { ok: false; error: string }

// paid ตั้งได้ทาง createSale เท่านั้น — หน้าคิวห้ามยิงสถานะนี้ตรงๆ
const STATUSES = ["waiting", "in_service", "cancelled"] as const

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

  const { error } = await supabase.from("queue_entries").insert({
    queue_date: queueDate,
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

  const groupId = crypto.randomUUID()
  const { error } = await supabase.from("queue_entries").insert(
    people.map((p) => {
      const service = serviceById.get(p.serviceId)!
      return {
        queue_date: queueDate,
        therapist_id: p.therapistId || null,
        service_id: p.serviceId,
        service_name: service.name,
        duration_min: service.duration_min ?? 60,
        customer_id: customerId,
        customer_name: customerName,
        customer_phone: customerPhone,
        is_request: p.isRequest ?? false,
        start_time: startTime,
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

/** เปลี่ยนสถานะ รอ ⇄ กำลังนวด · ยกเลิก */
export async function setQueueStatus(id: string, status: string): Promise<Result> {
  if (!STATUSES.includes(status as (typeof STATUSES)[number]))
    return { ok: false, error: "สถานะไม่ถูกต้อง" }
  const supabase = await createClient()
  const { error } = await supabase
    .from("queue_entries")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .neq("status", "paid")
  if (error) return { ok: false, error: error.message }

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
