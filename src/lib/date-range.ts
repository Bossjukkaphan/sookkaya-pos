export type DateRange = { from: string; to: string }

export type RangePreset = "today" | "last7" | "thisMonth" | "lastMonth"

export const PRESET_LABELS: Record<RangePreset, string> = {
  today: "วันนี้",
  last7: "7 วัน",
  thisMonth: "เดือนนี้",
  lastMonth: "เดือนที่แล้ว",
}

/**
 * ทุกฟังก์ชันทำงานบนสตริง YYYY-MM-DD และใช้ UTC ภายใน
 * เพื่อไม่ให้ timezone ของเครื่องมาเลื่อนวัน — วันที่ "วันนี้" ต้องส่งเข้ามา
 * จาก todayInShopTz() ใน src/lib/datetime.ts เสมอ
 */
function toUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(iso: string, days: number): string {
  const d = toUtc(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toIso(d)
}

export function rangeFromPreset(preset: RangePreset, today: string): DateRange {
  const [year, month] = today.split("-").map(Number)

  switch (preset) {
    case "today":
      return { from: today, to: today }
    case "last7":
      return { from: addDays(today, -6), to: today }
    case "thisMonth":
      return { from: `${today.slice(0, 7)}-01`, to: today }
    case "lastMonth": {
      const firstOfThis = new Date(Date.UTC(year, month - 1, 1))
      const lastOfPrev = new Date(firstOfThis)
      lastOfPrev.setUTCDate(0)
      return { from: `${toIso(lastOfPrev).slice(0, 7)}-01`, to: toIso(lastOfPrev) }
    }
  }
}

export function rangeLengthDays(range: DateRange): number {
  const ms = toUtc(range.to).getTime() - toUtc(range.from).getTime()
  return Math.round(ms / 86_400_000) + 1
}

/** ช่วงก่อนหน้าที่ยาวเท่ากัน สำหรับเทียบว่าดีขึ้นหรือแย่ลง */
export function previousRange(range: DateRange): DateRange {
  const length = rangeLengthDays(range)
  return {
    from: addDays(range.from, -length),
    to: addDays(range.from, -1),
  }
}
