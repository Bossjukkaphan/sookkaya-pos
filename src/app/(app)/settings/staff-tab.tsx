"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { saveStaffMember } from "./settings-actions"
import { NEW_ROLE_VALUE, staffRoleOptions } from "@/lib/staff-roles"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

type Staff = { id: string; name: string; role: string; is_active: boolean }

/**
 * จัดการทีมงานที่ไม่ใช่หมอนวด — เพิ่มคน เปลี่ยนตำแหน่ง และบันทึกว่าลาออก
 *
 * แยกจากแท็บหมอนวดเพราะคนละตาราง: หมอนวดผูกกับบิล/ค่ามือ ส่วนทีมงานผูกกับ
 * การเข้างานและตารางวันหยุดเท่านั้น แต่หน้าตาจงใจทำให้เหมือนกัน
 * พนักงานจะได้เรียนรู้ครั้งเดียวใช้ได้ทั้งสองแท็บ
 */
export function StaffTab({ staff, canEdit }: { staff: Staff[]; canEdit: boolean }) {
  const router = useRouter()
  const [editing, setEditing] = useState<Staff | "new" | null>(null)
  const [roleChoice, setRoleChoice] = useState("")
  const [pending, startTransition] = useTransition()

  const roles = staffRoleOptions(staff.map((s) => s.role))

  function startEdit(target: Staff | "new") {
    setRoleChoice(target === "new" ? roles[0] : target.role)
    setEditing(target)
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await saveStaffMember(formData)
      if (result.ok) {
        toast.success("บันทึกแล้ว")
        setEditing(null)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const active = staff.filter((s) => s.is_active)
  const resigned = staff.filter((s) => !s.is_active)

  if (editing) {
    const s = editing === "new" ? null : editing
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        {s && <input type="hidden" name="id" value={s.id} />}

        <div className="space-y-2">
          <Label htmlFor="staff_name">ชื่อพนักงาน</Label>
          <Input
            id="staff_name"
            name="name"
            className="h-12"
            required
            defaultValue={s?.name}
            placeholder="เช่น บูม รีเซฟชั่น"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="staff_role">ตำแหน่ง</Label>
          <select
            id="staff_role"
            name="role"
            value={roleChoice}
            onChange={(e) => setRoleChoice(e.target.value)}
            className="h-12 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            <option value={NEW_ROLE_VALUE}>+ เพิ่มตำแหน่งใหม่...</option>
          </select>
          {roleChoice === NEW_ROLE_VALUE && (
            <Input
              name="role_custom"
              className="h-12"
              required
              autoFocus
              placeholder="พิมพ์ชื่อตำแหน่งใหม่ เช่น เด็กฝึกงาน"
              aria-label="ตำแหน่งใหม่"
            />
          )}
          <p className="text-xs text-slate-500">
            ตำแหน่งที่พิมพ์ใหม่จะกลายเป็นตัวเลือกให้ครั้งต่อไปเอง ไม่ต้องแจ้งใครแก้ระบบ
          </p>
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
                  defaultChecked={(s?.is_active ?? true) === (o.v === "active")}
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

        {s && (
          <p className="text-xs text-slate-500">
            เปลี่ยนเป็น &quot;ลาออกแล้ว&quot; ชื่อจะหายจากรายการติ๊กเข้างานและตารางจัดวันหยุด
            แต่ประวัติเข้างานเดิมยังอยู่ครบ กดกลับเป็น &quot;ทำงานอยู่&quot; ได้ทุกเมื่อ
          </p>
        )}
      </form>
    )
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <Button onClick={() => startEdit("new")} className="h-11 w-full">
          + เพิ่มพนักงาน
        </Button>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-slate-600">
          ทำงานอยู่ ({active.length})
        </h3>
        {active.map((s) => (
          <Card key={s.id}>
            <CardContent className="flex items-center justify-between py-3">
              <span className="min-w-0 truncate font-medium">
                {s.name}
                <span className="ml-1 font-normal text-slate-500">· {s.role}</span>
              </span>
              {canEdit && (
                <Button variant="ghost" size="sm" onClick={() => startEdit(s)}>
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
          {resigned.map((s) => (
            <Card key={s.id} className="opacity-60">
              <CardContent className="flex items-center justify-between py-3">
                <span className="min-w-0 truncate">
                  {s.name} <Badge variant="outline">ลาออก</Badge>
                  <span className="ml-1 text-slate-500">· {s.role}</span>
                </span>
                {canEdit && (
                  <Button variant="ghost" size="sm" onClick={() => startEdit(s)}>
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
