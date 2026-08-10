import Link from "next/link"

import { formatBaht } from "@/lib/constants"
import type { Delta } from "@/lib/period-compare"
import { GroupedBarChart, type Series } from "@/components/charts/grouped-bar-chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

/**
 * โซน 2 — "เงินไปไหน กำไรจริงเหลือเท่าไหร่": กำไร/margin ก่อน ตามด้วยชิปรายจ่ายผิดปกติ
 * แล้วปิดท้ายด้วยกราฟ 6 เดือน — chart มาเป็น Series[] สำเร็จรูปจาก page แล้ว ที่นี่แค่ส่งต่อ
 */
export function MoneyZone({
  headline,
  profit,
  margin,
  profitDelta,
  anomalyChips,
  chart,
}: {
  headline: string
  profit: number
  margin: number | null
  profitDelta: Delta
  anomalyChips: { label: string; level: "alert" | "warn" }[]
  chart: Series[]
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-[#664343]">เงินไปไหน</CardTitle>
        <p className="text-sm text-slate-700">{headline}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            {/* คำศัพท์ทางการของระบบตาม /finance: profit_cash = "กำไรเงินสด" ·
                profit_accrual = "กำไรเชิงบัญชี" — ตัวเลขนี้คิดแบบ accrual (หักค่ามือจากงานจริง
                แล้วไม่หักรายจ่ายหมวดค่ามือซ้ำ) ห้ามเรียกว่ากำไรเงินสด ต่างกันหลักหมื่น */}
            <p className="text-xs text-slate-500">กำไรเชิงบัญชี MTD</p>
            {/* กำไรเขียว ขาดทุนแดง — ภาษาเดียวกันทุกหน้า */}
            <p className={`text-lg font-bold ${profit < 0 ? "text-red-700" : "text-emerald-700"}`}>
              {formatBaht(profit)} ฿
            </p>
          </div>
          <div>
            {/* margin ตัวนี้หารด้วยกำไรเชิงบัญชี ไม่ใช่กำไรเงินสดตามนิยาม MONEY_INFO.margin
                จึงต้องกำกับคำว่า "เชิงบัญชี" ไว้ ไม่งั้นอ่านเทียบกับหน้าอื่นแล้วเพี้ยน */}
            <p className="text-xs text-slate-500">Margin เชิงบัญชี</p>
            <p
              className={`text-lg font-bold ${
                margin !== null && margin < 0 ? "text-red-700" : "text-emerald-700"
              }`}
            >
              {margin === null ? "—" : `${margin.toFixed(1)}%`}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">เทียบเดือนก่อน (MTD)</p>
            <p
              className={`text-lg font-bold ${
                profitDelta.pct !== null && profitDelta.pct < 0 ? "text-red-700" : "text-emerald-700"
              }`}
            >
              {profitDelta.pct === null
                ? "—"
                : `${profitDelta.pct >= 0 ? "▲" : "▼"} ${Math.abs(profitDelta.pct)}%`}
            </p>
          </div>
        </div>

        {/* ชิปกดไปหน้าเจาะลึกรายจ่ายผิดปกติได้เลย — ว่างแปลว่าตรวจแล้วไม่มีอะไรผิดปกติ */}
        <div className="flex flex-wrap gap-1.5">
          {anomalyChips.length === 0 ? (
            <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800">
              รายจ่ายปกติดี ✓
            </span>
          ) : (
            anomalyChips.map((c) => (
              <Link
                key={c.label}
                href="/insights/expenses"
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  c.level === "alert"
                    ? "border-red-300 bg-red-50 text-red-900"
                    : "border-amber-300 bg-amber-50 text-amber-900"
                }`}
              >
                {c.level === "alert" ? "🔴" : "🟡"} {c.label}
              </Link>
            ))
          )}
        </div>

        {/* กราฟมาจาก v_monthly_pl (เดือนเต็ม) ซึ่งเส้นกำไรเป็น "กำไรเงินสด" คนละสูตรกับ
            ตัวเลขเชิงบัญชีข้างบน — ต้องเขียนบอก ไม่งั้นคนอ่านจะนึกว่าเป็นตัวเดียวกันคนละช่วง */}
        <p className="text-xs text-slate-500">
          กราฟ 6 เดือน (เดือนเต็ม) — เส้นกำไรเป็นกำไรเงินสด คนละสูตรกับกำไรเชิงบัญชีข้างบน
        </p>
        <GroupedBarChart series={chart} unit=" ฿" />

        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild variant="outline" size="sm">
            <Link href="/finance">ดูการเงินละเอียด</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/insights/expenses">รายจ่ายผิดปกติ</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
