import { createClient } from "@/lib/supabase/server"
import { formatBaht } from "@/lib/constants"
import { formatThaiDate, todayInShopTz } from "@/lib/datetime"
import { ExpenseForm } from "./expense-form"
import { ExpenseRowActions } from "./expense-row-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const metadata = { title: "รายจ่าย · สุขกายา POS" }

const FALLBACK_CATEGORIES = [
  "ซักรีด",
  "ค่าเช่าสถานที่",
  "ค่าน้ำ / ค่าไฟ / Internet",
  "วัสดุ-สิ้นเปลือง (น้ำมัน บาล์ม ผ้า)",
  "การตลาด / โฆษณา",
  "HR / payroll (เงินประกัน ค่ามือ)",
  "ชุดลูกค้า ชุดหมอ ชุดพนักงาน",
  "อื่นๆ",
]

export default async function ExpensesPage() {
  const supabase = await createClient()
  const today = todayInShopTz()
  const monthStart = `${today.slice(0, 7)}-01`

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
      .order("expense_date", { ascending: false })
      .limit(100),
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

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">รายจ่าย</h1>

      <Tabs defaultValue="add">
        <TabsList className="w-full">
          <TabsTrigger value="add" className="flex-1">
            บันทึกรายจ่าย
          </TabsTrigger>
          <TabsTrigger value="list" className="flex-1">
            เดือนนี้
          </TabsTrigger>
        </TabsList>

        <TabsContent value="add" className="pt-4">
          <ExpenseForm categories={categories} today={today} />
        </TabsContent>

        <TabsContent value="list" className="space-y-3 pt-4">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex items-baseline justify-between py-4">
              <span className="text-sm font-medium">รายจ่ายเดือนนี้</span>
              <span className="text-2xl font-bold text-red-800">
                {formatBaht(monthTotal)} ฿
              </span>
            </CardContent>
          </Card>

          {Object.keys(byCategory).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">แยกตามหมวดหมู่</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(byCategory)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, amount]) => {
                    const pct = monthTotal > 0 ? (amount / monthTotal) * 100 : 0
                    return (
                      <div key={cat}>
                        <div className="flex justify-between gap-2 text-sm">
                          <span className="text-slate-600">{cat}</span>
                          <span className="font-medium whitespace-nowrap">
                            {formatBaht(amount)} ฿{" "}
                            <span className="text-xs text-slate-400">
                              ({pct.toFixed(0)}%)
                            </span>
                          </span>
                        </div>
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
              <CardTitle className="text-base">รายการ</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {rows.length === 0 ? (
                <p className="px-6 py-6 text-center text-sm text-slate-500">
                  ยังไม่มีรายจ่ายในเดือนนี้
                </p>
              ) : (
                <ul className="divide-y">
                  {rows.map((e) => (
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
