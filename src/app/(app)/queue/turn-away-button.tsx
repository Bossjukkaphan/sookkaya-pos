"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { recordTurnAway } from "./queue-actions"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * บันทึกทุกครั้งที่ต้องปฏิเสธลูกค้าเพราะคิวเต็ม — ยอดนี้คือ "รายได้ที่หลุดมือ"
 * ตัวเลขสำคัญที่สุดตอนตัดสินใจจ้างหมอเพิ่ม
 */
export function TurnAwayButton({
  boardDate,
  initialCount,
}: {
  boardDate: string
  initialCount: number
}) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  const [count, setCount] = useState(initialCount)
  const [pending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const r = await recordTurnAway(boardDate, note)
      if (r.ok) {
        toast.success("บันทึกปฏิเสธลูกค้าแล้ว")
        setCount((c) => c + 1)
        setNote("")
        setOpen(false)
      } else {
        toast.error(r.error)
      }
    })
  }

  return (
    <>
      <Button
        variant="outline"
        className="h-11 border-red-200 text-red-600 hover:bg-red-50"
        onClick={() => setOpen(true)}
      >
        ปฏิเสธลูกค้า{count > 0 ? ` (${count})` : ""}
      </Button>

      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>บันทึกปฏิเสธลูกค้า</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600">
              กดบันทึกทุกครั้งที่รับลูกค้าไม่ได้ (คิวเต็ม/หมอไม่ว่าง) —
              ตัวเลขนี้ช่วยตัดสินใจว่าควรจ้างหมอเพิ่มไหม
            </p>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-11"
              placeholder="หมายเหตุ (ไม่บังคับ) เช่น ลูกค้า 2 คน อยากได้นวดน้ำมัน"
            />
            <div className="flex gap-2">
              <Button
                disabled={pending}
                onClick={submit}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                {pending ? "กำลังบันทึก..." : "บันทึกปฏิเสธ"}
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
