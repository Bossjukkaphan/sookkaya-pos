import { getMyProfile } from "@/lib/auth"
import { signOut } from "@/app/actions"
import { createClient } from "@/lib/supabase/server"
import { todayInShopTz } from "@/lib/datetime"
import { AppShell } from "@/components/app-shell"
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
  const profile = await getMyProfile()

  // ป้ายจำนวนคำขอจองจากไลน์ที่รอตัดสินใจ (วันนี้เป็นต้นไป) — เตือนบนเมนูให้เห็นทุกหน้า
  const supabase = await createClient()
  const { count: pendingCount } = await supabase
    .from("queue_entries")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .gte("queue_date", todayInShopTz())

  return (
    <div className="flex min-h-full flex-1 flex-col sm:flex-row">
      <AppShell role={profile?.role ?? "staff"} pendingCount={pendingCount ?? 0} />

      <div className="flex min-w-0 flex-1 flex-col">
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

        <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
