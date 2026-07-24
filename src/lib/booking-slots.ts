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
