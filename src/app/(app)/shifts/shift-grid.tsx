"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { copyPreviousWeek, setShiftPlan } from "./shift-actions"
import { Button } from "@/components/ui/button"

type Person = { id: string; name: string; role?: string }
type Plan = {
  work_date: string
  therapist_id: string | null
  staff_id: string | null
  plan: string
}

const WEEKDAY = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"]

/** วนสถานะเมื่อแตะช่อง: ทำงาน → หยุด → ลา → ทำงาน */
const NEXT: Record<string, "off" | "leave" | null> = {
  work: "off",
  off: "leave",
  leave: null,
}

const CELL: Record<string, { label: string; cls: string }> = {
  work: { label: "", cls: "bg-white hover:bg-slate-50" },
  off: { label: "หยุด", cls: "bg-slate-200 text-slate-600" },
  leave: { label: "ลา", cls: "bg-amber-200 text-amber-800" },
}

export function ShiftGrid({
  month,
  daysInMonth,
  today,
  therapists,
  staff,
  plans,
}: {
  month: string
  daysInMonth: number
  today: string
  therapists: Person[]
  staff: Person[]
  plans: Plan[]
}) {
  const router = useRouter()
  const [busyCell, setBusyCell] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, "0")}`
    const dow = new Date(date + "T00:00:00Z").getUTCDay()
    return { date, day: i + 1, weekday: WEEKDAY[dow], isMonday: dow === 1 }
  })

  const planOf = (personId: string, date: string) =>
    plans.find(
      (p) => p.work_date === date && (p.therapist_id === personId || p.staff_id === personId)
    )?.plan ?? "work"

  function tap(person: Person, kind: "therapist" | "staff", date: string) {
    const current = planOf(person.id, date)
    const next = NEXT[current] ?? null
    const cellKey = `${person.id}|${date}`
    setBusyCell(cellKey)
    startTransition(async () => {
      const r = await setShiftPlan(
        date,
        kind === "therapist" ? { therapistId: person.id } : { staffId: person.id },
        next
      )
      if (r.ok) router.refresh()
      else toast.error(r.error)
      setBusyCell(null)
    })
  }

  function copyWeek(weekStart: string) {
    startTransition(async () => {
      const r = await copyPreviousWeek(weekStart)
      if (r.ok) {
        toast.success("คัดลอกแผนสัปดาห์ก่อนหน้ามาแล้ว (ช่องที่จัดไว้แล้วไม่ถูกทับ)")
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  function renderRows(people: Person[], kind: "therapist" | "staff") {
    return people.map((person) => {
      // หมอที่วางแผนหยุดวันนั้น = จองไลน์รีเควสไม่ได้ + หน้าเข้างานขึ้น "หยุดตามแผน"
      const offCount = days.filter((d) => planOf(person.id, d.date) !== "work").length
      return (
        <tr key={person.id} className="border-t">
          <td className="sticky left-0 z-10 whitespace-nowrap border-r bg-white px-2 py-1 text-sm font-medium">
            {person.name}
            {person.role && <span className="font-normal text-slate-400"> · {person.role}</span>}
            {offCount > 0 && (
              <span className="ml-1 text-xs font-normal text-slate-400">({offCount} วัน)</span>
            )}
          </td>
          {days.map((d) => {
            const plan = planOf(person.id, d.date)
            const cell = CELL[plan]
            const busy = busyCell === `${person.id}|${d.date}`
            return (
              <td key={d.date} className="p-0">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => tap(person, kind, d.date)}
                  className={`h-10 w-10 border-l text-[10px] font-medium ${cell.cls} ${
                    d.date === today ? "ring-2 ring-violet-400 ring-inset" : ""
                  } ${busy ? "opacity-40" : ""}`}
                  aria-label={`${person.name} วันที่ ${d.day}`}
                >
                  {cell.label}
                </button>
              </td>
            )
          })}
        </tr>
      )
    })
  }

  // สรุปกำลังพลท้ายคอลัมน์: หมอที่ยังทำงานวันนั้น — เห็นวันกำลังพลบางทันที
  const therapistsPerDay = days.map(
    (d) => therapists.filter((t) => planOf(t.id, d.date) === "work").length
  )
  const minTherapists = Math.min(...therapistsPerDay)

  // ปุ่มคัดลอกรายสัปดาห์ (ทุกวันจันทร์ในเดือน)
  const mondays = days.filter((d) => d.isMonday).map((d) => d.date)

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="border-collapse">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-600">
              <th className="sticky left-0 z-10 border-r bg-slate-50 px-2 py-1 text-left">
                คน \ วัน
              </th>
              {days.map((d) => (
                <th
                  key={d.date}
                  className={`w-10 border-l px-0 py-1 text-center font-normal ${
                    d.date === today ? "bg-violet-100 font-bold text-violet-700" : ""
                  }`}
                >
                  <div>{d.weekday}</div>
                  <div className="font-semibold">{d.day}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {renderRows(therapists, "therapist")}
            {staff.length > 0 && (
              <tr className="border-t bg-slate-50">
                <td
                  className="sticky left-0 z-10 border-r bg-slate-50 px-2 py-0.5 text-xs text-slate-500"
                  colSpan={daysInMonth + 1}
                >
                  พนักงาน
                </td>
              </tr>
            )}
            {renderRows(staff, "staff")}
            {/* แถวสรุป: หมอที่มาทำงานแต่ละวัน — สีแดงเมื่อบางกว่าปกติ */}
            <tr className="border-t bg-emerald-50/60">
              <td className="sticky left-0 z-10 border-r bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
                หมอทำงาน (คน)
              </td>
              {days.map((d, i) => (
                <td
                  key={d.date}
                  className={`border-l text-center text-xs font-bold ${
                    therapistsPerDay[i] === minTherapists &&
                    therapistsPerDay[i] < therapists.length
                      ? "text-red-600"
                      : "text-emerald-700"
                  }`}
                >
                  {therapistsPerDay[i]}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">คัดลอกแผนจากสัปดาห์ก่อนหน้า มาใส่สัปดาห์:</span>
        {mondays.map((monday) => (
          <Button
            key={monday}
            size="sm"
            variant="outline"
            onClick={() => copyWeek(monday)}
          >
            จ. {Number(monday.slice(8, 10))}
          </Button>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        ช่องว่าง = ทำงานปกติ · เทา = หยุดตามแผน · เหลือง = ลา · กรอบม่วง = วันนี้
      </p>
    </div>
  )
}
