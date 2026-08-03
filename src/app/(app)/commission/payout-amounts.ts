import type { createClient } from "@/lib/supabase/server"
import {
  type PayoutPeriod,
  belongsToOtherMonth,
  commissionPeriodOfExpense,
  recordedWindowEnd,
} from "@/lib/payout-periods"

/**
 * ยอดสองฝั่งของงวด — helper ตัวเดียวที่ทั้งหน้าเว็บ (โชว์) และ action (แช่แข็ง) ใช้ร่วมกัน
 * ห้ามแยกคำนวณสองที่ ไม่งั้นเลขบนจอกับเลขที่แช่แข็งเพี้ยนจากกันได้ (บทเรียนซ้ำของโปรเจกต์นี้)
 *
 * ฝั่งจ่ายจริง (recorded) จับคู่รายจ่ายเข้างวด "ตามชื่อรายการก่อน วันที่ทีหลัง"
 * เพราะร้านคีย์วันที่เลื่อนได้จริง — ก.ค. 69 งวด 11-20 ถูกคีย์วันที่ 21
 * (ดูกติกาเต็มที่ commissionPeriodOfExpense ใน @/lib/payout-periods)
 *
 * พิสูจน์กับข้อมูล ก.ค. จริงแล้วทั้ง 3 งวด: 47,880 · 49,145 · 54,195
 * — งวด 11-20 สองฝั่งเท่ากันเป๊ะ 49,145 (ก้อนใหญ่ 46,645 + เงินเบิกในช่วง 2,500)
 */

/** หมวดรายจ่ายที่ผูกกับงวดแต่ละชนิด — ต้องตรงกับชื่อจริงใน expense_category_types */
export const PAYOUT_EXPENSE_CATEGORY = {
  commission: "HR / payroll (ค่ามือหมอ)",
  salary: "เงินเดือนพนักงานประจำ",
} as const

type Supabase = Awaited<ReturnType<typeof createClient>>

export async function computePayoutAmounts(
  supabase: Supabase,
  period: PayoutPeriod
): Promise<{ computed: number; recorded: number }> {
  const month = period.from.slice(0, 7)

  // ฝั่งจ่ายจริง: รายจ่ายหมวดของงวด ในหน้าต่างของเดือน [วันที่ 1 .. วันที่ 3 เดือนถัดไป]
  // (โซนผ่อนผันเดียวกับ accounting window — รายจ่ายปลายเดือนคีย์ข้ามเดือนได้)
  const { data: expenses, error: expErr } = await supabase
    .from("expenses")
    .select("item, amount, expense_date")
    .eq("category", PAYOUT_EXPENSE_CATEGORY[period.kind])
    .gte("expense_date", `${month}-01`)
    .lte("expense_date", recordedWindowEnd(month))
  if (expErr) throw new Error(`อ่านรายจ่ายไม่สำเร็จ: ${expErr.message}`)

  const rows = expenses ?? []
  const recorded =
    period.kind === "commission"
      ? // จัดเข้างวดตามชื่อรายการก่อน วันที่ทีหลัง — ของเดือนอื่น/กำกวมถูกตัดทิ้ง
        rows
          .filter((e) => commissionPeriodOfExpense(e, month) === period.periodNo)
          .reduce((s, e) => s + (e.amount ?? 0), 0)
      : // เงินเดือนมีงวดเดียว — ตัดเฉพาะรายการที่ชื่อระบุเดือนอื่น ที่เหลือนับหมด
        rows
          .filter((e) => !belongsToOtherMonth(e.item, month))
          .reduce((s, e) => s + (e.amount ?? 0), 0)

  if (period.kind === "commission") {
    // ฝั่งระบบคำนวณ: ค่ามือรวมจากบิลในช่วงงวด (สูตรเดียวกับหน้าค่ามือ)
    const { data: daily, error } = await supabase
      .from("v_therapist_daily")
      .select("total_income")
      .gte("work_date", period.from)
      .lte("work_date", period.to)
    if (error) throw new Error(`คำนวณค่ามือไม่สำเร็จ: ${error.message}`)
    const computed = (daily ?? []).reduce((s, d) => s + (d.total_income ?? 0), 0)
    return { computed, recorded }
  }

  // เงินเดือน: ยอดคาดหวัง = เงินเดือนตั้งต้นรวมของพนักงานที่ยังทำงานอยู่
  // คนลาออก (is_active=false) หลุดจากยอดเองโดยไม่ต้องทำอะไรเพิ่ม
  const { data: staff, error: staffErr } = await supabase
    .from("staff_members")
    .select("base_salary")
    .eq("is_active", true)
  if (staffErr) throw new Error(`อ่านเงินเดือนตั้งต้นไม่สำเร็จ: ${staffErr.message}`)
  const computed = (staff ?? []).reduce((s, m) => s + (m.base_salary ?? 0), 0)
  return { computed, recorded }
}
