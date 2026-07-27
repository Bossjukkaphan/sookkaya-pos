import Link from "next/link"

/**
 * ปุ่มเลื่อนวัน/เดือน (← →) — ที่เดียวของความจริงเรื่องขนาดและหน้าตา
 *
 * เคยเป็นคลาสก๊อปกันอยู่ 8 ไฟล์ แล้วเพี้ยนทีละนิดจนขนาดไม่ตรงกันสักหน้า (29-37px)
 * พอไล่แก้ด้วยการแทนที่ข้อความทับทุกไฟล์ ก็พลาดทำ padding ของปุ่มที่มีข้อความ
 * ("← ก่อนหน้า" หน้าค่ามือ) หายจนตัวอักษรชนขอบ — 28/7/2569 ทั้งสองรอบ
 *
 * ขนาดขั้นต่ำ 40x40 = เป้าแตะที่นิ้วกดโดน · px-3 ให้ปุ่มที่มีข้อความมีช่องหายใจ
 * (ลูกศรเปล่ายังเป็นสี่เหลี่ยมจัตุรัส 40x40 เพราะ min-w คุมไว้)
 *
 * ห้ามใส่ "use client" — หน้าที่เรียกใช้เป็น server component ทั้งหมด
 */
export function PagerLink({
  href,
  children,
  "aria-label": ariaLabel,
}: {
  href: string
  children: React.ReactNode
  "aria-label"?: string
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border px-3 text-sm hover:bg-slate-100"
    >
      {children}
    </Link>
  )
}
