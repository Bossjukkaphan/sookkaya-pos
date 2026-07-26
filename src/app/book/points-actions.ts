"use server"

import { createServiceClient } from "@/lib/supabase/service"
import { cleanLineDisplayName, verifyLineIdToken } from "@/lib/line"
import { couponExpiryDate, genCouponCode } from "@/lib/points"
import { todayInShopTz } from "@/lib/datetime"

type Fail = { ok: false; error: string; code?: "auth" }

const AUTH_FAIL: Fail = { ok: false, error: "เปิดหน้านี้จากไลน์อีกครั้งนะคะ", code: "auth" }

export type PointReward = {
  id: string
  name: string
  pointsCost: number
}

export type PointCoupon = {
  id: string
  code: string
  rewardName: string
  pointsCost: number
  expiresAt: string
}

export type PointHistoryRow = {
  delta: number
  reason: string
  createdAt: string
}

export type PointsHome =
  | {
      ok: true
      linked: true
      customerName: string
      /** โปรไฟล์สมาชิกครบหรือยัง (วันเกิด+เพศ) — ยังไม่ครบให้กรอกก่อนเห็นแต้ม */
      profileComplete: boolean
      /** ชื่อเล่นเดิมในระบบ (เติมให้ในฟอร์ม) */
      nickname: string | null
      /** จำนวนครั้งที่เคยมาใช้บริการ — โชว์ยืนยันว่าแมตช์ประวัติเดิมถูกคน */
      visits: number
      balance: number
      /** แต้มก้อนแรกสุดหมดอายุวันไหน (แสดงเตือน) */
      earliestExpiry: string | null
      coupons: PointCoupon[]
      rewards: PointReward[]
      history: PointHistoryRow[]
    }
  | { ok: true; linked: false; displayName: string | null }
  | Fail

/** หน้าแต้มของลูกค้า — เปิดครั้งเดียวได้ครบ: ยอด/คูปอง/รางวัล/ประวัติ */
export async function getPointsHome(idToken: string): Promise<PointsHome> {
  const who = await verifyLineIdToken(idToken)
  if (!who) return AUTH_FAIL
  const db = createServiceClient()

  const { data: account } = await db
    .from("line_accounts")
    .select("customer_id, customers(name, nickname, birthday, gender)")
    .eq("line_user_id", who.userId)
    .maybeSingle()

  if (!account) {
    return { ok: true, linked: false, displayName: cleanLineDisplayName(who.displayName) }
  }
  const customerId = account.customer_id
  const profile = (
    account as unknown as {
      customers: {
        name: string
        nickname: string | null
        birthday: string | null
        gender: string | null
      } | null
    }
  ).customers
  const profileComplete = Boolean(profile?.birthday && profile?.gender)

  // ชื่อไลน์เปลี่ยนได้ — เก็บชื่อล่าสุดไว้ให้ฝั่งร้านเห็น (แยกจากชื่อจริงในระบบ)
  const freshName = cleanLineDisplayName(who.displayName)
  if (freshName) {
    await db
      .from("line_accounts")
      .update({ display_name: freshName })
      .eq("line_user_id", who.userId)
  }

  // คูปองเกินกำหนด → ปิดเป็น expired + คืนแต้ม (ทำตอนเปิดหน้า ไม่ต้องมี cron)
  const today = todayInShopTz()
  const { data: overdue } = await db
    .from("point_redemptions")
    .select("id, points_cost")
    .eq("customer_id", customerId)
    .eq("status", "issued")
    .lt("expires_at", today)
  for (const c of overdue ?? []) {
    const { data: expired } = await db
      .from("point_redemptions")
      .update({ status: "expired" })
      .eq("id", c.id)
      .eq("status", "issued")
      .select("id")
    if (expired && expired.length > 0) {
      await db.from("point_transactions").insert({
        customer_id: customerId,
        delta: c.points_cost,
        reason: "คืนแต้ม (คูปองหมดอายุ)",
        redemption_id: c.id,
      })
    }
  }

  const [
    { data: balanceRow },
    { data: coupons },
    { data: rewards },
    { data: history },
    { data: earliest },
    { data: ltv },
  ] = await Promise.all([
      db.from("v_point_balances").select("balance").eq("customer_id", customerId).maybeSingle(),
      db
        .from("point_redemptions")
        .select("id, code, reward_name, points_cost, expires_at")
        .eq("customer_id", customerId)
        .eq("status", "issued")
        .order("created_at", { ascending: false }),
      db
        .from("point_rewards")
        .select("id, name, points_cost")
        .eq("is_active", true)
        .order("sort")
        .order("points_cost"),
      db
        .from("point_transactions")
        .select("delta, reason, created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(20),
      db
        .from("point_transactions")
        .select("expires_at")
        .eq("customer_id", customerId)
        .gt("delta", 0)
        .not("expires_at", "is", null)
        .order("expires_at")
        .limit(1)
        .maybeSingle(),
      db
        .from("v_customer_ltv")
        .select("visits")
        .eq("customer_id", customerId)
        .maybeSingle(),
    ])

  const customerName =
    (account as unknown as { customers: { name: string } | null }).customers?.name ?? ""

  return {
    ok: true,
    linked: true,
    customerName: cleanLineDisplayName(customerName) ?? customerName,
    profileComplete,
    nickname: profile?.nickname ?? null,
    visits: ltv?.visits ?? 0,
    balance: balanceRow?.balance ?? 0,
    earliestExpiry: earliest?.expires_at ?? null,
    coupons: (coupons ?? []).map((c) => ({
      id: c.id,
      code: c.code,
      rewardName: c.reward_name,
      pointsCost: c.points_cost,
      expiresAt: c.expires_at,
    })),
    rewards: (rewards ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      pointsCost: r.points_cost,
    })),
    history: (history ?? []).map((h) => ({
      delta: h.delta,
      reason: h.reason,
      createdAt: h.created_at,
    })),
  }
}

/** แลกแต้มเป็นคูปอง — กันแต้มออกทันที ได้รหัส 6 ตัวอายุ 30 วัน */
export async function redeemReward(
  idToken: string,
  rewardId: string
): Promise<{ ok: true; coupon: PointCoupon } | Fail> {
  const who = await verifyLineIdToken(idToken)
  if (!who) return AUTH_FAIL
  const db = createServiceClient()

  const { data: account } = await db
    .from("line_accounts")
    .select("customer_id")
    .eq("line_user_id", who.userId)
    .maybeSingle()
  if (!account) return AUTH_FAIL
  const customerId = account.customer_id

  const { data: reward } = await db
    .from("point_rewards")
    .select("id, name, points_cost, is_active")
    .eq("id", rewardId)
    .maybeSingle()
  if (!reward || !reward.is_active) {
    return { ok: false, error: "ของรางวัลนี้ปิดรับแลกแล้วค่ะ" }
  }

  const { data: balanceRow } = await db
    .from("v_point_balances")
    .select("balance")
    .eq("customer_id", customerId)
    .maybeSingle()
  const balance = balanceRow?.balance ?? 0
  if (balance < reward.points_cost) {
    return { ok: false, error: `แต้มไม่พอค่ะ (มี ${balance} ต้องใช้ ${reward.points_cost})` }
  }

  // รหัสซ้ำได้ยาก (31^6) แต่กันไว้ — ชนก็สุ่มใหม่
  const expiresAt = couponExpiryDate(todayInShopTz())
  let coupon: { id: string; code: string } | null = null
  for (let attempt = 0; attempt < 3 && !coupon; attempt++) {
    const { data } = await db
      .from("point_redemptions")
      .insert({
        customer_id: customerId,
        reward_id: reward.id,
        reward_name: reward.name,
        points_cost: reward.points_cost,
        code: genCouponCode(),
        expires_at: expiresAt,
      })
      .select("id, code")
      .single()
    if (data) coupon = data
  }
  if (!coupon) return { ok: false, error: "ระบบไม่ว่าง ลองใหม่อีกครั้งนะคะ" }

  await db.from("point_transactions").insert({
    customer_id: customerId,
    delta: -reward.points_cost,
    reason: `แลก: ${reward.name}`,
    redemption_id: coupon.id,
  })

  // เผื่อกดแลกพร้อมกันสองเครื่องจนแต้มติดลบ — ถอนรายการนี้คืน
  const { data: after } = await db
    .from("v_point_balances")
    .select("balance")
    .eq("customer_id", customerId)
    .maybeSingle()
  if ((after?.balance ?? 0) < 0) {
    await db.from("point_transactions").delete().eq("redemption_id", coupon.id)
    await db.from("point_redemptions").update({ status: "cancelled" }).eq("id", coupon.id)
    return { ok: false, error: "แต้มไม่พอค่ะ (มีรายการแลกซ้อนกัน)" }
  }

  return {
    ok: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      rewardName: reward.name,
      pointsCost: reward.points_cost,
      expiresAt,
    },
  }
}

/** ป้ายวิธีจ่ายภาษาลูกค้า — ค่าในระบบเป็นชื่อภายในร้าน */
const PAY_LABEL: Record<string, string> = {
  "QR Code": "โอน QR",
  เงินสด: "เงินสด",
  บัตรเครดิต: "บัตรเครดิต",
  Gowabi: "Gowabi",
  KOL: "KOL",
  "Member Credit": "เครดิตสมาชิก",
}

export type UsageBill = {
  key: string
  date: string
  time: string | null
  services: string[]
  total: number
  payment: string
  /** เครดิตสมาชิกที่ตัดในบิลนี้ (รวมโบนัส) — 0 = จ่ายช่องทางอื่น */
  creditUsed: number
  /** เครดิตคงเหลือหลังบิลนี้ (เฉพาะบิลที่ตัดเครดิต) */
  creditAfter: number | null
}

export type MyProfileData =
  | {
      ok: true
      linked: true
      profile: {
        name: string
        nickname: string | null
        birthday: string | null
        gender: string | null
        phone: string | null
      }
      member: {
        /** ระดับจากใบเติมเงินล่าสุด — null = ไม่เคยเติมเครดิต */
        tier: string | null
        creditBalance: number
        nextExpiry: string | null
      }
      visits: number
      usage: UsageBill[]
    }
  | { ok: true; linked: false }
  | Fail

/** หน้าโปรไฟล์ลูกค้า — ข้อมูลส่วนตัว + สถานะสมาชิกเครดิต + ประวัติใช้บริการทุกช่องทางจ่าย */
export async function getMyProfile(idToken: string): Promise<MyProfileData> {
  const who = await verifyLineIdToken(idToken)
  if (!who) return AUTH_FAIL
  const db = createServiceClient()

  const { data: account } = await db
    .from("line_accounts")
    .select("customer_id, customers(name, nickname, birthday, gender, phone)")
    .eq("line_user_id", who.userId)
    .maybeSingle()
  if (!account) return { ok: true, linked: false }
  const customerId = account.customer_id
  const c = (
    account as unknown as {
      customers: {
        name: string
        nickname: string | null
        birthday: string | null
        gender: string | null
        phone: string | null
      } | null
    }
  ).customers

  const [{ data: balance }, { data: lastTopup }, { data: saleRows }, { data: ltv }] =
    await Promise.all([
      db
        .from("member_balances")
        .select("credit_balance, next_expiry")
        .eq("customer_id", customerId)
        .maybeSingle(),
      db
        .from("member_topups")
        .select("tier")
        .eq("customer_id", customerId)
        .order("topup_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("sales")
        .select(
          "id, bill_id, sale_date, sale_time, service_name, net_amount, payment_method, credit_used, bonus_used, credit_after"
        )
        .eq("customer_id", customerId)
        .order("sale_date", { ascending: false })
        .order("sale_time", { ascending: false, nullsFirst: false })
        .limit(80),
      db.from("v_customer_ltv").select("visits").eq("customer_id", customerId).maybeSingle(),
    ])

  // บิลชุด (bill_id เดียวกันหลายรายการ) รวมเป็นใบเดียวให้ลูกค้าอ่านง่าย
  const bills = new Map<string, UsageBill>()
  for (const s of saleRows ?? []) {
    const key = s.bill_id ?? s.id
    const creditUsed = (s.credit_used ?? 0) + (s.bonus_used ?? 0)
    const row = bills.get(key)
    if (row) {
      row.services.push(s.service_name ?? "บริการ")
      row.total += s.net_amount ?? 0
      row.creditUsed += creditUsed
      if (s.credit_after !== null && (row.creditAfter === null || s.credit_after < row.creditAfter)) {
        row.creditAfter = s.credit_after
      }
    } else {
      bills.set(key, {
        key,
        date: s.sale_date,
        time: s.sale_time,
        services: [s.service_name ?? "บริการ"],
        total: s.net_amount ?? 0,
        payment: PAY_LABEL[s.payment_method] ?? s.payment_method,
        creditUsed,
        creditAfter: s.credit_after,
      })
    }
  }

  return {
    ok: true,
    linked: true,
    profile: {
      name: c?.name ?? "",
      nickname: c?.nickname ?? null,
      birthday: c?.birthday ?? null,
      gender: c?.gender ?? null,
      phone: c?.phone ?? null,
    },
    member: {
      tier: lastTopup?.tier ?? null,
      creditBalance: balance?.credit_balance ?? 0,
      nextExpiry: balance?.next_expiry ?? null,
    },
    visits: ltv?.visits ?? 0,
    usage: [...bills.values()].slice(0, 30),
  }
}

const GENDERS = ["หญิง", "ชาย", "ไม่ระบุ"] as const
const SOURCES = [
  "Instagram",
  "TikTok",
  "Facebook",
  "Google Maps",
  "เพื่อนแนะนำ",
  "เดินผ่านหน้าร้าน",
  "อื่นๆ",
] as const

/** ฟอร์มสมาชิกครั้งแรกก่อนเข้าหน้าแต้ม — เก็บเข้าโปรไฟล์ลูกค้าเพื่อการดูแล/การตลาด */
export async function savePointsProfile(
  idToken: string,
  input: {
    fullName: string
    nickname: string
    birthday: string
    gender: string
    source: string
  }
): Promise<{ ok: true } | Fail> {
  const who = await verifyLineIdToken(idToken)
  if (!who) return AUTH_FAIL
  const db = createServiceClient()

  const fullName = input.fullName.trim()
  const birthday = input.birthday.trim()
  if (!fullName) return { ok: false, error: "กรุณากรอกชื่อ-นามสกุลค่ะ" }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
    return { ok: false, error: "กรุณาเลือกวันเกิดค่ะ" }
  }
  if (!GENDERS.includes(input.gender as (typeof GENDERS)[number])) {
    return { ok: false, error: "กรุณาเลือกเพศค่ะ" }
  }

  const { data: account } = await db
    .from("line_accounts")
    .select("customer_id")
    .eq("line_user_id", who.userId)
    .maybeSingle()
  if (!account) return AUTH_FAIL

  const { error } = await db
    .from("customers")
    .update({
      name: fullName,
      nickname: input.nickname.trim() || null,
      birthday,
      gender: input.gender,
      ...(SOURCES.includes(input.source as (typeof SOURCES)[number])
        ? { acquisition_source: input.source }
        : {}),
    })
    .eq("id", account.customer_id)
  if (error) return { ok: false, error: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้งนะคะ" }
  return { ok: true }
}
