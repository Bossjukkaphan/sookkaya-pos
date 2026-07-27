"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { saveCategoryType, saveExpenseCostType } from "./settings-actions"
import { formatBaht } from "@/lib/constants"
import { formatThaiDate } from "@/lib/datetime"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type CostType = "fixed" | "variable" | "onetime"

type CategoryType = { category: string; cost_type: string }
type ExpenseRow = {
  id: string
  expense_date: string
  item: string
  category: string
  amount: number
  cost_type: string
}

const COST_TYPE_OPTIONS: { value: CostType; label: string; icon: string }[] = [
  { value: "fixed", label: "คงที่", icon: "⚙️" },
  { value: "variable", label: "ผันแปร", icon: "📈" },
  { value: "onetime", label: "ครั้งเดียว", icon: "🎯" },
]

// เงินเดือนพนักงานประจำแยกไปหมวดของตัวเองแล้ว (27/7/2569) หมวดนี้จึงเหลือค่ามือหมอล้วน
// แต่ยังมีทั้งค่ามือ (ผันแปร) และเงินประกันมือ (คงที่) ปนกัน จึงยังต้องให้เจ้าของร้านตรวจเอง
const HR_PAYROLL_CATEGORY = "HR / payroll (ค่ามือหมอ)"

function CostTypeSelector({
  value,
  saving,
  onSelect,
}: {
  value: string
  saving: boolean
  onSelect: (v: CostType) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {COST_TYPE_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={saving}
          onClick={() => onSelect(o.value)}
          className={`flex flex-col items-center gap-0.5 rounded-md border py-1.5 text-xs transition-colors disabled:opacity-50 ${
            value === o.value
              ? "border-emerald-600 bg-emerald-50 font-medium text-emerald-900"
              : "border-slate-200 text-slate-600"
          }`}
        >
          <span>{o.icon}</span>
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function CostTypesTab({
  categoryTypes,
  expenses,
}: {
  categoryTypes: CategoryType[]
  expenses: ExpenseRow[]
}) {
  const router = useRouter()
  const [categories, setCategories] = useState(categoryTypes)
  const [rows, setRows] = useState(expenses)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const [categoryFilter, setCategoryFilter] = useState(
    categories.some((c) => c.category === HR_PAYROLL_CATEGORY)
      ? HR_PAYROLL_CATEGORY
      : "all"
  )
  const [costTypeFilter, setCostTypeFilter] = useState<"all" | CostType>("all")

  const categoryOptions = useMemo(() => {
    const names = new Set<string>()
    categories.forEach((c) => names.add(c.category))
    rows.forEach((r) => names.add(r.category))
    return Array.from(names).sort()
  }, [categories, rows])

  const filteredExpenses = useMemo(() => {
    return rows.filter((r) => {
      if (categoryFilter !== "all" && r.category !== categoryFilter) return false
      if (costTypeFilter !== "all" && r.cost_type !== costTypeFilter) return false
      return true
    })
  }, [rows, categoryFilter, costTypeFilter])

  function handleCategorySave(category: string, costType: CostType) {
    const key = `cat:${category}`
    setSavingKey(key)
    startTransition(async () => {
      const result = await saveCategoryType(category, costType)
      if (result.ok) {
        setCategories((prev) =>
          prev.map((c) =>
            c.category === category ? { ...c, cost_type: costType } : c
          )
        )
        toast.success("บันทึกแล้ว")
        router.refresh()
      } else {
        toast.error(result.error)
      }
      setSavingKey(null)
    })
  }

  function handleExpenseSave(id: string, costType: CostType) {
    const key = `exp:${id}`
    setSavingKey(key)
    startTransition(async () => {
      const result = await saveExpenseCostType(id, costType)
      if (result.ok) {
        setRows((prev) =>
          prev.map((r) => (r.id === id ? { ...r, cost_type: costType } : r))
        )
        toast.success("บันทึกแล้ว")
        router.refresh()
      } else {
        toast.error(result.error)
      }
      setSavingKey(null)
    })
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">ค่าตั้งต้นตามหมวดหมู่</h2>
          <p className="text-xs text-slate-500">
            ตั้งค่านี้มีผลกับรายจ่าย<strong>รายการใหม่</strong>ในหมวดนี้เท่านั้น
            ไม่ย้อนหลังไปเปลี่ยนรายการที่บันทึกไปแล้ว — ถ้าต้องแก้ของเก่า
            ให้ไปที่หัวข้อ &quot;แก้รายรายการ&quot; ด้านล่าง
          </p>
        </div>

        <div className="space-y-2">
          {categories.map((c) => (
            <Card key={c.category}>
              <CardContent className="space-y-2 py-3">
                <p className="text-sm font-medium">{c.category}</p>
                <CostTypeSelector
                  value={c.cost_type}
                  saving={savingKey === `cat:${c.category}`}
                  onSelect={(v) => handleCategorySave(c.category, v)}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">แก้รายรายการ</h2>
          {categoryFilter === HR_PAYROLL_CATEGORY && (
            <p className="text-xs text-slate-500">
              หมวดนี้ปนกันระหว่างค่ามือหมอ (ผันแปร) กับเงินเดือนพนักงานต้อนรับ/แม่บ้าน
              (คงที่) กติกาเดิมแยกด้วยการเดาคำในชื่อรายการ ซึ่งไม่แม่นกับคำใหม่ๆ
              จึงควรตรวจและแก้เป็นรายการที่นี่
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">หมวดหมู่</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทั้งหมด</SelectItem>
                {categoryOptions.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">ประเภทต้นทุน</Label>
            <Select
              value={costTypeFilter}
              onValueChange={(v) => setCostTypeFilter(v as "all" | CostType)}
            >
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทั้งหมด</SelectItem>
                {COST_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.icon} {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          พบ {filteredExpenses.length} รายการ (จากล่าสุด {rows.length} รายการ)
        </p>

        <ul className="space-y-2">
          {filteredExpenses.map((r) => (
            <li key={r.id}>
              <Card>
                <CardContent className="space-y-2 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{r.item}</p>
                      <p className="text-xs text-slate-500">
                        {formatThaiDate(r.expense_date)} · {r.category}
                      </p>
                    </div>
                    <span className="shrink-0 font-medium">
                      {formatBaht(r.amount)} ฿
                    </span>
                  </div>
                  <CostTypeSelector
                    value={r.cost_type}
                    saving={savingKey === `exp:${r.id}`}
                    onSelect={(v) => handleExpenseSave(r.id, v)}
                  />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>

        {filteredExpenses.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">
            ไม่พบรายการตามตัวกรองนี้
          </p>
        )}
      </section>
    </div>
  )
}
