import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { formatBaht } from "@/lib/constants"
import { formatThaiDate, todayInShopTz } from "@/lib/datetime"
import { daysInMonth, monthLabel, monthShortLabel, recentMonths, shiftMonth } from "@/lib/month"
import { donutSlices } from "@/lib/chart"
import { DonutChart, DONUT_COLORS, type DonutSliceLink } from "@/components/charts/donut-chart"
import { ExpenseDialog } from "./expense-dialog"
import { ExpenseRowActions } from "./expense-row-actions"
import { PeriodPicker } from "./period-picker"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export const metadata = { title: "รายจ่าย · สุขกายา POS" }

/** จำนวนชิพเดือนที่โชว์ ที่เหลือย้อนผ่านช่องปฏิทิน */
const MONTH_CHIPS = 6
/** เพดานแถวที่ดึง — 6 เดือนราว 200 แถว เผื่อโตไว้ถึงสิ้นปี */
const ROW_LIMIT = 1000

const FALLBACK_CATEGORIES = [
  "ซักรีด",
  "ค่าเช่าสถานที่",
  "ค่าน้ำ / ค่าไฟ / Internet",
  "วัสดุ-สิ้นเปลือง (น้ำมัน บาล์ม ผ้า)",
  "การตลาด / โฆษณา",
  // ค่ามือหมออยู่หมวดนี้หมวดเดียว — เงินเดือนพนักงานประจำต้องแยก ไม่งั้นกำไรทางบัญชี
  // จะไม่หักเงินเดือน (สูตรตัดทั้งหมวดนี้ออกเพื่อกันนับค่ามือซ้ำ)
  "HR / payroll (ค่ามือหมอ)",
  "เงินเดือนพนักงานประจำ",
  "ชุดลูกค้า ชุดหมอ ชุดพนักงาน",
  "อื่นๆ",
]

function lastDayOf(month: string): string {
  return `${month}-${String(daysInMonth(month)).padStart(2, "0")}`
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; months?: string; category?: string }>
}) {
  const supabase = await createClient()
  const today = todayInShopTz()
  const params = await searchParams

  // โหมดรวมช่วงชนะเสมอเมื่อส่งมาถูกต้อง — ค่าอื่นถือว่าไม่ได้ส่ง
  const range = params.months === "3" ? 3 : params.months === "6" ? 6 : null
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : today.slice(0, 7)
  const pickedCategory = params.category?.trim() || null

  const endMonth = range ? today.slice(0, 7) : month
  const startMonth = range ? shiftMonth(endMonth, -(range - 1)) : month
  const from = `${startMonth}-01`
  const to = lastDayOf(endMonth)

  const periodLabel = range
    ? `${monthShortLabel(startMonth)} – ${monthShortLabel(endMonth)}`
    : monthLabel(month)

  const [{ data: setting }, { data: expenses }] = await Promise.all([
    supabase.from("settings").select("value").eq("key", "expense_categories").single(),
    supabase
      .from("expenses")
      .select("*")
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("expense_date", { ascending: false })
      .limit(ROW_LIMIT),
  ])

  const categories = setting?.value
    ? setting.value.split(",").map((c) => c.trim())
    : FALLBACK_CATEGORIES

  const rows = expenses ?? []
  type ExpenseRow = (typeof rows)[number]
  const hitLimit = rows.length === ROW_LIMIT

  // วงกลมคิดจากทั้งช่วงเสมอ ไม่ใช่เฉพาะหมวดที่กรอง ไม่งั้นเหลือชิ้นเดียว 100% ไร้ประโยชน์
  const byCategory = rows.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount)
    return acc
  }, {})

  const visibleRows = pickedCategory
    ? rows.filter((e) => e.category === pickedCategory)
    : rows
  const visibleTotal = visibleRows.reduce((sum, e) => sum + Number(e.amount), 0)

  const baseQuery = range ? `?months=${range}` : `?month=${month}`
  const hrefFor = (category: string) =>
    category === pickedCategory
      ? baseQuery
      : `${baseQuery}&category=${encodeURIComponent(category)}`

  /** ยอดของชิ้นตรงกับหมวดชื่อเดียวกันไหม — ไม่ตรง = donutSlices ยุบหลายหมวดมารวมกัน */
  const isMergedSlice = (label: string, value: number) =>
    Math.abs((byCategory[label] ?? 0) - value) > 0.005

  const slices: DonutSliceLink[] = donutSlices(
    Object.entries(byCategory).map(([label, value]) => ({ label, value }))
  ).map((s, i) => ({
    ...s,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
    // ชิ้นที่ยอดไม่ตรงกับหมวดชื่อเดียวกัน = ถูกยุบหลายหมวดเข้าด้วยกัน กดกรองไม่ได้
    // (กรองด้วยชื่อเดียวจะได้รายการน้อยกว่าที่ชิ้นนั้นแทน — ไม่ตรงแบบเงียบๆ)
    href: isMergedSlice(s.label, s.value) ? "" : hrefFor(s.label),
  }))

  // โหมดรวมช่วงคั่นหัวข้อเดือน ไม่งั้น 200 แถวเรียงรวดเดียวหาอะไรไม่เจอ
  const groups: [string, ExpenseRow[]][] = range
    ? Array.from(
        visibleRows.reduce((map, e) => {
          const m = e.expense_date.slice(0, 7)
          map.set(m, [...(map.get(m) ?? []), e])
          return map
        }, new Map<string, ExpenseRow[]>())
      ).sort((a, b) => b[0].localeCompare(a[0]))
    : [[endMonth, visibleRows]]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-bold">รายจ่าย</h1>
        <ExpenseDialog categories={categories} today={today} />
      </div>

      <Card>
        <CardContent className="py-4">
          <PeriodPicker
            months={recentMonths(today, MONTH_CHIPS)}
            activeMonth={range ? null : month}
            activeRange={range}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <div className="space-y-3 lg:order-1">
          {pickedCategory && (
            <div className="flex items-center justify-between gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm">
              <span className="truncate text-slate-600">
                กำลังดูเฉพาะหมวด <span className="font-medium">{pickedCategory}</span>
              </span>
              <Link href={baseQuery} className="shrink-0 underline">
                ดูทุกหมวด
              </Link>
            </div>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                รายการ
                <span className="ml-1 text-sm font-normal text-slate-500">
                  ({visibleRows.length} รายการ)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {visibleRows.length === 0 ? (
                <p className="px-6 py-6 text-center text-sm text-slate-500">
                  {pickedCategory
                    ? `ไม่มีรายจ่ายหมวด ${pickedCategory} ในช่วงนี้`
                    : "ยังไม่มีรายจ่ายในช่วงนี้"}
                </p>
              ) : (
                groups.map(([groupMonth, groupRows]) => (
                  <div key={groupMonth}>
                    {range && (
                      <div className="flex justify-between gap-2 border-y bg-slate-50 px-4 py-1.5 text-xs font-medium text-slate-600 sm:px-6">
                        <span>{monthLabel(groupMonth)}</span>
                        <span>
                          {formatBaht(groupRows.reduce((s, e) => s + Number(e.amount), 0))} ฿
                        </span>
                      </div>
                    )}
                    <ul className="divide-y">
                      {groupRows.map((e) => (
                        <li
                          key={e.id}
                          className="flex items-start justify-between gap-3 px-4 py-3 sm:px-6"
                        >
                          <div className="min-w-0">
                            <p className="font-medium">{e.item}</p>
                            <p className="text-xs text-slate-500">
                              {formatThaiDate(e.expense_date)}
                              {e.paid_by && ` · จ่ายโดย ${e.paid_by}`}
                            </p>
                            <Badge variant="outline" className="mt-1 text-xs">
                              {e.category}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-semibold whitespace-nowrap">
                              {formatBaht(Number(e.amount))} ฿
                            </span>
                            <ExpenseRowActions
                              expense={{
                                id: e.id,
                                expense_date: e.expense_date,
                                item: e.item,
                                category: e.category,
                                amount: Number(e.amount),
                                paid_by: e.paid_by,
                                notes: e.notes,
                              }}
                              categories={categories}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
              {hitLimit && (
                <p className="px-6 py-3 text-center text-xs text-amber-700">
                  แสดงได้สูงสุด {ROW_LIMIT} รายการ ช่วงนี้มีมากกว่านั้น — ยอดรวมและกราฟคิดจากที่แสดงเท่านั้น
                  ลองเลือกช่วงให้สั้นลง
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3 lg:order-2 lg:sticky lg:top-4 lg:self-start">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4">
              <p className="text-sm font-medium">
                รายจ่าย {periodLabel}
                {pickedCategory && ` · ${pickedCategory}`}
              </p>
              <p className="text-2xl font-bold text-red-800">{formatBaht(visibleTotal)} ฿</p>
            </CardContent>
          </Card>

          {slices.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">แยกตามหมวดหมู่</CardTitle>
                <p className="text-xs text-slate-500">กดที่ชิ้นหรือชื่อหมวดเพื่อกรองรายการ</p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 lg:flex-col">
                  <DonutChart slices={slices} size={120} activeLabel={pickedCategory} />
                  <div className="w-full space-y-1.5">
                    {slices.map((s) => {
                      const dot = (
                        <span
                          className="size-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: s.color }}
                        />
                      )
                      const name = (
                        <span
                          className={`min-w-0 flex-1 truncate ${
                            s.label === pickedCategory
                              ? "font-medium text-slate-900"
                              : "text-slate-600"
                          }`}
                        >
                          {s.label}
                          {!s.href && <span className="text-slate-400"> (หลายหมวดรวมกัน)</span>}
                        </span>
                      )
                      const pct = <span className="shrink-0 text-slate-500">{s.pct.toFixed(0)}%</span>
                      // ชิ้นที่ยุบหลายหมวดกดกรองไม่ได้ — แสดงเป็นข้อความเฉยๆ ไม่ล่อให้กด
                      if (!s.href) {
                        return (
                          <div key={s.label} className="flex items-center gap-2 text-sm">
                            {dot}
                            {name}
                            {pct}
                          </div>
                        )
                      }
                      return (
                        <Link
                          key={s.label}
                          href={s.href}
                          className="flex items-center gap-2 text-sm hover:underline"
                        >
                          {dot}
                          {name}
                          {pct}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
