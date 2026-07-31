"use client"

import { useRouter } from "next/navigation"

import { CollectDueDialog } from "./collect-due-dialog"
import { formatBaht } from "@/lib/constants"

/** เกณฑ์ถือว่า "มีค้างรับ/เกินรับ" — ตัดเศษปัดเลขทศนิยมลอยของ view v_bill_due ทิ้ง */
const DUE_EPSILON = 0.005

/**
 * ป้ายค้างรับ/เกินรับเฉยๆ ไม่มีปุ่มกด — ใช้ได้ทุกที่รวมในแถว/การ์ดที่ตัวเองเป็น
 * `<button>` อยู่แล้ว (เช่นแถวบิลหน้า /history) เพราะ DueBadge ด้านล่างมีปุ่มซ้อนอยู่ข้างใน
 * ห้ามวางปุ่มซ้อนปุ่ม (invalid HTML + click ชนกัน)
 * due≈0 ไม่ render อะไรเลย ไม่ให้บิลปกติรกป้าย
 */
export function DueChip({ due }: { due: number }) {
  if (Math.abs(due) <= DUE_EPSILON) return null
  if (due < 0) {
    return (
      <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-orange-700">
        เกินรับ {formatBaht(Math.abs(due))} ฿
      </span>
    )
  }
  return (
    <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-red-700">
      ค้างรับ {formatBaht(due)} ฿
    </span>
  )
}

/**
 * ป้ายค้างรับ/เกินรับของบิล — ใช้ร่วมบนแถวบิลหน้า /today และรายละเอียดบิลหน้า /history
 * ค้างรับ (due>0) โชว์ป้ายแดง + ปุ่ม "เก็บเพิ่ม" เปิด CollectDueDialog ในตัว
 * เกินรับ (due<0) โชว์ป้ายส้มเฉยๆ — ไม่มีปุ่มเก็บเพิ่ม เพราะไม่มีอะไรให้เก็บเพิ่ม
 * due≈0 ไม่ render อะไรเลย ไม่ให้บิลปกติรกป้าย
 * ⚠️ มีปุ่มซ้อนอยู่ข้างใน (ตอน due>0) — ห้ามวางไว้ในอิลิเมนต์ที่เป็น `<button>` เอง ใช้ DueChip แทน
 */
export function DueBadge({ billKey, due }: { billKey: string; due: number }) {
  const router = useRouter()

  if (Math.abs(due) <= DUE_EPSILON) return null
  if (due < 0) return <DueChip due={due} />

  return (
    <span className="inline-flex shrink-0 flex-wrap items-center gap-1.5">
      <DueChip due={due} />
      <CollectDueDialog billKey={billKey} due={due} onDone={() => router.refresh()} />
    </span>
  )
}
