export const WEEKDAY_LABELS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."] as const

/** ชั่วโมงที่ร้านเปิดจริง — ข้อมูลนอกช่วงนี้คือเวลาที่กรอกผิด ไม่เอามาระบายสี */
export const OPEN_HOURS = Array.from({ length: 12 }, (_, i) => i + 10) // 10:00–21:00

/**
 * ระดับความเข้มของสีในตาราง heatmap 0-4 เทียบกับช่องที่แน่นที่สุด
 * ใช้สัดส่วนแทนจำนวนดิบ เพราะร้านจะโตขึ้นเรื่อยๆ ถ้าตรึงเลขไว้อีกสามเดือนจะแดงหมดทั้งตาราง
 */
export function heatIntensity(sessions: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (max <= 0 || sessions <= 0) return 0
  // ขอบล่างของแต่ละช่วงนับรวม — ช่องที่แน่นครึ่งหนึ่งของช่องที่แน่นที่สุด ต้องได้ระดับ 3
  const ratio = sessions / max
  if (ratio >= 0.75) return 4
  if (ratio >= 0.5) return 3
  if (ratio >= 0.25) return 2
  return 1
}

/** จำนวนวันเต็มจาก `from` ถึง `to` (รูปแบบ YYYY-MM-DD ทั้งคู่) */
export function daysSince(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number)
  const [ty, tm, td] = to.split("-").map(Number)
  const ms = Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)
  return Math.round(ms / 86_400_000)
}

export type DormantInput = { visits: number; lastVisit: string }

/**
 * ลูกค้าที่ "หายไป" คือคนที่เคยกลับมาแล้วอย่างน้อยหนึ่งครั้ง (มา ≥ 2 ครั้ง) แต่หยุดมา
 * คนที่มาครั้งเดียวแล้วไม่มาอีกยังไม่เคยเป็นลูกค้าประจำ ตามกลับได้ผลน้อยกว่ามาก
 */
export function isDormant(
  row: DormantInput,
  todayIso: string,
  thresholdDays: number
): boolean {
  if (row.visits < 2) return false
  return daysSince(row.lastVisit, todayIso) > thresholdDays
}
