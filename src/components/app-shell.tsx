"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  HandCoins,
  LayoutDashboard,
  MoreHorizontal,
  Receipt,
  Users,
} from "lucide-react"

import { cn } from "@/lib/utils"

const STAFF_LINKS = [
  { href: "/pos", label: "บันทึกขาย", icon: Receipt },
  { href: "/today", label: "ยอดวันนี้", icon: BarChart3 },
  { href: "/commission", label: "ค่ามือ", icon: HandCoins },
  { href: "/customers", label: "ลูกค้า", icon: Users },
  { href: "/more", label: "เพิ่มเติม", icon: MoreHorizontal },
]

const OVERVIEW_LINK = {
  href: "/overview",
  label: "ภาพรวม",
  icon: LayoutDashboard,
}

export function AppShell({ role }: { role: string }) {
  const pathname = usePathname()
  const canSeeOverview = role === "admin" || role === "manager"
  const links = canSeeOverview ? [OVERVIEW_LINK, ...STAFF_LINKS] : STAFF_LINKS

  return (
    <nav
      className={cn(
        // จอแคบ: แถบล่างเหมือนเดิม — ใช้ order ดันลงล่างแทนการย้ายตำแหน่งใน DOM
        "order-last sticky bottom-0 z-10 border-t bg-white",
        // จอกว้าง: แถบข้างแนวตั้งติดซ้าย
        "sm:order-first sm:top-0 sm:bottom-auto sm:h-dvh sm:w-52 sm:shrink-0 sm:border-t-0 sm:border-r"
      )}
      aria-label="เมนูหลัก"
    >
      <ul className="flex sm:flex-col sm:gap-1 sm:p-3">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={href} className="flex-1 sm:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] transition-colors",
                  "sm:flex-row sm:justify-start sm:gap-3 sm:rounded-md sm:px-3 sm:py-2.5 sm:text-sm",
                  active
                    ? "font-semibold text-emerald-700 sm:bg-emerald-50"
                    : "text-slate-500 hover:text-slate-900 sm:hover:bg-slate-50"
                )}
              >
                <Icon className="size-5 sm:size-4" aria-hidden />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
