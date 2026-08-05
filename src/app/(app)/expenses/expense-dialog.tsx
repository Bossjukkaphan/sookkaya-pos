"use client"

import { useState } from "react"

import { ExpenseForm } from "./expense-form"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

/** ปุ่มบันทึกรายจ่าย — เดิมเป็นแท็บกินพื้นที่บนสุดตลอด ทั้งที่ส่วนใหญ่เข้ามาดูรายการ */
export function ExpenseDialog({
  categories,
  today,
}: {
  categories: string[]
  today: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">+ บันทึกรายจ่าย</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>บันทึกรายจ่าย</DialogTitle>
        </DialogHeader>
        <ExpenseForm categories={categories} today={today} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
