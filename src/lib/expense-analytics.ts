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

/** จับคู่ด้วยคำขึ้นต้น ไม่ใช่ชื่อเต็ม เพราะชื่อหมวดแก้ได้จากหน้าตั้งค่า
 *  หมวดที่จับไม่ได้ตกไปกลุ่ม discretionary เสมอ — เห็นตัวเลขครบแต่ไม่เตือนผิด */
const RULER_BY_PREFIX: { prefix: string; ruler: Ruler }[] = [
  { prefix: "HR / payroll", ruler: "revenue_linked" },
  { prefix: "วัสดุ-สิ้นเปลือง", ruler: "revenue_linked" },
  { prefix: "ซักรีด", ruler: "revenue_linked" },
  { prefix: "ค่าเช่าสถานที่", ruler: "fixed" },
  { prefix: "เงินเดือนพนักงานประจำ", ruler: "fixed" },
  { prefix: "ค่าน้ำ", ruler: "fixed" },
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
