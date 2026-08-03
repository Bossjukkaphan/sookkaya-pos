"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { todayInShopTz } from "@/lib/datetime"
import {
  type PayoutKind,
  canConfirmOn,
  needsReason,
  payoutPeriodsOf,
} from "@/lib/payout-periods"
import { computePayoutAmounts } from "./payout-amounts"

export type PayoutActionResult =
  | { ok: true }
  /** needReason มีค่า = ยังไม่บันทึก ยอดสองฝั่งไม่ตรง รอกรอกเหตุผลแล้วส่งใหม่ */
  | { ok: false; error?: string; needReason?: { computed: number; recorded: number } }

/** สิทธิ์ขั้นต่ำของทุก action ในไฟล์นี้ — พนักงานทั่วไปไม่เกี่ยวกับการจ่ายเงิน */
async function requireManager() {
  const me = await getMyProfile()
  if (!me || !["admin", "manager"].includes(me.role)) return null
  return me
}

export async function markPayoutPaid(input: {
  month: string
  kind: PayoutKind
  periodNo: number
  reason?: string
}): Promise<PayoutActionResult> {
  const me = await requireManager()
  if (!me) return { ok: false, error: "เฉพาะผู้จัดการ/เจ้าของร้านเท่านั้น" }

  const period = payoutPeriodsOf(input.month).find(
    (p) => p.kind === input.kind && p.periodNo === input.periodNo
  )
  if (!period) return { ok: false, error: "ไม่รู้จักงวดนี้" }

  // กันติ๊กก่อนงวดจบ — ฝั่ง UI ซ่อนปุ่มอยู่แล้ว แต่ server ต้องกันเองด้วยเสมอ
  if (!canConfirmOn(period, todayInShopTz())) {
    return { ok: false, error: `งวดนี้ยังไม่จบ ติ๊กได้ตั้งแต่วันที่ ${period.to.slice(8)} เป็นต้นไป` }
  }

  const supabase = await createClient()
  // คำนวณสดใน action เสมอ ไม่เชื่อตัวเลขจาก client — ค่านี้คือของที่จะถูกแช่แข็ง
  const { computed, recorded } = await computePayoutAmounts(supabase, period)

  const reason = (input.reason ?? "").trim()
  if (needsReason(computed, recorded) && !reason) {
    // ไม่ใช่ error — ส่งยอดทั้งสองกลับไปให้ฟอร์มโชว์ช่องเหตุผล
    return { ok: false, needReason: { computed, recorded } }
  }

  const { data: inserted, error } = await supabase
    .from("payout_confirmations")
    .insert({
      month: input.month,
      kind: input.kind,
      period_no: input.periodNo,
      computed_amount: computed,
      recorded_amount: recorded,
      variance_reason: reason || null,
      paid_by: me.full_name ?? me.email ?? "ไม่ระบุ",
    })
    .select("id")
  if (error) {
    if (error.code === "23505") return { ok: false, error: "งวดนี้ถูกติ๊กไปแล้ว รีเฟรชหน้าดูสถานะล่าสุด" }
    return { ok: false, error: `บันทึกไม่สำเร็จ: ${error.message}` }
  }
  // RLS กรองเงียบ (0 แถว ไม่มี error) — ห้ามรายงานสำเร็จทั้งที่ไม่มีอะไรถูกเขียน
  if (!inserted || inserted.length === 0) {
    return { ok: false, error: "บันทึกไม่สำเร็จ — คุณอาจไม่มีสิทธิ์" }
  }

  revalidatePath("/commission")
  return { ok: true }
}

export async function cancelPayoutPaid(id: string): Promise<PayoutActionResult> {
  const me = await requireManager()
  if (!me) return { ok: false, error: "เฉพาะผู้จัดการ/เจ้าของร้านเท่านั้น" }

  const supabase = await createClient()
  // ยกเลิกได้เฉพาะที่ยังไม่รับรอง — งวดที่รับรองแล้วปิดถาวร
  const { data: deleted, error } = await supabase
    .from("payout_confirmations")
    .delete()
    .eq("id", id)
    .is("endorsed_at", null)
    .select("id")
  if (error) return { ok: false, error: error.message }
  if (!deleted || deleted.length === 0) {
    return { ok: false, error: "ยกเลิกไม่ได้ — งวดนี้ถูกรับรองแล้ว หรือคุณไม่มีสิทธิ์" }
  }

  revalidatePath("/commission")
  return { ok: true }
}

export async function endorsePayout(id: string): Promise<PayoutActionResult> {
  const me = await getMyProfile()
  // รับรองได้เฉพาะเจ้าของร้าน — RLS แยกชนิดการเขียนไม่ได้ จึงต้องกันที่นี่
  if (!me || me.role !== "admin") {
    return { ok: false, error: "รับรองได้เฉพาะเจ้าของร้านเท่านั้น" }
  }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from("payout_confirmations")
    .update({
      endorsed_by: me.full_name ?? me.email ?? "ไม่ระบุ",
      endorsed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("endorsed_at", null) // รับรองซ้ำไม่ได้ — เวลา/ชื่อครั้งแรกคือหลักฐาน
    .select("id")
  if (error) return { ok: false, error: error.message }
  if (!updated || updated.length === 0) {
    return { ok: false, error: "รับรองไม่สำเร็จ — อาจถูกรับรองไปแล้ว" }
  }

  revalidatePath("/commission")
  return { ok: true }
}
