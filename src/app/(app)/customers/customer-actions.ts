"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { todayInShopTz } from "@/lib/datetime"
import { pointExpiryDate } from "@/lib/points"

export type CustomerResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

function clean(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? "").trim()
  return s === "" ? null : s
}

export async function saveCustomer(formData: FormData): Promise<CustomerResult> {
  const supabase = await createClient()

  const name = String(formData.get("name") ?? "").trim()
  if (!name) return { ok: false, error: "กรุณากรอกชื่อลูกค้า" }

  // เพศรับเฉพาะค่าในชุดที่กำหนด — ค่าเพี้ยนเก็บเป็น null (ไม่ทราบ) ไม่เดา
  const genderInput = String(formData.get("gender") ?? "")
  const payload = {
    name,
    nickname: clean(formData.get("nickname")),
    phone: clean(formData.get("phone")),
    line_id: clean(formData.get("line_id")),
    birthday: clean(formData.get("birthday")),
    notes: clean(formData.get("notes")),
    gender: ["ชาย", "หญิง", "อื่นๆ"].includes(genderInput) ? genderInput : null,
    nationality: clean(formData.get("nationality")),
    updated_at: new Date().toISOString(),
  }

  const id = clean(formData.get("id"))

  if (id) {
    const { error } = await supabase.from("customers").update(payload).eq("id", id)
    if (error) return { ok: false, error: `บันทึกไม่สำเร็จ: ${error.message}` }
    revalidatePath(`/customers/${id}`)
    revalidatePath("/customers")
    return { ok: true, id }
  }

  const { data, error } = await supabase
    .from("customers")
    .insert(payload)
    .select("id")
    .single()

  if (error) return { ok: false, error: `บันทึกไม่สำเร็จ: ${error.message}` }

  revalidatePath("/customers")
  return { ok: true, id: data.id }
}

/** ปรับแต้มมือ — เหตุผลบังคับ ตรวจย้อนได้จากสมุดบัญชีแต้มเสมอ */
export async function adjustPoints(
  customerId: string,
  delta: number,
  reasonRaw: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const reason = reasonRaw.trim()
  const rounded = Math.round(delta)
  if (!reason) return { ok: false, error: "กรุณากรอกเหตุผล" }
  if (!Number.isFinite(rounded) || rounded === 0) {
    return { ok: false, error: "จำนวนแต้มต้องไม่เป็นศูนย์" }
  }

  // ห้ามหักจนติดลบ
  if (rounded < 0) {
    const { data: balanceRow } = await supabase
      .from("v_point_balances")
      .select("balance")
      .eq("customer_id", customerId)
      .maybeSingle()
    if ((balanceRow?.balance ?? 0) + rounded < 0) {
      return {
        ok: false,
        error: `หักไม่ได้ แต้มคงเหลือ ${balanceRow?.balance ?? 0} แต้ม`,
      }
    }
  }

  const me = await getMyProfile()
  const { error } = await supabase.from("point_transactions").insert({
    customer_id: customerId,
    delta: rounded,
    reason: `ปรับมือ: ${reason}`,
    created_by: me?.full_name ?? me?.email ?? null,
    ...(rounded > 0 ? { expires_at: pointExpiryDate(todayInShopTz()) } : {}),
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/customers/${customerId}`)
  return { ok: true }
}

/**
 * รวมลูกค้าซ้ำ: ย้ายทุกอย่างของ source (บิล/คิว/แต้ม/คูปอง/ไลน์/เติมเงิน/ประวัติติดต่อ)
 * มาที่ target แล้วลบ source ทิ้ง — ใช้เคสระบบสมาชิกไลน์สร้างเรคคอร์ดใหม่
 * ทั้งที่ร้านมีลูกค้าคนนี้อยู่แล้ว (เบอร์ไม่ตรง/ไม่เคยบันทึกเบอร์)
 * ทำได้เฉพาะ admin/manager — ย้อนกลับไม่ได้
 */
export async function mergeCustomers(
  targetId: string,
  sourceId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (targetId === sourceId) {
    return { ok: false, error: "เลือกลูกค้าคนละคนกัน" }
  }
  const me = await getMyProfile()
  if (!me || !["admin", "manager"].includes(me.role)) {
    return { ok: false, error: "เฉพาะผู้จัดการ/แอดมินเท่านั้น" }
  }

  const supabase = await createClient()
  const [{ data: target }, { data: source }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", targetId).maybeSingle(),
    supabase.from("customers").select("*").eq("id", sourceId).maybeSingle(),
  ])
  if (!target || !source) return { ok: false, error: "ไม่พบลูกค้า" }

  // ย้ายลูกทุกตารางก่อน ลบตัวแม่ทีหลัง — พลาดกลางทางข้อมูลไม่หาย แค่กดรวมซ้ำได้
  const tables = [
    "sales",
    "queue_entries",
    "member_topups",
    "line_accounts",
    "point_transactions",
    "point_redemptions",
    "crm_contacts",
  ] as const
  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .update({ customer_id: targetId })
      .eq("customer_id", sourceId)
    if (error) {
      return { ok: false, error: `ย้ายข้อมูล ${table} ไม่สำเร็จ: ${error.message}` }
    }
  }

  // เติมช่องที่ target ยังว่างด้วยข้อมูลจาก source (ไม่ทับของที่มีอยู่)
  //
  // customer_type ต้องคิดแยก เพราะไม่เคยเป็น null — ?? จึงไม่ช่วยอะไร
  // ถ้าฝั่งไหนเป็นสมาชิก คนที่รวมแล้วต้องเป็นสมาชิก เพราะใบเติมเงินย้ายตามมาด้วย
  // ไม่งั้นจะได้ระเบียนที่ถือแพ็กอยู่แต่ขึ้นว่า "ลูกค้าทั่วไป" — ป้ายสมาชิกหายจากช่องค้นหา
  // หน้าโปรไฟล์ หน้าวิเคราะห์ลูกค้า และหลุดจากตัวกรอง "เฉพาะสมาชิก" ในหน้าดูแลลูกค้า
  // (เจอ 28/7/2569 ตอนรวมกล้วย→สงกรานต์ ซึ่งเป็นคนเดียวกันที่เปลี่ยนชื่อ)
  const mergedType =
    target.customer_type === "สมาชิก" || source.customer_type === "สมาชิก"
      ? "สมาชิก"
      : target.customer_type

  await supabase
    .from("customers")
    .update({
      customer_type: mergedType,
      phone: target.phone ?? source.phone,
      nickname: target.nickname ?? source.nickname,
      birthday: target.birthday ?? source.birthday,
      gender: target.gender ?? source.gender,
      line_id: target.line_id ?? source.line_id,
      acquisition_source: target.acquisition_source ?? source.acquisition_source,
      notes: target.notes ?? source.notes,
    })
    .eq("id", targetId)

  const { error: delError } = await supabase.from("customers").delete().eq("id", sourceId)
  if (delError) {
    return { ok: false, error: `ลบเรคคอร์ดซ้ำไม่สำเร็จ: ${delError.message}` }
  }

  revalidatePath(`/customers/${targetId}`)
  revalidatePath("/customers")
  return { ok: true }
}
