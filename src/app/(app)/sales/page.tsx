import { redirect } from "next/navigation"

/**
 * หน้ายอดขายย้อนหลังถูกยุบรวมเข้าหน้ารายงานแล้ว (กราฟรายวันอยู่ที่นั่น
 * รายบิลอยู่ที่ประวัติบิล) — คง URL ไว้เพื่อลิงก์/bookmark เก่าไม่พัง
 */
export default async function SalesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { from, to } = await searchParams
  const qs =
    from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)
      ? `?from=${from}&to=${to}`
      : ""
  redirect(`/reports${qs}`)
}
