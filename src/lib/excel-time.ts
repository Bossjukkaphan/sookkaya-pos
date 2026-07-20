/**
 * แปลงค่าเวลาจากไฟล์ Excel เดิมซึ่งบันทึกไว้หลายรูปแบบปนกัน
 *
 * รูปแบบที่พบจริงในไฟล์ (2,254 แถว):
 *   10.05, 10.3  -> ชั่วโมง.นาที (ทศนิยมเติมศูนย์ทางขวา: .3 = 30 นาที)
 *   1515         -> HHMM
 *   "4.20pm"     -> 16:20
 *   0.4583       -> เศษส่วนของวันแบบ Excel
 *
 * คืน null เมื่อตีความไม่ได้ — ปล่อยว่างดีกว่าเดาผิด
 */
export function parseExcelTime(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null

  if (typeof value === "string") return parseTimeString(value)
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  if (value < 0) return null

  // เศษส่วนของวันแบบ Excel (0 = เที่ยงคืน, 0.5 = เที่ยง)
  if (value > 0 && value < 1) {
    const totalMinutes = Math.round(value * 24 * 60)
    return formatHM(Math.floor(totalMinutes / 60), totalMinutes % 60)
  }

  // HHMM เช่น 1515
  if (value >= 100) {
    const hour = Math.floor(value / 100)
    const minute = Math.round(value % 100)
    return isValidHM(hour, minute) ? formatHM(hour, minute) : null
  }

  // ชั่วโมง.นาที เช่น 10.05, 10.3
  return parseHourDotMinute(value)
}

/** ".3" หมายถึง 30 นาที ไม่ใช่ 3 นาที — ต้องเติมศูนย์ทางขวาให้ครบ 2 หลัก */
function parseHourDotMinute(value: number): string | null {
  const text = value.toString()
  const [hourPart, fracPart = ""] = text.split(".")
  const hour = Number(hourPart)
  const minute = fracPart === "" ? 0 : Number(fracPart.padEnd(2, "0").slice(0, 2))
  return isValidHM(hour, minute) ? formatHM(hour, minute) : null
}

function parseTimeString(raw: string): string | null {
  const text = raw.trim().toLowerCase()
  const match = text.match(/^(\d{1,2})[.:](\d{1,2})\s*(am|pm)?$/)
  if (!match) return null

  let hour = Number(match[1])
  const minute = Number(match[2].padEnd(2, "0").slice(0, 2))
  const meridiem = match[3]

  if (meridiem === "pm" && hour < 12) hour += 12
  if (meridiem === "am" && hour === 12) hour = 0

  return isValidHM(hour, minute) ? formatHM(hour, minute) : null
}

function isValidHM(hour: number, minute: number): boolean {
  return (
    Number.isInteger(hour) && Number.isInteger(minute) &&
    hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
  )
}

function formatHM(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}
