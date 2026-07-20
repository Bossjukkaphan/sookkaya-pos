import { createClient } from "@/lib/supabase/server"
import { TherapistsTab } from "./therapists-tab"
import { ServicesTab } from "./services-tab"
import { UsersTab } from "./users-tab"
import { GeneralTab } from "./general-tab"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const metadata = { title: "ตั้งค่า · สุขกายา POS" }

export default async function SettingsPage() {
  const supabase = await createClient()

  const [
    { data: profile },
    { data: therapists },
    { data: services },
    { data: settingsRows },
    { data: allowed },
    { data: profiles },
  ] = await Promise.all([
    supabase.from("profiles").select("email, role").single(),
    supabase.from("therapists").select("id, name, status").order("name"),
    supabase
      .from("services")
      .select("id, name, price, commission, is_active")
      .order("name"),
    supabase.from("settings").select("key, value"),
    supabase.from("allowed_users").select("email, role, full_name").order("email"),
    supabase.from("profiles").select("email"),
  ])

  const role = profile?.role ?? "staff"
  const isAdmin = role === "admin"
  const canEditCatalog = role === "admin" || role === "manager"

  const settings = Object.fromEntries(
    (settingsRows ?? []).map((s) => [s.key, s.value ?? ""])
  )

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">ตั้งค่า</h1>

      <Tabs defaultValue="therapists">
        <TabsList className="w-full">
          <TabsTrigger value="therapists" className="flex-1">
            หมอนวด
          </TabsTrigger>
          <TabsTrigger value="services" className="flex-1">
            เมนู
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="users" className="flex-1">
              ผู้ใช้
            </TabsTrigger>
          )}
          <TabsTrigger value="general" className="flex-1">
            ทั่วไป
          </TabsTrigger>
        </TabsList>

        <TabsContent value="therapists" className="pt-4">
          <TherapistsTab
            therapists={therapists ?? []}
            canEdit={canEditCatalog}
          />
        </TabsContent>

        <TabsContent value="services" className="pt-4">
          <ServicesTab services={services ?? []} canEdit={canEditCatalog} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="users" className="pt-4">
            <UsersTab
              allowed={allowed ?? []}
              registered={(profiles ?? [])
                .map((p) => p.email?.toLowerCase())
                .filter((e): e is string => Boolean(e))}
              myEmail={profile?.email ?? null}
            />
          </TabsContent>
        )}

        <TabsContent value="general" className="pt-4">
          <GeneralTab settings={settings} canEdit={isAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
