"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { CustomerPicker } from "@/app/(app)/pos/customer-picker"
import {
  CUSTOMER_SOURCES,
  SOURCE_LABEL,
  type CustomerSource,
} from "@/lib/customer-source"
import { minToTime, snapMin } from "@/lib/queue"
import { createQueueEntry } from "./queue-actions"
import type { ServiceOption, Therapist } from "./queue-board"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const DURATIONS = [30, 45, 60, 90, 120]

function nowRounded(): string {
  const t = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date())
  const [h, m] = t.split(":").map(Number)
  return minToTime(snapMin(h * 60 + m))
}

export function AddQueueDialog({
  therapists,
  services,
  boardDate,
  isToday,
  onDone,
}: {
  therapists: Therapist[]
  services: ServiceOption[]
  /** คิวถูกสร้างลงวันที่บอร์ดกำลังแสดง — เลื่อนไปวันหน้าก็รับจองล่วงหน้าได้ */
  boardDate: string
  isToday: boolean
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [therapistId, setTherapistId] = useState("")
  const [serviceId, setServiceId] = useState("")
  const [duration, setDuration] = useState(60)
  // วันนี้เริ่มที่เวลาปัจจุบัน · วันอื่นเริ่มที่เปิดร้าน (เวลาปัจจุบันไม่เกี่ยวกับวันนั้น)
  const [startTime, setStartTime] = useState(isToday ? nowRounded() : "10:00")
  const [source, setSource] = useState<CustomerSource>("walk_in")
  const [customerId, setCustomerId] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [pending, startTransition] = useTransition()

  function reset() {
    setTherapistId("")
    setServiceId("")
    setDuration(60)
    setStartTime(isToday ? nowRounded() : "10:00")
    setSource("walk_in")
    setCustomerId("")
    setCustomerName("")
    setCustomerPhone("")
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const r = await createQueueEntry(fd)
      if (r.ok) {
        toast.success("เพิ่มคิวแล้ว")
        reset()
        setOpen(false)
        onDone()
      } else {
        toast.error(r.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-11">+ เพิ่มคิว</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>เพิ่มคิว</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <input type="hidden" name="therapist_id" value={therapistId} />
          <input type="hidden" name="duration_min" value={duration} />
          <input type="hidden" name="queue_date" value={boardDate} />
          <input type="hidden" name="source" value={source} />

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">ลูกค้ามาจาก</legend>
            <div className="grid grid-cols-3 gap-2">
              {CUSTOMER_SOURCES.map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant={source === s ? "default" : "outline"}
                  onClick={() => setSource(s)}
                >
                  {SOURCE_LABEL[s]}
                </Button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">หมอนวด</legend>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant={therapistId === "" ? "default" : "outline"}
                onClick={() => setTherapistId("")}
              >
                ยังไม่ระบุ
              </Button>
              {therapists.map((t) => (
                <Button
                  key={t.id}
                  type="button"
                  variant={therapistId === t.id ? "default" : "outline"}
                  onClick={() => setTherapistId(t.id)}
                >
                  {t.name}
                </Button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="q_service">เมนูบริการ</Label>
            <select
              id="q_service"
              name="service_id"
              value={serviceId}
              onChange={(e) => {
                setServiceId(e.target.value)
                // ระยะเวลาเริ่มจากของเมนู แล้วปรับรายคิวได้
                const s = services.find((x) => x.id === e.target.value)
                if (s?.duration_min) setDuration(s.duration_min)
              }}
              className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">— เลือกเมนู —</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="q_start">เวลาเริ่ม</Label>
              <Input
                id="q_start"
                name="start_time"
                type="time"
                className="h-11"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>ระยะเวลา (นาที)</Label>
              <div className="flex flex-wrap gap-1">
                {DURATIONS.map((d) => (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    variant={duration === d ? "default" : "outline"}
                    onClick={() => setDuration(d)}
                  >
                    {d}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <CustomerPicker
            customerId={customerId}
            customerName={customerName}
            customerPhone={customerPhone}
            onPick={(c) => {
              setCustomerId(c.id)
              setCustomerName(c.name)
              setCustomerPhone(c.phone ?? "")
            }}
            onNameChange={(n) => {
              setCustomerName(n)
              setCustomerId("")
            }}
            onPhoneChange={setCustomerPhone}
            requireMember={false}
          />

          <Button type="submit" disabled={pending || !serviceId} className="h-12 w-full">
            {pending ? "กำลังบันทึก..." : "เพิ่มคิว"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
