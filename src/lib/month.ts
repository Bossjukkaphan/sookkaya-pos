/** ตัวช่วยเรื่องเดือนที่ใช้ร่วมกันทั้งหน้าการเงิน รายจ่าย และวิเคราะห์รายจ่าย
 *  เดือนในระบบเป็นสตริง "YYYY-MM" เสมอ (ปี ค.ศ.) แสดงผลเป็น พ.ศ. */

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
]

const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
]

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  return `${THAI_MONTHS[m - 1]} ${y + 543}`
}

export function monthShortLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  return `${THAI_MONTHS_SHORT[m - 1]} ${(y + 543) % 100}`
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number)
  // UTC เสมอ — ถ้าใช้ new Date(y, m) ตามเขตเวลาเครื่อง วันที่ 1 ของเดือนอาจถอยไปเดือนก่อน
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7)
}

/** วันที่ 0 ของเดือนถัดไป = วันสุดท้ายของเดือนนี้ */
export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
