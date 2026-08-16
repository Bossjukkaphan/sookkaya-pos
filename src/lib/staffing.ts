/**
 * ตรรกะตัดสินการจัดกำลังหมอ — ที่เดียวของเกณฑ์ตัวเลขทั้งหมด
 *
 * เกณฑ์มาจากการวิเคราะห์ 17 ส.ค. 2569 (สเปก 2026-08-17-staffing-insights-design.md):
 * งานวันจันทร์-พฤหัสรองรับ ~5 คน (ต่อหมอ 2,248฿ ที่ 5 คน vs 1,780฿ ที่ 6 คน)
 * เสาร์-อาทิตย์ 7 คนคุ้ม (ครึ่งหนึ่งของวันหมอเต็มพร้อมกันทั้ง 7)
 * ร้านโตแล้วเกณฑ์เก่าไม่เหมาะ — แก้ที่ค่าคงที่นี้ที่เดียว
 */

export type DayClass = "mon_thu" | "fri" | "weekend"

export const DAY_CLASS_LABEL: Record<DayClass, string> = {
  mon_thu: "จันทร์–พฤหัส",
  fri: "ศุกร์",
  weekend: "เสาร์–อาทิตย์",
}

export const STAFFING = {
  /** จำนวนแนะนำ: ยอดต่อหมอเฉลี่ยขั้นต่ำของ n ที่ยอมรับได้ */
  recommendMinPerTherapist: 2000,
  /** จำนวนแนะนำ: สัดส่วนวันที่หมอเต็มพร้อมกันสูงสุดที่ยอมรับได้ (%) */
  recommendMaxFullPct: 30,
  /** จำนวนแนะนำ: n ต้องมีข้อมูลอย่างน้อยกี่วันถึงเข้ารอบ */
  recommendMinDays: 3,
  /** เกณฑ์จ้างคนที่ 8 ข้อ 1: % วันเสาร์-อาทิตย์ที่หมอเต็มพร้อมกัน */
  weekendFullPctPass: 70,
  /** เกณฑ์ข้อ 2: ยอดต่อหมอต่อวัน ศุกร์-อาทิตย์ (บาท) */
  fridaySundayPerTherapistPass: 2500,
  /** เกณฑ์ข้อ 3: ลูกค้าที่ปฏิเสธต่อเดือน (ครั้ง) */
  turnAwaysPerMonthPass: 8,
  /** เกณฑ์ข้อ 4: % หมอ-วันที่ต่ำกว่าการันตี 500฿ ไม่เกิน */
  guaranteeShortfallPctPass: 15,
  /** แถบเหลือง: ยังไม่ผ่านแต่อยู่ภายในกี่ % ของเกณฑ์ */
  nearBandPct: 15,
  /** จำนวนบันทึกปฏิเสธขั้นต่ำต่อเดือนที่ทำให้ตัวเลขข้อ 3 น่าเชื่อ */
  turnAwayTrustMin: 4,
} as const

/** จันทร์-พฤหัส / ศุกร์ / เสาร์-อาทิตย์ — ศุกร์แยกเพราะยอดใกล้วันหยุดกว่าวันธรรมดา */
export function dayClass(isoDate: string): DayClass {
  const [y, m, d] = isoDate.split("-").map(Number)
  // 0=อาทิตย์ … 6=เสาร์ (UTC ปลอดภัยเพราะสร้างจากปี-เดือน-วันตรง ๆ ไม่มีเขตเวลา)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  if (dow === 5) return "fri"
  if (dow === 0 || dow === 6) return "weekend"
  return "mon_thu"
}

export type StaffingDayRow = {
  day_class: DayClass
  therapists_checked_in: number
  revenue: number
  peak_concurrent_therapists: number
  idle_therapists: number
  is_estimated: boolean
}

export type Recommendation = {
  /** จำนวนหมอแนะนำ · null = ข้อมูลไม่พอจะตอบ */
  count: number | null
  inconclusive: boolean
  avgRevenue: number
  avgPerTherapist: number
  /** % ของวันที่หมอยุ่งเต็มพร้อมกัน (peak ≥ จำนวนที่เช็คอิน) */
  fullDayPct: number
  /** ครั้งที่หมอมาแล้วไม่ได้คิวเลย — นับเฉพาะข้อมูลเช็คอินจริง */
  idleCount: number
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/**
 * จำนวนหมอน้อยที่สุด n ที่ (ก) ยอดต่อหมอเฉลี่ย ≥ 2,000฿ และ (ข) วันที่เต็ม ≤ 30%
 * — น้อยกว่านั้นคือจัดขาด (เต็มบ่อย เสียลูกค้า) มากกว่านั้นคือจัดเกิน (ยอดต่อหมอจม)
 * n ที่มีข้อมูลน้อยกว่า 3 วันไม่เข้ารอบ ห้ามตัดสินจากวันเดียว
 */
export function recommendedTherapists(rows: StaffingDayRow[]): Recommendation {
  const summary = {
    avgRevenue: Math.round(avg(rows.map((r) => r.revenue))),
    avgPerTherapist: Math.round(
      avg(rows.filter((r) => r.therapists_checked_in > 0)
        .map((r) => r.revenue / r.therapists_checked_in))
    ),
    fullDayPct: rows.length
      ? Math.round((100 * rows.filter(
          (r) => r.peak_concurrent_therapists >= r.therapists_checked_in
        ).length) / rows.length)
      : 0,
    idleCount: rows.filter((r) => !r.is_estimated)
      .reduce((a, r) => a + r.idle_therapists, 0),
  }

  const byN = new Map<number, StaffingDayRow[]>()
  for (const r of rows) {
    if (r.therapists_checked_in <= 0) continue
    byN.set(r.therapists_checked_in, [...(byN.get(r.therapists_checked_in) ?? []), r])
  }
  const eligible = [...byN.entries()]
    .filter(([, g]) => g.length >= STAFFING.recommendMinDays)
    .sort(([a], [b]) => a - b)

  for (const [n, g] of eligible) {
    const perTherapist = avg(g.map((r) => r.revenue / n))
    const fullPct = (100 * g.filter((r) => r.peak_concurrent_therapists >= n).length) / g.length
    if (perTherapist >= STAFFING.recommendMinPerTherapist &&
        fullPct <= STAFFING.recommendMaxFullPct) {
      return { count: n, inconclusive: false, ...summary }
    }
  }

  // ไม่มี n ผ่าน — ชี้ n ที่ยอดต่อหมอดีสุดไว้เป็นจุดตั้งต้น แต่ประกาศตรง ๆ ว่ายังสรุปไม่ได้
  const fallback = eligible
    .map(([n, g]) => ({ n, per: avg(g.map((r) => r.revenue / n)) }))
    .sort((a, b) => b.per - a.per)[0]
  return { count: fallback?.n ?? null, inconclusive: true, ...summary }
}

export type CriterionStatus = "pass" | "near" | "fail"

/** เหลือง = ยังไม่ผ่านแต่อยู่ภายใน 15% ของเกณฑ์ — ให้เห็นว่ากำลังเข้าใกล้ */
export function criterionStatus(
  value: number,
  threshold: number,
  direction: "gte" | "lte"
): CriterionStatus {
  const band = STAFFING.nearBandPct / 100
  if (direction === "gte") {
    if (value >= threshold) return "pass"
    return value >= threshold * (1 - band) ? "near" : "fail"
  }
  if (value <= threshold) return "pass"
  return value <= threshold * (1 + band) ? "near" : "fail"
}

/**
 * ถึงเวลาจ้างเมื่อเดือนล่าสุดและเดือนก่อนหน้าผ่านครบ 4 ข้อติดกัน
 * เดือนเดียวไม่พอ — เดือนที่บังเอิญสวย (เทศกาล/โปรฯ) จะหลอกให้จ้างเกิน
 */
export function hireVerdict(
  monthsNewestFirst: { allPass: boolean }[]
): { verdict: "ready" | "not_yet" } {
  const ready =
    monthsNewestFirst.length >= 2 &&
    monthsNewestFirst[0].allPass &&
    monthsNewestFirst[1].allPass
  return { verdict: ready ? "ready" : "not_yet" }
}
