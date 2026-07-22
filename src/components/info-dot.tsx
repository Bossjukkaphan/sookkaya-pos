"use client"

import { useEffect, useRef, useState } from "react"
import { Info } from "lucide-react"

/**
 * ปุ่ม ⓘ เล็กๆ ที่เปิดคำอธิบายแบบซ่อนไว้ · ทำงานทั้งแตะ (แท็บเล็ตพนักงาน) และชี้เมาส์ (คอมเจ้าของร้าน)
 * hover อย่างเดียวไม่พอ เพราะแท็บเล็ตไม่มี hover — คนที่งงคือพนักงานที่ใช้แท็บเล็ตพอดี
 */
export function InfoDot({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  // แตะที่อื่นหรือกด Esc แล้วปิด
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("touchstart", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("touchstart", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <span
      ref={ref}
      className="group relative inline-flex"
      // เปิดค้างเมื่อชี้เมาส์บนคอม — บนแท็บเล็ตไม่มี hover จึงไม่มีผล
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="ความหมาย"
        className="flex text-slate-300 transition-colors hover:text-slate-500"
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute top-5 left-0 z-30 w-48 rounded-lg border bg-white p-2.5 text-[11px] leading-relaxed font-normal text-slate-600 shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  )
}
