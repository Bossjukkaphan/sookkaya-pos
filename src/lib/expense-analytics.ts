/** สูตรของหน้าวิเคราะห์รายจ่าย — ฟังก์ชันบริสุทธิ์ล้วน ไม่แตะฐานข้อมูล
 *  spec: docs/superpowers/specs/2026-07-27-expense-analytics-design.md */

import { shiftMonth } from "./month"

export type ExpenseRow = {
  /** "2026-07-15" */
  expense_date: string
  category: string
  item: string
  amount: number
}

export type Ruler = "revenue_linked" | "fixed" | "discretionary"

/** เกณฑ์เตือน — ต้องเข้าครบทั้งสองข้อ (เจ้าของร้านเลือกเมื่อ 27/7/2569) */
export const WARN_PCT = 10
export const ALERT_PCT = 30
export const MIN_IMPACT_BAHT = 2000

/** จำนวนเดือนย้อนหลังที่ใช้หาค่าปกติ — ต้องครบเท่านี้ถึงจะตัดสิน */
export const BASELINE_MONTHS = 3

/** ค่ามือหมอต้องอ่านจากงานที่ทำจริง ไม่ใช่จากแถวรายจ่าย เพราะยอดจ่ายขึ้นกับงวด */
export const COMMISSION_CATEGORY_PREFIX = "HR / payroll"

/** ป้ายชื่อหมวดค่ามือในบล็อกนี้ — ค่ามืออ่านจาก v_commission_daily ไม่ใช่จากแถวรายจ่าย
 *  จึงไม่ผูกกับชื่อหมวดที่แก้ได้จากหน้าตั้งค่า (เคยเปลี่ยนชื่อมาแล้ว 27/7/2569 แล้วเกือบได้การ์ดซ้ำสองใบ) */
export const COMMISSION_LABEL = "ค่ามือหมอ"

/** เดือนที่ยังไม่จบต้องผ่านไปอย่างน้อยเท่านี้วันก่อนถึงจะตัดสินหมวดที่วัดเป็น % ของยอดขาย
 *  ของที่ซื้อเป็นล็อต (บาล์ม ผ้า) ถ้าซื้อวันที่ 1 แล้วดูวันที่ 2 สัดส่วนจะพุ่งจนไร้ความหมาย */
export const MIN_DAYS_FOR_RATIO = 7

/** จับคู่ด้วยคำขึ้นต้น ไม่ใช่ชื่อเต็ม เพราะชื่อหมวดแก้ได้จากหน้าตั้งค่า
 *  หมวดที่จับไม่ได้ตกไปกลุ่ม discretionary เสมอ — เห็นตัวเลขครบแต่ไม่เตือนผิด */
const RULER_BY_PREFIX: { prefix: string; ruler: Ruler }[] = [
  { prefix: "HR / payroll", ruler: "revenue_linked" },
  { prefix: "วัสดุ-สิ้นเปลือง", ruler: "revenue_linked" },
  { prefix: "ซักรีด", ruler: "revenue_linked" },
  { prefix: "ค่าเช่าสถานที่", ruler: "fixed" },
  { prefix: "เงินเดือนพนักงานประจำ", ruler: "fixed" },
  // "ค่าน้ำ" อย่างเดียวคาบเกี่ยว ค่าน้ำมันรถ / ค่าน้ำดื่มลูกค้า ซึ่งเป็นต้นทุนแปรผันตามงาน
  { prefix: "ค่าน้ำ / ค่าไฟ", ruler: "fixed" },
]

export function rulerOf(category: string): Ruler {
  return RULER_BY_PREFIX.find((r) => category.startsWith(r.prefix))?.ruler ?? "discretionary"
}

/** ค่ากลาง ไม่ใช่ค่าเฉลี่ย — เดือนที่บันทึกไม่ครบหรือจ่ายผิดจังหวะจะถูกเขี่ยทิ้งเอง
 *  (ทดสอบย้อนหลังแล้ว: ค่าเฉลี่ยทำให้ค่าเช่าและค่าน้ำค่าไฟ มิ.ย. 69 เตือนหลอกทั้งคู่) */
export function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** เลขวันจากสตริงวันที่ "2026-07-15" → 15 */
function dayOf(isoDate: string): number {
  return Number(isoDate.slice(8, 10))
}

/** แถวของเดือนที่ระบุ ถึงวันที่ throughDay เท่านั้น */
export function rowsInRange(
  rows: ExpenseRow[],
  month: string,
  throughDay: number
): ExpenseRow[] {
  return rows.filter(
    (r) => r.expense_date.startsWith(`${month}-`) && dayOf(r.expense_date) <= throughDay
  )
}

/** รวมค่าจาก map ที่คีย์เป็นวันที่ ภายในช่วงวันเดียวกัน
 *  วนตามวันแทนการไล่คีย์ทั้ง map เพื่อให้ throughDay ที่เกินจำนวนวันจริงไม่พัง */
export function sumDaily(
  daily: Map<string, number>,
  month: string,
  throughDay: number
): number {
  let total = 0
  for (let d = 1; d <= throughDay; d++) {
    total += daily.get(`${month}-${String(d).padStart(2, "0")}`) ?? 0
  }
  return total
}

function sumByCategory(rows: ExpenseRow[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.category, (m.get(r.category) ?? 0) + r.amount)
  return m
}

export function compareRange(input: {
  rows: ExpenseRow[]
  revenueByDate: Map<string, number>
  month: string
  /** เดือนที่ยังไม่จบส่งวันที่ปัจจุบัน · เดือนที่ปิดแล้วส่ง 31 */
  throughDay: number
}): {
  current: { expense: number; revenue: number }
  previous: { expense: number; revenue: number }
  byCategory: { category: string; deltaBaht: number }[]
  topItems: { item: string; amount: number }[]
} {
  const { rows, revenueByDate, month, throughDay } = input
  const prevMonth = shiftMonth(month, -1)

  const curRows = rowsInRange(rows, month, throughDay)
  const prevRows = rowsInRange(rows, prevMonth, throughDay)

  const cur = sumByCategory(curRows)
  const prev = sumByCategory(prevRows)

  const categories = new Set([...cur.keys(), ...prev.keys()])
  const byCategory = [...categories]
    .map((category) => ({
      category,
      deltaBaht: (cur.get(category) ?? 0) - (prev.get(category) ?? 0),
    }))
    .filter((c) => c.deltaBaht !== 0)
    // เรียงตามขนาดผลกระทบ ไม่ใช่ตามเครื่องหมาย — ตัวที่ลดเยอะก็สำคัญพอกับตัวที่เพิ่มเยอะ
    .sort((a, b) => Math.abs(b.deltaBaht) - Math.abs(a.deltaBaht))

  const topItems = [...curRows]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((r) => ({ item: r.item, amount: r.amount }))

  return {
    current: {
      expense: curRows.reduce((s, r) => s + r.amount, 0),
      revenue: sumDaily(revenueByDate, month, throughDay),
    },
    previous: {
      expense: prevRows.reduce((s, r) => s + r.amount, 0),
      revenue: sumDaily(revenueByDate, prevMonth, throughDay),
    },
    byCategory,
    topItems,
  }
}

export type Level = "unknown" | "ok" | "better" | "warn" | "alert"

export type CategoryDelta = {
  category: string
  ruler: Ruler
  /** revenue_linked = % ของยอดขาย · fixed = บาท */
  current: number
  baseline: number
  /** ผลเป็นเงินของช่วงที่เทียบ ใช้ตัดสินเกณฑ์ 2,000 และเขียนบรรทัด "ประหยัดได้เท่าไร" */
  impactBaht: number
  deltaPct: number
  level: Level
}

function levelOf(deltaPct: number, impactBaht: number): Level {
  if (Math.abs(impactBaht) < MIN_IMPACT_BAHT) return "ok"
  if (deltaPct >= ALERT_PCT) return "alert"
  if (deltaPct >= WARN_PCT) return "warn"
  if (deltaPct <= -WARN_PCT) return "better"
  return "ok"
}

export function detectAnomalies(input: {
  rows: ExpenseRow[]
  revenueByDate: Map<string, number>
  commissionByDate: Map<string, number>
  month: string
  throughDay: number
  /** false = ข้ามหมวดคงที่ทั้งหมด เพราะจ่ายเป็นก้อนวันที่ตายตัว เทียบกลางเดือนไม่มีความหมาย */
  monthClosed: boolean
}): CategoryDelta[] {
  const { rows, revenueByDate, commissionByDate, month, throughDay, monthClosed } = input

  const baselineMonths = Array.from({ length: BASELINE_MONTHS }, (_, i) =>
    shiftMonth(month, -(i + 1))
  )

  // หมวดค่ามือทุกชื่อ (เก่า/ใหม่) ยุบเหลือป้ายเดียว — ไม่งั้นเปลี่ยนชื่อหมวดทีไรได้การ์ดซ้ำ
  const nonCommissionCategories = new Set(
    rows
      .map((r) => r.category)
      .filter((c) => rulerOf(c) !== "discretionary" && !c.startsWith(COMMISSION_CATEGORY_PREFIX))
  )

  // ค่ามือมาจาก commissionByDate เสมอ จึงต้องตรวจแม้ไม่มีแถวรายจ่ายค่ามือเลยในเดือนนี้
  const hasCommissionData = [month, ...baselineMonths].some(
    (m) => sumDaily(commissionByDate, m, throughDay) > 0
  )

  const categories: string[] = [...nonCommissionCategories]
  if (hasCommissionData) categories.push(COMMISSION_LABEL)

  const out: CategoryDelta[] = []

  for (const category of categories) {
    const isCommission = category === COMMISSION_LABEL
    const ruler: Ruler = isCommission ? "revenue_linked" : rulerOf(category)
    if (ruler === "fixed" && !monthClosed) continue

    if (ruler === "revenue_linked" && !monthClosed && throughDay < MIN_DAYS_FOR_RATIO) {
      out.push({
        category, ruler, current: 0, baseline: 0, impactBaht: 0, deltaPct: 0, level: "unknown",
      })
      continue
    }

    /** เดือนนั้นมีข้อมูลของหมวดนี้ไหม — ต้องแยก "ยังไม่ได้คีย์" ออกจาก "คีย์แล้วเป็น 0"
     *  ถ้าเดาผิดจะได้การ์ดเขียว "ประหยัดได้ 11,000" ทั้งที่แค่ยังไม่คีย์บิล */
    const hasData = (m: string): boolean =>
      isCommission
        ? sumDaily(commissionByDate, m, throughDay) > 0
        : rowsInRange(rows, m, throughDay).some((r) => r.category === category)

    /** ค่าของเดือนหนึ่งตามไม้บรรทัดของหมวดนี้ · null = คิดไม่ได้ (ไม่มีข้อมูล) */
    const valueOf = (m: string): number | null => {
      if (!hasData(m)) return null

      const baht = isCommission
        ? sumDaily(commissionByDate, m, throughDay)
        : rowsInRange(rows, m, throughDay)
            .filter((r) => r.category === category)
            .reduce((s, r) => s + r.amount, 0)

      if (ruler === "fixed") return baht

      const revenue = sumDaily(revenueByDate, m, throughDay)
      if (revenue <= 0) return null
      return (baht / revenue) * 100
    }

    const current = valueOf(month)
    const history = baselineMonths.map(valueOf).filter((v): v is number => v !== null)

    if (current === null || history.length < BASELINE_MONTHS) {
      out.push({
        category,
        ruler,
        current: current ?? 0,
        baseline: 0,
        impactBaht: 0,
        deltaPct: 0,
        level: "unknown",
      })
      continue
    }

    const baseline = median(history)
    const deltaPct = baseline === 0 ? 0 : ((current - baseline) / baseline) * 100
    const impactBaht =
      ruler === "fixed"
        ? current - baseline
        : ((current - baseline) / 100) * sumDaily(revenueByDate, month, throughDay)

    out.push({
      category,
      ruler,
      current,
      baseline,
      impactBaht,
      deltaPct,
      level: levelOf(deltaPct, impactBaht),
    })
  }

  // เรื่องที่ต้องแก้ขึ้นก่อน แล้วค่อยเรื่องที่ดีขึ้น
  const order: Record<Level, number> = { alert: 0, warn: 1, better: 2, ok: 3, unknown: 4 }
  return out.sort(
    (a, b) => order[a.level] - order[b.level] || Math.abs(b.impactBaht) - Math.abs(a.impactBaht)
  )
}
