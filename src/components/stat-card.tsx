import { Card, CardContent } from "@/components/ui/card"

/** การ์ด KPI ใบเล็กโทนสว่าง — ใช้ซ้ำได้ทุกหน้าในรอบ 2-4 */
export function StatCard({
  label,
  value,
  hint,
  tone = "normal",
}: {
  label: string
  value: string
  hint?: string
  tone?: "normal" | "bad"
}) {
  return (
    <Card>
      <CardContent className="py-3.5">
        <p className="text-xs text-slate-500">{label}</p>
        <p
          className={`text-lg font-bold ${
            tone === "bad" ? "text-red-700" : "text-slate-900"
          }`}
        >
          {value}
        </p>
        {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
      </CardContent>
    </Card>
  )
}
