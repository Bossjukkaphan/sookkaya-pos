import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { formatBaht } from "@/lib/constants"
import { formatThaiDate, todayInShopTz } from "@/lib/datetime"
import { monthLabel, shiftMonth } from "@/lib/month"
import { ExpenseForm } from "./expense-form"
import { ExpenseRowActions } from "./expense-row-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PagerLink } from "@/components/pager-link"

export const metadata = { title: "รายจ่าย · สุขกายา POS" }

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

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; category?: string }>
}) {
  const supabase = await createClient()
  const today = todayInShopTz()
  const params = await searchParams
  // เลือกดูเดือนอื่นได้ผ่าน ?month=YYYY-MM — ค่าเริ่มต้นเดือนปัจจุบัน
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : today.slice(0, 7)
  // ?category= มาจากการกดตัวเลขในตารางเทียบหมวดของหน้าวิเคราะห์รายจ่าย
  const pickedCategory = params.category?.trim() || null
  const isCurrentMonth = month === today.slice(0, 7)
  const [my, mm] = month.split("-").map(Number)
  const monthStart = `${month}-01`
  const monthEnd = `${month}-${String(new Date(Date.UTC(my, mm, 0)).getUTCDate()).padStart(2, "0")}`
  const monthName = monthLabel(month)

  const [{ data: setting }, { data: expenses }] = await Promise.all([
    supabase
      .from("settings")
      .select("value")
      .eq("key", "expense_categories")
      .single(),
    supabase
      .from("expenses")
      .select("*")
      .gte("expense_date", monthStart)
      .lte("expense_date", monthEnd)
      .order("expense_date", { ascending: false })
      .limit(300),
  ])

  const categories = setting?.value
    ? setting.value.split(",").map((c) => c.trim())
    : FALLBACK_CATEGORIES

  const rows = expenses ?? []
  const monthTotal = rows.reduce((sum, e) => sum + Number(e.amount), 0)

  const byCategory = rows.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount)
    return acc
  }, {})

  const visibleRows = pickedCategory
    ? rows.filter((e) => e.category === pickedCategory)
    : rows
  const visibleTotal = visibleRows.reduce((sum, e) => sum + Number(e.amount), 0)
  const monthQuery = `?month=${month}`
  /** เลื่อนเดือนโดยคงหมวดที่กำลังกรองไว้ — ดูหมวดเดียวย้อนหลายเดือนได้รวดเดียว */
  const monthHref = (m: string) =>
    `/expenses?month=${m}${pickedCategory ? `&category=${encodeURIComponent(pickedCategory)}` : ""}`

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">รายจ่าย</h1>

      {/* มาจากลิงก์เจาะดูรายการ (เช่นตารางเทียบหมวดของหน้าวิเคราะห์) ต้องเปิดแท็บรายการให้เลย
          ไม่งั้นกดลิงก์แล้วเจอฟอร์มบันทึกรายจ่าย ต้องกดแท็บเองอีกที */}
      <Tabs defaultValue={params.month || pickedCategory ? "list" : "add"}>
        <TabsList className="w-full">
          <TabsTrigger value="add" className="flex-1">
            บันทึกรายจ่าย
          </TabsTrigger>
          <TabsTrigger value="list" className="flex-1">
            {isCurrentMonth ? "เดือนนี้" : monthName}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="add" className="pt-4">
          <ExpenseForm categories={categories} today={today} />
        </TabsContent>

        <TabsContent value="list" className="space-y-3 pt-4">
          {/* เลื่อนดูเดือนอื่น */}
          <div className="flex items-center justify-center gap-2">
            <PagerLink href={monthHref(shiftMonth(month, -1))}>←</PagerLink>
            <span className="min-w-36 text-center text-sm font-semibold">{monthName}</span>
            <PagerLink href={monthHref(shiftMonth(month, 1))}>→</PagerLink>
            {!isCurrentMonth && (
              <Link href="/expenses" className="text-xs text-slate-500 underline">
                กลับเดือนนี้
              </Link>
            )}
          </div>

          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex items-baseline justify-between py-4">
              <span className="text-sm font-medium">
                รายจ่าย{isCurrentMonth ? "เดือนนี้" : monthName}
                {pickedCategory && ` · ${pickedCategory}`}
              </span>
              <span className="text-2xl font-bold text-red-800">
                {formatBaht(visibleTotal)} ฿
              </span>
            </CardContent>
          </Card>

          {pickedCategory && (
            <div className="flex items-center justify-between gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm">
              <span className="truncate text-slate-600">
                กำลังดูเฉพาะหมวด <span className="font-medium">{pickedCategory}</span>
              </span>
              <Link href={monthQuery} className="shrink-0 underline">
                ดูทุกหมวด
              </Link>
            </div>
          )}

          {Object.keys(byCategory).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">แยกตามหมวดหมู่</CardTitle>
                <p className="text-xs text-slate-500">กดชื่อหมวดเพื่อดูเฉพาะรายการของหมวดนั้น</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(byCategory)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, amount]) => {
                    const pct = monthTotal > 0 ? (amount / monthTotal) * 100 : 0
                    const active = cat === pickedCategory
                    return (
                      <div key={cat}>
                        <Link
                          href={
                            active ? monthQuery : `${monthQuery}&category=${encodeURIComponent(cat)}`
                          }
                          className="flex justify-between gap-2 text-sm hover:underline"
                        >
                          <span className={active ? "font-medium text-orange-700" : "text-slate-600"}>
                            {cat}
                          </span>
                          <span className="font-medium whitespace-nowrap">
                            {formatBaht(amount)} ฿{" "}
                            <span className="text-xs text-slate-400">
                              ({pct.toFixed(0)}%)
                            </span>
                          </span>
                        </Link>
                        {/* แถบสัดส่วนให้เห็นหมวดที่กินเงินเยอะสุดทันที */}
                        <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-orange-400"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                รายการ
                {pickedCategory && (
                  <span className="ml-1 text-sm font-normal text-slate-500">
                    ({visibleRows.length} รายการ)
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {visibleRows.length === 0 ? (
                <p className="px-6 py-6 text-center text-sm text-slate-500">
                  {pickedCategory
                    ? `ไม่มีรายจ่ายหมวด ${pickedCategory} ในเดือนนี้`
                    : "ยังไม่มีรายจ่ายในเดือนนี้"}
                </p>
              ) : (
                <ul className="divide-y">
                  {visibleRows.map((e) => (
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
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
