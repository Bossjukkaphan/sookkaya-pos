/**
 * ร้านอยู่ไทย แต่ server อาจรันที่ timezone อื่น (Vercel = UTC)
 * ทุกครั้งที่พูดถึง "วันนี้" ต้องคิดจากเวลาไทยเสมอ ไม่งั้นยอดขายหลังเที่ยงคืน UTC จะข้ามวัน
 */
export const SHOP_TZ = "Asia/Bangkok"

/** วันที่ปัจจุบันตามเวลาไทย รูปแบบ YYYY-MM-DD */
export function todayInShopTz(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/** เวลาปัจจุบันตามเวลาไทย รูปแบบ HH:mm */
export function nowTimeInShopTz(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: SHOP_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date())
}

export const THAI_MONTHS_ABBR = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
] as const

/** แปลง YYYY-MM-DD เป็นข้อความไทย เช่น "20 ก.ค. 2569" (พ.ศ.) */
export function formatThaiDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number)
  return `${d} ${THAI_MONTHS_ABBR[m - 1]} ${y + 543}`
}

/** "2026-06-15" → "มิ.ย." */
export function thaiMonthAbbr(isoDate: string): string {
  return THAI_MONTHS_ABBR[Number(isoDate.slice(5, 7)) - 1]
}

/** บวกเดือนแบบไม่ให้วันที่ล้นเดือน (31 ม.ค. + 1 เดือน = 28/29 ก.พ.) */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))
  return target.toISOString().slice(0, 10)
}
