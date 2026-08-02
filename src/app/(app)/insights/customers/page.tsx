import { redirect } from "next/navigation"

/**
 * หน้านี้ย้ายไปเป็นแท็บ "วิเคราะห์ลูกค้า" ใน /crm แล้ว (สเปก 2026-08-02
 * รวมสองเมนูที่โชว์ "ลูกค้าหายไปนาน" ซ้ำกัน) — เด้งพร้อมพารามิเตอร์เดิม
 * ให้ bookmark/ลิงก์เก่าไม่ตาย (แบบเดียวกับ /sales → /reports)
 */
export default async function CustomerInsightMoved({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; days?: string }>
}) {
  const { tab, days } = await searchParams
  const params = new URLSearchParams({ tab: "insights" })
  if (tab === "dormant") params.set("sub", "dormant")
  if (days) params.set("days", days)
  redirect(`/crm?${params.toString()}`)
}
