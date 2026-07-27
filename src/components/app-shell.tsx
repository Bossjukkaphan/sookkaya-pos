"use client"

import { Fragment } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { MoreHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"
import { usePendingQueue } from "@/components/queue-notifications"
import { MOBILE_PRIMARY_HREFS, NAV_SECTIONS, allNavLinks, canSeeNav } from "@/lib/nav"

const MORE_LINK = {
  href: "/more",
  label: "เพิ่มเติม",
  icon: MoreHorizontal,
}

export function AppShell({
  role,
  pendingCount: initialPendingCount,
}: {
  role: string
  /** ค่าจาก server ตอนโหลดหน้า — ใช้จนกว่าตัวแจ้งเตือนสด (realtime) จะพร้อม */
  pendingCount?: number
}) {
  const pathname = usePathname()
  // ป้ายเมนู "คิว" อ่านจาก store สด — คำขอใหม่/ถูกอนุมัติจากเครื่องอื่นเห็นทันที
  // ไม่ต้องรอเปลี่ยนหน้า (นอก provider เช่นหน้า preview → ใช้ค่า server แทน)
  const live = usePendingQueue()
  const pendingCount = live ? live.pendingCount : initialPendingCount

  // แถบล่างมือถือหยิบจาก NAV_SECTIONS ด้วย href — ชื่อกับไอคอนจึงมาจากที่เดียว
  const links = allNavLinks()
  const primary = MOBILE_PRIMARY_HREFS.flatMap((h) => {
    const link = links.find((l) => l.href === h)
    return link && canSeeNav(link, role) ? [link] : []
  })
  const sections = NAV_SECTIONS.map((s) => ({
    ...s,
    links: s.links.filter((l) => canSeeNav(l, role)),
  })).filter((s) => s.links.length > 0)

  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <nav
      className={cn(
        // จอแคบ: แถบล่างเหมือนเดิม — ใช้ order ดันลงล่างแทนการย้ายตำแหน่งใน DOM
        "order-last sticky bottom-0 z-10 border-t bg-white",
        // จอกว้าง: แถบข้างแนวตั้งติดซ้าย เลื่อนได้เมื่อรายการยาวเกินจอ
        "sm:order-first sm:top-0 sm:bottom-auto sm:h-dvh sm:w-56 sm:shrink-0 sm:overflow-y-auto sm:border-t-0 sm:border-r"
      )}
      aria-label="เมนูหลัก"
    >
      <ul className="flex sm:flex-col sm:gap-0.5 sm:p-3">
        {/* มือถือ: แถบล่าง — จอกว้างซ่อน (ลิงก์ชุดเดียวกันไปอยู่ในหมวดข้างล่างแทน) */}
        {primary.map(({ href, label, icon: Icon }) => (
          <li key={href} className="flex-1 sm:hidden">
            <Link
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[11px] transition-colors",
                isActive(href)
                  ? "font-semibold text-[#664343]"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              <Icon className="size-5" aria-hidden />
              <span className="flex items-center gap-1">
                {label}
                {href === "/queue" && pendingCount ? (
                  <span className="rounded-full bg-sky-500 px-1.5 text-[10px] text-white">
                    {pendingCount}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}

        {/* ปุ่มเพิ่มเติมมีไว้สำหรับมือถือเท่านั้น จอกว้างกางรายการจริงให้เห็นแทน */}
        <li className="flex-1 sm:hidden">
          <Link
            href={MORE_LINK.href}
            aria-current={isActive(MORE_LINK.href) ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 py-2.5 text-[11px] transition-colors",
              isActive(MORE_LINK.href)
                ? "font-semibold text-[#664343]"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            <MORE_LINK.icon className="size-5" aria-hidden />
            {MORE_LINK.label}
          </Link>
        </li>

        {/* จอกว้าง: เมนูจัดหมวด หน้าร้าน → ข้อมูล → ผู้บริหาร → ระบบ */}
        {sections.map((section, si) => (
          <Fragment key={section.title}>
            <li className={cn("hidden sm:block", si > 0 && "sm:mt-3")}>
              <p className="px-3 pb-1 text-[10px] font-semibold tracking-wide text-[#795757]/70 uppercase">
                {section.title}
              </p>
            </li>
            {section.links.map(({ href, label, icon: Icon }) => (
              <li key={href} className="hidden sm:block">
                <Link
                  href={href}
                  aria-current={isActive(href) ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive(href)
                      ? "font-semibold text-[#664343] sm:bg-[#FFF0D1]/70"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                  {href === "/queue" && pendingCount ? (
                    <span className="rounded-full bg-sky-500 px-1.5 text-[10px] text-white">
                      {pendingCount}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </Fragment>
        ))}
      </ul>
    </nav>
  )
}
