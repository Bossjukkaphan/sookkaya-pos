"use client"

/**
 * ช่องเลือกเวลาแบบ 24 ชม. (ชั่วโมง:นาที เป็น dropdown สองช่อง)
 * — แทน <input type="time"> ที่บนมือถือโชว์ AM/PM ตามภาษาเครื่อง
 *   เคยทำพนักงานคีย์ 00:30 ทั้งที่ตั้งใจ 12:30 → การ์ดคิวล่องหน
 * ค่า value ที่ไม่ตรงกับตัวเลือก (เช่นนาทีจากเวลาเริ่มนวดจริง) ถูกแทรกเป็นตัวเลือกเพิ่ม
 * เพื่อไม่ทำข้อมูลเดิมเพี้ยนตอนเปิดฟอร์มแก้ไข
 */
export function Time24Field({
  value,
  onChange,
  startHour = 10,
  endHour = 23,
  minuteStep = 5,
  ariaLabel,
  className = "",
}: {
  /** "HH:MM" */
  value: string
  onChange: (v: string) => void
  startHour?: number
  endHour?: number
  minuteStep?: number
  ariaLabel?: string
  className?: string
}) {
  const [rawH, rawM] = value.split(":")
  const hour = /^\d{1,2}$/.test(rawH ?? "") ? Number(rawH) : startHour
  const minute = /^\d{1,2}$/.test(rawM ?? "") ? Number(rawM) : 0

  const hours = Array.from(
    { length: endHour - startHour + 1 },
    (_, i) => startHour + i
  )
  if (!hours.includes(hour)) hours.unshift(hour)

  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep)
  if (!minutes.includes(minute)) {
    minutes.push(minute)
    minutes.sort((a, b) => a - b)
  }

  const pad = (n: number) => String(n).padStart(2, "0")
  const sel =
    "h-11 rounded-md border border-input bg-transparent px-2 text-base shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <select
        className={sel}
        value={hour}
        onChange={(e) => onChange(`${pad(Number(e.target.value))}:${pad(minute)}`)}
        aria-label={ariaLabel ? `${ariaLabel} (ชั่วโมง)` : "ชั่วโมง"}
      >
        {hours.map((h) => (
          <option key={h} value={h}>
            {pad(h)}
          </option>
        ))}
      </select>
      <span className="text-slate-500">:</span>
      <select
        className={sel}
        value={minute}
        onChange={(e) => onChange(`${pad(hour)}:${pad(Number(e.target.value))}`)}
        aria-label={ariaLabel ? `${ariaLabel} (นาที)` : "นาที"}
      >
        {minutes.map((m) => (
          <option key={m} value={m}>
            {pad(m)}
          </option>
        ))}
      </select>
      <span className="text-sm text-slate-500">น.</span>
    </div>
  )
}
