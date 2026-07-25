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
