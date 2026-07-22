"use client"

import { linePath, linearScale, type Point } from "@/lib/chart"
import {
  SlotTip,
  fmtValue,
  useMeasuredWidth,
  useSlotTooltip,
} from "@/components/charts/slot-tooltip"

// สูงเท่า h-32 (128px) เพื่อให้ viewBox : พิกเซลจริง = 1:1 ไม่มีการยืดภาพ
const H = 128

/**
 * กราฟเส้นแบบโต้ตอบ · มีเส้นศูนย์ให้เห็นเมื่อมีค่าติดลบ
 * แตะ/ชี้ตรงไหนจะเลือกจุดที่ใกล้สุดแล้วโชว์ค่าเป็นกล่องลอย
 */
export function LineChart({
  points,
  unit = "",
  color = "#059669",
}: {
  points: Point[]
  /** หน่วยต่อท้ายค่า เช่น " ฿" หรือ "%" — เป็น string เพราะฟังก์ชันส่งจาก server component ไม่ได้ */
  unit?: string
  color?: string
}) {
  const { ref: boxRef, width: W } = useMeasuredWidth()
  // จุดของกราฟเส้นอยู่ที่ขอบช่อง (i*step) ไม่ใช่กลางช่อง — ใช้โหมด nearest
  const { svgRef, active, handlers } = useSlotTooltip(points.length, "nearest")

  if (points.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">ยังไม่มีข้อมูล</p>
  }

  const scale = linearScale(points.map((p) => p.value), H)
  const d = linePath(points, W, H)
  const step = points.length > 1 ? W / (points.length - 1) : 0

  return (
    <div ref={boxRef} className="relative">
      {active !== null && (
        <SlotTip
          centerPct={points.length > 1 ? (active / (points.length - 1)) * 100 : 50}
        >
          <span className="font-semibold">{points[active].label}</span>{" "}
          <span className={points[active].value < 0 ? "text-red-600" : ""}>
            {fmtValue(points[active].value, unit)}
          </span>
        </SlotTip>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-32 w-full touch-none select-none"
        role="img"
        aria-label="กราฟเส้น"
        {...handlers}
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
        {active !== null && (
          <line
            x1={active * step}
            y1={0}
            x2={active * step}
            y2={H}
            stroke="#94a3b8"
            strokeDasharray="3 3"
          />
        )}
        <path d={d} fill="none" stroke={color} strokeWidth={2} />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={i * step}
            cy={scale.y(p.value)}
            r={active === i ? 5 : 3}
            fill={color}
          />
        ))}
      </svg>
      <div className="flex text-[10px] text-slate-500">
        {points.map((p, i) => (
          <span
            key={i}
            className={`flex-1 text-center ${active === i ? "font-semibold text-slate-800" : ""}`}
          >
            {p.label}
          </span>
        ))}
      </div>
    </div>
  )
}
