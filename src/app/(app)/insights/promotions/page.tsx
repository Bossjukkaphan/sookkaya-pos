import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { InsightsAccessDenied, canSeeInsights } from "../shared"
import { formatBaht } from "@/lib/constants"
import { formatThaiDate } from "@/lib/datetime"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = { title: "ROI ส่วนลด · สุขกายา POS" }

const SECTIONS = [
  { kind: "promotion", heading: "การตลาด", note: null },
  {
    kind: "channel",
    heading: "ช่องทางขาย",
    note: "ลูกค้าจ่ายเงินให้ช่องทางนี้ ไม่ได้จ่ายที่ร้าน",
  },
  {
    kind: "giveaway",
    heading: "ให้ฟรีเพื่อโปรโมท",
    note: "ร้านออกค่าใช้จ่ายเองเต็มจำนวน ไม่ได้คาดหวังรายรับ",
  },
  {
    kind: "internal",
    heading: "ใช้ภายใน",
    note: "ไม่ใช่โปรโมชั่นการตลาด แยกไว้ไม่ให้ปนกับตัวเลขข้างบน",
  },
] as const

export default async function PromotionsInsightPage() {
  const supabase = await createClient()
  const { data: profile } = await supabase.from("profiles").select("role").single()

  if (!canSeeInsights(profile?.role)) {
    return <InsightsAccessDenied title="ROI ส่วนลด" />
  }

  const [{ data: roi }, { data: unmatchedRows }] = await Promise.all([
    supabase
      .from("v_promo_roi")
      .select(
        "promotion_id, promotion_name, kind, uses, discount_given, revenue, customers, returning_customers, first_used, last_used"
      ),
    supabase.from("v_promo_unmatched").select("uses"),
  ])

  // v_promo_unmatched คืนแถวละ 1 ข้อความที่ไม่ซ้ำกัน (ตอนนี้ 19 แถว) ไม่ใช่แถวละ 1 รายการขาย
  // จึงไม่ชนเพดาน 1,000 แถวของ supabase-js แม้ยอดขายจะโตขึ้นอีกมาก
  const unmatchedCount = (unmatchedRows ?? []).reduce(
    (sum, r) => sum + Number(r.uses ?? 0),
    0
  )

  // เรียงตามส่วนลดที่จ่ายไป — โปรฯ ที่กินส่วนลดมากที่สุดคือตัวที่ต้องตัดสินใจก่อน
  const rows = [...(roi ?? [])].sort(
    (a, b) => Number(b.discount_given ?? 0) - Number(a.discount_given ?? 0)
  )

  // นับเฉพาะโปรฯ การตลาด — ช่องทางขายและรายการใช้ภายในไม่ใช่ส่วนลดที่ร้านออกให้
  const totalDiscount = rows
    .filter((r) => r.kind === "promotion")
    .reduce((s, r) => s + Number(r.discount_given ?? 0), 0)

  // แยกให้เห็นทั้งสองก้อน — ของแถมก็เป็นเงินที่ร้านออกเองเหมือนกัน ไม่ใช่ศูนย์
  const totalGiveaway = rows
    .filter((r) => r.kind === "giveaway")
    .reduce((s, r) => s + Number(r.discount_given ?? 0), 0)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">ROI ส่วนลด</h1>
        <p className="text-sm text-slate-600">
          ส่วนลดการตลาด {formatBaht(totalDiscount)} บาท
          {totalGiveaway > 0 && (
            <> · ของแถมเพื่อโปรโมท {formatBaht(totalGiveaway)} บาท</>
          )}
        </p>
      </div>

      {unmatchedCount > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-3 text-xs text-amber-900">
            มี {unmatchedCount} รายการที่พิมพ์ชื่อโปรฯ ไว้แต่ยังไม่ได้จับคู่
            จึงยังไม่ถูกนับในตารางนี้ —{" "}
            <Link href="/settings" className="underline">
              ไปจับคู่ที่หน้าตั้งค่า
            </Link>
          </CardContent>
        </Card>
      )}

      {SECTIONS.map((section) => {
        const sectionRows = rows.filter((r) => r.kind === section.kind)
        if (sectionRows.length === 0) return null

        return (
          <div key={section.kind} className="space-y-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">
                {section.heading}
              </h2>
              {section.note && (
                <p className="text-xs text-slate-500">{section.note}</p>
              )}
            </div>

            {sectionRows.map((r) => {
              const customers = Number(r.customers ?? 0)
              const returning = Number(r.returning_customers ?? 0)
              const isChannel = r.kind === "channel"
              const revenue = Number(r.revenue ?? 0)
              const returnRate =
                customers > 0 ? Math.round((returning / customers) * 100) : 0
              return (
                <Card key={r.promotion_id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="truncate text-base">
                      {r.promotion_name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      <Stat label="ใช้ไป" value={`${r.uses ?? 0} ครั้ง`} />
                      {isChannel ? (
                        <Stat
                          label="มูลค่าตั๋วที่ขายผ่านช่องทาง"
                          value={`${formatBaht(Number(r.discount_given ?? 0))} ฿`}
                        />
                      ) : (
                        <Stat
                          label="ส่วนลดที่ให้"
                          value={`${formatBaht(Number(r.discount_given ?? 0))} ฿`}
                        />
                      )}
                      <Stat
                        label="ยอดขายที่เกิด"
                        value={
                          revenue === 0 && Number(r.discount_given ?? 0) > 0
                            ? "ไม่ได้บันทึก"
                            : `${formatBaht(revenue)} ฿`
                        }
                      />
                      <Stat label="ลูกค้าที่ใช้" value={`${customers} คน`} />
                    </div>

                    {revenue === 0 && Number(r.discount_given ?? 0) > 0 && (
                      <p className="text-xs text-amber-700">
                        {isChannel
                          ? "ระบบไม่ได้บันทึกว่าได้รับเงินจากช่องทางนี้เท่าไหร่ ตัวเลขข้างบนจึงเป็นมูลค่าตั๋วตามราคาปกติ ไม่ใช่ส่วนลดที่ร้านออกให้"
                          : "รายการนี้ให้ฟรี ไม่มีรายรับตั้งแต่ต้น ตัวเลขข้างบนคือมูลค่าตามราคาปกติที่ร้านออกให้เอง"}
                      </p>
                    )}

                    <div className="border-t pt-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-slate-600">
                          กลับมาซื้อซ้ำหลังใช้โปรฯ
                        </span>
                        <span
                          className={`font-semibold ${
                            returnRate >= 50 ? "text-emerald-800" : "text-slate-700"
                          }`}
                        >
                          {returning} คน ({returnRate}%)
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {r.first_used && r.last_used
                          ? `ใช้ครั้งแรก ${formatThaiDate(r.first_used)} · ล่าสุด ${formatThaiDate(r.last_used)}`
                          : null}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )
      })}

      {rows.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">
          ยังไม่มีโปรโมชั่นที่จับคู่ไว้
        </p>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
