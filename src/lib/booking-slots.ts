/**
 * กติกาช่วงเวลาที่เปิดให้จองจากไลน์ — logic ล้วน ใช้ได้ทั้ง server/client
 * เวลาเป็น "นาทีจากเที่ยงคืน" แบบเดียวกับ lib/queue.ts · วันที่ YYYY-MM-DD (เวลาไทยเสมอ)
 */
export const OPEN_MIN = 10 * 60          // ร้านเปิด 10:00
export const CLOSE_MIN = 22 * 60         // ปิด 22:00 — คิวต้องจบก่อนหรือพอดี
export const SLOT_STEP = 30
export const MIN_LEAD_MIN = 60           // จองวันนี้ต้องล่วงหน้า ≥1 ชม.
export const MAX_ADVANCE_DAYS = 14
export const CANCEL_CUTOFF_MIN = 120     // ยกเลิกเองได้ถึงก่อนนัด 2 ชม.

const toHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`

export function computeSlots(opts: {
  date: string
  today: string
  nowMin: number
  durationMin: number
}): string[] {
  if (opts.date < opts.today) return []
  let earliest = OPEN_MIN
  if (opts.date === opts.today) {
    const lead = opts.nowMin + MIN_LEAD_MIN
    earliest = Math.max(OPEN_MIN, Math.ceil(lead / SLOT_STEP) * SLOT_STEP)
  }
  const latestStart = CLOSE_MIN - opts.durationMin
  const slots: string[] = []
  for (let m = earliest; m <= latestStart; m += SLOT_STEP) slots.push(toHHMM(m))
  return slots
}

/**
 * ความจุของช่วงเวลา — หมอหนึ่งคนรับได้ทีละคิว คิวหนึ่งใบจึงกินหมอหนึ่งคนเสมอ
 *
 * ทำไมต้องนับ "ใบ" ไม่ใช่ "หมอที่ถูกระบุ": การ์ดหน้าร้านที่ยังไม่ได้เลือกหมอ
 * (แถวบนสุดของกระดานคิว) มี therapist_id เป็น null ถ้ากรอง null ทิ้งแบบ busyTherapistIds()
 * การ์ดพวกนี้จะกลายเป็นไม่กินความจุอะไรเลย ทั้งที่กินหมอจริงหนึ่งคน
 * — นี่คือรูที่ทำให้คิวไลน์ 29/7/2569 15:00 ถูกรับเข้ามาทั้งที่หมอทั้ง 5 คนติดคิวหมดแล้ว
 *
 * ผู้เรียกต้องกรอง status cancelled/rejected ออกมาก่อน (คิว pending ยังนับ —
 * ไม่งั้นสามคนจองช่องเดียวกันพร้อมกันได้ก่อนร้านจะกดยืนยันใบแรก)
 */
export type LoadEntry = { start_time: string; duration_min: number }

const startMinOf = (e: LoadEntry) => {
  const [h, m] = e.start_time.split(":").map(Number)
  return h * 60 + m
}

/**
 * จำนวนคิวที่ซ้อนกันมากที่สุด ณ จุดใดจุดหนึ่งในช่วง [startMin, startMin+durationMin)
 *
 * ต้องเป็น "จุดที่แน่นที่สุด" ไม่ใช่ "จำนวนใบที่แตะช่วงนี้" — ใบที่จบ 15:10
 * กับใบที่เริ่ม 15:30 ต่างก็แตะช่วง 15:00-16:00 แต่ไม่เคยใช้หมอพร้อมกัน
 * ถ้านับรวมเป็น 2 จะปิดช่องที่ยังรับได้จริง (ปฏิเสธลูกค้าฟรีๆ)
 */
export function peakLoad(
  entries: LoadEntry[],
  startMin: number,
  durationMin: number
): number {
  const endMin = startMin + durationMin
  const overlapping = entries.filter((e) => {
    const s = startMinOf(e)
    return s < endMin && startMin < s + e.duration_min
  })
  if (overlapping.length === 0) return 0
  // จุดที่แน่นที่สุดอยู่ที่ "เวลาเริ่มของใบใดใบหนึ่ง" หรือที่หัวช่วงเสมอ
  // (จำนวนซ้อนเพิ่มขึ้นได้เฉพาะตอนมีใบใหม่เริ่ม) จึงเช็คแค่จุดเหล่านั้นพอ
  const probes = [startMin, ...overlapping.map(startMinOf).filter((s) => s > startMin)]
  return Math.max(
    ...probes.map((t) =>
      overlapping.filter((e) => {
        const s = startMinOf(e)
        return s <= t && t < s + e.duration_min
      }).length
    )
  )
}

/** ช่วงเวลานี้ยังรับเพิ่มได้อีก seats คนไหม */
export function hasRoomAt(opts: {
  entries: LoadEntry[]
  startMin: number
  durationMin: number
  /** จำนวนหมอที่ทำงานวันนั้น */
  capacity: number
  /** จองกี่ท่านพร้อมกัน */
  seats: number
}): boolean {
  return peakLoad(opts.entries, opts.startMin, opts.durationMin) + opts.seats <= opts.capacity
}

/** คัดช่องเวลาที่ยังรับได้ออกมาจากช่องที่ร้านเปิด */
export function openSlots(opts: {
  slots: string[]
  entries: LoadEntry[]
  capacity: number
  durationMin: number
  seats: number
}): string[] {
  return opts.slots.filter((t) => {
    const [h, m] = t.split(":").map(Number)
    return hasRoomAt({
      entries: opts.entries,
      startMin: h * 60 + m,
      durationMin: opts.durationMin,
      capacity: opts.capacity,
      seats: opts.seats,
    })
  })
}

export function isBookableDate(date: string, today: string): boolean {
  if (date < today) return false
  const diffDays =
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000
  return diffDays <= MAX_ADVANCE_DAYS
}

export function canCancelAt(
  queueDate: string,
  startTime: string, // "HH:MM"
  today: string,
  nowMin: number
): boolean {
  // ถูกต้องตราบใดที่ OPEN_MIN > CANCEL_CUTOFF_MIN (จองพรุ่งนี้เช้าสุด 10:00 ยกเลิกคืนนี้ก็ยังเหลือ >2 ชม.)
  if (queueDate > today) return true
  if (queueDate < today) return false
  const [h, m] = startTime.split(":").map(Number)
  return h * 60 + m - nowMin >= CANCEL_CUTOFF_MIN
}
