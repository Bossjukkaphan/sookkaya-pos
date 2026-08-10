import { daysInMonth, shiftMonth } from "@/lib/month"

export type Delta = { current: number; previous: number; pct: number | null }

/** จำนวนสัปดาห์ย้อนหลังที่ใช้เฉลี่ย "วันเดียวกันของสัปดาห์" — ต้องตรงกับ page.tsx เสมอ */
export const WEEKS_COMPARED = 4

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

  // เดือนก่อนไม่มีข้อมูลให้เทียบเลย (previous=0) — บอกตรงๆ ดีกว่าโชว์ delta หลอก
  if (mtd.pct === null) {
    return "ยังเทียบเดือนก่อนไม่ได้ (ไม่มีข้อมูล)"
  }

  // ทิศทางของ MTD เทียบเดือนก่อน ณ วันเดียวกัน
  const direction = mtd.pct > 0 ? "เร็วกว่า" : mtd.pct < 0 ? "ช้ากว่า" : "เท่ากับ"
  const pctText = Math.abs(mtd.pct)

  // ประโยคเปรียบเทียบวันนี้กับค่าเฉลี่ยวันเดียวกันของสัปดาห์ — มีก็ต่อเมื่อคำนวณค่าเฉลี่ยได้จริง
  // (weekdayAvg เป็น null แปลว่าไม่มีวันไหนในอดีตให้เทียบเลย ไม่ใช่ 0 บาท จึงต้องงดทั้งข้อความ
  // รวมถึง "(เทียบ n สัปดาห์)" ด้วย — ระบุจำนวนสัปดาห์โดยไม่มีค่าเฉลี่ยให้กำกับจะสับสน)
  let todayComparison = ""
  if (today.weekdayAvg !== null) {
    const todayDirection =
      today.revenue > today.weekdayAvg
        ? "สูงกว่า"
        : today.revenue < today.weekdayAvg
          ? "ต่ำกว่า"
          : "เท่ากับ"
    // ขนาดของความต่างเป็น % เทียบค่าเฉลี่ย — ค่าเฉลี่ยเป็น 0 หารไม่ได้ ต้องงดตัวเลข ไม่ใช่โชว์ Infinity/NaN
    const magnitudePct =
      today.weekdayAvg !== 0
        ? Math.round(((today.revenue - today.weekdayAvg) / today.weekdayAvg) * 100)
        : null
    const magnitudeText =
      magnitudePct === null ? "" : ` ${magnitudePct >= 0 ? "+" : ""}${magnitudePct}%`
    // จำนวนสัปดาห์ที่ใช้เฉลี่ย — กำกับค่าเฉลี่ยวันในสัปดาห์ตรงนี้ ไม่ใช่ตัวเลข MTD ข้างต้น
    const weeksInfo = today.weeksUsed < WEEKS_COMPARED ? ` (เทียบ ${today.weeksUsed} สัปดาห์)` : ""
    todayComparison = ` และ${todayLabel}นี้${todayDirection}ค่าเฉลี่ย${todayLabel}${magnitudeText}${weeksInfo}`
  }

  return `เดือนนี้วิ่ง${direction}เดือนก่อน ${pctText}% ณ วันเดียวกัน${todayComparison}`
}
