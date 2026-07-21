"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { deleteSale } from "../sale-actions"
import {
  EditSaleButton,
  type EditableSale,
  type MemberBalance,
  type Promotion,
  type Service,
  type Therapist,
} from "./edit-sale-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/** ปุ่มแก้กับปุ่มลบอยู่ด้วยกัน — ทั้งคู่โผล่เฉพาะรายการที่แก้ได้ */
export function SaleRowActions({
  sale,
  therapists,
  services,
  promotions,
  balance,
  currentTherapistName,
  label,
}: {
  sale: EditableSale
  therapists: Therapist[]
  services: Service[]
  promotions: Promotion[]
  balance: MemberBalance | null
  currentTherapistName: string | null
  label: string
}) {
  return (
    <div className="flex items-center">
      <EditSaleButton
        sale={sale}
        therapists={therapists}
        services={services}
        promotions={promotions}
        balance={balance}
        currentTherapistName={currentTherapistName}
      />
      <DeleteSaleButton id={sale.id} label={label} />
    </div>
  )
}

export function DeleteSaleButton({
  id,
  label,
}: {
  id: string
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteSale(id)
      if (result.ok) {
        toast.success("ลบรายการแล้ว")
        setOpen(false)
      } else {
        toast.error(result.error ?? "ลบไม่สำเร็จ")
        // หน้าอาจถูก render ไว้ตั้งแต่เดือนก่อน (แท็บเล็ตเปิดค้างข้ามเดือน)
        // ปุ่มลบที่เห็นจึงอาจเก่า — refresh ให้ server คิดวันที่ใหม่แล้วปุ่มจะหายเอง
        router.refresh()
      }
    })
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={`ลบรายการ ${label}`}
      >
        <Trash2 className="size-4 text-red-600" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ลบรายการขาย?</DialogTitle>
            <DialogDescription>
              {label} — ลบแล้วกู้คืนไม่ได้ และค่ามือหมอของวันนี้จะถูกคำนวณใหม่
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={pending}
            >
              {pending ? "กำลังลบ..." : "ลบรายการ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
