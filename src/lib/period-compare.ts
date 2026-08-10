import { daysInMonth, shiftMonth } from "@/lib/month"

export type Delta = { current: number; previous: number; pct: number | null }

/**
 * ช่วง MTD ของเดือน ym ตัดที่วัน dayOfMonth (รวมวันนั้น) — คืน {from,to} YYYY-MM-DD
 */
export function mtdRange(ym: string, dayOfMonth: number): { from: string; to: string } {
  return {
    from: `${ym}-01`,
    to: `${ym}-${String(dayOfMonth).padStart(2, "0")}`,
  }
}

/**
 * MTD เดือนก่อนหน้า ตัดวันเดียวกัน
 * — เดือนก่อนสั้นกว่า ตัดที่วันสุดท้ายของเดือนนั้น (31 มี.ค. → 28/29 ก.พ.)
 */
export function prevMtdRange(ym: string, dayOfMonth: number): { from: string; to: string } {
  const prevYm = shiftMonth(ym, -1)
  const maxDay = daysInMonth(prevYm)
  const day = Math.min(dayOfMonth, maxDay)
  return {
    from: `${prevYm}-01`,
    to: `${prevYm}-${String(day).padStart(2, "0")}`,
  }
}

/**
 * วันที่ของ "วันในสัปดาห์เดียวกัน" ย้อนหลัง count สัปดาห์ (ไม่รวม todayIso)
 * เรียงใหม่→เก่า
 */
export function sameWeekdayDates(todayIso: string, count: number): string[] {
  const dates: string[] = []
  const d = new Date(`${todayIso}T00:00:00Z`)

  for (let i = 1; i <= count; i++) {
    const weekBefore = new Date(d)
    weekBefore.setUTCDate(weekBefore.getUTCDate() - 7 * i)
    const iso = weekBefore.toISOString().slice(0, 10)
    dates.push(iso)
  }

  return dates
}

/**
 * คำนวณ delta: (current - previous) / previous * 100
 * pct = null เมื่อ previous เป็น 0 (ห้ามหารศูนย์)
 */
export function delta(current: number, previous: number): Delta {
  return {
    current,
    previous,
    pct: previous === 0 ? null : Math.round(((current - previous) / previous) * 100),
  }
}

/**
 * ประโยคคำตัดสินโซน 1 — คืนภาษาไทยพร้อมทิศทาง
 * เช่น "เดือนนี้วิ่งเร็วกว่าเดือนก่อน 12% ณ วันเดียวกัน"
 * weeksUsed < weeksRequested → ระบุ "(เทียบ n สัปดาห์)"
 * previous=0 → "ยังเทียบเดือนก่อนไม่ได้ (ไม่มีข้อมูล)"
 */
export function verdictSentence(input: {
  mtd: Delta
  today: { revenue: number; weekdayAvg: number | null; weeksUsed: number }
  todayLabel: string // เช่น "วันเสาร์"
}): string {
  const { mtd, today, todayLabel } = input

  // If no data from previous month
  if (mtd.pct === null) {
    return "ยังเทียบเดือนก่อนไม่ได้ (ไม่มีข้อมูล)"
  }

  // Build direction text
  const direction = mtd.pct > 0 ? "เร็วกว่า" : mtd.pct < 0 ? "ช้ากว่า" : "เท่ากับ"
  const pctText = Math.abs(mtd.pct)

  // Build weeks info if not full 4 weeks
  const weeksInfo = today.weeksUsed < 4 ? ` (เทียบ ${today.weeksUsed} สัปดาห์)` : ""

  // Build today comparison if available
  let todayComparison = ""
  if (today.weekdayAvg !== null) {
    const todayDirection =
      today.revenue > today.weekdayAvg
        ? "สูงกว่า"
        : today.revenue < today.weekdayAvg
          ? "ต่ำกว่า"
          : "เท่ากับ"
    todayComparison = ` และ${todayLabel}นี้${todayDirection}ค่าเฉลี่ย${todayLabel}`
  }

  return `เดือนนี้วิ่ง${direction}เดือนก่อน ${pctText}% ณ วันเดียวกัน${weeksInfo}${todayComparison}`
}
