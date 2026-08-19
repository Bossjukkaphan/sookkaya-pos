import { isoToShopMin } from "./queue"

/**
 * ชั่วโมง (เวลาไทย) ที่ลูกค้าถูกปฏิเสธ — ใช้หาว่าดีมานด์ล้นช่วงไหนของวัน
 * ประกอบการตัดสินใจจัดกำลัง/จ้างหมอเพิ่มในหน้า /insights/staffing
 *
 * อ่านเวลาจาก "หมายเหตุ" ก่อนเสมอ เพราะพนักงานมักบันทึกหลังเหตุการณ์
 * (เคสจริง 16/8/2569: ลูกค้าต้องการ 17:30 แต่ปุ่มถูกกดตอน 21:43 —
 * ถ้ายึดเวลาบันทึก ช่วงพีคจริงจะย้ายไปโผล่ตอนร้านใกล้ปิด)
 * หมายเหตุไม่มีเวลา ค่อยถอยไปใช้เวลาบันทึก (ใกล้เคียงสุดเท่าที่มี)
 *
 * รูปแบบเวลาที่เจอจริงในหมายเหตุ: "13:30 น." (ระบบเขียนเอง) · "17.30" ·
 * "ตอน16.00" · "20.30น." — จับทั้ง : และ . เป็นตัวคั่น และตรวจว่าเป็นเวลาจริง
 * (ชั่วโมง ≤ 23, นาที ≤ 59) เพื่อไม่ตีความ "นวด 90 นาที" หรือราคาเป็นเวลา
 */
export function turnAwayHour(note: string | null, createdAtIso: string): number {
  for (const m of (note ?? "").matchAll(/(\d{1,2})[:.](\d{2})/g)) {
    const hour = Number(m[1])
    const minute = Number(m[2])
    if (hour <= 23 && minute <= 59) return hour
  }
  return Math.floor(isoToShopMin(createdAtIso) / 60)
}

/** นับการปฏิเสธต่อชั่วโมง เรียงตามชั่วโมง — เฉพาะชั่วโมงที่มีข้อมูล (ข้อมูลจริงยังบาง
 *  การโชว์ช่องศูนย์ยาวทั้งวันจะกลบช่วงพีคที่อยากให้เห็น) */
export function turnAwayHourHistogram(
  rows: { note: string | null; created_at: string }[]
): { hour: number; count: number }[] {
  const byHour = new Map<number, number>()
  for (const r of rows) {
    const h = turnAwayHour(r.note, r.created_at)
    byHour.set(h, (byHour.get(h) ?? 0) + 1)
  }
  return [...byHour.entries()]
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour - b.hour)
}
