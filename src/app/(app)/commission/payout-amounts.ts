import type { createClient } from "@/lib/supabase/server"
import type { PayoutPeriod } from "@/lib/payout-periods"

/**
 * ยอดสองฝั่งของงวด — helper ตัวเดียวที่ทั้งหน้าเว็บ (โชว์) และ action (แช่แข็ง) ใช้ร่วมกัน
 * ห้ามแยกคำนวณสองที่ ไม่งั้นเลขบนจอกับเลขที่แช่แข็งเพี้ยนจากกันได้ (บทเรียนซ้ำของโปรเจกต์นี้)
 *
 * สูตรพิสูจน์กับข้อมูล ก.ค. จริงแล้ว: งวด 11-20 สองฝั่งเท่ากันเป๊ะ 49,145
 * (เงินเบิกล่วงหน้าที่ expense_date อยู่ในงวดถูกนับรวมฝั่งจ่ายจริง — ตรงกับวิธีที่ร้านจ่าย)
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
  // ฝั่งจ่ายจริง: รายจ่ายในหมวดของงวด ที่ลงวันที่ในช่วงงวด
  const { data: expenses, error: expErr } = await supabase
    .from("expenses")
    .select("amount")
    .eq("category", PAYOUT_EXPENSE_CATEGORY[period.kind])
    .gte("expense_date", period.from)
    .lte("expense_date", period.to)
  if (expErr) throw new Error(`อ่านรายจ่ายไม่สำเร็จ: ${expErr.message}`)
  const recorded = (expenses ?? []).reduce((s, e) => s + (e.amount ?? 0), 0)

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
