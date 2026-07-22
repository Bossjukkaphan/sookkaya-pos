import { Card, CardContent } from "@/components/ui/card"
import { InfoDot } from "@/components/info-dot"

/**
 * โทนสีตัวเลขตามความหมายเดียวกันทุกหน้า:
 * good = กำไร/บวก (เขียว) · bad = ขาดทุน/เกินงบ (แดง) · warn = จุดที่ต้องจับตา (ส้มอำพัน)
 */
const TONE_CLASS = {
  normal: "text-slate-900",
  good: "text-emerald-700",
  bad: "text-red-700",
  warn: "text-amber-600",
} as const

export type StatTone = keyof typeof TONE_CLASS

/** การ์ด KPI ใบเล็กโทนสว่าง — ใช้ซ้ำได้ทุกหน้า */
export function StatCard({
  label,
  value,
  hint,
  tone = "normal",
  info,
}: {
  label: string
  value: string
  hint?: string
  tone?: StatTone
  info?: string
}) {
  return (
    <Card>
      <CardContent className="py-3.5">
        <div className="flex items-center gap-1">
          <p className="text-xs text-slate-500">{label}</p>
          {info && <InfoDot text={info} />}
        </div>
        <p className={`text-lg font-bold ${TONE_CLASS[tone]}`}>{value}</p>
        {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
      </CardContent>
    </Card>
  )
}
