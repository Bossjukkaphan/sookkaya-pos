import { bedStartMin, minToTime, overlaps } from "./queue"

/** คอลัมน์ที่ต้อง select มาให้ firstClash — ให้ทุกทางเข้าดึงชุดเดียวกัน */
export const CLASH_COLUMNS =
  "id, customer_name, service_name, duration_min, start_time, started_at"

/** ใบที่ยกเลิก/ถูกปฏิเสธไม่ครองเตียง — ตัวกรองต้องเหมือนกันทุกทางเข้า
 *  (บอร์ดคิวก็กรองชุดนี้ตอนโหลด ฝั่งจอกับฝั่ง server จึงเห็นตรงกัน) */
export const CLASH_STATUS_FILTER = "(cancelled,rejected)"

/** แถวคิวเท่าที่ต้องใช้ตัดสินว่าเตียง/หมอชนกันไหม และประกอบข้อความบอกพนักงาน */
export type ClashRow = {
  id: string
  customer_name: string | null
  service_name: string
  duration_min: number
  start_time: string
  started_at: string | null
}

/**
 * ใบแรกที่ครองทรัพยากรเดียวกัน (เตียง/หมอ) คร่อมช่วงเวลานี้ — ไม่พบคืน null
 *
 * กติกาเดียวที่ทุกทางเข้าต้องใช้ร่วมกัน: หน้าคิว (createQueueEntry/updateQueueEntry/
 * moveQueueEntry/movePaidCard) และหน้าเก็บเงิน (createSale) เคยมีแค่ฝั่งคิวที่ตรวจ
 * ทำให้เตียงที่พนักงานเลือกตอนกดเก็บเงินจองซ้อนได้เงียบๆ (เจอจริง 9/8/2569 เก้าอี้ 3)
 *
 * เวลาอิงการใช้จริง: ใบที่เริ่มนวดแล้วยึดเวลาเริ่มจริง (มาสายเตียงติดนานขึ้น)
 * ใบที่ยังไม่เริ่มยึดเวลาจอง · ชนขอบพอดี (จบ 11:00 เริ่ม 11:00) ไม่นับชน
 */
export function firstClash(
  rows: ClashRow[],
  startMin: number,
  durationMin: number,
  excludeIds: string[]
): ClashRow | null {
  return (
    rows.find(
      (e) =>
        !excludeIds.includes(e.id) &&
        overlaps(bedStartMin(e), e.duration_min, startMin, durationMin)
    ) ?? null
  )
}

/** ช่วงเวลา+เจ้าของคิวที่ชน — ใช้ประกอบข้อความให้พนักงานรู้ว่าติดใคร */
export function clashLabel(clash: ClashRow): string {
  const s = bedStartMin(clash)
  const who = clash.customer_name ? `คุณ${clash.customer_name}` : clash.service_name
  return `${minToTime(s)}–${minToTime(s + clash.duration_min)} (คิว${who})`
}
