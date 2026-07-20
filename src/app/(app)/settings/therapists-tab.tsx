"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { saveTherapist } from "./settings-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

type Therapist = { id: string; name: string; status: string }

export function TherapistsTab({
  therapists,
  canEdit,
}: {
  therapists: Therapist[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<Therapist | "new" | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await saveTherapist(formData)
      if (result.ok) {
        toast.success("บันทึกแล้ว")
        setEditing(null)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const active = therapists.filter((t) => t.status === "active")
  const resigned = therapists.filter((t) => t.status !== "active")

  if (editing) {
    const t = editing === "new" ? null : editing
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        {t && <input type="hidden" name="id" value={t.id} />}
        <div className="space-y-2">
          <Label htmlFor="th_name">ชื่อหมอนวด</Label>
          <Input
            id="th_name"
            name="name"
            className="h-12"
            required
            defaultValue={t?.name}
            placeholder="เช่น รัน"
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">สถานะ</legend>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: "active", label: "ทำงานอยู่" },
              { v: "resigned", label: "ลาออกแล้ว" },
            ].map((o) => (
              <label
                key={o.v}
                className="flex cursor-pointer items-center gap-2 rounded-md border p-3 has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50"
              >
                <input
                  type="radio"
                  name="status"
                  value={o.v}
                  defaultChecked={(t?.status ?? "active") === o.v}
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex gap-2">
          <Button type="submit" className="h-12 flex-1" disabled={pending}>
            {pending ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12"
            onClick={() => setEditing(null)}
          >
            ยกเลิก
          </Button>
        </div>
        {t && (
          <p className="text-xs text-slate-500">
            เปลี่ยนเป็น &quot;ลาออกแล้ว&quot; จะไม่โผล่ในหน้าบันทึกขาย
            แต่ประวัติและรายงานเดิมยังอยู่ครบ
          </p>
        )}
      </form>
    )
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <Button onClick={() => setEditing("new")} className="w-full h-11">
          + เพิ่มหมอนวด
        </Button>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-slate-600">
          ทำงานอยู่ ({active.length})
        </h3>
        {active.map((t) => (
          <Card key={t.id}>
            <CardContent className="flex items-center justify-between py-3">
              <span className="font-medium">{t.name}</span>
              {canEdit && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(t)}>
                  แก้ไข
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      {resigned.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-slate-600">
            ลาออกแล้ว ({resigned.length})
          </h3>
          {resigned.map((t) => (
            <Card key={t.id} className="opacity-60">
              <CardContent className="flex items-center justify-between py-3">
                <span>
                  {t.name} <Badge variant="outline">ลาออก</Badge>
                </span>
                {canEdit && (
                  <Button variant="ghost" size="sm" onClick={() => setEditing(t)}>
                    แก้ไข
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </div>
  )
}
