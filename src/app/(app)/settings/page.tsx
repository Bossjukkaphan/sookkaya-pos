import { createClient } from "@/lib/supabase/server"
import { TherapistsTab } from "./therapists-tab"
import { ServicesTab } from "./services-tab"
import { UsersTab } from "./users-tab"
import { GeneralTab } from "./general-tab"
import { CostTypesTab } from "./cost-types-tab"
import { PromotionsTab } from "./promotions-tab"
import { promoKey } from "@/lib/promo"
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
    { data: promoSales },
    { data: aliases },
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
      .from("sales")
      .select("coupon_promo")
      .not("coupon_promo", "is", null),
    supabase.from("promotion_aliases").select("raw_key"),
  ])

  const role = profile?.role ?? "staff"
  const isAdmin = role === "admin"
  const canEditCatalog = role === "admin" || role === "manager"

  const settings = Object.fromEntries(
    (settingsRows ?? []).map((s) => [s.key, s.value ?? ""])
  )

  // นับข้อความดิบที่ยังไม่มีแถวใน promotion_aliases เพื่อให้เจ้าของร้านมาจับคู่
  const knownKeys = new Set((aliases ?? []).map((a) => a.raw_key))
  const unmatchedMap = new Map<string, { sample_text: string; uses: number }>()
  for (const row of promoSales ?? []) {
    const text = (row.coupon_promo ?? "").trim()
    if (!text) continue
    const key = promoKey(text)
    if (knownKeys.has(key)) continue
    const current = unmatchedMap.get(key) ?? { sample_text: text, uses: 0 }
    current.uses += 1
    unmatchedMap.set(key, current)
  }
  const unmatched = [...unmatchedMap.entries()]
    .map(([raw_key, v]) => ({ raw_key, ...v }))
    .sort((a, b) => b.uses - a.uses)

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
