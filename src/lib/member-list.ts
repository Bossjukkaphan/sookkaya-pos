/**
 * ค้นหา/กรอง/เรียงรายชื่อสมาชิกฝั่งเบราว์เซอร์ — สมาชิกที่มีเครดิตมีแค่หลักสิบคน
 * ไม่คุ้มยิง query ใหม่ทุกครั้งที่พิมพ์ค้นหา ทำในเครื่องแล้วเห็นผลทันที
 */

import { RED_ZONE_DAYS } from "./credit-expiry"

export type MemberListItem = {
  customerId: string
  name: string
  nickname: string | null
  phone: string | null
  tier: string | null
  balance: number
  /** วันหมดอายุของ "ใบใกล้สุด" ที่ยังใช้ได้ (คิดรายใบ — ดู lib/credit-expiry.ts)
   *  null = ไม่มีใบที่ยังใช้ได้เลย (เครดิตแช่แข็งทั้งหมด หรือไม่เคยเติม) */
  nextExpiry: string | null
  /** เหลืออีกกี่วันถึงวันของใบใกล้สุด — null คู่กับ nextExpiry */
  daysLeft: number | null
  /** ยอดรวมใบที่จะหมดภายใน 30 วัน (0 = ยังไม่มีอะไรเร่งด่วน) */
  expiringAmount: number
  /** เครดิตแช่แข็ง (หมดอายุแล้วแต่ยอดยังอยู่) — งานที่ 1 · optional กัน test เดิม/ผู้เรียกเดิมพัง */
  expired?: boolean
}

export type MemberSort = "name" | "balance_desc" | "balance_asc" | "expiry_soon"

/** ชิปกรองสถานะหมดอายุ — ≤N วัน นับจากใบใกล้สุด · frozen = หมดอายุแล้วแต่ยอดยังค้าง */
export type ExpiryFilter = "all" | "d7" | "d14" | "d30" | "frozen"

export function filterMembers(
  members: MemberListItem[],
  term: string,
  tier: string,
  expiry: ExpiryFilter = "all"
): MemberListItem[] {
  const t = term.trim().toLowerCase()
  return members.filter((m) => {
    if (tier && m.tier !== tier) return false
    if (!matchesExpiry(m, expiry)) return false
    if (!t) return true
    return (
      m.name.toLowerCase().includes(t) ||
      (m.nickname ?? "").toLowerCase().includes(t) ||
      (m.phone ?? "").includes(t)
    )
  })
}

function matchesExpiry(m: MemberListItem, expiry: ExpiryFilter): boolean {
  switch (expiry) {
    case "all":
      return true
    case "frozen":
      return m.expired === true
    case "d7":
      return m.daysLeft !== null && m.daysLeft <= RED_ZONE_DAYS
    case "d14":
      return m.daysLeft !== null && m.daysLeft <= 14
    case "d30":
      return m.daysLeft !== null && m.daysLeft <= 30
  }
}

export function sortMembers(members: MemberListItem[], sort: MemberSort): MemberListItem[] {
  const arr = [...members]
  switch (sort) {
    case "balance_desc":
      return arr.sort((a, b) => b.balance - a.balance)
    case "balance_asc":
      return arr.sort((a, b) => a.balance - b.balance)
    case "expiry_soon":
      // ไม่มีใบที่ยังใช้ได้ (แช่แข็ง/ไม่เคยเติม) ไม่ใช่เรื่องด่วน — ไปอยู่ท้ายสุดเสมอ
      return arr.sort((a, b) => {
        if (!a.nextExpiry && !b.nextExpiry) return 0
        if (!a.nextExpiry) return 1
        if (!b.nextExpiry) return -1
        return a.nextExpiry.localeCompare(b.nextExpiry)
      })
    default:
      return arr.sort((a, b) => a.name.localeCompare(b.name, "th"))
  }
}
