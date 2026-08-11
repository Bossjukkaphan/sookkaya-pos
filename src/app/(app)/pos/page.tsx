import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getServicesCached, getTherapistsCached } from "@/lib/cached-lookups"
import { PosForm } from "./pos-form"
import { GroupPosForm, type GroupPerson } from "./group-pos-form"

export const metadata = { title: "บันทึกขาย · สุขกายา POS" }

/** timestamptz → HH:MM เวลาไทย — เวลาเริ่มนวดจริงของแต่ละคนในกลุ่ม */
function toShopTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso))
}

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string; group?: string }>
}) {
  const supabase = await createClient()
  const { queue, group } = await searchParams

  // ทุกการขายต้องเริ่มจากคิว — เปิดหน้านี้ตรงๆ ไม่ได้แล้ว (รวมโหมดกลุ่ม multi เดิม)
  // walk-in: เพิ่มคิวก่อน (เวลาจอง = เวลาที่ลูกค้ามาถึง) แล้วกด 💰 เก็บเงินจากการ์ด
  // บิลจึงมีเวลาครบ 3 ชั้นเสมอ: เวลาบันทึก · เวลาจอง · เวลาเริ่มนวดจริง
  if (!queue && !group) redirect("/queue?from=pos")

  const [allTherapists, allServices, { data: promotions }, { data: beds }, queueRes, groupRes] =
    await Promise.all([
      getTherapistsCached(),
      getServicesCached(),
      // ใช้ภายใน (Member / ถ่ายคอนเทนต์) ไม่ต้องขึ้นเป็นตัวเลือกให้พนักงานเลือกผิด
      supabase
        .from("promotions")
        .select("id, name, discount_pct")
        .eq("is_active", true)
        .neq("kind", "internal")
        .order("name"),
      supabase
        .from("beds")
        .select("id, room, name")
        .eq("is_active", true)
        .order("sort"),
      // เดิมสองตัวนี้รอหลัง lookup เสร็จทั้งที่ไม่พึ่งกัน — ยุบมารอบเดียว
      queue
        ? supabase
            .from("queue_entries")
            .select("*")
            .eq("id", queue)
            .not("status", "in", "(paid,pending,rejected)")
            .maybeSingle()
        : Promise.resolve({ data: null }),
      group
        ? supabase
            .from("queue_entries")
            .select("*")
            .eq("group_id", group)
            .not("status", "in", "(paid,cancelled,pending,rejected)")
            .order("start_time")
        : Promise.resolve({ data: null }),
    ])

  // เงื่อนไขกรองเดิมของหน้า — ย้ายจาก .eq ใน query มาไว้ที่นี่ (ข้อมูลมาจาก cache รวม)
  const therapists = allTherapists
    .filter((t) => t.status === "active")
    .map((t) => ({ id: t.id, name: t.name }))
  const services = allServices
    .filter((s) => s.is_active)
    // duration_min ใช้คิดว่าเตียงของแต่ละคนทับเวลากันจริงไหม (ดู bedHolderInGroup)
    .map((s) => ({
      id: s.id,
      name: s.name,
      price: s.price,
      commission: s.commission,
      duration_min: s.duration_min,
    }))

  // เก็บเงินทั้งกลุ่ม → โหลดทุกคนในกลุ่มที่ยังไม่จ่าย/ไม่ยกเลิก มาลงจอเดียว
  const groupEntries = groupRes.data

  if (groupEntries && groupEntries.length > 0) {
    const customerIds = [
      ...new Set(
        groupEntries.map((e) => e.customer_id).filter((id): id is string => !!id)
      ),
    ]
    const { data: groupCustomers } = customerIds.length
      ? await supabase.from("customers").select("id, name, phone").in("id", customerIds)
      : { data: [] }
    const customerById = new Map((groupCustomers ?? []).map((c) => [c.id, c]))

    const people: GroupPerson[] = groupEntries.map((e) => {
      const customer = e.customer_id ? customerById.get(e.customer_id) : null
      return {
        queueEntryId: e.id,
        groupId: group as string,
        therapistId: e.therapist_id ?? "",
        serviceId: e.service_id ?? "",
        customerId: customer?.id ?? "",
        customerName: customer?.name ?? e.customer_name ?? "",
        customerPhone: customer?.phone ?? e.customer_phone ?? "",
        isRequest: e.is_request,
        privateRoom: e.private_room,
        serviceTime: e.started_at
          ? toShopTime(e.started_at)
          : (e.start_time?.slice(0, 5) ?? ""),
        // วันที่ของบิล = วันของการ์ด (createSale ใช้ค่านี้เป็น saleDate และเทียบวันหมดอายุเครดิต)
        queueDate: e.queue_date ?? "",
        bedId: e.bed_id ?? "",
        source: e.source,
        bookingChannel: e.booking_channel ?? "",
        notes: e.notes ?? "",
      }
    })

    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-xl font-bold">เก็บเงินทั้งกลุ่ม</h1>
        <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-800">
          กลุ่ม {people.length} คน — แก้เมนู/ส่วนลดรายคนได้ จ่ายรวมครั้งเดียว
          ระบบออกใบเสร็จแยกรายคนให้อัตโนมัติ
        </p>
        <GroupPosForm
          therapists={therapists ?? []}
          services={services ?? []}
          promotions={promotions ?? []}
          beds={beds ?? []}
          people={people}
        />
      </div>
    )
  }

  // มาจากการ์ดคิว → กรอกหมอ/เมนู/ลูกค้าให้ล่วงหน้า
  // (คิวที่จ่ายแล้วไม่รับซ้ำ · คิวที่ยังไม่อนุมัติ/ถูกปฏิเสธจากไลน์ห้ามเก็บเงินจนกว่าจะรับจองก่อน —
  // ปกติปุ่ม "เก็บเงิน" ไม่โผล่ให้กดตั้งแต่แรกอยู่แล้ว แต่กันไว้เผื่อเข้าลิงก์ตรง/บุ๊กมาร์กเก่า)
  const queueEntry = queueRes.data

  // คิวที่ระบุมาหาไม่เจอ/จ่ายไปแล้ว → กลับหน้าคิว (ห้ามเปิดฟอร์มเปล่าที่ไม่ผูกคิว)
  if (!queueEntry) redirect("/queue?from=pos")

  // คิวทั้งวันของการ์ดใบนี้ — ให้ฟอร์มรู้ว่าเตียงไหนไม่ว่าง (กรองชุดเดียวกับบอร์ดคิว)
  // ต้องรอ queueEntry ก่อนเพราะยึด "วันของการ์ด" ไม่ใช่วันนี้ (เก็บเงินคิวของวันอื่นได้)
  const [{ data: queueCustomer }, { data: dayEntries }] = await Promise.all([
    queueEntry.customer_id
      ? supabase
          .from("customers")
          .select("id, name, phone")
          .eq("id", queueEntry.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("queue_entries")
      .select("id, bed_id, start_time, duration_min, status, started_at")
      .eq("queue_date", queueEntry.queue_date)
      .not("status", "in", "(cancelled,rejected)"),
  ])

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">บันทึกขาย</h1>
      <p className="rounded-md bg-violet-50 px-3 py-2 text-sm text-violet-800">
        เก็บเงินจากคิว: {queueEntry.service_name}
        {queueEntry.customer_name ? ` · ${queueEntry.customer_name}` : ""}
      </p>
      <PosForm
        therapists={therapists ?? []}
        services={services ?? []}
        promotions={promotions ?? []}
        beds={beds ?? []}
        dayEntries={dayEntries ?? []}
        initial={{
          queueEntryId: queueEntry.id,
          therapistId: queueEntry.therapist_id ?? "",
          serviceId: queueEntry.service_id ?? "",
          customerId: queueCustomer?.id ?? "",
          customerName: queueCustomer?.name ?? queueEntry.customer_name ?? "",
          customerPhone: queueCustomer?.phone ?? queueEntry.customer_phone ?? "",
          isRequest: queueEntry.is_request,
          privateRoom: queueEntry.private_room,
          source: queueEntry.source,
          bedId: queueEntry.bed_id ?? "",
          bookingChannel: queueEntry.booking_channel ?? "",
          notes: queueEntry.notes ?? "",
          // เวลาใช้บริการ: เวลากด "เริ่มนวด" จริงแม่นสุด รองลงมาคือเวลาคิวที่วางไว้
          serviceTime: queueEntry.started_at
            ? toShopTime(queueEntry.started_at)
            : (queueEntry.start_time?.slice(0, 5) ?? ""),
          // วันที่ของบิล = วันของการ์ด (createSale ใช้ค่านี้เป็น saleDate และเทียบวันหมดอายุเครดิต)
          queueDate: queueEntry.queue_date ?? "",
        }}
      />
    </div>
  )
}
