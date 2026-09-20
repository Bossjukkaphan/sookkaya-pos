/** องค์ประกอบของเงินที่เข้าร้าน — ใครจ่ายด้วยอะไร และเป็นเงินใหม่หรือเครดิตที่เก็บไว้แล้ว
 *
 *  ทำไมต้องแยก: ยอดขายที่ดูเท่าเดิมสองเดือนอาจเป็นเงินสดเข้าไม่เท่ากันเลย ถ้าเดือนหนึ่ง
 *  ลูกค้าจ่ายด้วยเครดิตที่ซื้อไว้ตั้งแต่เดือนก่อน (เงินเข้าไปแล้วรอบที่แล้ว) — เจ้าของร้าน
 *  ต้องเห็นส่วนผสมนี้ก่อนตัดสินใจเรื่องกระแสเงินสด เช่น การจ่ายปันผล
 *
 *  ฟังก์ชันทั้งหมดในไฟล์นี้บริสุทธิ์ ไม่แตะฐานข้อมูล และรับค่าที่เป็น string ได้
 *  เพราะ PostgREST คืนคอลัมน์ numeric มาเป็นสตริง */

const UNKNOWN = "ไม่ระบุ"

/** ตัวเลขจาก PostgREST/RPC มาได้ทั้ง number, string และ null — บังคับให้เป็นเลขเสมอ */
function num(v: number | string | null | undefined): number {
  return Number(v ?? 0) || 0
}

function label(v: string | null | undefined): string {
  return v?.trim() || UNKNOWN
}

/** เรียงจากก้อนใหญ่ลงเล็ก · ยอดเท่ากันเรียงตามชื่อ เพื่อให้ลำดับคงที่ทุกครั้งที่โหลดหน้า */
function byAmountThenLabel<T extends { amount: number; label: string }>(a: T, b: T) {
  return b.amount - a.amount || a.label.localeCompare(b.label)
}

/** amount/cash_received เป็น nullable ตาม generated types ของ view แม้ข้อมูลจริงไม่เคยว่าง
 *  — รับ null ไว้เลยดีกว่าให้ผู้เรียกต้อง cast ทิ้งความปลอดภัยของ type */
export type PaymentLineRow = { method: string | null; amount: number | string | null }
export type TopupRow = {
  payment_method: string | null
  cash_received: number | string | null
  tier?: string | null
}

export type CashChannel = {
  method: string
  /** เงินจากบิลค่าบริการ */
  bills: number
  /** เงินจากการขายแพ็กเกจสมาชิก */
  topups: number
  total: number
}

/**
 * เงินเข้าบัญชีแยกตามช่องทาง พร้อมบอกที่มาของแต่ละช่องทาง
 *
 * เดิมหน้ารายงานบวกบิลกับแพ็กเกจรวมกันในช่องทางเดียว ทำให้กระทบยอดกับสลิปไม่ได้:
 * ยอด QR ก้อนเดียวอาจเป็นค่าบริการหน้าร้าน 147,013 + ขายแพ็กเกจ 10,000 ปนกันอยู่
 * (ตัวเลขจริง 1-20 ก.ย. 2569) ซึ่งทีมบัญชีต้องแยกให้ออกเวลาเทียบกับ statement
 */
export function cashInBreakdown(
  bills: PaymentLineRow[],
  topups: TopupRow[]
): { rows: CashChannel[]; billsTotal: number; topupsTotal: number; total: number } {
  const acc = new Map<string, { bills: number; topups: number }>()
  const get = (m: string) => {
    const cur = acc.get(m) ?? { bills: 0, topups: 0 }
    acc.set(m, cur)
    return cur
  }

  let billsTotal = 0
  for (const b of bills) {
    const amount = num(b.amount)
    get(label(b.method)).bills += amount
    billsTotal += amount
  }

  let topupsTotal = 0
  for (const t of topups) {
    const amount = num(t.cash_received)
    get(label(t.payment_method)).topups += amount
    topupsTotal += amount
  }

  const rows = [...acc.entries()]
    .map(([method, v]) => ({ ...v, method, total: v.bills + v.topups }))
    .sort((a, b) => b.total - a.total || a.method.localeCompare(b.method))

  return { rows, billsTotal, topupsTotal, total: billsTotal + topupsTotal }
}

export type GroupRow = { label: string; amount: number; count: number }

export type TopupSummary = {
  total: number
  /** จำนวนใบเติม (ไม่ใช่จำนวนคน — คนเดียวเติมหลายใบได้) */
  count: number
  byMethod: GroupRow[]
  byTier: GroupRow[]
}

/** ยอดขายแพ็กเกจสมาชิกในช่วงนั้น แยกตามช่องทางจ่ายและระดับแพ็กเกจ
 *  ยอดนี้ไม่ใช่รายได้ (เป็นภาระให้บริการในอนาคต) แต่เป็นเงินสดที่เข้าบัญชีจริงในช่วงนั้น */
export function topupBreakdown(topups: TopupRow[]): TopupSummary {
  const group = (keyOf: (t: TopupRow) => string): GroupRow[] => {
    const m = new Map<string, GroupRow>()
    for (const t of topups) {
      const key = keyOf(t)
      const cur = m.get(key) ?? { label: key, amount: 0, count: 0 }
      cur.amount += num(t.cash_received)
      cur.count += 1
      m.set(key, cur)
    }
    return [...m.values()].sort(byAmountThenLabel)
  }

  return {
    total: topups.reduce((s, t) => s + num(t.cash_received), 0),
    count: topups.length,
    byMethod: group((t) => label(t.payment_method)),
    byTier: group((t) => label(t.tier)),
  }
}

export type MemberMoneySplit = {
  volume: number
  /** ส่วนของยอดใช้บริการที่ลูกค้าจ่ายด้วยเงินใหม่ในช่วงนั้น */
  freshMoney: number
  /** ส่วนที่ตัดจากเครดิตที่ซื้อไว้ก่อนหน้า — ร้านได้เงินก้อนนี้ไปแล้วในอดีต */
  creditUsed: number
  /** สัดส่วนเครดิตเก่าในยอดใช้บริการ (%) ปัดเป็นจำนวนเต็ม */
  creditPct: number
  topupIn: number
  /** เงินสดที่เข้าร้านในช่วงนั้นโดยประมาณ = เงินใหม่ + ขายแพ็กเกจ
   *  "โดยประมาณ" เพราะนับตามวันใช้บริการ/วันเติม ส่วนเงินเข้าบัญชีจริงขึ้นกับรอบตัดบัตร */
  cashIn: number
}

/** แยกยอดใช้บริการเป็น "เงินใหม่" กับ "เครดิตเก่า"
 *  เครดิตที่ใช้เกินยอดขาย (ข้อมูลเพี้ยน) ต้องไม่ทำให้เงินใหม่ติดลบ — ตรึงที่ 0 */
export function memberMoneySplit(input: {
  volume: number | string | null
  creditUsed: number | string | null
  topupIn: number | string | null
}): MemberMoneySplit {
  const volume = num(input.volume)
  const creditUsed = num(input.creditUsed)
  const topupIn = num(input.topupIn)
  const freshMoney = Math.max(0, volume - creditUsed)
  return {
    volume,
    freshMoney,
    creditUsed,
    creditPct: volume <= 0 ? 0 : Math.min(100, Math.round((creditUsed / volume) * 100)),
    topupIn,
    cashIn: freshMoney + topupIn,
  }
}
