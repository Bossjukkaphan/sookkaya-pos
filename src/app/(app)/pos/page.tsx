import { createClient } from "@/lib/supabase/server"
import { PosForm } from "./pos-form"

export const metadata = { title: "บันทึกขาย · สุขกายา POS" }

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string }>
}) {
  const supabase = await createClient()
  const { queue } = await searchParams

  const [{ data: therapists }, { data: services }, { data: promotions }, { data: beds }] =
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
      supabase
        .from("beds")
        .select("id, room, name")
        .eq("is_active", true)
        .order("sort"),
    ])

  // มาจากการ์ดคิว → กรอกหมอ/เมนู/ลูกค้าให้ล่วงหน้า (คิวที่จ่ายแล้วไม่รับซ้ำ)
  const { data: queueEntry } = queue
    ? await supabase
        .from("queue_entries")
        .select("*")
        .eq("id", queue)
        .neq("status", "paid")
        .maybeSingle()
    : { data: null }

  const { data: queueCustomer } = queueEntry?.customer_id
    ? await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("id", queueEntry.customer_id)
        .maybeSingle()
    : { data: null }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">บันทึกขาย</h1>
      {queueEntry && (
        <p className="rounded-md bg-violet-50 px-3 py-2 text-sm text-violet-800">
          เก็บเงินจากคิว: {queueEntry.service_name}
          {queueEntry.customer_name ? ` · ${queueEntry.customer_name}` : ""}
        </p>
      )}
      <PosForm
        therapists={therapists ?? []}
        services={services ?? []}
        promotions={promotions ?? []}
        beds={beds ?? []}
        initial={
          queueEntry
            ? {
                queueEntryId: queueEntry.id,
                therapistId: queueEntry.therapist_id ?? "",
                serviceId: queueEntry.service_id ?? "",
                customerId: queueCustomer?.id ?? "",
                customerName: queueCustomer?.name ?? queueEntry.customer_name ?? "",
                customerPhone: queueCustomer?.phone ?? "",
                source: queueEntry.source,
                bedId: queueEntry.bed_id ?? "",
                bookingChannel: queueEntry.booking_channel ?? "",
                notes: queueEntry.notes ?? "",
              }
            : undefined
        }
      />
    </div>
  )
}
