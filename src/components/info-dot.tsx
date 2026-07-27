"use client"

import { useEffect, useRef, useState } from "react"
import { Info } from "lucide-react"

/**
 * ปุ่ม ⓘ เล็กๆ ที่เปิดคำอธิบายแบบซ่อนไว้ · ทำงานทั้งแตะ (แท็บเล็ตพนักงาน) และคลิก (คอมเจ้าของร้าน)
 * hover อย่างเดียวไม่พอ เพราะแท็บเล็ตไม่มี hover — คนที่งงคือพนักงานที่ใช้แท็บเล็ตพอดี
 */
export function InfoDot({
  text,
  light = false,
}: {
  text: string
  /** ใช้บนพื้นสีเข้ม (การ์ดเขียว/ม่วง) — ไอคอนต้องสว่างไม่งั้นมองไม่เห็น */
  light?: boolean
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)
  const open = pos !== null

  // กล่องคำอธิบายใช้ position: fixed เพราะ Card แม่มี overflow-hidden
  // ถ้าใช้ absolute กล่องจะโดนขอบการ์ดตัด — fixed หลุดจากการตัดนั้น (ไม่มีบรรพบุรุษที่ transform)
  const BUBBLE_W = 192 // ต้องตรงกับ w-48 ด้านล่าง

  function toggle() {
    if (open) {
      setPos(null)
      return
    }
    const r = ref.current!.getBoundingClientRect()
    // หนีบไม่ให้ล้นขอบขวาจอ (การ์ดคอลัมน์ขวาบนมือถือแคบ)
    const left = Math.max(8, Math.min(r.left, window.innerWidth - BUBBLE_W - 8))
    setPos({ top: r.bottom + 4, left })
  }

  // แตะที่อื่น เลื่อนจอ หรือกด Esc แล้วปิด (ปิดตอนเลื่อนเพราะกล่องเป็น fixed จะค้างที่เดิม)
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setPos(null)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPos(null)
    }
    function onScroll() {
      setPos(null)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("touchstart", onDown)
    document.addEventListener("keydown", onKey)
    document.addEventListener("scroll", onScroll, true)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("touchstart", onDown)
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("scroll", onScroll, true)
    }
  }, [open])

  // ใช้แตะ/คลิกอย่างเดียว ไม่ผูก hover — บนแท็บเล็ตการแตะจะยิง mouseenter แล้วตามด้วย click
  // ถ้าผูก hover ไว้ด้วย สองอันจะหักล้างกัน (เปิดแล้วปิดทันที) แตะแล้วไม่ขึ้น
  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={toggle}
        aria-label="ความหมาย"
        // ไอคอนเล็ก 14px แต่ต้องกดโดนด้วยนิ้ว — ขยายพื้นที่กดด้วย before ที่มองไม่เห็น
        // แทนการเพิ่ม padding เพราะ padding จะดันข้อความข้างๆ ให้เลื่อนตำแหน่ง
        className={`relative flex transition-colors before:absolute before:-inset-3.5 before:content-[''] ${
          light ? "text-white/60 hover:text-white" : "text-slate-300 hover:text-slate-500"
        }`}
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      {open && (
        <span
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-30 w-48 rounded-lg border bg-white p-2.5 text-[11px] leading-relaxed font-normal text-slate-600 shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  )
}
