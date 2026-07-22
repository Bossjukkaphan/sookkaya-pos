"use client"

import { groupedBarsWithLine, type Point } from "@/lib/chart"
import {
  SlotTip,
  fmtValue,
  useMeasuredWidth,
  useSlotTooltip,
} from "@/components/charts/slot-tooltip"

// สูงเท่า h-32 (128px) เพื่อให้ viewBox : พิกเซลจริง = 1:1 ไม่มีการยืดภาพ
const H = 128

export type Series = { name: string; color: string; points: Point[] }

/**
 * กราฟแท่งหลายชุดวางข้างกัน พร้อมเส้นทับหนึ่งเส้น — ทุกชุดและเส้นใช้สเกลเดียวกัน
 * แตะ/ชี้ช่องไหนจะเห็นค่าของทุกชุดในช่องนั้นพร้อมกัน (เทียบรายได้-รายจ่าย-กำไรได้ในกล่องเดียว)
 */
export function GroupedBarChart({
  series,
  line,
  unit = "",
}: {
  series: Series[]
  line?: { name: string; color: string; points: Point[] }
  /** หน่วยต่อท้ายค่า เช่น " ฿" — เป็น string เพราะฟังก์ชันส่งจาก server component ไม่ได้ */
  unit?: string
}) {
  const { ref: boxRef, width: W } = useMeasuredWidth()
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

  const { svgRef, active, handlers } = useSlotTooltip(labels.length)

  if (labels.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">ยังไม่มีข้อมูล</p>
  }

  const slot = W / labels.length

  // แถวในกล่องลอย: ทุกชุดแท่ง + เส้น (ถ้าช่องนั้นมีข้อมูล)
  const tipRows =
    active === null
      ? []
      : [
          ...series.map((s) => ({
            name: s.name,
            color: s.color,
            value: s.points[active]?.value,
            isLine: false,
          })),
          ...(line
            ? [
                {
                  name: line.name,
                  color: line.color,
                  value: line.points[active]?.value,
                  isLine: true,
                },
              ]
            : []),
        ].filter((r) => r.value !== undefined)

  return (
    <div ref={boxRef} className="relative">
      {active !== null && tipRows.length > 0 && (
        <SlotTip centerPct={((active + 0.5) / labels.length) * 100}>
          <span className="font-semibold">{labels[active].label}</span>
          {tipRows.map((r) => (
            <span key={r.name} className="flex items-center gap-1.5">
              <span
                className={`inline-block ${r.isLine ? "h-0.5 w-2.5 rounded" : "h-2 w-2 rounded-sm"}`}
                style={{ backgroundColor: r.color }}
              />
              {r.name}{" "}
              <span className={r.value! < 0 ? "font-medium text-red-600" : "font-medium"}>
                {fmtValue(r.value!, unit)}
              </span>
            </span>
          ))}
        </SlotTip>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-32 w-full touch-none select-none"
        role="img"
        aria-label="กราฟแท่งเปรียบเทียบ"
        {...handlers}
      >
        {active !== null && (
          <rect x={active * slot} y={0} width={slot} height={H} fill="#f1f5f9" />
        )}
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
              opacity={active !== null && active !== i ? 0.45 : 1}
            />
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
          <span
            key={i}
            className={`flex-1 text-center ${active === i ? "font-semibold text-slate-800" : ""}`}
          >
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
