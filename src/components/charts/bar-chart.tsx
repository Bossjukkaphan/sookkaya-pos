import { barGeometry, type Point } from "@/lib/chart"

const W = 320
const H = 120

/**
 * กราฟแท่ง เรนเดอร์เป็น SVG ฝั่ง server — ไม่ต้องเป็น client component
 * และไม่ต้องโหลดไลบรารีกราฟ · ชี้ค้างที่แท่งจะเห็นค่าจาก <title>
 */
export function BarChart({
  points,
  format,
  color = "#059669",
}: {
  points: Point[]
  format: (value: number) => string
  color?: string
}) {
  const bars = barGeometry(points, W, H)

  if (bars.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">ยังไม่มีข้อมูล</p>
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-32 w-full"
        role="img"
        aria-label="กราฟแท่ง"
      >
        {bars.map((b) => (
          <rect
            key={b.label}
            x={b.x}
            y={b.y}
            width={b.w}
            height={Math.max(b.h, 1)}
            rx={2}
            fill={b.value < 0 ? "#dc2626" : color}
          >
            <title>{`${b.label} — ${format(b.value)}`}</title>
          </rect>
        ))}
      </svg>
      <div className="flex text-[10px] text-slate-500">
        {bars.map((b) => (
          <span key={b.label} className="flex-1 text-center">
            {b.label}
          </span>
        ))}
      </div>
    </div>
  )
}
