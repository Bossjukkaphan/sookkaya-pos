import { createClient } from "@/lib/supabase/server"
import { TherapistsTab } from "./therapists-tab"
import { ServicesTab } from "./services-tab"
import { UsersTab } from "./users-tab"
import { GeneralTab } from "./general-tab"
import { CostTypesTab } from "./cost-types-tab"
import { PromotionsTab } from "./promotions-tab"
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
    { data: categoryTypes },
    { data: recentExpenses },
    { data: promotions },
    { data: unmatchedRows },
    { data: aliasRows },
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
    supabase.from("expense_category_types").select("category, cost_type").order("category"),
    supabase
      .from("expenses")
      .select("id, expense_date, item, category, amount, cost_type")
      .order("expense_date", { ascending: false })
      .limit(60),
    supabase
      .from("promotions")
      .select("id, name, kind, is_active")
      .order("name"),
    supabase
      .from("v_promo_unmatched")
      .select("raw_key, sample_text, uses")
      .order("uses", { ascending: false }),
    supabase
      .from("promotion_aliases")
      .select("raw_key, sample_text, promotion_id")
      .order("raw_key"),
  ])

  const role = profile?.role ?? "staff"
  const isAdmin = role === "admin"
  const canEditCatalog = role === "admin" || role === "manager"

  const settings = Object.fromEntries(
    (settingsRows ?? []).map((s) => [s.key, s.value ?? ""])
  )

  // view คืนค่า nullable ตามธรรมชาติของ view ใน Postgres แต่ทุกแถวมีค่าจริงเสมอ
  const unmatched = (unmatchedRows ?? []).map((r) => ({
    raw_key: r.raw_key ?? "",
    sample_text: r.sample_text ?? "",
    uses: Number(r.uses ?? 0),
  }))

  const aliases = (aliasRows ?? []).map((a) => ({
    raw_key: a.raw_key,
    sample_text: a.sample_text ?? a.raw_key,
    promotion_id: a.promotion_id,
  }))

  return (
    <div className="mx-auto max-w-3xl space-y-4">
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
          {canEditCatalog && (
            <TabsTrigger value="cost-types" className="flex-1">
              ต้นทุน
            </TabsTrigger>
          )}
          {canEditCatalog && (
            <TabsTrigger value="promotions" className="flex-1">
              โปรฯ
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

        {canEditCatalog && (
          <TabsContent value="cost-types" className="pt-4">
            <CostTypesTab
              categoryTypes={categoryTypes ?? []}
              expenses={recentExpenses ?? []}
            />
          </TabsContent>
        )}

        {canEditCatalog && (
          <TabsContent value="promotions" className="pt-4">
            <PromotionsTab
              promotions={promotions ?? []}
              unmatched={unmatched}
              aliases={aliases}
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
