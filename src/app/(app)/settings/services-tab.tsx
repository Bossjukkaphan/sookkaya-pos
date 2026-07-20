"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { saveService } from "./settings-actions"
import { formatBaht } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"

type Service = {
  id: string
  name: string
  price: number
  commission: number
  is_active: boolean
}

export function ServicesTab({
  services,
  canEdit,
}: {
  services: Service[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<Service | "new" | null>(null)
  const [search, setSearch] = useState("")
  const [pending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return services
    return services.filter((s) => s.name.toLowerCase().includes(term))
  }, [services, search])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await saveService(formData)
      if (result.ok) {
        toast.success("บันทึกแล้ว")
        setEditing(null)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  if (editing) {
    const s = editing === "new" ? null : editing
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        {s && <input type="hidden" name="id" value={s.id} />}

        <div className="space-y-2">
          <Label htmlFor="svc_name">ชื่อเมนู</Label>
          <Input
            id="svc_name"
            name="name"
            className="h-12"
            required
            defaultValue={s?.name}
            placeholder="เช่น นวดแผนไทย 60 นาที"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="svc_price">ราคาขาย (฿)</Label>
            <Input
              id="svc_price"
              name="price"
              type="number"
              inputMode="numeric"
              min={0}
              required
              className="h-12"
              defaultValue={s?.price}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="svc_comm">ค่ามือหมอ (฿)</Label>
            <Input
              id="svc_comm"
              name="commission"
              type="number"
              inputMode="numeric"
              min={0}
              required
              className="h-12"
              defaultValue={s?.commission}
            />
          </div>
        </div>

        <label className="flex items-center gap-3 rounded-lg border p-3">
          <Checkbox
            name="is_active"
            defaultChecked={s?.is_active ?? true}
            id="svc_active"
          />
          <span className="flex-1">เปิดขายอยู่</span>
        </label>

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

        <p className="text-xs text-slate-500">
          การแก้ราคามีผลกับรายการขาย<strong>ครั้งต่อไป</strong>เท่านั้น
          รายการที่บันทึกไปแล้วเก็บราคา ณ ตอนขายไว้ ไม่เปลี่ยนตาม
        </p>
      </form>
    )
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <Button onClick={() => setEditing("new")} className="w-full h-11">
          + เพิ่มเมนู
        </Button>
      )}

      <Input
        className="h-11"
        placeholder="ค้นหาเมนู"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="ค้นหาเมนู"
      />

      <p className="text-xs text-slate-500">
        ทั้งหมด {services.length} เมนู · เปิดขาย{" "}
        {services.filter((s) => s.is_active).length}
      </p>

      <ul className="space-y-2">
        {filtered.map((s) => (
          <li key={s.id}>
            <Card className={s.is_active ? undefined : "opacity-60"}>
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {s.name}
                    {!s.is_active && (
                      <Badge variant="outline" className="ml-2">
                        ปิดขาย
                      </Badge>
                    )}
                  </p>
                  <p className="text-sm text-slate-600">
                    {formatBaht(s.price)} ฿ · ค่ามือ {formatBaht(s.commission)} ฿
                  </p>
                </div>
                {canEdit && (
                  <Button variant="ghost" size="sm" onClick={() => setEditing(s)}>
                    แก้ไข
                  </Button>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
