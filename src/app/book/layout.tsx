import type { Metadata } from "next"

import { CustomerNav } from "./customer-nav"

// ชื่อกลางของโซนลูกค้า — แต่ละหน้าตั้งคำนำหน้าเอง (จองคิว/แต้มสะสม/การจองของฉัน)
export const metadata: Metadata = {
  title: {
    default: "SOOKKAYA Thai Massage",
    template: "%s · SOOKKAYA",
  },
}

export default function BookLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen" style={{ background: "#f8f6f3" }}>
      <header className="px-4 py-3" style={{ background: "#664343" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-cream.png" alt="SOOK KAYA" className="mx-auto h-10 w-auto" />
      </header>
      {/* pb เผื่อที่ให้แถบเมนูล่าง — เนื้อหาท้ายหน้าจะได้ไม่โดนบัง */}
      <main className="mx-auto max-w-md p-4 pb-28">{children}</main>
      <CustomerNav />
    </div>
  )
}
