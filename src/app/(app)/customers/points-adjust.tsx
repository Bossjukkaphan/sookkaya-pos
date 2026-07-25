"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { adjustPoints } from "./customer-actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** ปรับแต้มมือ (ชดเชย/แก้คีย์ผิด) — บังคับกรอกเหตุผลเพื่อให้ตรวจย้อนได้เสมอ */
export function PointsAdjust({ customerId }: { customerId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [delta, setDelta] = useState("")
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const r = await adjustPoints(customerId, Number(delta), reason)
      if (r.ok) {
        toast.success("ปรับแต้มแล้ว")
        setOpen(false)
        setDelta("")
        setReason("")
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          ปรับแต้ม
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>ปรับแต้มมือ</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="adj-delta">
              จำนวนแต้ม{" "}
              <span className="font-normal text-slate-500">(ติดลบ = หักออก เช่น -50)</span>
            </Label>
            <Input
              id="adj-delta"
              type="number"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="เช่น 100 หรือ -50"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="adj-reason">เหตุผล (บังคับ)</Label>
            <Input
              id="adj-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น ชดเชยบิลลืมผูกลูกค้า 25 ก.ค."
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending || !reason.trim()}>
            {pending ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
