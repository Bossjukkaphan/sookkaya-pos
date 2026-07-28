"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { saveCustomer } from "./customer-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Customer = {
  id: string
  name: string
  nickname: string | null
  phone: string | null
  line_id: string | null
  birthday: string | null
  notes: string | null
  gender: string | null
  nationality: string | null
}

const GENDERS = ["ชาย", "หญิง", "อื่นๆ"] as const

export function CustomerForm({ customer }: { customer?: Customer }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(!customer)
  const [gender, setGender] = useState(customer?.gender ?? "")
  // เบอร์ชนกับลูกค้าที่มีอยู่ — เก็บฟอร์มไว้เผื่อพนักงานยืนยันว่าเป็นคนละคนแล้วส่งซ้ำ
  const [dupPhone, setDupPhone] = useState<{ id: string; name: string } | null>(null)
  const [pendingForm, setPendingForm] = useState<FormData | null>(null)

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await saveCustomer(formData)
      if (result.ok) {
        toast.success("บันทึกข้อมูลลูกค้าแล้ว")
        if (customer) {
          setOpen(false)
          router.refresh()
        } else {
          router.push(`/customers/${result.id}`)
        }
      } else if (result.duplicatePhone) {
        // ไม่ใช่ error จริง — ถามให้แน่ใจก่อนว่ากดซ้ำ หรือเป็นคนละคนที่ใช้เบอร์เดียวกัน
        setDupPhone(result.duplicatePhone)
        setPendingForm(formData)
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setDupPhone(null)
    submit(new FormData(event.currentTarget))
  }

  function confirmDuplicatePhone() {
    if (!pendingForm) return
    pendingForm.set("allow_duplicate_phone", "on")
    setDupPhone(null)
    submit(pendingForm)
  }

  if (customer && !open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        แก้ไขข้อมูล
      </Button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {customer && <input type="hidden" name="id" value={customer.id} />}

      {dupPhone && (
        <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">
            เบอร์นี้เป็นของ &quot;{dupPhone.name}&quot; อยู่แล้ว
          </p>
          <p className="text-amber-800">
            ถ้าเป็นคนเดียวกัน ให้เปิดข้อมูลเดิมแทนการเพิ่มใหม่ — ประวัติ แต้ม
            และเครดิตจะได้อยู่ที่เดียวกัน
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" type="button">
              <Link href={`/customers/${dupPhone.id}`}>เปิดข้อมูลของ {dupPhone.name}</Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={confirmDuplicatePhone}
              disabled={pending}
            >
              คนละคนที่ใช้เบอร์เดียวกัน · บันทึกต่อ
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">ชื่อลูกค้า</Label>
        <Input
          id="name"
          name="name"
          className="h-12"
          required
          defaultValue={customer?.name}
          placeholder="ชื่อ-นามสกุล"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="nickname">ชื่อเล่น</Label>
          <Input
            id="nickname"
            name="nickname"
            className="h-12"
            defaultValue={customer?.nickname ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">เบอร์โทร</Label>
          <Input
            id="phone"
            name="phone"
            inputMode="tel"
            className="h-12"
            defaultValue={customer?.phone ?? ""}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="line_id">LINE ID</Label>
          <Input
            id="line_id"
            name="line_id"
            className="h-12"
            defaultValue={customer?.line_id ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="birthday">วันเกิด</Label>
          <Input
            id="birthday"
            name="birthday"
            type="date"
            className="h-12"
            defaultValue={customer?.birthday ?? ""}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>เพศ</Label>
          <input type="hidden" name="gender" value={gender} />
          <div className="flex gap-1">
            {GENDERS.map((g) => (
              <Button
                key={g}
                type="button"
                size="sm"
                variant={gender === g ? "default" : "outline"}
                onClick={() => setGender(gender === g ? "" : g)}
              >
                {g}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="nationality">สัญชาติ</Label>
          <Input
            id="nationality"
            name="nationality"
            className="h-12"
            defaultValue={customer?.nationality ?? ""}
            placeholder="เช่น ไทย"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">บันทึกเพิ่มเติม</Label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={customer?.notes ?? ""}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          placeholder="เช่น แพ้น้ำมันบางชนิด ชอบนวดหนัก"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" className="h-12 flex-1" disabled={pending}>
          {pending ? "กำลังบันทึก..." : "บันทึก"}
        </Button>
        {customer && (
          <Button
            type="button"
            variant="outline"
            className="h-12"
            onClick={() => setOpen(false)}
          >
            ยกเลิก
          </Button>
        )}
      </div>
    </form>
  )
}
