/** บอร์ดคิว 10:00–24:00 · หน่วยภายในคือ "นาทีตั้งแต่เที่ยงคืน"
 * ปลายบอร์ดเลยเวลาปิดร้านไว้ — ลูกค้ามาดึกนวดยาวเกินเวลาต้องยังเห็นการ์ดเต็มใบ */
export const BOARD_START_MIN = 10 * 60
export const BOARD_END_MIN = 24 * 60
export const SLOT_MIN = 15
/** 1 นาที = 2px → ชั่วโมงละ 120px · บอร์ดกว้าง 1,440px */
export const PX_PER_MIN = 2

/** ความสูงการ์ดคิว — พอดี 5 บรรทัด (เมนู · ลูกค้า · เวลา · เตียง · ชิพสถานะ)
 *  ROW_H = CARD_H + ระยะขอบบนล่าง 6px สองด้าน · ต้องคู่กันเสมอ ไม่งั้นพิกัดลากการ์ดเพี้ยน */
export const CARD_H = 88
export const ROW_H = CARD_H + 12

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

/**
 * ฟิลด์ที่การ์ดคิว "มิเรอร์" มาจากบิล — ที่เดียวของความจริง
 *
 * กติกา: บิลคือความจริงว่าใครนวด เมนูอะไร นานเท่าไร เตียงไหน (ค่ามือเดินตามบิล)
 * การ์ดคือผังงานบนกระดานที่ต้องเดินตามบิลเสมอ
 *
 * เคยเขียนรายชื่อฟิลด์แยกกันสองที่ (ตอนกดชำระใน createSale · ตอนแก้บิลใน updateSale)
 * แล้วสองชุดค่อยๆ เพี้ยนออกจากกันจนไม่มีทางไหนครบ — ตรวจเจอ 28/7/2569:
 *   · ชวน 25/7 บิลแก้เป็น 120 นาที การ์ดค้าง 90 → บล็อกบนบอร์ดสั้นกว่าจริง 30 นาที
 *   · ใบใบ 27/7 บิลอยู่ห้องสปา 2 การ์ดอยู่ห้องสปา 3 (ทุกห้องมี "เตียง 1" เลยไม่มีใครทันสังเกต)
 * เพิ่มฟิลด์ใหม่ที่การ์ดต้องมิเรอร์ ให้เพิ่มที่นี่ที่เดียว แล้วได้ครบทั้งสองทางพร้อมกัน
 */
export function queueMirrorFromSale(
  formData: FormData,
  serviceId: string,
  service: { name: string; duration_min: number | null },
  therapistId: string,
) {
  // ฟอร์มแก้บิลไม่มีช่องเตียง — ถ้าไม่มีคีย์นี้มาเลยต้อง "ไม่แตะ" เตียงของการ์ด
  // ไม่ใช่เขียน null ทับ (จะลบเตียงที่พนักงานเลือกไว้ตอนกดชำระทิ้ง)
  // มีคีย์แต่ค่าว่าง = พนักงานตั้งใจเอาออก อันนั้นเขียน null ถูกแล้ว
  const bed = formData.get("bed_id")

  return {
    service_id: serviceId,
    service_name: service.name,
    duration_min: service.duration_min ?? 60,
    therapist_id: therapistId,
    customer_name: String(formData.get("customer_name") ?? "").trim() || null,
    customer_phone: String(formData.get("customer_phone") ?? "").trim() || null,
    is_request: formData.get("is_request") === "on",
    private_room: formData.get("private_room") === "on",
    ...(bed === null ? {} : { bed_id: String(bed) || null }),
    updated_at: new Date().toISOString(),
  }
}
