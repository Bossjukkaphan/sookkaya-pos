import { createClient } from "@/lib/supabase/server"
import { PosForm } from "./pos-form"

export const metadata = { title: "บันทึกขาย · สุขกายา POS" }

export default async function PosPage() {
  const supabase = await createClient()

  const [{ data: therapists }, { data: services }, { data: promotions }] =
    await Promise.all([
      supabase
        .from("therapists")
        .select("id, name")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("services")
        .select("id, name, price, commission")
        .eq("is_active", true)
        .order("name"),
      // ใช้ภายใน (Member / ถ่ายคอนเทนต์) ไม่ต้องขึ้นเป็นตัวเลือกให้พนักงานเลือกผิด
      supabase
        .from("promotions")
        .select("id, name")
        .eq("is_active", true)
        .neq("kind", "internal")
        .order("name"),
    ])

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">บันทึกขาย</h1>
      <PosForm
        therapists={therapists ?? []}
        services={services ?? []}
        promotions={promotions ?? []}
      />
    </div>
  )
}
