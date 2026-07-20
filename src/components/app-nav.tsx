"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, HandCoins, MoreHorizontal, Receipt, Users } from "lucide-react"

import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/pos", label: "บันทึกขาย", icon: Receipt },
  { href: "/", label: "ยอดวันนี้", icon: BarChart3 },
  { href: "/commission", label: "ค่ามือ", icon: HandCoins },
  { href: "/customers", label: "ลูกค้า", icon: Users },
  { href: "/more", label: "เพิ่มเติม", icon: MoreHorizontal },
]

export function AppNav() {
  const pathname = usePathname()

  return (
    <nav
      className="sticky bottom-0 z-10 border-t bg-white sm:top-0 sm:bottom-auto sm:border-t-0 sm:border-b"
      aria-label="เมนูหลัก"
    >
      <ul className="mx-auto flex max-w-3xl">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] transition-colors sm:flex-row sm:justify-center sm:gap-2 sm:py-3 sm:text-sm",
                  active
                    ? "text-emerald-700 font-semibold"
                    : "text-slate-500 hover:text-slate-900"
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
