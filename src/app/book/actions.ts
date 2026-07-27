"use server"

import { createServiceClient } from "@/lib/supabase/service"
import { cleanLineDisplayName, pushLineMessage, verifyLineIdToken } from "@/lib/line"
import { msgCancelled, msgRequested, type BookingInfo } from "@/lib/line-messages"
import { pushAssistantMessage } from "@/lib/line-assistant"
import { msgShopCancelled, msgShopNewBooking } from "@/lib/line-assistant-messages"
import { canCancelAt, computeSlots, isBookableDate } from "@/lib/booking-slots"
import { formatThaiDate, nowTimeInShopTz, todayInShopTz } from "@/lib/datetime"

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
      customerName:
        cleanLineDisplayName(
          (data as unknown as { customers: { name: string } | null }).customers?.name
        ) ?? "",
    }
  return { ok: true, linked: false, displayName: cleanLineDisplayName(who.displayName) }
}

/** ผูกบัญชีครั้งแรกด้วยเบอร์โทร — เบอร์ช่วยจับคู่เท่านั้น ไม่ใช่ตัวให้สิทธิ์
 *  ห้ามคืนชื่อลูกค้าจริงตรงนี้: ใครก็ตามที่ล็อกอินไลน์แล้วกรอกเบอร์คนอื่น (สุ่ม/เดา)
 *  จะได้รู้ชื่อเจ้าของเบอร์นั้นทันที เป็นช่องโหว่สอดแนมข้อมูลลูกค้า — wizard ก็ไม่ได้ใช้ชื่อนี้อยู่แล้ว */
export async function linkLineAccount(
  idToken: string,
  phone: string,
  realName?: string
): Promise<{ ok: true } | Fail> {
  const who = await verifyLineIdToken(idToken)
  if (!who) return AUTH_FAIL
  const clean = phone.replace(/\D/g, "")
  if (!/^0\d{8,9}$/.test(clean)) return { ok: false, error: "เบอร์โทรไม่ถูกต้อง" }

  const db = createServiceClient()
  // ชื่อจากไลน์ต้องผ่านตัวกรอง placeholder ก่อนเสมอ — เคยได้ "Loading..." มาจริง
  // แล้วกลายเป็นชื่อลูกค้าในระบบ/บนการ์ดคิว
  const displayName = cleanLineDisplayName(who.displayName)
  // ชื่อจริงที่ลูกค้ากรอกเอง (ไม่บังคับ) — ชนะชื่อไลน์เสมอสำหรับลูกค้าใหม่
  // ส่วนชื่อไลน์ถูกเก็บแยกใน line_accounts ผูกกับ user id อยู่แล้ว ไม่หายไปไหน
  const cleanRealName = (realName ?? "").trim().slice(0, 100) || null
  const { data: matches } = await db.from("customers").select("id, name").eq("phone", clean)
  let customerId: string
  let upgradeAutoNameTo: string | null = null
  if (!matches || matches.length === 0) {
    const { data: created, error } = await db
      .from("customers")
      .insert({ name: cleanRealName ?? displayName ?? "ลูกค้า LINE", phone: clean })
      .select("id").single()
    if (error) return { ok: false, error: "สร้างข้อมูลลูกค้าไม่สำเร็จ ลองใหม่นะคะ" }
    customerId = created.id
  } else if (matches.length === 1) {
    customerId = matches[0].id
    // ลูกค้าเก่าที่ชื่อในระบบเป็นค่า auto ("ลูกค้า LINE") → ชื่อจริงที่กรอกมาดีกว่าเสมอ
    // ชื่อจริงอื่นๆ ที่ร้านตั้งไว้ห้ามทับ — ข้อมูลร้านเชื่อถือได้กว่าฟอร์มลูกค้า
    // แค่จดไว้ก่อน — เขียนจริงหลังการผูกสำเร็จเท่านั้น (ดูท้ายฟังก์ชัน)
    if (cleanRealName && matches[0].name === "ลูกค้า LINE") {
      upgradeAutoNameTo = cleanRealName
    }
  } else {
    // เบอร์ซ้ำหลายคน → เลือกคนที่มีบิลล่าสุด (ตาม spec)
    const { data: latest } = await db
      .from("sales").select("customer_id")
      .in("customer_id", matches.map((m) => m.id))
      .order("sale_date", { ascending: false }).limit(1).maybeSingle()
    const pick = matches.find((m) => m.id === latest?.customer_id) ?? matches[0]
    customerId = pick.id
  }
  // กันสวมสิทธิ์: ลูกค้าคนนี้ผูกไลน์ (ตัวอื่น) ไว้แล้ว → ห้ามผูกซ้อน
  // ตั้งแต่มีระบบแต้ม การผูกเบอร์ = เห็นประวัติ+แลกแต้มได้ ใครรู้เบอร์ก็สวมได้ถ้าไม่กัน
  // เคสจริงที่ต้องผ่านร้าน: ลูกค้าเปลี่ยนบัญชีไลน์ → แอดมินย้ายลิงก์ให้จากโปรไฟล์ลูกค้า
  const { data: existingLink } = await db
    .from("line_accounts")
    .select("line_user_id")
    .eq("customer_id", customerId)
    .neq("line_user_id", who.userId)
    .limit(1)
    .maybeSingle()
  if (existingLink) {
    return {
      ok: false,
      error:
        "เบอร์นี้ผูกกับบัญชีไลน์อื่นอยู่แล้วค่ะ ถ้าเป็นเบอร์ของคุณ (เช่น เปลี่ยนไลน์ใหม่) แจ้งพนักงานที่ร้านให้ย้ายบัญชีได้เลยนะคะ",
    }
  }

  const { error } = await db.from("line_accounts").upsert({
    line_user_id: who.userId,
    customer_id: customerId,
    display_name: displayName,
    picture_url: who.pictureUrl ?? null,
    phone: clean,
  })
  if (error) return { ok: false, error: "ผูกบัญชีไม่สำเร็จ ลองใหม่นะคะ" }

  // เขียนชื่อหลังผูกสำเร็จเท่านั้น — ก่อนหน้านี้คือคำขอที่ยังไม่ผ่านด่าน
  // ห้ามให้คำขอที่ถูกปฏิเสธ (เช่น โดนด่านกันสวมสิทธิ์) แก้ข้อมูลฝั่งร้านได้แม้แต่ตัวอักษรเดียว
  if (upgradeAutoNameTo) {
    await db.from("customers").update({ name: upgradeAutoNameTo }).eq("id", customerId)
  }
  return { ok: true }
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
  } catch (e) {
    console.error("getBookingOptions failed:", e)
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
    .from("line_accounts").select("customer_id, phone, display_name, customers(name)")
    .eq("line_user_id", who.userId).maybeSingle()
  if (!account) return { ok: false, error: "กรุณายืนยันเบอร์โทรก่อนจองค่ะ" }

  // ชื่อ/รูปไลน์ซ่อมตัวเองทุกครั้งที่ลูกค้ากลับมาจอง — เคยผูกตอนได้ "Loading..." /
  // เปลี่ยนชื่อไลน์ทีหลัง ข้อมูลจะทันสมัยเอง (best-effort ไม่กระทบการจอง)
  const freshName = cleanLineDisplayName(who.displayName)
  if (freshName && freshName !== account.display_name) {
    await db
      .from("line_accounts")
      .update({ display_name: freshName, picture_url: who.pictureUrl ?? null })
      .eq("line_user_id", who.userId)
  }
  // ชื่อบนการ์ดคิว: ใช้ชื่อจริงในระบบลูกค้าก่อน (พนักงานคุ้นชื่อนี้) — ตกไปใช้ชื่อเล่นไลน์ถ้าไม่มี
  // ทุกชั้นผ่านตัวกรอง placeholder (ชื่อเก่าในระบบอาจติด "Loading..." มาก่อนแล้ว) — ห้ามหลุดขึ้นการ์ด
  const customerName =
    cleanLineDisplayName(
      (account as unknown as { customers: { name: string } | null }).customers?.name
    ) ??
    cleanLineDisplayName(account.display_name) ??
    "ลูกค้า LINE"

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

  // กันรีเควสหมอที่ลาออก/ปิดรับแล้ว (ข้อมูลฝั่งลูกค้าอาจ cache หมอเก่าไว้)
  // เก็บชื่อไว้ด้วย — ข้อความแจ้งกลุ่มร้านต้องบอกว่ารีเควสหมอคนไหน
  const therapistIds = [...new Set(
    input.people.map((p) => p.therapistId).filter((id): id is string => id !== null))]
  const therapistName = new Map<string, string>()
  if (therapistIds.length > 0) {
    const { data: activeTherapists } = await db
      .from("therapists").select("id, name").eq("status", "active").in("id", therapistIds)
    for (const t of activeTherapists ?? []) therapistName.set(t.id, t.name)
    if (therapistIds.some((id) => !therapistName.has(id)))
      return { ok: false, error: "หมอที่เลือกไม่พร้อมให้จอง รีเฟรชแล้วลองใหม่นะคะ" }
  }

  // เช็คอินรายวัน: วันไหนแอดมินติ๊กเข้างานแล้ว (วันนี้/พรุ่งนี้ล่วงหน้า)
  // หมอที่ไม่ได้เข้างานวันนั้นรับรีเควสไม่ได้ · ไม่มีใครเข้างานเลย = ปิดรับทั้งวัน
  const { data: dayAttendance } = await db
    .from("attendance")
    .select("therapist_id")
    .eq("work_date", input.date)
    .not("therapist_id", "is", null)
  if ((dayAttendance ?? []).length > 0) {
    const checkedInIds = new Set((dayAttendance ?? []).map((a) => a.therapist_id))
    if (therapistIds.some((id) => !checkedInIds.has(id)))
      return {
        ok: false,
        error: "หมอที่เลือกไม่ได้เข้างานวันนั้นค่ะ เลือกหมอท่านอื่นหรือให้ร้านจัดให้นะคะ",
      }
  }

  // แผนวันหยุดล่วงหน้า (หน้า /shifts): หมอที่วางแผนหยุด/ลาวันนั้น รับรีเควสไม่ได้
  // ครอบคลุมวันอนาคตที่ยังไม่มีการเช็คอิน — ลูกค้าไม่ต้องมาถูกยกเลิกทีหลัง
  if (therapistIds.length > 0) {
    const { data: dayPlans } = await db
      .from("shift_plans")
      .select("therapist_id")
      .eq("work_date", input.date)
      .in("therapist_id", therapistIds)
    if ((dayPlans ?? []).length > 0)
      return {
        ok: false,
        error: "หมอที่เลือกหยุดวันนั้นค่ะ เลือกหมอท่านอื่นหรือให้ร้านจัดให้นะคะ",
      }
  }

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
      customer_name: customerName,
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
      ? "รีเควสหมอตามที่เลือกไว้ค่ะ" : undefined,
  }
  await pushLineMessage(who.userId, msgRequested(info)) // ส่งไม่ผ่านก็ไม่เป็นไร
  // แจ้งกลุ่มทีมร้านผ่าน OA ผู้ช่วย — env ยังไม่ตั้ง/ส่งพลาด → ข้ามเงียบๆ ไม่กระทบการจอง
  await pushAssistantMessage(
    process.env.LINE_ASSISTANT_QUEUE_GROUP_ID ?? "",
    msgShopNewBooking({
      name: customerName,
      dateLabel: info.dateLabel,
      time: input.time,
      // ฝั่งร้านต้องรู้ว่าท่านไหนรีเควสหมอคนไหน — ต่อท้ายชื่อเมนูรายคน
      services: input.people.map(
        (p) =>
          serviceById.get(p.serviceId)!.name +
          (p.therapistId
            ? ` (รีเควสหมอ${therapistName.get(p.therapistId) ?? "ที่เลือกไว้"})`
            : "")
      ),
      phone: account.phone,
    })
  )
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
    .select("id, queue_date, start_time, service_name, customer_name, status")
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
  // แจ้งกลุ่มทีมร้านผ่าน OA ผู้ช่วย — env ยังไม่ตั้ง/ส่งพลาด → ข้ามเงียบๆ ไม่กระทบการยกเลิก
  await pushAssistantMessage(
    process.env.LINE_ASSISTANT_QUEUE_GROUP_ID ?? "",
    msgShopCancelled({
      name: data[0].customer_name ?? "ลูกค้า LINE", dateLabel: formatThaiDate(data[0].queue_date),
      time, services: data.map((d) => d.service_name),
      // ร้านรับคิวไปแล้ว (waiting) — ทีมอาจกันหมอ/เตียงไว้ ต้องรู้ว่าคิวหลุด
      afterConfirm: data.some((d) => d.status === "waiting"),
    })
  )
  return { ok: true }
}
