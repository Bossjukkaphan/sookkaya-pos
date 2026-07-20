"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { saveSetting } from "./settings-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const FIELDS = [
  {
    key: "min_commission_guarantee",
    label: "ประกันค่ามือขั้นต่ำ (บาท/วัน)",
    type: "number",
    hint: "ถ้าค่ามือรวมทั้งวันของหมอน้อยกว่านี้ จะจ่ายเท่านี้แทน (เฉพาะวันที่เข้างาน)",
  },
  { key: "shop_name", label: "ชื่อร้าน", type: "text" },
  { key: "shop_phone", label: "เบอร์โทรร้าน", type: "tel" },
  { key: "shop_line", label: "LINE ร้าน", type: "text" },
  { key: "open_time", label: "เวลาเปิด", type: "time" },
  { key: "close_time", label: "เวลาปิด", type: "time" },
] as const

export function GeneralTab({
  settings,
  canEdit,
}: {
  settings: Record<string, string>
  canEdit: boolean
}) {
  const router = useRouter()
  const [values, setValues] = useState<Record<string, string>>(settings)
  const [pending, startTransition] = useTransition()

  function save(key: string) {
    startTransition(async () => {
      const result = await saveSetting(key, values[key] ?? "")
      if (result.ok) {
        toast.success("บันทึกแล้ว")
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="space-y-4">
      {FIELDS.map((f) => (
        <div key={f.key} className="space-y-2">
          <Label htmlFor={f.key}>{f.label}</Label>
          <div className="flex gap-2">
            <Input
              id={f.key}
              type={f.type}
              className="h-12"
              disabled={!canEdit}
              value={values[f.key] ?? ""}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.key]: e.target.value }))
              }
            />
            {canEdit && (
              <Button
                type="button"
                variant="outline"
                className="h-12"
                disabled={pending || values[f.key] === settings[f.key]}
                onClick={() => save(f.key)}
              >
                บันทึก
              </Button>
            )}
          </div>
          {"hint" in f && f.hint && (
            <p className="text-xs text-slate-500">{f.hint}</p>
          )}
        </div>
      ))}

      {!canEdit && (
        <p className="text-sm text-slate-500">
          เฉพาะเจ้าของร้านเท่านั้นที่แก้ไขส่วนนี้ได้
        </p>
      )}
    </div>
  )
}
