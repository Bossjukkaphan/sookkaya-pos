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
  bed_id_2?: string | null
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

/** ช่วงที่การ์ดหนึ่งใบครองห้องหนึ่งห้อง — การ์ดที่ย้ายห้องกลางคันจะมีสองช่วงต่อกัน */
export type BedSegment = { bedId: string; startMin: number; durationMin: number }

/**
 * การ์ดใบนี้ยึดห้องไหน ช่วงไหนบ้าง — **สูตรเดียวที่ทุกจุดต้องใช้ตอบว่าห้องว่างไหม**
 *
 * เมนู "นวดคลายเท้า & คอบ่าไหล่ 90/120 นาที" ลูกค้านวดเท้าบนโซฟาครึ่งแรก แล้วย้ายไป
 * คอบ่าไหล่บนเตียงไทยครึ่งหลัง เดิมระบบเก็บได้ห้องเดียวจึงเข้าใจผิดสองทางพร้อมกัน:
 * คิดว่าโซฟายังไม่ว่างทั้งที่ลูกค้าย้ายไปแล้ว และคิดว่าเตียงไทยว่างทั้งที่มีคนอยู่
 *
 * จุดแบ่งคือครึ่งหนึ่งของโปรแกรมเสมอ (60=30+30 · 90=45+45 · 120=60+60 ตามที่หน้าร้านทำจริง)
 * ใช้ floor ให้ครึ่งหลังรับเศษไป เมนูจริงหารลงตัวหมด แต่ต้องไม่พังถ้าวันหนึ่งมีเมนูนาทีคี่
 *
 * ไม่มี bed_id_2 = อยู่ห้องเดียวตลอด → คืนช่วงเดียวยาวเต็มโปรแกรม = พฤติกรรมเดิมเป๊ะ
 */
export function bedSegments(e: {
  bed_id: string | null
  bed_id_2?: string | null
  start_time: string
  duration_min: number
  started_at?: string | null
}): BedSegment[] {
  if (!e.bed_id) return []
  const startMin = bedStartMin(e)
  if (!e.bed_id_2) {
    return [{ bedId: e.bed_id, startMin, durationMin: e.duration_min }]
  }
  const firstHalf = Math.floor(e.duration_min / 2)
  return [
    { bedId: e.bed_id, startMin, durationMin: firstHalf },
    {
      bedId: e.bed_id_2,
      startMin: startMin + firstHalf,
      durationMin: e.duration_min - firstHalf,
    },
  ]
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

/**
 * เตียงที่มีคิว (ไม่นับยกเลิก) คร่อมช่วงเวลานี้ — ใช้ทำปุ่มเตียงขึ้น "ไม่ว่าง"
 *
 * ไล่เป็นช่วง ๆ ผ่าน bedSegments เพราะการ์ดที่ย้ายห้องกลางคันยึดสองห้องคนละช่วงเวลา
 * การ์ดห้องเดียวได้ช่วงเดียวยาวเต็มโปรแกรม ผลจึงเท่าเดิมทุกประการ
 */
export function busyBedIds(
  entries: BedLike[],
  startMin: number,
  durationMin: number
): Set<string> {
  const busy = new Set<string>()
  for (const e of entries) {
    if (e.status === "cancelled") continue
    for (const seg of bedSegments(e)) {
      if (overlaps(seg.startMin, seg.durationMin, startMin, durationMin)) {
        busy.add(seg.bedId)
      }
    }
  }
  return busy
}

/**
 * การ์ดใบนี้ใช้เตียงซ้อนกับใบอื่นไหม (ข้ามช่องหมอ) — ป้าย ⚠️ซ้อน บนบอร์ดคิวใช้ตัวนี้ตัดสิน
 *
 * เทียบผ่าน bedSegments ทีละช่วง (ห้องแรก/ห้องที่สอง) ไม่ใช่เทียบ bed_id ตรงๆ เต็มโปรแกรม —
 * เดิมเทียบเต็มโปรแกรมจะเห็นการ์ดที่ย้ายห้องกลางคัน (ถูกต้อง) เป็น "ซ้อน" ผิดๆ เพราะห้องแรก
 * ที่ว่างไปแล้วครึ่งหลังยังถูกนับรวมเป็นช่วงเดียวยาวเต็ม (เคสจริง 9 ส.ค. 2569 เอ็ม เมธี/กอล์ฟฟี่)
 */
export function hasBedClash<T extends BedLike & { id: string }>(
  entry: T,
  others: T[]
): boolean {
  const mySegments = bedSegments(entry)
  return others.some(
    (s) =>
      s.id !== entry.id &&
      s.status !== "cancelled" &&
      bedSegments(s).some((sSeg) =>
        mySegments.some(
          (mySeg) =>
            mySeg.bedId === sSeg.bedId &&
            overlaps(mySeg.startMin, mySeg.durationMin, sSeg.startMin, sSeg.durationMin)
        )
      )
  )
}

/** เวลาเริ่ม·ระยะเวลาของแต่ละรายการในคิวกลุ่ม
 *
 *  **ต้องให้ผลตรงกับ `createQueueGroup` ฝั่ง server เป๊ะ** — ฟอร์มใช้ค่านี้บอกว่าเตียงไหนว่าง
 *  ถ้าสองที่คิดเวลาไม่ตรงกัน พนักงานจะเห็นเตียงว่างแล้วกดไปโดนเซิร์ฟเวอร์ตีกลับ (หรือแย่กว่า: จองซ้อน)
 *
 *  กติกาเดียวกับ server: รายการ "ต่อเวลา" (ลูกค้าคนเดิมทำหลายคอร์ส) เริ่มต่อจากรายการก่อนหน้าจบ
 *  รายการปกติ (คนละคนมาด้วยกัน) เริ่มพร้อมกันทั้งกลุ่ม · ระยะเวลายึดจากเมนูเสมอ
 *  (server อ่าน `services.duration_min` ไม่เชื่อค่าจากฟอร์ม — ไม่มีเมนู/ไม่มีระยะเวลาคิดเป็น 60) */
export function groupSlotTimes(
  people: { serviceId: string; sequential?: boolean }[],
  startMin: number,
  durationOf: (serviceId: string) => number | null | undefined
): { startMin: number; durationMin: number }[] {
  let chainEnd = startMin
  return people.map((p) => {
    const durationMin = durationOf(p.serviceId) ?? 60
    const s = p.sequential ? chainEnd : startMin
    chainEnd = s + durationMin
    return { startMin: s, durationMin }
  })
}

/** คนอื่นในกลุ่มที่ถือเตียงนี้อยู่ทับช่วงเวลาของรายการที่ i → ดัชนีคนนั้น (ไม่พบ = -1)
 *
 *  เดิมจอเก็บเงินกลุ่มเทียบแค่ "เตียงซ้ำ" ไม่ดูเวลา — ลูกค้าคนเดิมนวดต่ออีกคอร์สบนเตียงเดิม
 *  (รายการ "ต่อเวลา" ที่ส่งมาจากคิว) จึงถูกกันทั้งที่ถูกต้อง เพราะอยู่คนละช่วงเวลากัน
 *
 *  เวลาไม่ครบ (เว้นว่าง = ยึดเวลาบันทึก ซึ่งยังไม่รู้ตอนกรอก) ถือว่าชนไว้ก่อน —
 *  เตียงจองซ้อนแก้ยากกว่าการให้พนักงานกรอกเวลาเพิ่มอีกช่อง */
export function bedHolderInGroup(
  rows: { bedId: string; startMin: number | null; durationMin: number }[],
  i: number,
  bedId: string
): number {
  if (!bedId) return -1
  const mine = rows[i]
  return rows.findIndex((r, j) => {
    if (j === i || r.bedId !== bedId) return false
    if (mine.startMin === null || r.startMin === null) return true
    return overlaps(r.startMin, r.durationMin, mine.startMin, mine.durationMin)
  })
}

/** ใครในกลุ่ม (ก่อนแถวที่ i) ครองห้องเดียวกับรายการที่ i ทับช่วงเวลากันไหม — ใช้ตอนสร้างคิวกลุ่ม
 *
 * แถวในกลุ่มยังไม่ถูก insert ตอนเช็ค (insert รวมทีเดียวท้ายฟังก์ชัน) — bedConflictError ที่คุย
 * กับฐานข้อมูลจึงมองไม่เห็นกัน ต้องเทียบกันเองในหน่วยความจำตรงนี้
 *
 * เทียบผ่าน bedSegments เหมือนทุกจุดที่ถามว่า "ห้องนี้ว่างไหม" — เทียบแค่ bed_id === bed_id
 * เฉยๆ ไม่พอ เพราะคนหนึ่งอาจถือห้องนี้เป็น "ห้องที่สอง" (bed_id_2) ซึ่งจะหลุดการเทียบแบบตรงตัว
 */
export function groupBedClash(
  rows: {
    bed_id: string | null
    bed_id_2?: string | null
    start_time: string
    duration_min: number
  }[],
  i: number
): boolean {
  const mySegments = bedSegments(rows[i])
  return rows
    .slice(0, i)
    .some((r) =>
      bedSegments(r).some((rSeg) =>
        mySegments.some(
          (mySeg) =>
            mySeg.bedId === rSeg.bedId &&
            overlaps(rSeg.startMin, rSeg.durationMin, mySeg.startMin, mySeg.durationMin)
        )
      )
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
  // ห้องที่สองก็เป็นช่องที่ฟอร์มแก้บิลไม่มีเหมือนกัน — ปฏิบัติแบบเดียวกับเตียงเป๊ะ
  const bed2 = formData.get("bed_id_2")

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
    ...(bed2 === null ? {} : { bed_id_2: String(bed2) || null }),
    updated_at: new Date().toISOString(),
  }
}

/** หน้าต่างเวลาที่ยังย้ายเตียง/เปลี่ยนหมอของการ์ดที่ชำระแล้วได้ (กติกาเจ้าของร้าน 1/8/2569):
 *  เปลี่ยนได้ถึง 15 นาทีแรกของการนวดจริงเท่านั้น — เลยนั้นหมอนวดไปเกินครึ่งค่อนแล้ว
 *  ค่ามือต้องนิ่ง · ยังไม่เริ่มนวดย้ายได้เสมอ · จบแล้วล็อกเสมอ (กันย้ายย้อนหลังแก้ค่ามือ) */
export const MOVE_CARD_WINDOW_MIN = 15

export function canMoveCardWindow(
  entry: { start_time: string; duration_min: number; started_at: string | null },
  nowMin: number
): { allowed: boolean; reason?: string } {
  const startMin = bedStartMin(entry)
  const endMin = startMin + entry.duration_min
  // จบแล้ว (ตามเวลาเริ่มจริงถ้ามี ไม่มีก็ตามจอง) — ล็อกเสมอ
  if (nowMin >= endMin) return { allowed: false, reason: "การนวดจบแล้ว ย้ายย้อนหลังไม่ได้" }
  // ยังไม่เริ่มนวดจริง — ย้ายได้เสมอ
  if (!entry.started_at) return { allowed: true }
  const elapsed = nowMin - isoToShopMin(entry.started_at)
  if (elapsed <= MOVE_CARD_WINDOW_MIN) return { allowed: true }
  return {
    allowed: false,
    reason: `เริ่มนวดเกิน ${MOVE_CARD_WINDOW_MIN} นาทีแล้ว (ผ่านไป ${elapsed} นาที) — เปลี่ยนหมอ/เตียงไม่ได้`,
  }
}
