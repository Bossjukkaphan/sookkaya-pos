import { formatBaht } from "./constants"

// ════════════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════════════

export type CareReason = "birthday" | "dormant" | "low_credit"

export type CareItem = {
  customerId: string
  name: string
  reason: CareReason
  badge: string        // "🎂 วันเกิดวันนี้" | "🎂 พรุ่งนี้" | "💤 หาย 74 วัน" | "💳 เหลือ 120฿"
  amountLabel: string  // LTV หรือเครดิตคงเหลือ format แล้ว
}

export type TherapistRank = {
  therapistId: string
  name: string
  revenue: number
  sessions: number
  sharePct: number     // สัดส่วนเทียบ top1 (ใช้วาด bar ในแถว)
}

// ════════════════════════════════════════════════════════════════════════════
// buildCareList: รวม 3 แหล่ง เรียง: วันเกิด → dormant(top5 ตาม ltv) → เครดิตต่ำ(top3)
// ════════════════════════════════════════════════════════════════════════════

export function buildCareList(input: {
  birthdays: { id: string; name: string; nickname: string | null; daysUntil: 0 | 1 }[]
  dormant: { id: string; name: string; ltv: number; daysSinceVisit: number }[]
  lowCredit: { id: string; name: string; balance: number }[]
}): CareItem[] {
  const items: CareItem[] = []

  // วันเกิด — ไม่ตัด ใส่ทั้งหมด (โปรแกรมกำหนดวันเกิด จำนวนน้อย)
  for (const b of input.birthdays) {
    const badge = b.daysUntil === 0 ? "🎂 วันเกิดวันนี้" : "🎂 พรุ่งนี้"
    items.push({
      customerId: b.id,
      name: b.name,
      reason: "birthday",
      badge,
      amountLabel: "", // UI ไม่โชว์ถ้าว่าง
    })
  }

  // dormant — เรียงตาม ltv มาก→น้อย แล้วตัด top 5
  // ใช้ copy ของ input เพื่อไม่ให้ mutate array ของ caller
  const sortedDormant = [...input.dormant]
    .sort((a, b) => b.ltv - a.ltv)
    .slice(0, 5)

  for (const d of sortedDormant) {
    const badge = `💤 หาย ${d.daysSinceVisit} วัน`
    items.push({
      customerId: d.id,
      name: d.name,
      reason: "dormant",
      badge,
      amountLabel: formatBaht(d.ltv),
    })
  }

  // เครดิตต่ำ — เรียงตาม balance น้อย→มาก (ด่วนสุด = ต่ำสุด) แล้วตัด top 3
  const sortedLowCredit = [...input.lowCredit]
    .sort((a, b) => a.balance - b.balance)
    .slice(0, 3)

  for (const c of sortedLowCredit) {
    const badge = `💳 เหลือ ${formatBaht(c.balance)}฿`
    items.push({
      customerId: c.id,
      name: c.name,
      reason: "low_credit",
      badge,
      amountLabel: formatBaht(c.balance),
    })
  }

  // ตัดรวมไม่เกิน 10
  return items.slice(0, 10)
}

// ════════════════════════════════════════════════════════════════════════════
// topTherapists: เรียงตามรายได้ · ส่วนแบ่ง sharePct เทียบ top1
// ════════════════════════════════════════════════════════════════════════════

export function topTherapists(
  byTherapist: { therapist_id: string; revenue: number; sessions: number }[],
  names: Map<string, string>,
  limit: number
): TherapistRank[] {
  // ตรวจว่ารู้จักชื่อ ถ้าไม่รู้จัก skip
  const filtered = byTherapist.filter((t) => names.has(t.therapist_id))

  // เรียงตามรายได้มาก→น้อย
  const sorted = filtered.sort((a, b) => b.revenue - a.revenue)

  // ตัด limit
  const limited = sorted.slice(0, limit)

  // หา max revenue สำหรับคำนวณ sharePct
  // ถ้า maxRevenue <= 0 ให้ sharePct = 0 สำหรับทุกแถว (ไม่ NaN/Infinity)
  const maxRevenue = limited.length > 0 ? limited[0].revenue : 1

  // แปลงเป็น TherapistRank พร้อมคำนวณ sharePct
  return limited.map((t) => ({
    therapistId: t.therapist_id,
    name: names.get(t.therapist_id)!,
    revenue: t.revenue,
    sessions: t.sessions,
    sharePct: maxRevenue > 0 ? Math.round((t.revenue / maxRevenue) * 100) : 0,
  }))
}

// ════════════════════════════════════════════════════════════════════════════
// guaranteeFlags: หมอที่ "กินการันตี" เกินครึ่งของวันทำงาน
// ════════════════════════════════════════════════════════════════════════════

/**
 * หมอที่ "กินการันตี" เกินครึ่งของวันทำงานเดือนนี้ — คืนรายชื่อพร้อมสัดส่วน
 *
 * นิยาม "วันนั้นการันตีถูกเติม" (hitGuarantee):
 * ตรวจสอบจาก v_therapist_daily · status === "ใช้ประกัน" (commission/page.tsx ~L98)
 * ถ้าวันไหนการันตีถูกเติมให้หมอ hitGuarantee=true สำหรับวันนั้น
 *
 * การนับ ratio:
 * - นับจำนวนวันที่ hitGuarantee=true สำหรับแต่ละหมอ
 * - นับจำนวนวันทำงานทั้งหมดของหมอ (เข้ามาในอาเรย์ที่ผ่านมา)
 * - ถ้า (วันกินการันตี > ครึ่งวันทำงาน) ให้คืน ratio = วันกินการันตี / วันทำงานทั้งหมด
 */
export function guaranteeFlags(
  days: { therapist_id: string; hitGuarantee: boolean }[],
  names: Map<string, string>
): { name: string; ratio: number }[] {
  // จัดกลุ่มตามหมอ และนับจำนวนวันกินการันตี
  const therapistStats = new Map<string, { hitCount: number; totalCount: number }>()

  for (const d of days) {
    const stats = therapistStats.get(d.therapist_id) || { hitCount: 0, totalCount: 0 }
    stats.totalCount += 1
    if (d.hitGuarantee) {
      stats.hitCount += 1
    }
    therapistStats.set(d.therapist_id, stats)
  }

  // ตรวจว่ากินการันตีเกินครึ่ง และมีชื่อ
  const result: { name: string; ratio: number }[] = []

  for (const [therapistId, stats] of therapistStats) {
    // ตรวจว่ารู้จักชื่อ
    if (!names.has(therapistId)) continue

    // ตรวจว่าเกินครึ่ง (strictly greater than, ไม่ใช่ equal)
    if (stats.hitCount > stats.totalCount / 2) {
      result.push({
        name: names.get(therapistId)!,
        ratio: stats.hitCount / stats.totalCount,
      })
    }
  }

  return result
}
