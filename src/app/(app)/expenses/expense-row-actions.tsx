"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { deleteExpense, updateExpense } from "./expense-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type ExpenseRow = {
  id: string
  expense_date: string
  item: string
  category: string
  amount: number
  paid_by: string | null
  notes: string | null
}

/**
 * แก้/ลบรายจ่ายรายแถว — แก้แล้วกำไรเงินสด/เชิงบัญชี/รายงาน คำนวณใหม่ให้เองทันที
 * server กันเดือนที่ปิดงบแล้วอีกชั้น (แก้/ลบ/ย้ายวันที่ ได้เฉพาะเดือนปัจจุบัน)
 */
export function ExpenseRowActions({
  expense,
  categories,
}: {
  expense: ExpenseRow
  categories: string[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [category, setCategory] = useState(expense.category)
  const [pending, startTransition] = useTransition()

  function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await updateExpense(expense.id, formData)
      if (result.ok) {
        toast.success("แก้รายจ่ายแล้ว — ตัวเลขการเงินอัพเดตตามทันที")
        setEditing(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteExpense(expense.id)
      if (result.ok) {
        toast.success("ลบรายจ่ายแล้ว — ตัวเลขการเงินอัพเดตตามทันที")
        setConfirmingDelete(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="flex shrink-0 gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        onClick={() => {
          setCategory(expense.category)
          setEditing(true)
        }}
      >
        ✏️
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-red-600"
        onClick={() => setConfirmingDelete(true)}
      >
        🗑
      </Button>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>แก้รายจ่าย</DialogTitle>
            <DialogDescription>
              บันทึกแล้ว กำไรเงินสด/เชิงบัญชี และรายงานทุกหน้า จะคำนวณใหม่ตามทันที
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`ed_date_${expense.id}`}>วันที่</Label>
                <Input
                  id={`ed_date_${expense.id}`}
                  name="expense_date"
                  type="date"
                  className="h-11"
                  defaultValue={expense.expense_date}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`ed_amount_${expense.id}`}>จำนวนเงิน (฿)</Label>
                <Input
                  id={`ed_amount_${expense.id}`}
                  name="amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  required
                  className="h-11"
                  defaultValue={expense.amount}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`ed_item_${expense.id}`}>รายการ</Label>
              <Input
                id={`ed_item_${expense.id}`}
                name="item"
                required
                className="h-11"
                defaultValue={expense.item}
              />
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">หมวดหมู่</legend>
              <input type="hidden" name="category" value={category} />
              <div className="grid grid-cols-2 gap-1.5">
                {categories.map((c) => (
                  <Button
                    key={c}
                    type="button"
                    size="sm"
                    variant={category === c ? "default" : "outline"}
                    className="h-auto min-h-9 py-1.5 text-xs whitespace-normal"
                    onClick={() => setCategory(c)}
                    aria-pressed={category === c}
                  >
                    {c}
                  </Button>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`ed_paidby_${expense.id}`}>ผู้จ่าย</Label>
                <Input
                  id={`ed_paidby_${expense.id}`}
                  name="paid_by"
                  className="h-11"
                  defaultValue={expense.paid_by ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`ed_notes_${expense.id}`}>หมายเหตุ</Label>
                <Input
                  id={`ed_notes_${expense.id}`}
                  name="notes"
                  className="h-11"
                  defaultValue={expense.notes ?? ""}
                />
              </div>
            </div>
            <Button
              type="submit"
              className="h-11 w-full"
              disabled={pending || !category}
            >
              {pending ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>ลบรายจ่ายนี้?</DialogTitle>
            <DialogDescription>
              {expense.item} · {expense.amount.toLocaleString()} ฿ — ลบแล้วกู้คืนไม่ได้
              และกำไรของเดือนนี้จะถูกคำนวณใหม่ทันที
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setConfirmingDelete(false)}
            >
              ไม่ลบ
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={pending}
              onClick={handleDelete}
            >
              {pending ? "กำลังลบ..." : "ลบรายจ่าย"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
