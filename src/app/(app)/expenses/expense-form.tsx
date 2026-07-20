"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { createExpense } from "./expense-actions"
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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      const result = await createExpense(formData)
      if (result.ok) {
        toast.success("บันทึกรายจ่ายแล้ว")
        formRef.current?.reset()
        setCategory("")
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
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
