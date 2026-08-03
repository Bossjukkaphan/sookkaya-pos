"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { updateStaffMember } from "./staff-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type StaffRow = { id: string; name: string; role: string | null; base_salary: number; is_active: boolean }

/** แก้เงินเดือนตั้งต้น + สถานะยังทำงาน — ยอดนี้ใช้เทียบตอนยืนยันการจ่ายเงินเดือนบนหน้าค่ามือ */
export function StaffSalaryCard({ staff }: { staff: StaffRow[] }) {
  const [pending, startTransition] = useTransition()
  // ค่าที่กำลังแก้ค้างไว้ต่อคน — บันทึกทีละคน ไม่มีฟอร์มรวม
  const [draft, setDraft] = useState<Record<string, { salary: string; active: boolean }>>(
    Object.fromEntries(staff.map((s) => [s.id, { salary: String(s.base_salary), active: s.is_active }]))
  )

  function save(id: string) {
    const d = draft[id]
    startTransition(async () => {
      const result = await updateStaffMember(id, {
        baseSalary: Number(d.salary),
        isActive: d.active,
      })
      if (result.ok) toast.success("บันทึกแล้ว")
      else toast.error(result.error)
    })
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div>
          <p className="font-semibold">เงินเดือนตั้งต้นพนักงานประจำ</p>
          <p className="text-xs text-slate-500">
            ใช้เทียบตอนยืนยันการจ่ายเงินเดือนในหน้าค่ามือ · โบนัส/เงินพิเศษไม่ต้องใส่ตรงนี้
            เขียนเป็นเหตุผลตอนติ๊กแทน · คนลาออกให้ปิด &quot;ยังทำงาน&quot; แล้วจะหลุดจากยอดคาดหวังเอง
          </p>
        </div>
        <ul className="space-y-2">
          {staff.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2">
              <span className={`min-w-32 ${draft[s.id]?.active ? "" : "text-slate-400 line-through"}`}>
                {s.name}
                {s.role && <span className="ml-1 text-xs text-slate-400">({s.role})</span>}
              </span>
              <Input
                type="number" inputMode="numeric" className="h-10 w-32"
                value={draft[s.id]?.salary ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [s.id]: { ...d[s.id], salary: e.target.value } }))}
              />
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={draft[s.id]?.active ?? true}
                  onChange={(e) => setDraft((d) => ({ ...d, [s.id]: { ...d[s.id], active: e.target.checked } }))} />
                ยังทำงาน
              </label>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => save(s.id)}>
                บันทึก
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
