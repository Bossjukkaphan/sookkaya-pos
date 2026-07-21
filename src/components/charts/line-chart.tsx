import { linePath, linearScale, type Point } from "@/lib/chart"

const W = 320
const H = 120

/** กราฟเส้น เรนเดอร์ฝั่ง server · มีเส้นศูนย์ให้เห็นเมื่อมีค่าติดลบ */
export function LineChart({
  points,
  format,
  color = "#059669",
}: {
  points: Point[]
  format: (value: number) => string
  color?: string
}) {
  if (points.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">ยังไม่มีข้อมูล</p>
  }

  const scale = linearScale(points.map((p) => p.value), H)
  const d = linePath(points, W, H)
  const step = points.length > 1 ? W / (points.length - 1) : 0

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-32 w-full"
        role="img"
        aria-label="กราฟเส้น"
      >
        {scale.min < 0 && (
          <line
            x1={0}
            y1={scale.zeroY}
            x2={W}
            y2={scale.zeroY}
            stroke="#cbd5e1"
            strokeDasharray="3 3"
          />
        )}
        <path d={d} fill="none" stroke={color} strokeWidth={2} />
        {points.map((p, i) => (
          <circle key={p.label} cx={i * step} cy={scale.y(p.value)} r={3} fill={color}>
            <title>{`${p.label} — ${format(p.value)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex text-[10px] text-slate-500">
        {points.map((p) => (
          <span key={p.label} className="flex-1 text-center">
            {p.label}
          </span>
        ))}
      </div>
    </div>
  )
}
