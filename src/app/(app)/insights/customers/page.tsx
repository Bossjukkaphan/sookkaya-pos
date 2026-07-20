import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { InsightsAccessDenied, canSeeInsights } from "../shared"
import { daysSince, isDormant } from "@/lib/insights"
import { formatBaht } from "@/lib/constants"
import { formatThaiDate, todayInShopTz } from "@/lib/datetime"
import { Card, CardContent } from "@/components/ui/card"

export const metadata = { title: "ลูกค้า · สุขกายา POS" }

const DAY_OPTIONS = [30, 60, 90]

export default async function CustomerInsightPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; days?: string }>
}) {
  const supabase = await createClient()
  const { data: profile } = await supabase.from("profiles").select("role").single()

  if (!canSeeInsights(profile?.role)) {
    return <InsightsAccessDenied title="ลูกค้า" />
  }

  const params = await searchParams
  const tab = params.tab === "dormant" ? "dormant" : "ltv"
  const days = DAY_OPTIONS.includes(Number(params.days)) ? Number(params.days) : 60

  const { data } = await supabase
    .from("v_customer_ltv")
    .select(
      "customer_id, name, nickname, phone, customer_type, visits, lifetime_value, avg_ticket, first_visit, last_visit"
    )
    .order("lifetime_value", { ascending: false })

  const rows = data ?? []
  const today = todayInShopTz()

  const dormant = rows.filter((r) =>
    isDormant(
      { visits: Number(r.visits ?? 0), lastVisit: r.last_visit ?? today },
      today,
      days
    )
  )

  const shown = tab === "dormant" ? dormant : rows.slice(0, 50)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">ลูกค้า</h1>
        <p className="text-sm text-slate-600">
          {tab === "ltv"
            ? `ลูกค้าที่เคยซื้อ ${rows.length} คน · แสดง 50 อันดับแรกตามยอดสะสม`
            : `เคยมาอย่างน้อย 2 ครั้ง แต่ไม่มาเกิน ${days} วัน — ${dormant.length} คน`}
        </p>
      </div>

      <div className="flex gap-2">
        <TabLink href="/insights/customers" label="ยอดสะสมสูงสุด" active={tab === "ltv"} />
        <TabLink
          href={`/insights/customers?tab=dormant&days=${days}`}
          label="หายไปนาน"
          active={tab === "dormant"}
        />
      </div>

      {tab === "dormant" && (
        <div className="flex gap-2">
          {DAY_OPTIONS.map((d) => (
            <Link
              key={d}
              href={`/insights/customers?tab=dormant&days=${d}`}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                d === days
                  ? "border-emerald-600 bg-emerald-50 font-medium text-emerald-900"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              เกิน {d} วัน
            </Link>
          ))}
        </div>
      )}

      <ul className="space-y-2">
        {shown.map((r) => (
          <li key={r.customer_id}>
            <Link href={`/customers/${r.customer_id}`}>
              <Card className="transition-colors hover:bg-slate-50">
                <CardContent className="space-y-1 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {r.name}
                        {r.nickname && (
                          <span className="text-slate-500"> ({r.nickname})</span>
                        )}
                        {r.customer_type === "สมาชิก" && (
                          <span className="ml-1 text-xs text-emerald-700">💳</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {r.visits} ครั้ง · เฉลี่ย {formatBaht(Number(r.avg_ticket ?? 0))} ฿
                        {r.phone && ` · ${r.phone}`}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold">
                      {formatBaht(Number(r.lifetime_value ?? 0))} ฿
                    </span>
                  </div>
                  {r.last_visit && (
                    <p className="text-xs text-slate-500">
                      มาล่าสุด {formatThaiDate(r.last_visit)} (
                      {daysSince(r.last_visit, today)} วันก่อน)
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      {shown.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">
          ไม่มีลูกค้าในเงื่อนไขนี้
        </p>
      )}
    </div>
  )
}

function TabLink({
  href,
  label,
  active,
}: {
  href: string
  label: string
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={`flex-1 rounded-md border px-3 py-2 text-center text-sm ${
        active
          ? "border-emerald-600 bg-emerald-50 font-medium text-emerald-900"
          : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </Link>
  )
}
