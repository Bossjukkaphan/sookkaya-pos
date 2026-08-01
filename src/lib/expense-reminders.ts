import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"

/**
 * เตือนบันทึกค่าใช้จ่ายสำคัญบนกระดิ่ง — ค่ามือหมอ (รอบ 10/20/สิ้นเดือน) + เงินเดือน (สิ้นเดือน)
 * ดู docs/superpowers/specs/2026-08-02-expense-reminder-design.md
 */

export type ExpenseDuty = "therapist_fee" | "salary"

export type ExpenseReminder = { duty: ExpenseDuty; label: string }

/** หมวดอิงชื่อที่พนักงานใช้จริงในตาราง expenses — ร้านเปลี่ยนชื่อหมวดต้องแก้ตรงนี้ตาม */
const DUTY_CATEGORY: Record<ExpenseDuty, string> = {
  therapist_fee: "HR / payroll (ค่ามือหมอ)",
  salary: "เงินเดือนพนักงานประจำ",
}

/** รายการรอบใหญ่จริงอยู่ 28,000–52,000 ส่วนเบิกย่อยกลางรอบ 2,500–5,750
 *  — เกณฑ์นี้กันรายการย่อยไปปิดเตือนทั้งที่รอบใหญ่ยังไม่ลง */
const MIN_ROUND_AMOUNT = 10000

const THAI_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
]

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** วันสิ้นเดือนของเดือนที่ isoDate อยู่ (คำนวณแบบ UTC เหมือน lib วันที่ตัวอื่น) */
function endOfMonth(y: number, m: number): Date {
  return new Date(Date.UTC(y, m, 0)) // day 0 ของเดือนถัดไป = วันสุดท้ายของเดือน m
}

/** รอบจ่ายค่ามือหมอล่าสุดที่ผ่านมาแล้ว (ก่อนวันนี้ — วันครบกำหนดพอดียังไม่เตือน) */
export function lastTherapistDue(todayIso: string): string {
  const [y, m, d] = todayIso.split("-").map(Number)
  if (d > 20) return iso(new Date(Date.UTC(y, m - 1, 20)))
  if (d > 10) return iso(new Date(Date.UTC(y, m - 1, 10)))
  return iso(endOfMonth(y, m - 1)) // สิ้นเดือนก่อนหน้า
}

/** รอบจ่ายเงินเดือนล่าสุดที่ผ่านมาแล้ว = สิ้นเดือนก่อนหน้าเสมอ */
export function lastSalaryDue(todayIso: string): string {
  const [y, m] = todayIso.split("-").map(Number)
  return iso(endOfMonth(y, m - 1))
}

/** ข้อความบนแถบกระดิ่ง — บอกรอบชัดๆ ให้รู้ว่าลืมของรอบไหน */
export function expenseReminderLabel(duty: ExpenseDuty, dueIso: string): string {
  const [, m, d] = dueIso.split("-").map(Number)
  const month = THAI_MONTHS[m - 1]
  if (duty === "salary") return `💼 อย่าลืมบันทึกเงินเดือนพนักงาน เดือน ${month}`
  const round = d === 10 || d === 20 ? `รอบวันที่ ${d} ${month}` : `รอบสิ้นเดือน ${month}`
  return `💰 อย่าลืมบันทึกค่ามือหมอ ${round}`
}

/** เลื่อนวันแบบ ISO — ใช้หาขอบหน้าต่าง D-3 (พฤติกรรมลงจริงคลาดวันได้ เช่น รอบ 20 ลงวันที่ 21) */
function addDays(isoDate: string, days: number): string {
  return iso(new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86400000))
}

/** เตือนที่ยังค้าง ณ วันนี้ — รอบครบกำหนดล่าสุดของแต่ละงานที่ยังไม่มีรายการรอบใหญ่ในหมวด */
export async function expenseReminders(
  supabase: SupabaseClient<Database>,
  todayIso: string
): Promise<ExpenseReminder[]> {
  const duties: { duty: ExpenseDuty; due: string }[] = [
    { duty: "therapist_fee", due: lastTherapistDue(todayIso) },
    { duty: "salary", due: lastSalaryDue(todayIso) },
  ]

  const checks = await Promise.all(
    duties.map(({ duty, due }) =>
      supabase
        .from("expenses")
        .select("id", { count: "exact", head: true })
        .eq("category", DUTY_CATEGORY[duty])
        .gte("expense_date", addDays(due, -3))
        .gte("amount", MIN_ROUND_AMOUNT)
        .then(({ count }) => ({ duty, due, recorded: (count ?? 0) > 0 }))
    )
  )

  return checks
    .filter((c) => !c.recorded)
    .map((c) => ({ duty: c.duty, label: expenseReminderLabel(c.duty, c.due) }))
}
