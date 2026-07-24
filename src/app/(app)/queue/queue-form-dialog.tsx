"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { CustomerPicker } from "@/app/(app)/pos/customer-picker"
import {
  BOOKING_CHANNELS,
  CHANNEL_LABEL,
  CUSTOMER_SOURCES,
  SOURCE_LABEL,
  type BookingChannel,
  type CustomerSource,
} from "@/lib/customer-source"
import { busyBedIds, minToTime, snapMin, timeToMin } from "@/lib/queue"
import {
  createQueueEntry,
  createQueueGroup,
  updateQueueEntry,
  type GroupPerson,
} from "./queue-actions"
import type { Bed, QueueEntry, ServiceOption, Therapist } from "./queue-board"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { REQUEST_FEE } from "@/lib/constants"

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

/**
 * ฟอร์มคิวใช้ร่วมทั้ง "เพิ่ม" และ "แก้ไข" — parent เป็นคน mount เมื่อจะเปิด
 * (unmount ตอนปิด → state เริ่มใหม่จาก initializer เสมอ ไม่ต้อง sync เอง)
 */
export function QueueFormDialog({
  therapists,
  services,
  beds,
  entries,
  boardDate,
  isToday,
  entry,
  defaultTherapistId,
  defaultStartTime,
  onClose,
  onDone,
}: {
  therapists: Therapist[]
  services: ServiceOption[]
  beds: Bed[]
  /** คิวของวันบนบอร์ด — ใช้เช็คว่าเตียงไหนถูกจองคร่อมเวลาที่เลือก */
  entries: QueueEntry[]
  /** คิวถูกสร้างลงวันที่บอร์ดกำลังแสดง — เลื่อนไปวันหน้าก็รับจองล่วงหน้าได้ */
  boardDate: string
  isToday: boolean
  /** มีค่า = โหมดแก้ไขคิวใบนี้ */
  entry?: QueueEntry
  /** เพิ่มจากการแตะช่องว่างบนบอร์ด — หมอของแถวนั้น (null = ยังไม่ระบุ) */
  defaultTherapistId?: string | null
  defaultStartTime?: string
  onClose: () => void
  onDone: () => void
}) {
  const isEdit = !!entry
  const [therapistId, setTherapistId] = useState(
    entry ? (entry.therapist_id ?? "") : (defaultTherapistId ?? "")
  )
  const [serviceId, setServiceId] = useState(entry?.service_id ?? "")
  const [duration, setDuration] = useState(entry?.duration_min ?? 60)
  // วันนี้เริ่มที่เวลาปัจจุบัน · วันอื่นเริ่มที่เปิดร้าน (เวลาปัจจุบันไม่เกี่ยวกับวันนั้น)
  const [startTime, setStartTime] = useState(
    entry?.start_time.slice(0, 5) ??
      defaultStartTime ??
      (isToday ? nowRounded() : "10:00")
  )
  const [source, setSource] = useState<CustomerSource>(
    entry && ["walk_in", "booking", "agency"].includes(entry.source)
      ? (entry.source as CustomerSource)
      : "walk_in"
  )
  const [bookingChannel, setBookingChannel] = useState<BookingChannel | "">(
    entry && ["line", "phone", "facebook"].includes(entry.booking_channel ?? "")
      ? (entry.booking_channel as BookingChannel)
      : ""
  )
  const [bedId, setBedId] = useState(entry?.bed_id ?? "")
  const [notes, setNotes] = useState(entry?.notes ?? "")
  const [customerId, setCustomerId] = useState(entry?.customer_id ?? "")
  const [customerName, setCustomerName] = useState(entry?.customer_name ?? "")
  const [customerPhone, setCustomerPhone] = useState(entry?.customer_phone ?? "")
  // รีเควสหมอบันทึกตั้งแต่ตอนจอง — ตอนกดเก็บเงินระบบจะติ๊ก +40 ให้เอง ไม่ตกหล่น
  const [isRequest, setIsRequest] = useState(entry?.is_request ?? false)
  // ลูกค้ามาเป็นครอบครัว/กลุ่ม: คนแรกใช้ช่องหลักด้านบน คนต่อไปเพิ่มเป็นแถวย่อย
  // (เวลา·ลูกค้าผู้ติดต่อ·ที่มา·หมายเหตุ ใช้ร่วมกันทั้งกลุ่ม)
  const [extraPeople, setExtraPeople] = useState<GroupPerson[]>([])
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const r = entry
        ? await updateQueueEntry(entry.id, fd)
        : extraPeople.length > 0
          ? await createQueueGroup(fd, [
              {
                therapistId: therapistId || null,
                serviceId,
                bedId: bedId || null,
                isRequest,
              },
              ...extraPeople,
            ])
          : await createQueueEntry(fd)
      if (r.ok) {
        toast.success(
          entry
            ? "แก้ไขคิวแล้ว"
            : extraPeople.length > 0
              ? `เพิ่มคิวกลุ่ม ${extraPeople.length + 1} คนแล้ว`
              : "เพิ่มคิวแล้ว"
        )
        onClose()
        onDone()
      } else {
        toast.error(r.error)
      }
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "แก้ไขคิว" : "เพิ่มคิว"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <input type="hidden" name="therapist_id" value={therapistId} />
          <input type="hidden" name="duration_min" value={duration} />
          <input type="hidden" name="queue_date" value={boardDate} />
          <input type="hidden" name="source" value={source} />
          <input type="hidden" name="booking_channel" value={bookingChannel} />
          <input type="hidden" name="bed_id" value={bedId} />

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">ลูกค้ามาจาก</legend>
            <div className="grid grid-cols-3 gap-2">
              {CUSTOMER_SOURCES.map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant={source === s ? "default" : "outline"}
                  onClick={() => {
                    setSource(s)
                    // ช่องทางย่อยมีความหมายเฉพาะจองล่วงหน้า
                    if (s !== "booking") setBookingChannel("")
                  }}
                >
                  {SOURCE_LABEL[s]}
                </Button>
              ))}
            </div>
            {source === "booking" && (
              <div className="flex flex-wrap gap-1 pt-1">
                {BOOKING_CHANNELS.map((c) => (
                  <Button
                    key={c}
                    type="button"
                    size="sm"
                    variant={bookingChannel === c ? "default" : "outline"}
                    onClick={() =>
                      setBookingChannel(bookingChannel === c ? "" : c)
                    }
                  >
                    {CHANNEL_LABEL[c]}
                  </Button>
                ))}
              </div>
            )}
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

          {/* เตียง (ไม่บังคับ) — เตียงที่ถูกจองคร่อมเวลาที่เลือกขึ้นจาง แต่ยังกดได้ (นวดคู่/ตั้งใจ) */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              เตียง <span className="font-normal text-slate-500">(ไม่บังคับ)</span>
            </legend>
            {(() => {
              // โหมดแก้ไข: ไม่นับคิวใบที่กำลังแก้ ไม่งั้นเตียงตัวเองขึ้น "ไม่ว่าง"
              const busy = busyBedIds(
                entries.filter((en) => en.id !== entry?.id),
                timeToMin(/^\d{2}:\d{2}$/.test(startTime) ? startTime : "10:00"),
                duration
              )
              const rooms = [...new Set(beds.map((b) => b.room))]
              return rooms.map((room) => (
                <div key={room}>
                  <p className="text-xs text-slate-500">{room}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {beds
                      .filter((b) => b.room === room)
                      .map((b) => (
                        <Button
                          key={b.id}
                          type="button"
                          size="sm"
                          variant={bedId === b.id ? "default" : "outline"}
                          className={
                            busy.has(b.id) && bedId !== b.id ? "opacity-40" : ""
                          }
                          onClick={() => setBedId(bedId === b.id ? "" : b.id)}
                        >
                          {b.name}
                          {busy.has(b.id) ? " · ไม่ว่าง" : ""}
                        </Button>
                      ))}
                  </div>
                </div>
              ))
            })()}
          </fieldset>

          {/* รีเควสหมอ — เก็บตั้งแต่ตอนจอง ระบบคิดค่ารีเควสตายตัวตอนเก็บเงิน */}
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Checkbox
              id="q_is_request"
              name="is_request"
              checked={isRequest}
              onCheckedChange={(v) => setIsRequest(v === true)}
            />
            <Label htmlFor="q_is_request" className="flex-1 cursor-pointer">
              ลูกค้ารีเควสหมอ{" "}
              <span className="font-normal text-slate-500">
                (+{REQUEST_FEE} ฿ คิดตอนเก็บเงิน)
              </span>
            </Label>
          </div>

          {/* จองเป็นกลุ่ม: คนแรกคือช่องหลักด้านบน คนต่อไปเพิ่มแถวตรงนี้
              ทั้งกลุ่มเริ่มเวลาเดียวกัน ใช้ลูกค้าผู้ติดต่อ/ที่มา/หมายเหตุร่วมกัน */}
          {!isEdit && (
            <fieldset className="space-y-2 rounded-lg border border-dashed p-3">
              <legend className="px-1 text-sm font-medium">
                มากันหลายคน?{" "}
                <span className="font-normal text-slate-500">
                  (ครอบครัว/กลุ่ม — สร้างการ์ดให้ทุกคนพร้อมกัน)
                </span>
              </legend>
              {extraPeople.map((p, i) => (
                <div key={i} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-10 shrink-0 text-xs text-slate-500">
                    คนที่ {i + 2}
                  </span>
                  <select
                    value={p.therapistId ?? ""}
                    onChange={(e) =>
                      setExtraPeople((arr) =>
                        arr.map((x, j) =>
                          j === i ? { ...x, therapistId: e.target.value || null } : x
                        )
                      )
                    }
                    className="h-10 w-24 shrink-0 rounded-md border border-input bg-transparent px-2 text-sm outline-none"
                    aria-label={`หมอนวดคนที่ ${i + 2}`}
                  >
                    <option value="">หมอ?</option>
                    {therapists.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={p.serviceId}
                    onChange={(e) =>
                      setExtraPeople((arr) =>
                        arr.map((x, j) =>
                          j === i ? { ...x, serviceId: e.target.value } : x
                        )
                      )
                    }
                    className="h-10 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none"
                    aria-label={`เมนูคนที่ ${i + 2}`}
                  >
                    <option value="">— เมนู —</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <label className="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-slate-600">
                    <Checkbox
                      checked={p.isRequest ?? false}
                      onCheckedChange={(v) =>
                        setExtraPeople((arr) =>
                          arr.map((x, j) =>
                            j === i ? { ...x, isRequest: v === true } : x
                          )
                        )
                      }
                      aria-label={`รีเควสหมอคนที่ ${i + 2}`}
                    />
                    รีเควส
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-red-600"
                    aria-label={`ลบคนที่ ${i + 2}`}
                    onClick={() =>
                      setExtraPeople((arr) => arr.filter((_, j) => j !== i))
                    }
                  >
                    ✕
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() =>
                  setExtraPeople((arr) => [
                    ...arr,
                    { therapistId: null, serviceId: "", bedId: null },
                  ])
                }
              >
                + เพิ่มคนในกลุ่ม
              </Button>
              {extraPeople.length > 0 && (
                <p className="text-xs text-slate-500">
                  รวม {extraPeople.length + 1} คน เริ่ม {startTime} พร้อมกัน ·
                  เตียงของคนที่ 2 ขึ้นไปค่อยเลือกทีหลังได้จากการ์ด
                </p>
              )}
            </fieldset>
          )}

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

          <div className="space-y-2">
            <Label htmlFor="q_notes">
              หมายเหตุ <span className="font-normal text-slate-500">(ไม่บังคับ)</span>
            </Label>
            <Input
              id="q_notes"
              name="notes"
              className="h-11"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="เช่น แพ้น้ำมัน · ขอผู้หญิงนวด"
            />
          </div>

          <Button
            type="submit"
            disabled={
              pending || !serviceId || extraPeople.some((p) => !p.serviceId)
            }
            className="h-12 w-full"
          >
            {pending
              ? "กำลังบันทึก..."
              : isEdit
                ? "บันทึกการแก้ไข"
                : extraPeople.length > 0
                  ? `เพิ่มคิวกลุ่ม ${extraPeople.length + 1} คน`
                  : "เพิ่มคิว"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
