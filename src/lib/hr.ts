/**
 * สรุปวันทำงานของทีม (หน้า /team) — คำนวณจาก attendance + sales
 * ดู docs/superpowers/specs/2026-07-27-hr-workdays-summary-design.md
 */

export type AttendanceInput = {
  personId: string
  workDate: string
  checkedInAt: string
  checkedOutAt: string | null
  /** เวลาที่เดามาจากบิลย้อนหลัง ไม่ใช่การตอกบัตรจริง */
  estimated: boolean
}

export type SaleInput = {
  therapistId: string
  saleDate: string
  commission: number
  netAmount: number
  isRequest: boolean
  customerId: string | null
}

export type PersonSummary = {
  personId: string
  name: string
  daysWorked: number
  daysAbsent: number
  hours: number
  hoursPerDay: number
  hasEstimatedTime: boolean
  bills: number
  revenue: number
  commission: number
  commissionPerDay: number
  requests: number
  /** สัดส่วนบิลที่ลูกค้าขอชื่อคนนี้ (%) */
  requestPct: number
  /** ลูกค้าที่กลับมาหาคนนี้ซ้ำ (≥2 ครั้งในช่วง) */
  repeatCustomers: number
  /** วันหยุดตามแผน/ลา ในช่วงที่ดู (เฟส 2) — แยกจากขาดงาน */
  daysPlannedOff: number
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function summarizeWorkdays({
  people,
  attendance,
  sales,
  openDays,
  plannedOffDays = {},
}: {
  people: { id: string; name: string }[]
  attendance: AttendanceInput[]
  sales: SaleInput[]
  /** วันที่ร้านเปิดในช่วงที่ดู (มีบิลอย่างน้อย 1 ใบ) */
  openDays: string[]
  /** เฟส 2: วันที่วางแผนหยุดไว้ต่อคน — ไม่นับเป็นขาดงาน */
  plannedOffDays?: Record<string, string[]>
}): PersonSummary[] {
  return people.map((person) => {
    const mine = attendance.filter((a) => a.personId === person.id)
    const workedDays = new Set(mine.map((a) => a.workDate))

    // ขาดงานนับเฉพาะช่วงที่คนนี้ยังทำงานอยู่จริง — คนเข้าใหม่กลางเดือนหรือ
    // ลาออกไปแล้ว ไม่ควรถูกนับขาดในวันที่เขายังไม่มา/ไม่อยู่แล้ว
    const sortedDays = [...workedDays].sort()
    const firstDay = sortedDays[0]
    const lastDay = sortedDays[sortedDays.length - 1]
    const plannedOff = new Set(plannedOffDays[person.id] ?? [])
    const daysAbsent =
      sortedDays.length === 0
        ? 0
        : openDays.filter(
            (d) =>
              d >= firstDay && d <= lastDay && !workedDays.has(d) && !plannedOff.has(d)
          ).length

    const hours = mine.reduce((sum, a) => {
      if (!a.checkedOutAt) return sum
      const ms = Date.parse(a.checkedOutAt) - Date.parse(a.checkedInAt)
      return ms > 0 ? sum + ms / 3_600_000 : sum
    }, 0)

    const mySales = sales.filter((s) => s.therapistId === person.id)
    const commission = mySales.reduce((sum, s) => sum + s.commission, 0)
    const requests = mySales.filter((s) => s.isRequest).length

    // ลูกค้าที่กลับมาหาคนนี้ซ้ำ — บิลที่ไม่ผูกชื่อลูกค้าเอามานับไม่ได้
    const visitsByCustomer = new Map<string, number>()
    for (const s of mySales) {
      if (!s.customerId) continue
      visitsByCustomer.set(s.customerId, (visitsByCustomer.get(s.customerId) ?? 0) + 1)
    }

    const daysWorked = workedDays.size
    return {
      personId: person.id,
      name: person.name,
      daysWorked,
      daysAbsent,
      hours: round1(hours),
      hoursPerDay: daysWorked > 0 ? round1(hours / daysWorked) : 0,
      hasEstimatedTime: mine.some((a) => a.estimated),
      bills: mySales.length,
      revenue: mySales.reduce((sum, s) => sum + s.netAmount, 0),
      commission,
      commissionPerDay: daysWorked > 0 ? Math.round(commission / daysWorked) : 0,
      requests,
      requestPct: mySales.length > 0 ? Math.round((requests / mySales.length) * 100) : 0,
      repeatCustomers: [...visitsByCustomer.values()].filter((v) => v >= 2).length,
      daysPlannedOff: plannedOff.size,
    }
  })
}

export type Stars = {
  topCommission: PersonSummary | null
  topRequests: PersonSummary | null
  mostDiligent: PersonSummary | null
  topRepeat: PersonSummary | null
}

/** ดาวเด่นประจำช่วง — ใช้ประกาศหน้าร้าน/ให้รางวัล (ไม่มีข้อมูล = ไม่โชว์การ์ด) */
export function pickStars(rows: PersonSummary[]): Stars {
  const best = (
    valueOf: (r: PersonSummary) => number,
    tieBreak: (r: PersonSummary) => number = () => 0
  ): PersonSummary | null => {
    const eligible = rows.filter((r) => valueOf(r) > 0)
    if (eligible.length === 0) return null
    return eligible.reduce((best, r) => {
      const diff = valueOf(r) - valueOf(best)
      if (diff > 0) return r
      if (diff === 0 && tieBreak(r) > tieBreak(best)) return r
      return best
    })
  }

  // ขยันที่สุด: ขาดน้อยสุดในกลุ่มคนที่มาทำงานจริง — เสมอกันเอาคนที่มามากวันกว่า
  const worked = rows.filter((r) => r.daysWorked > 0)
  const mostDiligent =
    worked.length === 0
      ? null
      : worked.reduce((best, r) => {
          if (r.daysAbsent < best.daysAbsent) return r
          if (r.daysAbsent === best.daysAbsent && r.daysWorked > best.daysWorked) return r
          return best
        })

  return {
    topCommission: best((r) => r.commission),
    topRequests: best((r) => r.requests, (r) => r.requestPct),
    mostDiligent,
    topRepeat: best((r) => r.repeatCustomers),
  }
}
