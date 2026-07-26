"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

/** แท็บรอง — ปุ่มจองคิวแยกไว้เป็นปุ่มใหญ่ต่างหาก */
const TABS = [
  { href: "/book/mine", label: "คิวของฉัน", icon: "🗓" },
  { href: "/book/points", label: "แต้มสะสม", icon: "⭐" },
  { href: "/book/profile", label: "โปรไฟล์", icon: "👤" },
] as const

/**
 * แถบเมนูล่างโซนลูกค้า (LIFF เปิดบนมือถือ) — กดถึงด้วยนิ้วโป้งทุกหน้า
 * ปุ่ม "จองคิวนวด" เด่นสุดตาม CTA หลักของร้าน แท็บอื่นเป็นเมนูรอง
 */
export function CustomerNav() {
  const pathname = usePathname()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e5e0da] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-md items-center gap-1 px-3 py-2">
        <Link
          href="/book"
          className={cn(
            "flex h-12 flex-[1.6] items-center justify-center rounded-full text-sm font-semibold shadow-sm transition-transform active:scale-95",
            pathname === "/book"
              ? "bg-[#664343] text-[#FFF0D1] ring-2 ring-[#664343]/30"
              : "bg-[#664343] text-[#FFF0D1]"
          )}
        >
          📅 จองคิวนวด
        </Link>
        {TABS.map((t) => {
          const active = pathname === t.href
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-[11px] leading-tight",
                active
                  ? "font-semibold text-[#664343]"
                  : "text-slate-500"
              )}
            >
              <span className="text-base">{t.icon}</span>
              {t.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
