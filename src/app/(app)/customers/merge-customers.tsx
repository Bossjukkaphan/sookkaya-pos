"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { mergeCustomers } from "./customer-actions"
import { CustomerPicker } from "../pos/customer-picker"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

/**
 * รวมลูกค้าซ้ำเข้าคนนี้ — เคสหลัก: สมัครสมาชิกไลน์แล้วระบบสร้างเรคคอร์ดใหม่
 * ทั้งที่ร้านมีประวัติลูกค้าคนนี้อยู่แล้ว (เบอร์ไม่ตรง/ไม่เคยบันทึกเบอร์)
 */
export function MergeCustomers({
  targetId,
  targetName,
}: {
  targetId: string
  targetName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pickedId, setPickedId] = useState("")
  const [pickedName, setPickedName] = useState("")
  const [pickedPhone, setPickedPhone] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  function reset() {
    setPickedId("")
    setPickedName("")
    setPickedPhone("")
    setConfirming(false)
  }

  function doMerge() {
    startTransition(async () => {
      const r = await mergeCustomers(targetId, pickedId)
      if (r.ok) {
        toast.success(`รวม "${pickedName}" เข้ากับ "${targetName}" แล้ว`)
        setOpen(false)
        reset()
        router.refresh()
      } else {
        toast.error(r.error)
        setConfirming(false)
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          รวมลูกค้าซ้ำ
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>รวมลูกค้าซ้ำเข้ากับ &quot;{targetName}&quot;</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600">
          ค้นหาเรคคอร์ดที่ซ้ำ (เช่น ตัวที่ระบบไลน์เพิ่งสร้าง) — ประวัติบิล แต้ม คิว
          และบัญชีไลน์ของคนนั้นจะย้ายมารวมที่นี่ทั้งหมด แล้วเรคคอร์ดซ้ำถูกลบ
        </p>
        <CustomerPicker
          customerId={pickedId}
          customerName={pickedName}
          customerPhone={pickedPhone}
          onPick={(c) => {
            setPickedId(c.id)
            setPickedName(c.name)
            setPickedPhone(c.phone ?? "")
          }}
          onNameChange={(name) => {
            setPickedName(name)
            setPickedId("")
          }}
          onPhoneChange={setPickedPhone}
          requireMember={false}
        />
        {pickedId && pickedId !== targetId && (
          confirming ? (
            <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-medium text-red-700">
                ยืนยันรวม &quot;{pickedName}&quot; → &quot;{targetName}&quot;?
                ย้อนกลับไม่ได้
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={pending}
                  onClick={doMerge}
                >
                  {pending ? "กำลังรวม..." : "ยืนยันรวมร่าง"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
                  ยกเลิก
                </Button>
              </div>
            </div>
          ) : (
            <Button className="w-full" onClick={() => setConfirming(true)}>
              รวม &quot;{pickedName}&quot; เข้ากับคนนี้
            </Button>
          )
        )}
        {pickedId === targetId && pickedId && (
          <p className="text-sm text-red-600">เลือกตัวเองไม่ได้ — ค้นหาเรคคอร์ดที่ซ้ำ</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
