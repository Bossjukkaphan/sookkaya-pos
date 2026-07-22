"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

/**
 * วัดความกว้างจริงของกล่องกราฟ เพื่อให้ viewBox ตรงกับพิกเซลจริงแบบ 1:1
 * ถ้าใช้ viewBox กว้างคงที่แล้วยืดเต็มการ์ด preserveAspectRatio จะจัดกึ่งกลางภาพ
 * ทำให้แท่งเลื่อนไม่ตรงป้ายกำกับ และตำแหน่งแตะ/ชี้เพี้ยนทั้งหมด
 */
export function useMeasuredWidth(fallback = 320) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return { ref, width }
}

/**
 * เครื่องมือร่วมของกราฟแบบโต้ตอบ: แปลงตำแหน่งนิ้ว/เมาส์เป็น index ช่องข้อมูล
 * แล้วโชว์กล่องค่าของช่องนั้น · ใช้ pointer event จึงทำงานทั้งแตะ (แท็บเล็ต) และชี้เมาส์
 *
 * เลือกจาก "ช่อง" ไม่ใช่ตัวแท่ง/จุด — นิ้วบนแท็บเล็ตแตะไม่แม่นพอจะโดนแท่งเล็กๆ
 * แตะแถวไหนของกราฟก็ได้ค่าของช่วงเวลานั้นเลย
 */
export function useSlotTooltip(
  slotCount: number,
  // แท่งอยู่กลางช่อง (floor) แต่จุดของกราฟเส้นอยู่ขอบช่อง (round ไปจุดใกล้สุด)
  mode: "slot" | "nearest" = "slot"
) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [active, setActive] = useState<number | null>(null)

  function locate(e: React.PointerEvent) {
    if (!svgRef.current || slotCount === 0) return
    const rect = svgRef.current.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const raw =
      mode === "nearest" && slotCount > 1
        ? Math.round(ratio * (slotCount - 1))
        : Math.floor(ratio * slotCount)
    setActive(Math.min(slotCount - 1, Math.max(0, raw)))
  }

  return {
    svgRef,
    active,
    handlers: {
      onPointerMove: locate,
      onPointerDown: locate,
      onPointerLeave: () => setActive(null),
    },
  }
}

/** ตัวเลขอ่านง่ายแบบไทย + หน่วยต่อท้าย (unit ใส่ช่องว่างนำหน้ามาเองถ้าต้องการ เช่น " ฿") */
export function fmtValue(value: number, unit = ""): string {
  return `${value.toLocaleString("th-TH", { maximumFractionDigits: 2 })}${unit}`
}

/**
 * กล่องค่าลอยเหนือกราฟ · ตรึงแนวนอนตามกึ่งกลางช่องที่เลือก
 * clamp กันหลุดขอบการ์ดซ้าย/ขวา — กราฟอยู่ในการ์ดแคบบนมือถือได้
 */
export function SlotTip({
  centerPct,
  children,
}: {
  centerPct: number
  children: ReactNode
}) {
  return (
    <div
      className="pointer-events-none absolute top-0 z-20 -translate-x-1/2 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[11px] leading-snug whitespace-nowrap text-slate-700 shadow-md"
      style={{ left: `clamp(4rem, ${centerPct}%, calc(100% - 4rem))` }}
    >
      {children}
    </div>
  )
}
