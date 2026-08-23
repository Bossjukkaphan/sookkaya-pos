import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"

/**
 * เตือนบันทึกค่าใช้จ่ายสำคัญบนกระดิ่ง — ค่ามือหมอ (รอบ 10/20/สิ้นเดือน) + เงินเดือน (สิ้นเดือน)
 * + บิลประจำหมวดค่าน้ำ/ค่าไฟ/เน็ต (เพิ่ม 23/8/2569 หลังพบค่าน้ำและบิลเน็ตรอบ ก.ค. ไม่ถูกคีย์)
 * ดู docs/superpowers/specs/2026-08-02-expense-reminder-design.md
 * และ docs/superpowers/specs/2026-08-23-utility-bill-reminders-design.md
 *
 * กติการอบเตือนทั้งหมดถูก replicate ไว้ใน SQL ของ `layout_bootstrap`
 * (ล่าสุด: supabase/migrations/20260823060000_utility_bill_reminders.sql)
 * — แก้กติกาที่นี่ต้องแก้ SQL ด้วยเสมอ
 * `expenseReminders()` ไม่มี caller ใน app แล้ว (layout ใช้ SQL แทน) เก็บไว้เป็น executable spec ของกติกา
 */

export type ExpenseDuty = "therapist_fee" | "salary" | "electricity" | "water" | "internet"

export type ExpenseReminder = { duty: ExpenseDuty; label: string }

/** หมวดอิงชื่อที่พนักงานใช้จริงในตาราง expenses — ร้านเปลี่ยนชื่อหมวดต้องแก้ตรงนี้ตาม */
const PAYROLL_CATEGORY: Record<"therapist_fee" | "salary", string> = {
  therapist_fee: "HR / payroll (ค่ามือหมอ)",
  salary: "เงินเดือนพนักงานประจำ",
}

export const UTILITY_CATEGORY = "ค่าน้ำ / ค่าไฟ / Internet"

/** รายการรอบใหญ่จริงอยู่ 28,000–52,000 ส่วนเบิกย่อยกลางรอบ 2,500–5,750
 *  — เกณฑ์นี้กันรายการย่อยไปปิดเตือนทั้งที่รอบใหญ่ยังไม่ลง */
const MIN_ROUND_AMOUNT = 10000

/** สามบิลในหมวดเดียวกัน แยกกันด้วยขนาดเงินกับชื่อรายการ (สำรวจข้อมูลจริง มี.ค.–ส.ค. 2569):
 *  ค่าไฟ 2,847–17,701 · เน็ต/โทรศัพท์ 462–2,197 · ซิม EDC 136 · ค่าน้ำ 70–165 (ชื่อขึ้นต้น "ค่าน้ำ" ทุกครั้ง)
 *  ค่าไฟกับค่าน้ำจ่ายคู่กันช่วงวันที่ 21–สิ้นเดือน ส่วนบิลเน็ตจ่ายวันที่ 1–12 ของเดือนถัดไป */
const ELECTRICITY_MIN = 2500
const INTERNET_MIN = 400
const UTILITY_WINDOW_DAYS = 10
const INTERNET_DUE_DAY = 12
const INTERNET_WINDOW_DAYS = INTERNET_DUE_DAY - 1

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

/** ค่าน้ำ/ค่าไฟครบกำหนดสิ้นเดือน (จ่ายจริงช่วงวันที่ 21–สิ้นเดือน) — รอบล่าสุดที่ผ่านมา */
export function lastUtilityDue(todayIso: string): string {
  return lastSalaryDue(todayIso)
}

/** บิลเน็ตจ่ายวันที่ 1–12 ของเดือน (7/4 · 8/5 · 12/6 · 1/8) — ครบกำหนดวันที่ 12 ล่าสุดที่ผ่านมา */
export function lastInternetDue(todayIso: string): string {
  const [y, m, d] = todayIso.split("-").map(Number)
  if (d > INTERNET_DUE_DAY) return iso(new Date(Date.UTC(y, m - 1, INTERNET_DUE_DAY)))
  return iso(new Date(Date.UTC(y, m - 2, INTERNET_DUE_DAY)))
}

/** ข้อความบนแถบกระดิ่ง — บอกรอบชัดๆ ให้รู้ว่าลืมของรอบไหน */
export function expenseReminderLabel(duty: ExpenseDuty, dueIso: string): string {
  const [, m, d] = dueIso.split("-").map(Number)
  const month = THAI_MONTHS[m - 1]
  if (duty === "salary") return `💼 อย่าลืมบันทึกเงินเดือนพนักงาน เดือน ${month}`
  if (duty === "electricity") return `💡 อย่าลืมบันทึกค่าไฟ เดือน ${month}`
  if (duty === "water") return `🚰 อย่าลืมบันทึกค่าน้ำ เดือน ${month}`
  if (duty === "internet") return `🌐 อย่าลืมบันทึกค่าเน็ต/โทรศัพท์ร้าน รอบต้นเดือน ${month}`
  const round = d === 10 || d === 20 ? `รอบวันที่ ${d} ${month}` : `รอบสิ้นเดือน ${month}`
  return `💰 อย่าลืมบันทึกค่ามือหมอ ${round}`
}

/** เลื่อนวันแบบ ISO — ใช้หาขอบหน้าต่าง D-3 (พฤติกรรมลงจริงคลาดวันได้ เช่น รอบ 20 ลงวันที่ 21) */
function addDays(isoDate: string, days: number): string {
  return iso(new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86400000))
}

/** เกณฑ์ "บันทึกแล้ว = เตือนหาย" ของแต่ละงาน — โครงเดียวกับ CTE duties ในไฟล์ SQL */
type DutyCheck = {
  duty: ExpenseDuty
  due: string
  category: string
  windowDays: number
  minAmount: number
  /** กันบิลก้อนใหญ่ (ค่าไฟ) ไปปิดเตือนบิลเล็ก (เน็ต) ที่อยู่หมวดเดียวกัน */
  maxAmount?: number
  /** ค่าน้ำยอดเล็กเกินกว่าจะแยกด้วยจำนวนเงิน — แยกด้วยชื่อรายการที่พนักงานตั้งเหมือนกันทุกครั้ง */
  itemPrefix?: string
}

function dutyChecks(todayIso: string): DutyCheck[] {
  const utilityDue = lastUtilityDue(todayIso)
  return [
    {
      duty: "therapist_fee", due: lastTherapistDue(todayIso),
      category: PAYROLL_CATEGORY.therapist_fee, windowDays: 3, minAmount: MIN_ROUND_AMOUNT,
    },
    {
      duty: "salary", due: lastSalaryDue(todayIso),
      category: PAYROLL_CATEGORY.salary, windowDays: 3, minAmount: MIN_ROUND_AMOUNT,
    },
    {
      duty: "electricity", due: utilityDue,
      category: UTILITY_CATEGORY, windowDays: UTILITY_WINDOW_DAYS, minAmount: ELECTRICITY_MIN,
    },
    {
      duty: "water", due: utilityDue,
      category: UTILITY_CATEGORY, windowDays: UTILITY_WINDOW_DAYS, minAmount: 0,
      itemPrefix: "ค่าน้ำ",
    },
    {
      duty: "internet", due: lastInternetDue(todayIso),
      category: UTILITY_CATEGORY, windowDays: INTERNET_WINDOW_DAYS,
      minAmount: INTERNET_MIN, maxAmount: ELECTRICITY_MIN,
    },
  ]
}

/** เตือนที่ยังค้าง ณ วันนี้ — รอบครบกำหนดล่าสุดของแต่ละงานที่ยังไม่มีรายการเข้าเกณฑ์ */
export async function expenseReminders(
  supabase: SupabaseClient<Database>,
  todayIso: string
): Promise<ExpenseReminder[]> {
  const checks = await Promise.all(
    dutyChecks(todayIso).map((c) => {
      let q = supabase
        .from("expenses")
        .select("id", { count: "exact", head: true })
        .eq("category", c.category)
        .gte("expense_date", addDays(c.due, -c.windowDays))
        .gte("amount", c.minAmount)
      if (c.maxAmount !== undefined) q = q.lt("amount", c.maxAmount)
      if (c.itemPrefix !== undefined) q = q.like("item", `${c.itemPrefix}%`)
      return q.then(({ count }) => ({ ...c, recorded: (count ?? 0) > 0 }))
    })
  )

  return checks
    .filter((c) => !c.recorded)
    .map((c) => ({ duty: c.duty, label: expenseReminderLabel(c.duty, c.due) }))
}
