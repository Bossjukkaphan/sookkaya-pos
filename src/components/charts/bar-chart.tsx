"use client"

import { barGeometry, type Point } from "@/lib/chart"
import {
  SlotTip,
  fmtValue,
  useMeasuredWidth,
  useSlotTooltip,
} from "@/components/charts/slot-tooltip"

// สูงเท่า h-32 (128px) เพื่อให้ viewBox : พิกเซลจริง = 1:1 ไม่มีการยืดภาพ
const H = 128

/**
 * กราฟแท่งแบบโต้ตอบ — แตะหรือชี้ช่องไหนจะเห็นค่าของช่องนั้นเป็นกล่องลอย
 * (เดิมใช้ <title> ของ SVG ซึ่งบนแท็บเล็ตไม่ขึ้นเลย)
 */
export function BarChart({
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
  const bars = barGeometry(points, W, H)
  const { svgRef, active, handlers } = useSlotTooltip(bars.length)

  if (bars.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">ยังไม่มีข้อมูล</p>
  }

  const slot = W / bars.length

  return (
    <div ref={boxRef} className="relative">
      {active !== null && (
        <SlotTip centerPct={((active + 0.5) / bars.length) * 100}>
          <span className="font-semibold">{bars[active].label}</span>{" "}
          <span className={bars[active].value < 0 ? "text-red-600" : ""}>
            {fmtValue(bars[active].value, unit)}
          </span>
        </SlotTip>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-32 w-full touch-none select-none"
        role="img"
        aria-label="กราฟแท่ง"
        {...handlers}
      >
        {active !== null && (
          <rect x={active * slot} y={0} width={slot} height={H} fill="#f1f5f9" />
        )}
        {/* key เป็น index ได้เพราะลำดับแท่งไม่เคยสลับหรือถูกกรอง
            ถ้าใช้ label เป็น key แล้ววันหน้าเอากราฟไปใส่ชื่อหมอหรือชื่อเมนูที่ซ้ำกันได้
            React จะ reconcile ผิดจนแท่งหายหรือสูงผิด แต่ tooltip ยังบอกค่าเดิม */}
        {bars.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={b.w}
            height={Math.max(b.h, 1)}
            rx={2}
            fill={b.value < 0 ? "#dc2626" : color}
            opacity={active !== null && active !== i ? 0.45 : 1}
          />
        ))}
      </svg>
      <div className="flex text-[10px] text-slate-500">
        {bars.map((b, i) => (
          <span
            key={i}
            className={`flex-1 text-center ${active === i ? "font-semibold text-slate-800" : ""}`}
          >
            {b.label}
          </span>
        ))}
      </div>
    </div>
  )
}
