"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { createExpense } from "./expense-actions"
import type { ExpenseWarning } from "@/lib/expense-warnings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function ExpenseForm({
  categories,
  today,
}: {
  categories: string[]
  today: string
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, startTransition] = useTransition()
  const [category, setCategory] = useState("")
  // รายการที่ระบบสงสัยว่าซ้ำหรือหมวดผิด — เก็บฟอร์มไว้เผื่อพนักงานยืนยันแล้วส่งซ้ำ
  const [warnings, setWarnings] = useState<ExpenseWarning[]>([])
  const [pendingForm, setPendingForm] = useState<FormData | null>(null)

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await createExpense(formData)
      if (result.ok) {
        toast.success("บันทึกรายจ่ายแล้ว")
        formRef.current?.reset()
        setCategory("")
        setWarnings([])
        setPendingForm(null)
        router.refresh()
      } else if (result.warnings?.length) {
        // ไม่ใช่ error — ถามให้แน่ใจก่อนว่าตั้งใจบันทึกจริง
        setWarnings(result.warnings)
        setPendingForm(formData)
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setWarnings([])
    submit(new FormData(event.currentTarget))
  }

  function confirmAnyway() {
    if (!pendingForm) return
    pendingForm.set("confirm_warnings", "on")
    setWarnings([])
    submit(pendingForm)
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      {warnings.length > 0 && (
        <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">ตรวจสอบก่อนบันทึก</p>
          <ul className="list-disc space-y-1 pl-5 text-amber-800">
            {warnings.map((w) => (
              <li key={w.kind}>{w.message}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={confirmAnyway} disabled={pending}>
              ตรวจแล้ว ไม่ซ้ำ · บันทึกเลย
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setWarnings([])}>
              กลับไปแก้
            </Button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="expense_date">วันที่</Label>
          <Input
            id="expense_date"
            name="expense_date"
            type="date"
            className="h-12"
            defaultValue={today}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="amount">จำนวนเงิน (฿)</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            required
            className="h-12"
            placeholder="0"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="item">รายการ</Label>
        <Input
          id="item"
          name="item"
          required
          className="h-12"
          placeholder="เช่น ค่าน้ำมันนวด 5 ขวด"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">หมวดหมู่</legend>
        <input type="hidden" name="category" value={category} />
        <div className="grid grid-cols-2 gap-2">
          {categories.map((c) => (
            <Button
              key={c}
              type="button"
              variant={category === c ? "default" : "outline"}
              className="h-auto min-h-11 py-2 text-xs whitespace-normal"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
            >
              {c}
            </Button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="paid_by">ผู้จ่าย</Label>
          <Input id="paid_by" name="paid_by" className="h-12" placeholder="ไม่บังคับ" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expense_notes">หมายเหตุ</Label>
          <Input
            id="expense_notes"
            name="notes"
            className="h-12"
            placeholder="ไม่บังคับ"
          />
        </div>
      </div>

      <Button
        type="submit"
        className="h-12 w-full"
        disabled={pending || !category}
      >
        {pending ? "กำลังบันทึก..." : "บันทึกรายจ่าย"}
      </Button>
    </form>
  )
}
