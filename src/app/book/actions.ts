"use server"

import { createServiceClient } from "@/lib/supabase/service"
import { pushLineMessage, verifyLineIdToken } from "@/lib/line"
import { msgCancelled, msgRequested, type BookingInfo } from "@/lib/line-messages"
import { canCancelAt, computeSlots, isBookableDate } from "@/lib/booking-slots"
import { formatThaiDate, nowTimeInShopTz, todayInShopTz } from "@/lib/datetime"
import { REQUEST_FEE } from "@/lib/constants"

type Fail = { ok: false; error: string; code?: "auth" }

const AUTH_FAIL: Fail = { ok: false, error: "เปิดหน้านี้จากไลน์อีกครั้งนะคะ", code: "auth" }

const nowMin = () => {
  const [h, m] = nowTimeInShopTz().split(":").map(Number)
  return h * 60 + m
}

/** สถานะบัญชีไลน์: ผูกกับลูกค้าแล้วหรือยัง (เรียกตอนเปิดหน้า /book) */
export async function getLineStatus(idToken: string): Promise<
  | { ok: true; linked: true; customerName: string }
  | { ok: true; linked: false; displayName: string | null }
  | Fail
> {
  const who = await verifyLineIdToken(idToken)
  if (!who) return AUTH_FAIL
  const db = createServiceClient()
  const { data } = await db
    .from("line_accounts")
    .select("customer_id, customers(name)")
    .eq("line_user_id", who.userId)
    .maybeSingle()
  if (data)
    return {
      ok: true, linked: true,
      customerName: (data as unknown as { customers: { name: string } | null }).customers?.name ?? "",
    }
  return { ok: true, linked: false, displayName: who.displayName ?? null }
}

/** ผูกบัญชีครั้งแรกด้วยเบอร์โทร — เบอร์ช่วยจับคู่เท่านั้น ไม่ใช่ตัวให้สิทธิ์ */
export async function linkLineAccount(
  idToken: string,
  phone: string
): Promise<{ ok: true; customerName: string } | Fail> {
  const who = await verifyLineIdToken(idToken)
  if (!who) return AUTH_FAIL
  const clean = phone.replace(/\D/g, "")
  if (!/^0\d{8,9}$/.test(clean)) return { ok: false, error: "เบอร์โทรไม่ถูกต้อง" }

  const db = createServiceClient()
  const { data: matches } = await db.from("customers").select("id, name").eq("phone", clean)
  let customerId: string
  let customerName: string
  if (!matches || matches.length === 0) {
    const { data: created, error } = await db
      .from("customers")
      .insert({ name: who.displayName ?? "ลูกค้า LINE", phone: clean })
      .select("id, name").single()
    if (error) return { ok: false, error: "สร้างข้อมูลลูกค้าไม่สำเร็จ ลองใหม่นะคะ" }
    customerId = created.id
    customerName = created.name
  } else if (matches.length === 1) {
    customerId = matches[0].id
    customerName = matches[0].name
  } else {
    // เบอร์ซ้ำหลายคน → เลือกคนที่มีบิลล่าสุด (ตาม spec)
    const { data: latest } = await db
      .from("sales").select("customer_id")
      .in("customer_id", matches.map((m) => m.id))
      .order("sale_date", { ascending: false }).limit(1).maybeSingle()
    const pick = matches.find((m) => m.id === latest?.customer_id) ?? matches[0]
    customerId = pick.id
    customerName = pick.name
  }
  const { error } = await db.from("line_accounts").upsert({
    line_user_id: who.userId,
    customer_id: customerId,
    display_name: who.displayName ?? null,
    picture_url: who.pictureUrl ?? null,
    phone: clean,
  })
  if (error) return { ok: false, error: "ผูกบัญชีไม่สำเร็จ ลองใหม่นะคะ" }
  return { ok: true, customerName }
}

/** เมนู+หมอสำหรับ wizard (เปิดเผยเฉพาะ ชื่อ/ราคา/ระยะเวลา) */
export async function getBookingOptions(): Promise<
  | {
      ok: true
      services: { id: string; name: string; price: number; durationMin: number }[]
      therapists: { id: string; name: string }[]
    }
  | Fail
> {
  // createServiceClient() โยน exception แบบ sync ถ้ายังไม่ตั้งค่า env (เช่นก่อนร้านทำ Task 0)
  // ต้องดักไว้ตรงนี้ ไม่งั้นหน้า /book (SSR) จะ 500 ทั้งหน้าแทนที่จะโชว์ข้อความนี้เฉยๆ
  try {
    const db = createServiceClient()
    const [
      { data: services, error: servicesError },
      { data: therapists, error: therapistsError },
    ] = await Promise.all([
      db.from("services").select("id, name, price, duration_min").eq("is_active", true).order("name"),
      db.from("therapists").select("id, name").eq("status", "active").order("name"),
    ])
    if (servicesError || therapistsError)
      return { ok: false, error: "โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้งนะคะ" }
    return {
      ok: true,
      services: (services ?? []).map((s) => ({
        id: s.id, name: s.name, price: Number(s.price), durationMin: s.duration_min ?? 60,
      })),
      therapists: therapists ?? [],
    }
  } catch {
    return { ok: false, error: "โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้งนะคะ" }
  }
}

export type BookingPersonInput = { serviceId: string; therapistId: string | null }

export async function createBookingRequest(
  idToken: string,
  input: { date: string; time: string; people: BookingPersonInput[]; note: string }
): Promise<{ ok: true } | Fail> {
  const who = await verifyLineIdToken(idToken)
  if (!who) return AUTH_FAIL
  const db = createServiceClient()

  const { data: account } = await db
    .from("line_accounts").select("customer_id, phone, display_name")
    .eq("line_user_id", who.userId).maybeSingle()
  if (!account) return { ok: false, error: "กรุณายืนยันเบอร์โทรก่อนจองค่ะ" }

  if (input.people.length < 1 || input.people.length > 4)
    return { ok: false, error: "จองได้ครั้งละ 1–4 ท่านค่ะ" }
  const today = todayInShopTz()
  if (!isBookableDate(input.date, today))
    return { ok: false, error: "เลือกวันได้ตั้งแต่วันนี้ถึงล่วงหน้า 14 วันค่ะ" }
  if (!/^\d{2}:\d{2}$/.test(input.time)) return { ok: false, error: "เวลาไม่ถูกต้อง" }
  const note = input.note.trim().slice(0, 500)

  const { data: services } = await db
    .from("services").select("id, name, duration_min").eq("is_active", true)
    .in("id", input.people.map((p) => p.serviceId))
  const serviceById = new Map((services ?? []).map((s) => [s.id, s]))
  if (input.people.some((p) => !serviceById.has(p.serviceId)))
    return { ok: false, error: "มีเมนูที่ไม่พร้อมให้จอง รีเฟรชแล้วลองใหม่นะคะ" }
  const maxDuration = Math.max(
    ...input.people.map((p) => serviceById.get(p.serviceId)!.duration_min ?? 60))
  const validSlots = computeSlots({ date: input.date, today, nowMin: nowMin(), durationMin: maxDuration })
  if (!validSlots.includes(input.time))
    return { ok: false, error: "ช่วงเวลานี้ไม่เปิดรับจองแล้ว เลือกเวลาอื่นนะคะ" }

  // เช็คแล้วค่อย insert (ไม่มี transaction) — ยอมรับ race ได้: เคสแย่สุดคือการ์ด pending เกิน ร้านกดปฏิเสธเอง ไม่มีเงินเกี่ยว
  // ประตูแคบ: pending ค้าง ≤3 · กันกดซ้ำใน 1 นาที
  const { data: existing } = await db
    .from("queue_entries")
    .select("id, queue_date, start_time, created_at, group_id")
    .eq("line_user_id", who.userId).eq("status", "pending")
  const distinctPending = new Set((existing ?? []).map((e) => e.group_id ?? e.id))
  if (distinctPending.size >= 3)
    return { ok: false, error: "มีคิวรอร้านยืนยันอยู่แล้ว 3 รายการ รอสักครู่นะคะ" }
  const dup = (existing ?? []).some(
    (e) => e.queue_date === input.date && e.start_time.startsWith(input.time) &&
      Date.now() - Date.parse(e.created_at) < 60_000)
  if (dup) return { ok: true } // เพิ่งส่งรายการเดียวกันไป — สำเร็จเงียบๆ ไม่สร้างซ้ำ

  const groupId = input.people.length > 1 ? crypto.randomUUID() : null
  const { error } = await db.from("queue_entries").insert(
    input.people.map((p) => ({
      queue_date: input.date,
      start_time: input.time,
      service_id: p.serviceId,
      service_name: serviceById.get(p.serviceId)!.name,
      duration_min: serviceById.get(p.serviceId)!.duration_min ?? 60,
      therapist_id: p.therapistId,
      is_request: p.therapistId !== null,   // เลือกหมอ = รีเควส (spec)
      customer_id: account.customer_id,
      customer_name: account.display_name,
      customer_phone: account.phone,
      notes: note || null,
      status: "pending",
      source: "booking",
      booking_channel: "line",
      line_user_id: who.userId,
      group_id: groupId,
    })))
  if (error) return { ok: false, error: "ส่งคำขอไม่สำเร็จ ลองใหม่อีกครั้งนะคะ" }

  const info: BookingInfo = {
    dateLabel: formatThaiDate(input.date),
    time: input.time,
    services: input.people.map((p) => serviceById.get(p.serviceId)!.name),
    therapistNote: input.people.some((p) => p.therapistId)
      ? `มีรีเควสหมอ (+${REQUEST_FEE}฿/ท่านที่เลือก)` : undefined,
  }
  await pushLineMessage(who.userId, msgRequested(info)) // ส่งไม่ผ่านก็ไม่เป็นไร
  return { ok: true }
}

export type MyBooking = {
  id: string; groupId: string | null; date: string; dateLabel: string
  time: string; services: string[]; serviceIds: string[]; status: string; canCancel: boolean
}

/** การจองข้างหน้า (pending/waiting) + ที่ผ่านมา 5 รายการ (ปุ่มจองซ้ำ — แบบ ThaiHand) */
export async function getMyBookings(idToken: string): Promise<
  { ok: true; upcoming: MyBooking[]; past: MyBooking[] } | Fail
> {
  const who = await verifyLineIdToken(idToken)
  if (!who) return AUTH_FAIL
  const db = createServiceClient()
  const today = todayInShopTz()
  const now = nowMin()
  const { data } = await db
    .from("queue_entries")
    .select("id, group_id, queue_date, start_time, service_id, service_name, status")
    .eq("line_user_id", who.userId)
    .order("queue_date", { ascending: false }).order("start_time", { ascending: false })
    .limit(60)
  // สมมติฐาน: ทุกแถวในกลุ่มเดียวกันมี วันที่/เวลา/สถานะ เดียวกัน (สร้างและอนุมัติ/ปฏิเสธพร้อมกันทั้งกลุ่มเสมอ)
  const group = (rows: NonNullable<typeof data>): MyBooking[] => {
    const byKey = new Map<string, MyBooking>()
    for (const e of rows) {
      const key = e.group_id ?? e.id
      const time = e.start_time.slice(0, 5)
      const cur = byKey.get(key)
      if (cur) {
        cur.services.push(e.service_name)
        cur.serviceIds.push(e.service_id ?? "")
        continue
      }
      byKey.set(key, {
        id: e.id, groupId: e.group_id, date: e.queue_date,
        dateLabel: formatThaiDate(e.queue_date), time,
        services: [e.service_name], serviceIds: [e.service_id ?? ""], status: e.status,
        canCancel: e.status !== "paid" && e.status !== "cancelled" && e.status !== "rejected" &&
          canCancelAt(e.queue_date, time, today, now),
      })
    }
    return [...byKey.values()]
  }
  const rows = data ?? []
  const upcoming = group(rows.filter(
    (e) => e.queue_date >= today && (e.status === "pending" || e.status === "waiting")))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  const past = group(rows.filter(
    (e) => e.status === "paid" || e.status === "cancelled" || e.status === "rejected" ||
      e.queue_date < today)).slice(0, 5)
  return { ok: true, upcoming, past }
}

export async function cancelBooking(
  idToken: string,
  target: { id: string; groupId: string | null }
): Promise<{ ok: true } | Fail> {
  const who = await verifyLineIdToken(idToken)
  if (!who) return AUTH_FAIL
  const db = createServiceClient()
  // อ่านก่อน — ยืนยันว่าเป็นของตัวเอง + ยังยกเลิกทัน
  const q = db.from("queue_entries")
    .select("id, queue_date, start_time, service_name, status")
    .eq("line_user_id", who.userId).in("status", ["pending", "waiting"])
  const { data } = target.groupId
    ? await q.eq("group_id", target.groupId)
    : await q.eq("id", target.id)
  if (!data || data.length === 0) return { ok: false, error: "ไม่พบการจองนี้ค่ะ" }
  const today = todayInShopTz()
  const time = data[0].start_time.slice(0, 5)
  if (!canCancelAt(data[0].queue_date, time, today, nowMin()))
    return { ok: false, error: "ใกล้เวลานัดแล้ว รบกวนโทรแจ้งร้านโดยตรงนะคะ" }

  const upd = db.from("queue_entries")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("line_user_id", who.userId).in("status", ["pending", "waiting"])
  const { error } = target.groupId
    ? await upd.eq("group_id", target.groupId)
    : await upd.eq("id", target.id)
  if (error) return { ok: false, error: "ยกเลิกไม่สำเร็จ ลองใหม่นะคะ" }

  await pushLineMessage(who.userId, msgCancelled({
    dateLabel: formatThaiDate(data[0].queue_date), time,
    services: data.map((d) => d.service_name),
  }))
  return { ok: true }
}
