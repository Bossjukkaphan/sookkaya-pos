import { groupedBarsWithLine, type Point } from "@/lib/chart"

const W = 320
const H = 120

export type Series = { name: string; color: string; points: Point[] }

/**
 * กราฟแท่งหลายชุดวางข้างกัน พร้อมเส้นทับหนึ่งเส้น เรนเดอร์เป็น SVG ฝั่ง server
 * ทุกชุดและเส้นใช้สเกลเดียวกัน จึงเทียบความสูงกันได้ตรงๆ
 */
export function GroupedBarChart({
  series,
  line,
  format,
}: {
  series: Series[]
  line?: { name: string; color: string; points: Point[] }
  format: (value: number) => string
}) {
  const { bars, path } = groupedBarsWithLine(
    series.map((s) => s.points),
    line?.points ?? [],
    W,
    H
  )

  const labels = series.reduce<Point[]>(
    (longest, s) => (s.points.length > longest.length ? s.points : longest),
    line?.points ?? []
  )

  if (labels.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">ยังไม่มีข้อมูล</p>
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-32 w-full"
        role="img"
        aria-label="กราฟแท่งเปรียบเทียบ"
      >
        {/* key เป็น index ได้เพราะลำดับชุดและลำดับแท่งคงที่เสมอ ไม่มีการกรองระหว่างทาง */}
        {bars.map((group, s) =>
          group.map((b, i) => (
            <rect
              key={`${s}-${i}`}
              x={b.x}
              y={b.y}
              width={b.w}
              height={Math.max(b.h, 1)}
              rx={1.5}
              fill={series[s].color}
            >
              <title>{`${b.label} — ${series[s].name} ${format(b.value)}`}</title>
            </rect>
          ))
        )}
        {line && path && (
          <path
            d={path}
            fill="none"
            stroke={line.color}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}
      </svg>
      <div className="flex text-[10px] text-slate-500">
        {labels.map((p, i) => (
          <span key={i} className="flex-1 text-center">
            {p.label}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            {s.name}
          </span>
        ))}
        {line && (
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-0.5 w-3 rounded"
              style={{ backgroundColor: line.color }}
            />
            {line.name}
          </span>
        )}
      </div>
    </div>
  )
}
