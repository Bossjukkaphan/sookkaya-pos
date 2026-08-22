/** แจกแจงกลุ่มลูกค้า (เพศ/ช่วงอายุ/สัญชาติ) จากบิลจริง — หัวใจของแท็บ "กลุ่มลูกค้า"
 *
 *  กติกาที่ตายตัว (สเปก 2026-08-21):
 *  · ประชากร = ลูกค้ายูนีคที่มีบิลในชุดที่ส่งเข้ามา (บิลไม่ระบุชื่อรายงานแยก)
 *  · รายได้ต่อบิล = coalesce(revenue_recognize, net_amount) — กติกากลางของทั้งระบบ
 *  · "ไม่ทราบ" เป็นแถวจริงเสมอและอยู่ท้ายลิสต์ — เห็นทั้งภาพและช่องว่างพร้อมกัน
 *  · % ความครอบคลุมนับจากประชากรที่มีบิล ไม่ใช่ลูกค้าทั้งระบบ */

const AGE_ORDER = ["ต่ำกว่า 20", "20-29", "30-39", "40-49", "50-59", "60+"] as const
const UNKNOWN = "ไม่ทราบ"

/** อายุเต็มปี ณ วันนี้ (เขตเวลาร้านคือคนส่ง todayIso เข้ามา) — เทียบเดือน/วันแบบ tuple
 *  ปีไม่มี 29 ก.พ.: (2,29) > (2,28) และ < (3,1) จึงครบรอบเมื่อถึง 1 มี.ค. โดยธรรมชาติ
 *  ตรงกับพฤติกรรม daysUntilBirthday ใน src/lib/crm.ts */
export function ageBucket(birthday: string | null, todayIso: string): string | null {
  if (!birthday) return null
  const [by, bm, bd] = birthday.split("-").map(Number)
  const [ty, tm, td] = todayIso.split("-").map(Number)
  if (!by || !bm || !bd) return null
  let age = ty - by
  if (tm < bm || (tm === bm && td < bd)) age -= 1
  if (age < 20) return AGE_ORDER[0]
  if (age < 30) return AGE_ORDER[1]
  if (age < 40) return AGE_ORDER[2]
  if (age < 50) return AGE_ORDER[3]
  if (age < 60) return AGE_ORDER[4]
  return AGE_ORDER[5]
}

export type GroupStat = {
  label: string
  customers: number
  revenue: number
  avgPerCustomer: number
  avgVisits: number
}

export type DemographicsResult = {
  population: number
  unnamedBills: number
  genderKnownPct: number
  ageKnownPct: number
  gender: GroupStat[]
  age: GroupStat[]
  nationality: GroupStat[]
}

type CustomerRow = {
  id: string
  gender: string | null
  birthday: string | null
  nationality: string | null
}
type BillRow = {
  customer_id: string | null
  net_amount: number | string
  revenue_recognize: number | string | null
}

export function demographicBreakdown(
  customers: CustomerRow[],
  bills: BillRow[],
  todayIso: string
): DemographicsResult {
  const custById = new Map(customers.map((c) => [c.id, c]))

  // ยอด/จำนวนครั้งต่อลูกค้า — รวมก่อนแล้วค่อยแจกเข้ากลุ่ม (ลูกค้าหนึ่งคนนับครั้งเดียวต่อมิติ)
  const perCustomer = new Map<string, { revenue: number; visits: number }>()
  let unnamedBills = 0
  for (const b of bills) {
    if (!b.customer_id) {
      unnamedBills++
      continue
    }
    const revenue = Number(b.revenue_recognize ?? b.net_amount) || 0
    const cur = perCustomer.get(b.customer_id) ?? { revenue: 0, visits: 0 }
    cur.revenue += revenue
    cur.visits += 1
    perCustomer.set(b.customer_id, cur)
  }

  const population = perCustomer.size
  if (population === 0) {
    return {
      population: 0, unnamedBills, genderKnownPct: 0, ageKnownPct: 0,
      gender: [], age: [], nationality: [],
    }
  }

  const round1 = (n: number) => Math.round(n * 10) / 10
  const build = (labelOf: (c: CustomerRow | undefined) => string | null) => {
    const groups = new Map<string, { customers: number; revenue: number; visits: number }>()
    for (const [customerId, stat] of perCustomer) {
      const label = labelOf(custById.get(customerId)) ?? UNKNOWN
      const g = groups.get(label) ?? { customers: 0, revenue: 0, visits: 0 }
      g.customers += 1
      g.revenue += stat.revenue
      g.visits += stat.visits
      groups.set(label, g)
    }
    return groups
  }
  const toStats = (
    groups: Map<string, { customers: number; revenue: number; visits: number }>,
    order: (a: string, b: string) => number
  ): GroupStat[] =>
    [...groups.entries()]
      .sort(([a], [b]) => {
        // "ไม่ทราบ" อยู่ท้ายเสมอ ไม่ว่าเรียงแบบไหน
        if (a === UNKNOWN) return 1
        if (b === UNKNOWN) return -1
        return order(a, b)
      })
      .map(([label, g]) => ({
        label,
        customers: g.customers,
        revenue: Math.round(g.revenue),
        avgPerCustomer: Math.round(g.revenue / g.customers),
        avgVisits: round1(g.visits / g.customers),
      }))

  const byCount = (groups: Map<string, { customers: number }>) =>
    (a: string, b: string) =>
      (groups.get(b)!.customers - groups.get(a)!.customers) || a.localeCompare(b)
  const byAgeOrder = (a: string, b: string) =>
    AGE_ORDER.indexOf(a as (typeof AGE_ORDER)[number]) -
    AGE_ORDER.indexOf(b as (typeof AGE_ORDER)[number])

  const genderGroups = build((c) => c?.gender?.trim() || null)
  const ageGroups = build((c) => ageBucket(c?.birthday ?? null, todayIso))
  const nationGroups = build((c) => c?.nationality?.trim() || null)

  const knownPct = (groups: Map<string, { customers: number }>) =>
    Math.round(((population - (groups.get(UNKNOWN)?.customers ?? 0)) / population) * 100)

  return {
    population,
    unnamedBills,
    genderKnownPct: knownPct(genderGroups),
    ageKnownPct: knownPct(ageGroups),
    gender: toStats(genderGroups, byCount(genderGroups)),
    age: toStats(ageGroups, byAgeOrder),
    nationality: toStats(nationGroups, byCount(nationGroups)),
  }
}
