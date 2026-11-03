/**
 * เครดิตสมาชิกแบบ "แยกก้อนตามใบเติม" (ตัดสินใจ 2026-11-03 — แทนกระปุกเดียวของ ส.ค.)
 *
 * กติกา:
 *  - แต่ละใบเติมมี วันหมดอายุ/ยอดคงเหลือ/สถานะเปิดปิด ของตัวเอง
 *  - ใบที่ตัดได้ ณ วันของบิล = เปิดใช้งาน + ซื้อก่อนหรือวันเดียวกับวันบิล + ยังไม่หมดอายุ ณ วันบิล
 *  - บิลหนึ่งใบแบ่งตัดได้หลายใบ · ระบบจัดให้อัตโนมัติ (ใกล้หมดอายุก่อน) · พนักงานแก้การแบ่งได้
 *  - ใบหมดอายุ = ยอดยังโชว์แต่ตัดไม่ได้ · การเติมใหม่ไม่ฟื้นใบเก่า (ยืดอายุรายใบได้จากหน้าแก้ไข)
 *  - แก้บิลเดิม: ยอดที่บิลนี้เคยตัดจากใบไหน ถือเป็นโควตาของบิลนั้นต่อ แม้ใบนั้นจะหมดอายุไปแล้ว
 *    (ตัดเท่าเดิมหรือน้อยลงไม่ใช่การใช้เครดิตใหม่ — หลักการเดียวกับระบบเดิม)
 *
 * บทเรียนจากรอบ FIFO ส.ค.: ห้ามให้ระบบ "เดาย้อนหลัง" ว่าบิลตัดใบไหน
 * รอบนี้การแบ่งถูกบันทึกจริงเป็นรายบิลใน sale_credit_allocations ตั้งแต่ตอนขาย
 */

const round2 = (n: number) => Math.round(n * 100) / 100

export type TopupBucket = {
  topupId: string
  tier: string
  /** YYYY-MM-DD */
  topupDate: string
  /** YYYY-MM-DD */
  expiryDate: string
  remaining: number
  /** เงินจริงต่อเครดิต 1 บาทของใบนี้ (cash_received / credit_added) — ใช้คิดรายได้รับรู้ */
  recognizeRatio: number
  isActive: boolean
}

export type SplitPart = { topupId: string; amount: number }

export type SplitResult =
  | { ok: true; parts: SplitPart[]; usableTotal: number }
  | { ok: false; reason: "expired" | "insufficient"; message: string }

/** ใบนี้ตัด "เครดิตใหม่" ได้ไหม ณ วันของบิล (ไม่รวมโควตาที่บิลเดิมเคยตัด) */
export function bucketUsableOn(b: TopupBucket, onDate: string): boolean {
  // เทียบสตริง YYYY-MM-DD ตรงๆ ได้ — เรียงตามพจนานุกรมตรงกับเรียงตามเวลา
  // วันหมดอายุวันนี้พอดียังใช้ได้ทั้งวัน (>=) · ใบที่ซื้อหลังวันบิลยังไม่มีอยู่จริง ณ วันนั้น
  return b.isActive && b.topupDate <= onDate && b.expiryDate >= onDate
}

/** เพดานที่บิลนี้ตัดจากใบนี้ได้ = เครดิตใหม่ (ถ้าใบ usable) + โควตาที่บิลนี้เคยตัดไว้ */
function bucketCap(b: TopupBucket, onDate: string, already: number): number {
  const fresh = bucketUsableOn(b, onDate) ? Math.max(0, b.remaining) : 0
  return round2(fresh + already)
}

/**
 * แบ่งยอดตัดอัตโนมัติ: ใบใกล้หมดอายุก่อน (ของลูกค้าหมดก่อนได้ใช้ก่อน) — ใบเดิมที่บิลนี้
 * เคยตัดถูกใช้ก่อนเสมอ (โควตาเดิม) เพื่อให้การแก้บิลไม่ย้ายใบโดยไม่จำเป็น
 */
export function planCreditSplit(input: {
  buckets: TopupBucket[]
  amount: number
  onDate: string
  /** ยอดที่บิลนี้เคยตัดไว้ต่อใบ (เฉพาะตอนแก้บิล) */
  already?: Map<string, number>
}): SplitResult {
  const { buckets, onDate } = input
  const amount = round2(input.amount)
  const already = input.already ?? new Map<string, number>()
  if (amount <= 0) return { ok: true, parts: [], usableTotal: 0 }

  const caps = buckets
    .map((b) => ({ b, cap: bucketCap(b, onDate, already.get(b.topupId) ?? 0) }))
    .filter((x) => x.cap > 0)
    // โควตาเดิมของบิลนี้มาก่อน แล้วค่อยเรียงใกล้หมดอายุก่อน
    .sort((x, y) => {
      const xOld = (already.get(x.b.topupId) ?? 0) > 0 ? 0 : 1
      const yOld = (already.get(y.b.topupId) ?? 0) > 0 ? 0 : 1
      if (xOld !== yOld) return xOld - yOld
      return (
        x.b.expiryDate.localeCompare(y.b.expiryDate) ||
        x.b.topupDate.localeCompare(y.b.topupDate) ||
        x.b.topupId.localeCompare(y.b.topupId)
      )
    })

  const usableTotal = round2(caps.reduce((s, x) => s + x.cap, 0))
  if (usableTotal < amount) {
    return insufficientOrExpired(buckets, amount, usableTotal, onDate)
  }

  const parts: SplitPart[] = []
  let need = amount
  for (const { b, cap } of caps) {
    if (need <= 0) break
    const take = round2(Math.min(need, cap))
    if (take > 0) {
      parts.push({ topupId: b.topupId, amount: take })
      need = round2(need - take)
    }
  }
  return { ok: true, parts, usableTotal }
}

/** แยกข้อความ "หมดอายุ" ออกจาก "ยอดไม่พอ" — สองเหตุนำไปสู่คำแนะนำหน้าเคาน์เตอร์คนละแบบ
 * (หมดอายุ = ชวนซื้อแพ็กเกจใหม่/ยืดอายุ · ไม่พอ = เก็บเงินเพิ่มช่องทางอื่น) */
function insufficientOrExpired(
  buckets: TopupBucket[],
  amount: number,
  usableTotal: number,
  onDate: string
): SplitResult {
  const frozen = buckets
    .filter((b) => b.remaining > 0 && !bucketUsableOn(b, onDate))
    .reduce((s, b) => s + b.remaining, 0)
  if (usableTotal <= 0 && frozen > 0) {
    return {
      ok: false,
      reason: "expired",
      message: `เครดิตที่ใช้ได้หมดแล้ว — มียอด ${round2(frozen)} ฿ ในใบที่หมดอายุ/ปิดใช้งาน (ซื้อแพ็กเกจใหม่ หรือผู้จัดการยืดอายุใบเดิมได้)`,
    }
  }
  if (usableTotal <= 0) {
    return {
      ok: false,
      reason: "expired",
      message: "ลูกค้ายังไม่เคยซื้อแพ็กเกจสมาชิก จึงยังไม่มีเครดิตให้ตัด",
    }
  }
  return {
    ok: false,
    reason: "insufficient",
    message: `เครดิตที่ใช้ได้ไม่พอ (ใช้ได้ ${usableTotal} บาท ต้องใช้ ${amount} บาท)`,
  }
}

/** ตรวจการแบ่งที่พนักงานแก้เอง — ทุกใบต้องตัดได้จริง ยอดรวมต้องเท่ายอดตัดเป๊ะ */
export function validateSplit(input: {
  parts: SplitPart[]
  buckets: TopupBucket[]
  amount: number
  onDate: string
  already?: Map<string, number>
}): SplitResult {
  const { parts, buckets, onDate } = input
  const amount = round2(input.amount)
  const already = input.already ?? new Map<string, number>()
  const byId = new Map(buckets.map((b) => [b.topupId, b]))

  const seen = new Set<string>()
  let sum = 0
  for (const p of parts) {
    const b = byId.get(p.topupId)
    if (!b) return { ok: false, reason: "insufficient", message: "ใบเติมที่เลือกไม่ใช่ของลูกค้าคนนี้" }
    if (seen.has(p.topupId))
      return { ok: false, reason: "insufficient", message: "เลือกใบเติมซ้ำกันในบิลเดียว" }
    seen.add(p.topupId)
    const amt = round2(p.amount)
    if (amt <= 0) continue
    const cap = bucketCap(b, onDate, already.get(p.topupId) ?? 0)
    if (amt > cap) {
      return {
        ok: false,
        reason: "insufficient",
        message: `ใบ ${b.tier} (หมดอายุ ${b.expiryDate}) ตัดได้สูงสุด ${cap} บาท — ขอตัด ${amt} บาท`,
      }
    }
    sum = round2(sum + amt)
  }
  if (sum !== amount) {
    return {
      ok: false,
      reason: "insufficient",
      message: `ยอดแบ่งรวม ${sum} บาท ไม่เท่ายอดเครดิตที่ตัด ${amount} บาท`,
    }
  }
  return {
    ok: true,
    parts: parts.filter((p) => round2(p.amount) > 0).map((p) => ({ topupId: p.topupId, amount: round2(p.amount) })),
    usableTotal: sum,
  }
}

/** สัดส่วนรับรู้รายได้ถ่วงน้ำหนักตามใบที่ตัดจริง — ใบโบนัสเยอะรับรู้น้อย ตามเงินจริงของใบนั้น */
export function weightedRecognizeRatio(parts: SplitPart[], buckets: TopupBucket[]): number {
  const byId = new Map(buckets.map((b) => [b.topupId, b]))
  let total = 0
  let weighted = 0
  for (const p of parts) {
    const b = byId.get(p.topupId)
    if (!b || p.amount <= 0) continue
    total += p.amount
    weighted += p.amount * b.recognizeRatio
  }
  return total > 0 ? weighted / total : 1
}

/** ยอดที่ตัดได้จริงรวมทุกใบ ณ วันบิล — ใช้โชว์/เช็คเพดานฝั่งจอให้ตรงกับ server */
export function usableCreditOn(buckets: TopupBucket[], onDate: string): number {
  return round2(
    buckets.reduce((s, b) => s + (bucketUsableOn(b, onDate) ? Math.max(0, b.remaining) : 0), 0)
  )
}
