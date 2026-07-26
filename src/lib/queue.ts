/** บอร์ดคิว 10:00–22:00 · หน่วยภายในคือ "นาทีตั้งแต่เที่ยงคืน" */
export const BOARD_START_MIN = 10 * 60
export const BOARD_END_MIN = 22 * 60
export const SLOT_MIN = 15
/** 1 นาที = 2px → ชั่วโมงละ 120px · บอร์ดกว้าง 1,440px */
export const PX_PER_MIN = 2

export function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

export function minToTime(min: number): string {
  const h = String(Math.floor(min / 60)).padStart(2, "0")
  const m = String(min % 60).padStart(2, "0")
  return `${h}:${m}`
}

export function minToX(min: number): number {
  return (min - BOARD_START_MIN) * PX_PER_MIN
}

export function snapMin(min: number): number {
  return Math.round(min / SLOT_MIN) * SLOT_MIN
}

/** หนีบให้การ์ดอยู่ในบอร์ดทั้งใบ — เริ่มช้าสุดคือปิดร้านลบระยะเวลา */
export function clampStart(startMin: number, durationMin: number): number {
  return Math.max(BOARD_START_MIN, Math.min(startMin, BOARD_END_MIN - durationMin))
}

/** ทับกันจริงเท่านั้น ชนขอบพอดี (จบ 11:00 เริ่ม 11:00) ไม่นับ */
export function overlaps(
  aStart: number,
  aDur: number,
  bStart: number,
  bDur: number
): boolean {
  return aStart < bStart + bDur && bStart < aStart + aDur
}

type QueueLike = {
  therapist_id: string | null
  start_time: string
  duration_min: number
  status: string
}

type BedLike = {
  bed_id: string | null
  start_time: string
  duration_min: number
  status: string
  started_at?: string | null
}

/** timestamptz → นาทีในวัน (เวลาไทย) */
export function isoToShopMin(iso: string): number {
  return timeToMin(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso))
  )
}

/** เวลาที่เตียงถูกใช้จริง — เริ่มนวดแล้วยึดเวลาเริ่มจริง (มาสายเตียงติดนานขึ้น) ยังไม่เริ่มยึดเวลาจอง */
export function bedStartMin(e: {
  start_time: string
  started_at?: string | null
}): number {
  return e.started_at ? isoToShopMin(e.started_at) : timeToMin(e.start_time)
}

/** หมอที่มีคิว (ไม่นับยกเลิก) คร่อมช่วงเวลานี้ — หมอหนึ่งรับได้ทีละคิว นับจากเวลานวดจริง */
export function busyTherapistIds(
  entries: {
    therapist_id: string | null
    start_time: string
    duration_min: number
    status: string
    started_at?: string | null
  }[],
  startMin: number,
  durationMin: number
): Set<string> {
  return new Set(
    entries
      .filter(
        (e) =>
          e.therapist_id !== null &&
          e.status !== "cancelled" &&
          overlaps(bedStartMin(e), e.duration_min, startMin, durationMin)
      )
      .map((e) => e.therapist_id as string)
  )
}

/** เตียงที่มีคิว (ไม่นับยกเลิก) คร่อมช่วงเวลานี้ — ใช้ทำปุ่มเตียงขึ้น "ไม่ว่าง" */
export function busyBedIds(
  entries: BedLike[],
  startMin: number,
  durationMin: number
): Set<string> {
  return new Set(
    entries
      .filter(
        (e) =>
          e.bed_id !== null &&
          e.status !== "cancelled" &&
          overlaps(bedStartMin(e), e.duration_min, startMin, durationMin)
      )
      .map((e) => e.bed_id as string)
  )
}

/** หมอว่าง = ไม่มีคิว (รอ/กำลังนวด) คร่อมเวลานี้ · คิวไม่ระบุหมอไม่ทำให้ใครติด */
export function countFreeTherapists(
  therapistIds: string[],
  entries: QueueLike[],
  nowMin: number
): number {
  const busy = new Set(
    entries
      .filter(
        (e) =>
          e.therapist_id !== null &&
          (e.status === "waiting" || e.status === "in_service") &&
          overlaps(timeToMin(e.start_time), e.duration_min, nowMin, 1)
      )
      .map((e) => e.therapist_id)
  )
  return therapistIds.filter((id) => !busy.has(id)).length
}
