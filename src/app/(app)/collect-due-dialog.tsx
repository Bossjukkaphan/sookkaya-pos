"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { addBillPayment } from "./payment-actions"
import { PAYMENT_LINE_METHODS } from "@/lib/payments"
import { formatBaht } from "@/lib/constants"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * กล่องเก็บเงินเพิ่มของบิลค้างรับ — ใช้ร่วมจากการ์ดคิว / หน้าวันนี้ / ประวัติ
 * default = ยอดค้างทั้งหมด · เลือกวิธี · กดยืนยันเรียก addBillPayment แล้วแจ้งผล
 * (โครง Dialog ตามแบบ turn-away-button.tsx — ปุ่มเปิด + useTransition + toast idiom เดียวกัน)
 */
export function CollectDueDialog({
  billKey,
  due,
  onDone,
}: {
  billKey: string
  due: number
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState<string>(PAYMENT_LINE_METHODS[0])
  const [amount, setAmount] = useState(String(due))
  const [pending, startTransition] = useTransition()

  function submit() {
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("ยอดต้องมากกว่า 0")
      return
    }
    startTransition(async () => {
      const r = await addBillPayment(billKey, method, n)
      if (r.ok) {
        toast.success(
          r.due > 0.001
            ? `เก็บเพิ่มแล้ว — ยังค้างรับ ${formatBaht(r.due)} ฿`
            : "เก็บครบแล้ว — บิลนี้ไม่มีค้างรับแล้ว"
        )
        setOpen(false)
        onDone()
      } else {
        toast.error(r.error)
      }
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-red-200 text-red-600 hover:bg-red-50"
        onClick={() => {
          // เปิดกล่องใหม่ทุกครั้ง — เผื่อ due ที่ได้จาก props เปลี่ยนไปตั้งแต่เปิดครั้งก่อน
          setAmount(String(due))
          setMethod(PAYMENT_LINE_METHODS[0])
          setOpen(true)
        }}
      >
        เก็บเพิ่ม
      </Button>

      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>เก็บเงินเพิ่ม — ค้างรับ {formatBaht(due)} ฿</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_LINE_METHODS.map((m) => (
                  <Button
                    key={m}
                    type="button"
                    variant={method === m ? "default" : "outline"}
                    className="h-11 text-xs sm:text-sm"
                    onClick={() => setMethod(m)}
                    aria-pressed={method === m}
                  >
                    {m}
                  </Button>
                ))}
              </div>
              <Input
                inputMode="numeric"
                className="h-11"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label="จำนวนเงินที่เก็บเพิ่ม"
              />
            </div>
            <div className="flex gap-2">
              <Button disabled={pending} onClick={submit} className="flex-1">
                {pending ? "กำลังบันทึก..." : "บันทึกเก็บเพิ่ม"}
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)}>
                ยกเลิก
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
