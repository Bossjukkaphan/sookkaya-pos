import { getMyProfile } from "@/lib/auth"
import { signOut } from "@/app/actions"
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

  return (
    <div className="flex min-h-full flex-1 flex-col sm:flex-row">
      <AppShell role={profile?.role ?? "staff"} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3 lg:px-6">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-emerald-800">สุขกายา</span>
              {profile?.role && (
                <Badge variant="secondary">
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
