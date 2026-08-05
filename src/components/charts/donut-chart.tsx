"use client"

import Link from "next/link"

import type { DonutSlice } from "@/lib/chart"

/** ชิ้นที่พร้อมวาดแล้ว — href กับสีคำนวณมาจากฝั่ง server (ส่งฟังก์ชันข้ามมาไม่ได้) */
export type DonutSliceLink = DonutSlice & { href: string; color: string }

/** สีวนตามลำดับชิ้น ไม่ผูกกับชื่อหมวด เพราะหมวดแก้ชื่อได้จากหน้าตั้งค่า */
export const DONUT_COLORS = [
  "#7F77DD", "#1D9E75", "#D85A30", "#378ADD",
  "#BA7517", "#D4537E", "#639922", "#888780",
]

const R = 40
const CIRC = 2 * Math.PI * R

/**
 * วงกลมสรุปสัดส่วน — แต่ละชิ้นเป็นลิงก์ กดแล้วกรองรายการตามหมวดนั้น
 * วาดด้วย stroke-dasharray บนวงกลมซ้อนกัน ไม่ใช้ arc path เพราะได้ผลเท่ากันแต่คณิตง่ายกว่า
 */
export function DonutChart({
  slices,
  size = 120,
  activeLabel = null,
}: {
  slices: DonutSliceLink[]
  size?: number
  activeLabel?: string | null
}) {
  if (slices.length === 0) return null

  return (
    <svg
      viewBox="0 0 100 100"
      style={{ width: size, height: size }}
      className="block"
      role="img"
      aria-label="สัดส่วนรายจ่ายแยกตามหมวด"
    >
      {slices.map((s) => {
        const active = activeLabel === s.label
        return (
          <Link key={s.label} href={s.href} aria-label={`${s.label} ${s.pct.toFixed(1)}%`}>
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={active ? 24 : 18}
              strokeDasharray={`${(s.pct / 100) * CIRC} ${CIRC}`}
              // −90 องศาเพื่อให้ชิ้นแรกเริ่มที่หัวนาฬิกา ไม่ใช่ 3 นาฬิกา
              transform={`rotate(${(s.startPct / 100) * 360 - 90} 50 50)`}
            />
          </Link>
        )
      })}
    </svg>
  )
}
