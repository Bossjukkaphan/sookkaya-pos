"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"

/**
 * บันทึกสถานะจ่ายค่ามือ — snapshot ยอด ณ เวลาที่จ่ายไว้ด้วย
 * เพื่อให้ยอดที่จ่ายจริงไม่เปลี่ยนตามหลังถ้ามีการแก้รายการขายย้อนหลัง
 */
export async function setCommissionPaid(input: {
  workDate: string
  therapistId: string
  totalCommission: number
  guaranteeAmount: number
  netCommission: number
  requestFee: number
  totalIncome: number
  status: string
  isPaid: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase.from("therapist_daily_commission").upsert(
    {
      work_date: input.workDate,
      therapist_id: input.therapistId,
      total_commission: input.totalCommission,
      guarantee_amount: input.guaranteeAmount,
      net_commission: input.netCommission,
      request_fee: input.requestFee,
      total_income: input.totalIncome,
      status: input.status,
      is_paid: input.isPaid,
    },
    { onConflict: "work_date,therapist_id" }
  )

  if (error) return { ok: false, error: error.message }

  revalidatePath("/commission")
  return { ok: true }
}
