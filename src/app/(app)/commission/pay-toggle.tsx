"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import { setCommissionPaid } from "./commission-actions"
import { Button } from "@/components/ui/button"

export function PayToggle({
  paid,
  payload,
}: {
  paid: boolean
  payload: Parameters<typeof setCommissionPaid>[0]
}) {
  const [pending, startTransition] = useTransition()

  function toggle() {
    startTransition(async () => {
      const result = await setCommissionPaid({ ...payload, isPaid: !paid })
      if (result.ok) {
        toast.success(!paid ? "บันทึกว่าจ่ายแล้ว" : "ยกเลิกสถานะจ่ายแล้ว")
      } else {
        toast.error(result.error ?? "บันทึกไม่สำเร็จ")
      }
    })
  }

  return (
    <Button
      variant={paid ? "outline" : "default"}
      size="sm"
      onClick={toggle}
      disabled={pending}
    >
      {pending ? "..." : paid ? "จ่ายแล้ว ✓" : "ทำเครื่องหมายจ่าย"}
    </Button>
  )
}
