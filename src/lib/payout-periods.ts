import { daysInMonth } from "@/lib/month"

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

export type ConfirmationStatus = "pending" | "paid" | "endorsed"

/** สถานะงวดจากแถวยืนยัน — ไม่มีแถว = ยังไม่ติ๊ก */
export function statusOf(
  row: { endorsed_at: string | null } | null
): ConfirmationStatus {
  if (!row) return "pending"
  return row.endorsed_at ? "endorsed" : "paid"
}
