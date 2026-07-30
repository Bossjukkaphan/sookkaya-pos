/**
 * บิลชุด: หลายรายการบริการของลูกค้าคนเดียวผูกกันด้วย sales.bill_id
 * (ว่าง = บิลรายการเดียวแบบเดิม) — ดู docs/superpowers/specs/2026-07-25-multi-item-bill-design.md
 */

/** จัดกลุ่มแถวขายเป็นบิล: bill_id เดียวกันรวมใบเดียว ตำแหน่งบิล = แถวแรกที่เจอ */
export function groupSalesByBill<T extends { id: string; bill_id: string | null }>(
  rows: T[]
): { key: string; items: T[] }[] {
  const groups: { key: string; items: T[] }[] = []
  const byBill = new Map<string, { key: string; items: T[] }>()
  for (const row of rows) {
    if (!row.bill_id) {
      groups.push({ key: row.id, items: [row] })
      continue
    }
    const existing = byBill.get(row.bill_id)
    if (existing) {
      existing.items.push(row)
    } else {
      const group = { key: row.bill_id, items: [row] }
      byBill.set(row.bill_id, group)
      groups.push(group)
    }
  }
  return groups
}

/** ยอดสุทธิรวมทั้งบิล */
export function billTotal(items: { net_amount: number }[]): number {
  return items.reduce((sum, i) => sum + (Number(i.net_amount) || 0), 0)
}

/**
 * เฉลี่ยเครดิตที่ตัดลงแต่ละรายการของบิลชุด ตามสัดส่วน net ของรายการ (สเปกแบ่งชำระ ข้อ 6)
 * คิดเป็นสตางค์ (จำนวนเต็ม) กันเศษทศนิยมลอย — การันตี: ผลรวม = min(credit, ยอดบิล) เป๊ะ
 * และไม่มีช่องไหนเกิน net ของตัวเอง (server หนีบ credit_used ≤ net ต่อแถว ถ้าเกินเงินจะหาย)
 */
export function allocateCredit(nets: number[], credit: number): number[] {
  const toSatang = (n: number) => Math.round(n * 100)
  const netS = nets.map(toSatang)
  const totalS = netS.reduce((s, n) => s + n, 0)
  const useS = Math.min(Math.max(0, toSatang(credit)), totalS)
  if (useS <= 0 || totalS <= 0) return nets.map(() => 0)
  const out = netS.map((n) => Math.min(n, Math.floor((useS * n) / totalS)))
  let left = useS - out.reduce((s, n) => s + n, 0)
  // เศษจากการปัด — ไล่เติมจากรายการท้ายที่ยังมีที่ว่าง ให้ผลรวมตรงเป๊ะ
  for (let i = out.length - 1; i >= 0 && left > 0; i--) {
    const add = Math.min(left, netS[i] - out[i])
    out[i] += add
    left -= add
  }
  return out.map((s) => s / 100)
}
