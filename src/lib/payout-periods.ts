import { CLOSE_GRACE_DAYS } from "@/lib/accounting-window"
import { daysInMonth, shiftMonth } from "@/lib/month"

/**
 * งวดจ่ายเงินของร้าน — ที่เดียวของความจริง
 *
 * ร้านจ่ายค่ามือหมอเดือนละ 3 งวด (1-10 · 11-20 · 21-สิ้นเดือน) และเงินเดือนพนักงาน
 * สิ้นเดือน 1 งวด ถ้าอนาคตรอบจ่ายเปลี่ยน แก้ payoutPeriodsOf ที่เดียวแล้วทุกอย่างตาม
 *
 * ห้ามใส่ "use client" — ฝั่งเรียกเป็น server component/action
 */

export type PayoutKind = "commission" | "salary"

export type PayoutPeriod = {
  kind: PayoutKind
  /** 1|2|3 = งวดค่ามือ · 0 = เงินเดือน */
  periodNo: number
  label: string
  /** ISO วันแรกของช่วง */
  from: string
  /** ISO วันสุดท้ายของช่วง */
  to: string
}

/** งวดทั้ง 4 ของเดือน เรียงตามลำดับจ่ายจริง — สิ้นเดือนคิดถูกทั้ง 28/29/30/31 */
export function payoutPeriodsOf(month: string): PayoutPeriod[] {
  const last = daysInMonth(month)
  const d = (day: number) => `${month}-${String(day).padStart(2, "0")}`
  return [
    { kind: "commission", periodNo: 1, label: "ค่ามือหมอ 1-10", from: d(1), to: d(10) },
    { kind: "commission", periodNo: 2, label: "ค่ามือหมอ 11-20", from: d(11), to: d(20) },
    { kind: "commission", periodNo: 3, label: `ค่ามือหมอ 21-${last}`, from: d(21), to: d(last) },
    { kind: "salary", periodNo: 0, label: "เงินเดือนพนักงานประจำ", from: d(1), to: d(last) },
  ]
}

/** ยอดสองฝั่งไม่เท่ากันแม้แต่สตางค์เดียว = ต้องเขียนเหตุผลก่อนติ๊ก (เจ้าของร้านเลือกเกณฑ์นี้) */
export function needsReason(computed: number, recorded: number): boolean {
  return computed !== recorded
}

/**
 * ติ๊กได้ตั้งแต่วันสุดท้ายของงวดเป็นต้นไป — งวด 1-10 ติ๊กได้ตั้งแต่วันที่ 10
 * ก่อนหน้านั้นยอดยังไม่นิ่ง (ยังมีบิลเพิ่มได้) ติ๊กไปก็ต้องยกเลิกแก้ใหม่
 */
export function canConfirmOn(period: PayoutPeriod, today: string): boolean {
  return today >= period.to
}

/** วันสุดท้ายของหน้าต่างรายจ่ายเดือนนี้ = วันที่ผ่อนผันของเดือนถัดไป (กติกาเดียวกับ accounting window) */
export function recordedWindowEnd(month: string): string {
  return `${shiftMonth(month, 1)}-${String(CLOSE_GRACE_DAYS).padStart(2, "0")}`
}

/** เครื่องหมายเดือนในชื่อรายการ เช่น "/7/" ใน "ค่ามือหมอ11-20/7/69" (เลขเดือนไม่มีศูนย์นำ) */
function monthMarker(month: string): string {
  return `/${Number(month.slice(5))}/`
}

/**
 * ชื่อรายการระบุเดือนอื่นชัดเจนไหม — มีเครื่องหมายเดือน (/N/) แต่ไม่ใช่ของเดือนนี้
 * ใช้ตัดรายจ่ายที่คีย์ช้าข้ามเดือน (โซนผ่อนผัน 1-3) ไม่ให้หลงเข้างวดของเดือนถัดไป
 */
export function belongsToOtherMonth(item: string, month: string): boolean {
  return /\/\d+\//.test(item) && !item.includes(monthMarker(month))
}

/** รายจ่ายหนึ่งแถวที่รอจัดเข้างวด */
export type PayoutExpense = { item: string; amount: number; expense_date: string }

/**
 * จัดรายจ่ายหมวดค่ามือเข้างวด ตามพฤติกรรมจริงของร้าน:
 * งวดหลักตั้งชื่อบอกช่วงกับเดือนเสมอ ("ค่ามือหมอ11-20/7/69") แต่วันที่คีย์เลื่อนได้
 * (ก.ค. งวด 11-20 ถูกคีย์วันที่ 21) ส่วนเงินเบิกย่อยไม่มีชื่องวด ใช้วันที่ตามจริง
 * คืนเลขงวด 1|2|3 หรือ null = ไม่นับ (ของเดือนอื่น หรืออยู่โซนผ่อนผันโดยไม่บอกงวด)
 */
export function commissionPeriodOfExpense(
  expense: PayoutExpense,
  month: string
): 1 | 2 | 3 | null {
  // 1. ชื่อระบุเดือนอื่น → ไม่ใช่ของเดือนนี้แน่นอน
  if (belongsToOtherMonth(expense.item, month)) return null

  // 2. ชื่อระบุเดือนนี้ + ช่วงงวด → เชื่อชื่อ ไม่สนวันที่คีย์
  //    ลำดับสำคัญ: เช็ค "11-20" ก่อน "1-10" (กันชื่ออย่าง "ค่ามือหมอ11-20" ที่มี "1-20"
  //    คาบเกี่ยว) และ "21-" ไว้ท้ายสุดเพราะ pattern กว้างสุด
  if (expense.item.includes(monthMarker(month))) {
    if (expense.item.includes("11-20")) return 2
    if (expense.item.includes("1-10")) return 1
    if (expense.item.includes("21-")) return 3
  }

  // 3. ไม่บอกงวด (เงินเบิกล่วงหน้า ฯลฯ) → ตามวันที่จริง · นอกเดือน = ไม่นับ
  for (const p of payoutPeriodsOf(month)) {
    if (p.kind !== "commission") continue
    if (expense.expense_date >= p.from && expense.expense_date <= p.to) {
      return p.periodNo as 1 | 2 | 3
    }
  }
  return null
}

export type ConfirmationStatus = "pending" | "paid" | "endorsed"

/** สถานะงวดจากแถวยืนยัน — ไม่มีแถว = ยังไม่ติ๊ก */
export function statusOf(
  row: { endorsed_at: string | null } | null
): ConfirmationStatus {
  if (!row) return "pending"
  return row.endorsed_at ? "endorsed" : "paid"
}
