/**
 * ค้นหา/กรอง/เรียงรายชื่อสมาชิกฝั่งเบราว์เซอร์ — สมาชิกที่มีเครดิตมีแค่หลักสิบคน
 * ไม่คุ้มยิง query ใหม่ทุกครั้งที่พิมพ์ค้นหา ทำในเครื่องแล้วเห็นผลทันที
 */

export type MemberListItem = {
  customerId: string
  name: string
  nickname: string | null
  phone: string | null
  tier: string | null
  balance: number
  nextExpiry: string | null
}

export type MemberSort = "name" | "balance_desc" | "balance_asc" | "expiry_soon"

export function filterMembers(
  members: MemberListItem[],
  term: string,
  tier: string
): MemberListItem[] {
  const t = term.trim().toLowerCase()
  return members.filter((m) => {
    if (tier && m.tier !== tier) return false
    if (!t) return true
    return (
      m.name.toLowerCase().includes(t) ||
      (m.nickname ?? "").toLowerCase().includes(t) ||
      (m.phone ?? "").includes(t)
    )
  })
}

export function sortMembers(members: MemberListItem[], sort: MemberSort): MemberListItem[] {
  const arr = [...members]
  switch (sort) {
    case "balance_desc":
      return arr.sort((a, b) => b.balance - a.balance)
    case "balance_asc":
      return arr.sort((a, b) => a.balance - b.balance)
    case "expiry_soon":
      // ไม่มีวันหมดอายุ (ไม่เคยเติม) ไม่ใช่เรื่องด่วน — ไปอยู่ท้ายสุดเสมอ
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
