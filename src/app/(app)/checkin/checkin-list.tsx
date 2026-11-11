"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { addStaffMember, checkOut, toggleCheckin } from "./checkin-actions"
import { splitByCallIn } from "@/lib/staff-roster"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type Person = { id: string; name: string; role?: string; is_part_time?: boolean }
type AttendanceRow = {
  id: string
  therapist_id: string | null
  staff_id: string | null
  checked_in_at: string
  checked_out_at: string | null
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  })

export function CheckinList({
  workDate,
  therapists,
  staff,
  attendance,
  monthCount,
  roles,
  planOf = {},
}: {
  workDate: string
  therapists: Person[]
  staff: Person[]
  attendance: AttendanceRow[]
  monthCount: Record<string, number>
  /** ตัวเลือกตำแหน่ง — มาจากข้อมูลจริงบวกตำแหน่งพื้นฐาน (ดู staffRoleOptions) */
  roles: string[]
  /** แผนวันหยุดของวันนี้จากหน้า /shifts — "off" | "leave" ต่อคน */
  planOf?: Record<string, string>
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [newName, setNewName] = useState("")
  const [newRole, setNewRole] = useState("ผู้จัดการ")
  const [, startTransition] = useTransition()

  const byTherapist = new Map(attendance.filter((a) => a.therapist_id).map((a) => [a.therapist_id!, a]))
  const byStaff = new Map(attendance.filter((a) => a.staff_id).map((a) => [a.staff_id!, a]))

  function toggle(person: Person, kind: "therapist" | "staff", current: AttendanceRow | undefined) {
    setBusyId(person.id)
    startTransition(async () => {
      const r = await toggleCheckin(
        workDate,
        kind === "therapist" ? { therapistId: person.id } : { staffId: person.id },
        !current
      )
      if (r.ok) router.refresh()
      else toast.error(r.error)
      setBusyId(null)
    })
  }

  function onCheckOut(row: AttendanceRow) {
    setBusyId(row.id)
    startTransition(async () => {
      const r = await checkOut(row.id)
      if (r.ok) router.refresh()
      else toast.error(r.error)
      setBusyId(null)
    })
  }

  function submitStaff(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const r = await addStaffMember(newName, newRole)
      if (r.ok) {
        toast.success("เพิ่มพนักงานแล้ว")
        setNewName("")
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  function renderRow(person: Person, kind: "therapist" | "staff") {
    const row = kind === "therapist" ? byTherapist.get(person.id) : byStaff.get(person.id)
    const days = monthCount[person.id] ?? 0
    // วางแผนหยุดไว้ (หน้า /shifts) — ไม่ต้องติ๊ก แต่ถ้ามาจริงก็ยังเช็คอินทับได้
    const plan = planOf[person.id]
    return (
      <li key={person.id} className="flex items-center justify-between gap-2 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {/* วงแหวนเขียว/แดงแบบเดียวกับบอร์ดคิว */}
          <span
            className={`h-4 w-4 shrink-0 rounded-full border-4 ${
              row
                ? "border-emerald-500"
                : plan || person.is_part_time
                  ? "border-slate-300"
                  : "border-red-300"
            }`}
          />
          <div className="min-w-0">
            <p className="truncate font-medium">
              {person.name}
              {person.role && (
                <span className="ml-1 font-normal text-slate-500">· {person.role}</span>
              )}
            </p>
            <p className="text-xs text-slate-500">
              {row
                ? `เข้า ${timeOf(row.checked_in_at)}${row.checked_out_at ? ` · ออก ${timeOf(row.checked_out_at)}` : ""}`
                : plan
                  ? plan === "leave"
                    ? "🏖️ ลา (ตามแผน)"
                    : "😴 หยุดตามแผน"
                  : person.is_part_time
                    ? "เรียกเมื่อต้องการ"
                    : "ยังไม่เช็คอิน"}
              {days > 0 && ` · เดือนนี้มา ${days} วัน`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {row && !row.checked_out_at && (
            <Button
              size="sm"
              variant="outline"
              disabled={busyId === row.id}
              onClick={() => onCheckOut(row)}
            >
              ออกงาน
            </Button>
          )}
          <Button
            size="sm"
            variant={row ? "outline" : "default"}
            className={row ? "text-red-600" : "bg-emerald-600 hover:bg-emerald-700"}
            disabled={busyId === person.id}
            onClick={() => toggle(person, kind, row)}
          >
            {row ? "ยกเลิก" : "เช็คอิน"}
          </Button>
        </div>
      </li>
    )
  }

  const therapistIn = therapists.filter((t) => byTherapist.has(t.id)).length
  // พาร์ทไทม์ไม่เข้าตัวหาร — ไม่งั้นตัวเลข "มา x/N" จะดูเหมือนขาดคนทุกวัน
  const { regular: regularStaff, onCall: onCallStaff } = splitByCallIn(staff)
  const staffIn = regularStaff.filter((s) => byStaff.has(s.id)).length
  const onCallIn = onCallStaff.filter((s) => byStaff.has(s.id)).length

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-base">
            💆 หมอนวด ({therapistIn}/{therapists.length} มา)
          </CardTitle>
          <p className="text-xs text-slate-500">
            หมอที่ไม่เช็คอิน: จองไลน์ไม่นับสลอต · แถวบนบอร์ดคิวเป็นลายทแยง วางการ์ดไม่ได้
          </p>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="divide-y">{therapists.map((t) => renderRow(t, "therapist"))}</ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-base">
            🧑‍💼 พนักงาน ({staffIn}/{regularStaff.length} มา)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {staff.length === 0 && (
            <p className="px-6 pb-2 text-sm text-slate-500">
              ยังไม่มีพนักงานในระบบ — เพิ่มด้านล่างได้เลย
            </p>
          )}
          <ul className="divide-y">{regularStaff.map((s) => renderRow(s, "staff"))}</ul>

          {onCallStaff.length > 0 && (
            <>
              <p className="border-t bg-amber-50/60 px-4 py-1.5 text-xs text-amber-800 sm:px-6">
                🕘 พาร์ทไทม์ — เรียกเป็นครั้งคราว ({onCallIn} มาวันนี้) ·
                ไม่ถูกนับว่าขาดงานในวันที่ไม่ได้เรียก
              </p>
              <ul className="divide-y">{onCallStaff.map((s) => renderRow(s, "staff"))}</ul>
            </>
          )}
          <form onSubmit={submitStaff} className="flex flex-wrap items-center gap-2 border-t px-4 pt-3 sm:px-6">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="ชื่อพนักงานใหม่"
              className="h-10 w-40 flex-1"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="h-10 rounded-md border border-input bg-transparent px-2 text-sm outline-none"
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" disabled={!newName.trim()}>
              + เพิ่ม
            </Button>
          </form>
          <p className="px-4 pt-2 text-xs text-slate-400 sm:px-6">
            เปลี่ยนตำแหน่ง ตั้งตำแหน่งใหม่ หรือบันทึกว่าลาออก: ตั้งค่า → แท็บพนักงาน
            (ประวัติเข้างานยังเก็บไว้ครบ)
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
