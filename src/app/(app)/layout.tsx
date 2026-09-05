import { signOut } from "@/app/actions"
import { createClient } from "@/lib/supabase/server"
import { todayInShopTz } from "@/lib/datetime"
import { layoutBootstrap } from "@/lib/layout-bootstrap"
import { AppShell } from "@/components/app-shell"
import {
  QueueBell,
  QueueNotificationsProvider,
} from "@/components/queue-notifications"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const ROLE_LABEL: Record<string, string> = {
  admin: "เจ้าของร้าน",
  manager: "ผู้จัดการ",
  staff: "พนักงาน",
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const today = todayInShopTz()
  // ป้ายจำนวนคำขอจองจากไลน์ที่รอตัดสินใจ — เตือนบนเมนูให้เห็นทุกหน้า
  // ห้ามกรองวันที่ (ไม่มี .gte("queue_date", ...)) ใน SQL ของ layout_bootstrap:
  // ถ้ากรองแค่วันนี้เป็นต้นไป รายการที่ค้างข้ามวันไปแล้ว (ร้านลืมตัดสินใจ) จะหายจากป้าย
  // ทั้งที่ลูกค้ายังเห็น "รอร้านยืนยัน" อยู่ฝั่งไลน์ตลอด — ต้องนับทุก pending จนกว่าพนักงานจะรับ/ปฏิเสธเอง
  // round trip เดียวแทน ~5 query เดิม — auth ไม่ต้อง getUser ซ้ำที่นี่:
  // proxy เช็ค session ทุก request อยู่แล้ว และ RLS ใน RPC คุมสิทธิ์ข้อมูลอีกชั้น
  const { profile, pendingCount, birthdays, expenseReminders: expenseDue } =
    await layoutBootstrap(supabase, today)

  return (
    // ตัวแจ้งเตือนคิวจองไลน์แบบสด — ครอบทั้งโซนพนักงาน ให้เสียง/toast/ป้ายเมนู
    // ทำงานทุกหน้าโดย subscribe realtime ชุดเดียว (ค่าเริ่มจาก server กันป้ายกระพริบ)
    <QueueNotificationsProvider
      initialCount={pendingCount ?? 0}
      birthdayCount={birthdays.length}
      expenseReminders={expenseDue}
    >
      <div className="flex min-h-full flex-1 flex-col sm:flex-row">
        <AppShell role={profile?.role ?? "staff"} pendingCount={pendingCount ?? 0} />

        {/* pb จอแคบ: กันที่ให้แถบเมนูล่างที่เป็น fixed (สูง ~60px + safe area ของ iPhone)
            ไม่งั้นเนื้อหาบรรทัดสุดท้ายของทุกหน้าจะโดนแถบเมนูบัง */}
        <div className="flex min-w-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0">
          {/* แถบบนขาวตามธีมรวม — โลโก้น้ำตาลแดง (เวอร์ชันสำหรับพื้นสว่างตามคู่มือ CI) */}
          <header className="border-b border-[#664343]/15 bg-white">
            <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-2.5 lg:px-6">
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-maroon.png" alt="SOOK KAYA" className="h-9 w-auto" />
                {profile?.role && (
                  <Badge
                    variant="outline"
                    className="border-[#664343]/25 bg-[#FFF0D1]/60 text-[#664343]"
                  >
                    {ROLE_LABEL[profile.role] ?? profile.role}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3">
                {/* กระดิ่งแจ้งเตือน — header เดียวใช้ทั้งจอแคบ/กว้าง เลยเห็นทุกขนาดจอ */}
                <QueueBell />
                <span className="hidden text-sm text-slate-600 sm:inline">
                  {profile?.full_name}
                </span>
                <form action={signOut}>
                  <Button type="submit" variant="outline" size="sm">
                    ออกจากระบบ
                  </Button>
                </form>
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </QueueNotificationsProvider>
  )
}
