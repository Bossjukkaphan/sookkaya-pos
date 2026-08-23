import { createClient } from "@/lib/supabase/server"
import { fetchAllRows } from "@/lib/fetch-all-rows"
import { demographicBreakdown, type GroupStat } from "@/lib/demographics"
import { todayInShopTz } from "@/lib/datetime"
import { formatBaht } from "@/lib/constants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** เกณฑ์ป้ายเตือน: ความครอบคลุมต่ำกว่านี้ = ตัวเลขยังไม่แทนภาพรวมร้าน (สเปก 2026-08-21) */
const LOW_COVERAGE_PCT = 30

/**
 * แท็บ "กลุ่มลูกค้า" — เพศ/ช่วงอายุ/สัญชาติของลูกค้าที่ใช้บริการ 90 วันล่าสุด
 *
 * การ์ดความครอบคลุมต้องอยู่บนสุดเสมอ: วันนี้ข้อมูลเพศมีแค่ส่วนน้อยของลูกค้าที่มีบิล
 * กราฟที่ดูน่าเชื่อถือบนฐานข้อมูลบางคืออันตรายกว่าไม่มีกราฟ — ผู้อ่านต้องเห็น
 * ข้อจำกัดก่อนเห็นตัวเลข (สเปก 2026-08-21)
 */
export async function DemographicsView() {
  const supabase = await createClient()
  const today = todayInShopTz()
  const from = shiftDate(today, -90)

  // บิล 90 วันอาจเกินเพดานแถว PostgREST — ต้องดึงผ่าน fetchAllRows เสมอ
  // (เคยได้ยอดขาด 83,631 บาทมาแล้วจากการดึงตรง — ดู src/lib/fetch-all-rows.ts)
  const bills = await fetchAllRows((offset, limit) =>
    supabase
      .from("sales")
      .select("customer_id, net_amount, revenue_recognize", { count: "exact" })
      .gte("sale_date", from)
      .order("id")
      .range(offset, offset + limit - 1)
  )

  const customerIds = [...new Set(bills.map((b) => b.customer_id).filter(Boolean))] as string[]
  const customers = customerIds.length
    ? await fetchAllRows((offset, limit) =>
        supabase
          .from("customers")
          .select("id, gender, birthday, nationality", { count: "exact" })
          .in("id", customerIds)
          .order("id")
          .range(offset, offset + limit - 1)
      )
    : []

  // ความคืบหน้าการเก็บข้อมูล (การ์ดท้ายหน้า) — เทียบ baseline 21/8/2569: ผูกไลน์ 140 / ครบ 90
  const [{ count: linkedCount }, { count: completeCount }] = await Promise.all([
    supabase.from("line_accounts").select("line_user_id", { count: "exact", head: true }),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .not("gender", "is", null)
      .not("birthday", "is", null),
  ])

  const r = demographicBreakdown(customers, bills, today)
  const lowCoverage = r.genderKnownPct < LOW_COVERAGE_PCT || r.ageKnownPct < LOW_COVERAGE_PCT

  return (
    <div className="space-y-4">
      {/* การ์ดความครอบคลุม — บนสุดเสมอ ห้ามย้าย (สเปก) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            ลูกค้าที่ใช้บริการ 90 วันล่าสุด {r.population} คน
          </CardTitle>
          {r.unnamedBills > 0 && (
            <p className="text-xs text-slate-500">
              (บิลไม่ระบุชื่ออีก {r.unnamedBills} ใบ ไม่อยู่ในตัวเลขนี้)
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          <CoverageBar label="รู้เพศ" pct={r.genderKnownPct} />
          <CoverageBar label="รู้อายุ" pct={r.ageKnownPct} />
          {lowCoverage && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              ⚠️ ตัวเลขด้านล่างมาจากลูกค้าส่วนน้อยที่มีข้อมูล อาจไม่แทนภาพรวมร้าน —
              ยิ่งลูกค้าผูกไลน์และกรอกโปรไฟล์มาก ตัวเลขยิ่งเชื่อถือได้
            </p>
          )}
        </CardContent>
      </Card>

      <BreakdownCard title="เพศ" rows={r.gender} />
      <BreakdownCard title="ช่วงอายุ" rows={r.age} />
      <BreakdownCard title="สัญชาติ" rows={r.nationality} />

      {/* ความคืบหน้าการเก็บข้อมูล — ไว้ดูว่าตัวชวนกรอกในไลน์ทำงานไหม */}
      <Card>
        <CardContent className="py-3 text-sm text-slate-600">
          การเก็บข้อมูล: ผูกไลน์แล้ว{" "}
          <span className="font-semibold">{linkedCount ?? 0}</span> คน · โปรไฟล์ครบ{" "}
          <span className="font-semibold">{completeCount ?? 0}</span> คน
          <span className="text-xs text-slate-400">
            {" "}(21 ส.ค. 2569 อยู่ที่ 140 / 90 — เพิ่มขึ้น = ตัวชวนในไลน์ทำงาน)
          </span>
        </CardContent>
      </Card>
    </div>
  )
}

function CoverageBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-14 shrink-0 text-slate-600">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-2 rounded-full ${pct >= 50 ? "bg-emerald-500" : pct >= 30 ? "bg-amber-500" : "bg-red-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-12 shrink-0 text-right font-medium tabular-nums">{pct}%</span>
    </div>
  )
}

function BreakdownCard({ title, rows }: { title: string; rows: GroupStat[] }) {
  if (rows.length === 0) return null
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-slate-500">
              <th className="py-1.5 font-medium">กลุ่ม</th>
              <th className="py-1.5 text-right font-medium">คน</th>
              <th className="py-1.5 text-right font-medium">ยอดรวม</th>
              <th className="py-1.5 text-right font-medium">เฉลี่ย/คน</th>
              <th className="py-1.5 text-right font-medium">ครั้ง/คน</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr
                key={g.label}
                className={`border-b last:border-0 ${g.label === "ไม่ทราบ" ? "text-slate-400" : ""}`}
              >
                <td className="py-1.5">{g.label}</td>
                <td className="py-1.5 text-right tabular-nums">{g.customers}</td>
                <td className="py-1.5 text-right tabular-nums">{formatBaht(g.revenue)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatBaht(g.avgPerCustomer)}</td>
                <td className="py-1.5 text-right tabular-nums">{g.avgVisits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
