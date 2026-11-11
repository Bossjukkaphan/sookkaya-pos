/**
 * เตือนเครดิตสมาชิกใกล้หมดอายุ (แผน 2026-11-11) — กติกากลางที่เดียว
 * ใช้ทั้งลิสต์ "เครดิตใกล้หมดอายุ" ในหน้า /crm และ cron เตือนทีมตอนเช้า
 *
 * กติกา:
 *  - ใบที่นับ = เปิดใช้งาน + ยอดคงเหลือ > 0 + หมดอายุภายใน 30 วันข้างหน้า (รวมวันนี้)
 *  - โซนความด่วน: ≤7 วัน แดง · 8-14 ส้ม · 15-30 เหลือง
 *  - ติดต่อแล้วแถวหาย 30 วันเหมือนลิสต์อื่น แต่พอใบข้ามเข้า "โซนแดง" ให้โผล่กลับมา
 *    อีกครั้งหนึ่ง (การติดต่อก่อนเข้าโซนแดงไม่กดแถวช่วงโค้งสุดท้าย) — ชวนมากสุด 2 ครั้งต่อใบ
 *  - cron เตือนทีมเมื่อใบแตะหลักไมล์ D-30/14/7/3 ครั้งละหนเดียวต่อหลักไมล์
 *    (กันซ้ำด้วยตาราง credit_expiry_alerts key รวม expiry_date — ยืดอายุใบ = นับหลักไมล์ใหม่)
 */

import { round2 } from "./topup-credit"

const DAY_MS = 86_400_000

export const EXPIRY_WINDOW_DAYS = 30
export const RED_ZONE_DAYS = 7
export const ALERT_THRESHOLDS = [30, 14, 7, 3] as const

/** บวก/ลบวันบนสตริง YYYY-MM-DD ตรึง UTC เที่ยงคืน — new Date() ตรงๆ เพี้ยนข้ามวันช่วงเช้าไทย */
export function addDaysIso(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10)
}

/** เหลืออีกกี่วันถึงวันหมดอายุ (0 = หมดอายุวันนี้ ยังใช้ได้ทั้งวัน · ติดลบ = หมดไปแล้ว) */
export function daysLeft(expiryDate: string, today: string): number {
  return Math.round(
    (Date.parse(`${expiryDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS
  )
}

export type ExpiringBucketRow = {
  topupId: string
  customerId: string
  expiryDate: string
  remaining: number
}

export type ExpiringCustomer = {
  customerId: string
  /** ยอดรวมของทุกใบที่กำลังจะหมดในช่วง 30 วัน */
  total: number
  /** วันหมดอายุที่ใกล้ที่สุด */
  nearestExpiry: string
  daysLeft: number
  bucketCount: number
}

/** รวมใบเป็นรายลูกค้า (คนเดียวหลายใบ = แถวเดียว) เรียงด่วนก่อน แล้วยอดมากก่อน */
export function groupExpiringByCustomer(
  rows: ExpiringBucketRow[],
  today: string
): ExpiringCustomer[] {
  const byCustomer = new Map<string, ExpiringCustomer>()
  for (const r of rows) {
    if (r.remaining <= 0) continue
    const d = daysLeft(r.expiryDate, today)
    if (d < 0 || d > EXPIRY_WINDOW_DAYS) continue
    const cur = byCustomer.get(r.customerId)
    if (!cur) {
      byCustomer.set(r.customerId, {
        customerId: r.customerId,
        total: round2(r.remaining),
        nearestExpiry: r.expiryDate,
        daysLeft: d,
        bucketCount: 1,
      })
    } else {
      cur.total = round2(cur.total + r.remaining)
      cur.bucketCount += 1
      if (r.expiryDate < cur.nearestExpiry) {
        cur.nearestExpiry = r.expiryDate
        cur.daysLeft = d
      }
    }
  }
  return [...byCustomer.values()].sort(
    (a, b) => a.daysLeft - b.daysLeft || b.total - a.total
  )
}

export type MemberExpirySummary = {
  /** วันหมดอายุของ "ใบใกล้สุด" ที่ยังใช้ได้ — ไม่ใช่ next_expiry ของ member_balances
   *  ซึ่งเป็นใบไกลสุด (ไว้คิดสูตรแช่แข็ง) ใช้คนละงานกัน ห้ามสลับ */
  nearestExpiry: string
  daysLeft: number
  /** ยอดรวมใบที่จะหมดภายใน 30 วัน (0 = ใบใกล้สุดยังอยู่ไกล) */
  expiringAmount: number
}

/** สรุปต่อสมาชิกจากใบที่ยังใช้ได้ (เปิดใช้ + มียอด + ยังไม่หมดอายุ) — หน้า /members ใช้
 *  โชว์/กรอง/เรียง "ใกล้หมดอายุ" ให้ตรงกับหน้า /crm และ cron ที่คิดรายใบเหมือนกัน */
export function summarizeMemberExpiry(
  rows: ExpiringBucketRow[],
  today: string
): Map<string, MemberExpirySummary> {
  const out = new Map<string, MemberExpirySummary>()
  for (const r of rows) {
    if (r.remaining <= 0) continue
    const d = daysLeft(r.expiryDate, today)
    if (d < 0) continue
    const expiring = d <= EXPIRY_WINDOW_DAYS ? r.remaining : 0
    const cur = out.get(r.customerId)
    if (!cur) {
      out.set(r.customerId, {
        nearestExpiry: r.expiryDate,
        daysLeft: d,
        expiringAmount: round2(expiring),
      })
    } else {
      cur.expiringAmount = round2(cur.expiringAmount + expiring)
      if (r.expiryDate < cur.nearestExpiry) {
        cur.nearestExpiry = r.expiryDate
        cur.daysLeft = d
      }
    }
  }
  return out
}

/** ไอคอน + คำบอกความด่วนตามโซน — ใช้ในลิสต์หน้า /crm */
export function expiryUrgency(d: number): { icon: string; label: string } {
  if (d <= 0) return { icon: "🔴", label: "หมดอายุวันนี้!" }
  if (d <= RED_ZONE_DAYS) return { icon: "🔴", label: `เหลือ ${d} วัน` }
  if (d <= 14) return { icon: "🟠", label: `เหลือ ${d} วัน` }
  return { icon: "🟡", label: `เหลือ ${d} วัน` }
}

/**
 * ติดต่อไปแล้ว ควรซ่อนแถวไหม — กติกา "โผล่กลับมาอีกครั้งตอนเข้าโซนแดง":
 *   นอกโซนแดง: ติดต่อครั้งไหนก็ได้ใน 30 วันล่าสุด = ซ่อน (เหมือนลิสต์อื่น)
 *   ในโซนแดง (≤7 วันก่อนหมด): ซ่อนเฉพาะเมื่อ "เคยติดต่อหลังจากเข้าโซนแดงแล้ว"
 *   — การโทรตอน D-20 ไม่ทำให้พลาดการเตือนรอบสุดท้าย
 * contactDates เป็นวันที่ตามเวลาร้าน (YYYY-MM-DD จาก shopDateOf)
 */
export function creditExpiryContactSuppressed(input: {
  nearestExpiry: string
  today: string
  contactDates: string[]
  cooldownDays?: number
}): boolean {
  const { nearestExpiry, today, contactDates } = input
  const cooldownDays = input.cooldownDays ?? 30
  const d = daysLeft(nearestExpiry, today)
  if (d <= RED_ZONE_DAYS) {
    const redStart = addDaysIso(nearestExpiry, -RED_ZONE_DAYS)
    return contactDates.some((c) => c >= redStart)
  }
  const cooldownStart = addDaysIso(today, -cooldownDays)
  return contactDates.some((c) => c >= cooldownStart)
}

/** หลักไมล์ที่ "ถึงแล้วแต่ยังไม่เคยเตือน" ของใบหนึ่ง — ใบหมดอายุไปแล้วไม่เตือน (สายเกิน) */
export function dueThresholds(
  dLeft: number,
  alerted: ReadonlySet<number>
): number[] {
  if (dLeft < 0) return []
  return ALERT_THRESHOLDS.filter((th) => dLeft <= th && !alerted.has(th))
}

/** ข้อความเตือนทีมเข้ากลุ่มไลน์ — รายชื่อ + ยอด + วันเหลือ จบด้วยลิงก์หน้า CRM */
export function msgCreditExpiryStaff(
  items: { name: string; total: number; daysLeft: number; expiryThai: string }[]
): string {
  const fmt = (n: number) => n.toLocaleString("th-TH")
  const lines = items.map((i) => {
    const when = i.daysLeft <= 0 ? "หมดอายุวันนี้!" : `เหลือ ${i.daysLeft} วัน (${i.expiryThai})`
    return `• คุณ${i.name} ฿${fmt(i.total)} ${when}`
  })
  return (
    `⏳ เครดิตสมาชิกใกล้หมดอายุ ${items.length} คน\n` +
    lines.join("\n") +
    `\nเปิดเมนู "ดูแลลูกค้า" เพื่อชวนมาใช้ก่อนหมดอายุ → https://sookkaya-pos.vercel.app/crm`
  )
}
