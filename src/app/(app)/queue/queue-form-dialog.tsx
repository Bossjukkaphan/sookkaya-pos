"use client"

import { useRef, useState, useTransition } from "react"
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
import {
  bedSegments,
  busyBedIds,
  busyTherapistIds,
  groupSlotTimes,
  minToTime,
  overlaps,
  snapMin,
  timeToMin,
} from "@/lib/queue"
import { Time24Field } from "@/components/time24-field"
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
import { ServiceCombobox } from "@/components/service-combobox"
import { PRIVATE_ROOM_FEE, REQUEST_FEE } from "@/lib/constants"

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
  // ห้องช่วงครึ่งหลัง — ขึ้นเฉพาะเมนูที่ย้ายห้องกลางคัน · ว่างได้ = อยู่ห้องเดียวตลอด
  const [bedId2, setBedId2] = useState(entry?.bed_id_2 ?? "")
  const [notes, setNotes] = useState(entry?.notes ?? "")
  const [customerId, setCustomerId] = useState(entry?.customer_id ?? "")
  const [customerName, setCustomerName] = useState(entry?.customer_name ?? "")
  const [customerPhone, setCustomerPhone] = useState(entry?.customer_phone ?? "")
  // รีเควสหมอบันทึกตั้งแต่ตอนจอง — ตอนกดเก็บเงินระบบจะติ๊ก +40 ให้เอง ไม่ตกหล่น
  // รหัสประจำการเปิดฟอร์มครั้งนี้ — กดรัว/เน็ต retry ใช้รหัสเดิม (server กันซ้ำ)
  // เปิดฟอร์มใหม่ = รหัสใหม่ → เพิ่มคิวหน้าตาเหมือนกันติดๆ กันได้เสมอ
  const [clientKey] = useState(() => crypto.randomUUID())
  const [isRequest, setIsRequest] = useState(entry?.is_request ?? false)
  // ห้องสปาส่วนตัว +100฿ (ลูกค้าจ่าย) — เก็บตั้งแต่ตอนจอง ตอนเก็บเงินระบบติ๊กบวกให้เอง
  const [privateRoom, setPrivateRoom] = useState(entry?.private_room ?? false)
  // ลูกค้ามาเป็นครอบครัว/กลุ่ม: คนแรกใช้ช่องหลักด้านบน คนต่อไปเพิ่มเป็นแถวย่อย
  // (เวลา·ลูกค้าผู้ติดต่อ·ที่มา·หมายเหตุ ใช้ร่วมกันทั้งกลุ่ม)
  const [extraPeople, setExtraPeople] = useState<GroupPerson[]>([])
  const [pending, startTransition] = useTransition()
  // กันยิงซ้ำแบบ synchronous — ปุ่ม disabled={pending} ไม่ทันเคสกดรัว/Enter+คลิก
  // เพราะ pending เพิ่งจะเปลี่ยนหลัง re-render (คลิกที่สองแทรกก่อนได้)
  const submittingRef = useRef(false)

  const startMinSafe = timeToMin(
    /^\d{2}:\d{2}$/.test(startTime) ? startTime : "10:00"
  )
  // โหมดแก้ไข: ไม่นับคิวใบที่กำลังแก้ ไม่งั้นเตียง/หมอของตัวเองขึ้น "ไม่ว่าง"
  const otherEntries = entries.filter((en) => en.id !== entry?.id)
  const rooms = [...new Set(beds.map((b) => b.room))]
  // เมนูที่เลือกอยู่ตอนนี้ — ใช้เช็ค splits_room ว่าจะโชว์ช่องห้องที่สองไหม
  const selectedService = services.find((s) => s.id === serviceId)
  // เวลาของทุกรายการในกลุ่ม คิดด้วยกติกาเดียวกับ server เป๊ะ (ดู groupSlotTimes)
  // ดัชนี 0 = คนแรก (ช่องหลักด้านบน) · 1 เป็นต้นไป = extraPeople ตามลำดับ
  const slots = groupSlotTimes(
    [{ serviceId }, ...extraPeople],
    startMinSafe,
    (id) => services.find((s) => s.id === id)?.duration_min
  )
  // คิวกลุ่มยึดระยะเวลาจากเมนูเสมอ (server ไม่อ่านปุ่มระยะเวลาเลยตอนสร้างกลุ่ม)
  // คิวเดี่ยวยึดปุ่มระยะเวลาตามเดิม — ช่องเตียงต้องบอกความจริงว่าเซิร์ฟเวอร์จะจองยาวแค่ไหน
  const mainSlot =
    extraPeople.length > 0
      ? slots[0]
      : { startMin: startMinSafe, durationMin: duration }
  const slotOf = (i: number) => (i === 0 ? mainSlot : slots[i])
  const bedOf = (i: number) => (i === 0 ? bedId || null : extraPeople[i - 1].bedId)
  const therapistOf = (i: number) =>
    i === 0 ? therapistId || null : extraPeople[i - 1].therapistId

  // ช่วงเวลาที่ห้องแรก/ห้องที่สองของคนแรก (ช่องหลักด้านบน) ถูกยึด — สูตรเดียวกับทุกจุด
  // (bed_id/bed_id_2 ใส่ตัวคั่นที่ไม่ใช่ค่าว่างเพื่อบังคับให้ได้ครบสองช่วงตอนเมนูย้ายห้อง
  // ค่าเตียงจริงที่ใช้เช็คว่างมาจาก state bedId/bedId2 ด้านล่าง ไม่ใช่ตัวคั่นนี้)
  const bedFormSegments = bedSegments({
    bed_id: bedId || "_",
    bed_id_2: selectedService?.splits_room ? bedId2 || "_" : null,
    start_time: minToTime(mainSlot.startMin),
    duration_min: mainSlot.durationMin,
    started_at: null,
  })
  const firstHalfSeg = bedFormSegments[0]
  const secondHalfSeg = bedFormSegments[1] ?? null
  const secondHalfLabel = secondHalfSeg
    ? `${minToTime(secondHalfSeg.startMin)}–${minToTime(secondHalfSeg.startMin + secondHalfSeg.durationMin)} น.`
    : ""

  /** เตียง/หมอที่คนอื่นในกลุ่มจองไว้คร่อมเวลาของรายการที่ i → หมายเลขคนที่จอง (นับจาก 1)
   *  server ก็กันซ้ำในกลุ่มอีกชั้น (createQueueGroup) — ตรงนี้กันไม่ให้พนักงานเสียเที่ยว */
  const takenInGroup = (
    i: number,
    resourceOf: (j: number) => string | null
  ): Map<string, number> => {
    const mine = slotOf(i)
    const taken = new Map<string, number>()
    slots.forEach((_, j) => {
      if (j === i) return
      const r = resourceOf(j)
      const other = slotOf(j)
      if (
        r &&
        overlaps(other.startMin, other.durationMin, mine.startMin, mine.durationMin)
      )
        taken.set(r, j + 1)
    })
    return taken
  }

  /** แก้เมนู/เวลาทีหลังทำให้ตัวเลือกที่เคยถูกกลายเป็นชนได้ — ตัวเลือกของตัวเองห้าม disable
   *  (ไม่งั้น select โชว์ค่าที่กดไม่ได้) จึงต้องกันที่ปุ่มบันทึกแทน ไม่ปล่อยให้ไปตายที่ server */
  const groupClash = (() => {
    if (extraPeople.length === 0) return null
    for (let i = 0; i < slots.length; i++) {
      const bed = bedOf(i)
      if (bed && takenInGroup(i, bedOf).has(bed))
        return `คนที่ ${i + 1}: เตียงซ้ำกับคนอื่นในกลุ่มช่วงเวลาเดียวกัน — เปลี่ยนเตียงหรือเวลา`
      const t = therapistOf(i)
      if (t && takenInGroup(i, therapistOf).has(t))
        return `คนที่ ${i + 1}: หมอซ้ำกับคนอื่นในกลุ่มช่วงเวลาเดียวกัน — หมอหนึ่งคนรับได้ทีละคิว`
    }
    return null
  })()

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submittingRef.current) return
    submittingRef.current = true
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
                privateRoom,
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
        submittingRef.current = false // แก้ข้อมูลแล้วส่งใหม่ได้
      }
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
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
          <input type="hidden" name="bed_id_2" value={bedId2} />
          <input type="hidden" name="client_key" value={clientKey} />

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
            {(() => {
              // หมอหนึ่งคนรับได้ทีละคิว (นับจากเวลานวดจริง) — โหมดแก้ไขไม่นับใบตัวเอง
              // ใช้ช่วงเวลาชุดเดียวกับช่องเตียงเสมอ ไม่งั้นสองช่องในฟอร์มเดียวกันตอบคนละอย่าง
              // (คิวกลุ่ม server ยึดระยะเวลาจากเมนู ไม่ใช่ปุ่มระยะเวลา — ดู mainSlot)
              const busyT = busyTherapistIds(
                otherEntries,
                mainSlot.startMin,
                mainSlot.durationMin
              )
              const takenByOthers = takenInGroup(0, therapistOf)
              return (
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={therapistId === "" ? "default" : "outline"}
                    onClick={() => setTherapistId("")}
                  >
                    ยังไม่ระบุ
                  </Button>
                  {therapists.map((t) => {
                    const takenBy = takenByOthers.get(t.id)
                    const unavailable =
                      (busyT.has(t.id) || takenBy !== undefined) &&
                      therapistId !== t.id
                    return (
                      <Button
                        key={t.id}
                        type="button"
                        variant={therapistId === t.id ? "default" : "outline"}
                        className={unavailable ? "opacity-40 line-through" : ""}
                        disabled={unavailable}
                        onClick={() => setTherapistId(t.id)}
                      >
                        {t.name}
                        {busyT.has(t.id)
                          ? " · ติดคิว"
                          : takenBy !== undefined
                            ? ` · คนที่ ${takenBy}`
                            : ""}
                      </Button>
                    )
                  })}
                </div>
              )
            })()}
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="q_service">เมนูบริการ</Label>
            <ServiceCombobox
              id="q_service"
              name="service_id"
              services={services}
              value={serviceId}
              onChange={(id) => {
                setServiceId(id)
                // ระยะเวลาเริ่มจากของเมนู แล้วปรับรายคิวได้
                const s = services.find((x) => x.id === id)
                if (s?.duration_min) setDuration(s.duration_min)
              }}
              triggerClassName="h-11"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>เวลาเริ่ม (24 ชม.)</Label>
              {/* dropdown 24 ชม. — input type=time บนมือถือโชว์ AM/PM แล้วเคยคีย์ผิดเป็น 00:30 */}
              <input type="hidden" name="start_time" value={startTime} />
              <Time24Field
                value={startTime}
                onChange={setStartTime}
                startHour={10}
                endHour={23}
                ariaLabel="เวลาเริ่ม"
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
              // เมนูย้ายห้องกลางคัน: เช็คว่างเฉพาะ "ช่วงครึ่งแรก" ไม่ใช่เต็มโปรแกรม
              // (เมนูปกติ firstHalfSeg ยาวเท่า mainSlot อยู่แล้ว — พฤติกรรมเดิมเป๊ะ)
              const busy = busyBedIds(
                otherEntries,
                firstHalfSeg.startMin,
                firstHalfSeg.durationMin
              )
              // เตียงที่คนอื่นในกลุ่ม (ที่ยังไม่ได้บันทึก) จองไว้ทับเวลาเดียวกัน
              const takenByOthers = takenInGroup(0, bedOf)
              return rooms.map((room) => (
                <div key={room}>
                  <p className="text-xs text-slate-500">{room}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {beds
                      .filter((b) => b.room === room)
                      .map((b) => {
                        const takenBy = takenByOthers.get(b.id)
                        const unavailable =
                          (busy.has(b.id) || takenBy !== undefined) &&
                          bedId !== b.id
                        return (
                          <Button
                            key={b.id}
                            type="button"
                            size="sm"
                            variant={bedId === b.id ? "default" : "outline"}
                            className={
                              unavailable ? "opacity-40 line-through" : ""
                            }
                            // เตียงมีจำกัด — ไม่ว่างคือกดไม่ได้เลย (server กันซ้ำอีกชั้น)
                            disabled={unavailable}
                            onClick={() => setBedId(bedId === b.id ? "" : b.id)}
                          >
                            {b.name}
                            {busy.has(b.id)
                              ? " · ไม่ว่าง"
                              : takenBy !== undefined
                                ? ` · คนที่ ${takenBy} ใช้อยู่`
                                : ""}
                          </Button>
                        )
                      })}
                  </div>
                </div>
              ))
            })()}
          </fieldset>

          {/* ห้องช่วงครึ่งหลัง — ขึ้นเฉพาะเมนูที่ตั้ง splits_room ไว้ (นวดเท้า→คอบ่าไหล่ ฯลฯ)
              จุดแบ่งคือครึ่งหนึ่งของโปรแกรมเสมอ (bedSegments คำนวณให้ ไม่หารครึ่งเวลาเอง) */}
          {selectedService?.splits_room && (
            <div className="space-y-1">
              <p className="text-sm font-medium">
                ห้องช่วงครึ่งหลัง · {secondHalfLabel}
              </p>
              {(() => {
                const busy2 = secondHalfSeg
                  ? busyBedIds(
                      otherEntries,
                      secondHalfSeg.startMin,
                      secondHalfSeg.durationMin
                    )
                  : new Set<string>()
                // เตียงที่คนอื่นในกลุ่ม (ที่ยังไม่ได้บันทึก) จองไว้ทับเวลาเดียวกัน
                const takenByOthers = takenInGroup(0, bedOf)
                return rooms.map((room) => (
                  <div key={room}>
                    <p className="text-xs text-slate-500">{room}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {beds
                        .filter((b) => b.room === room)
                        .map((b) => {
                          const takenBy = takenByOthers.get(b.id)
                          const unavailable =
                            (busy2.has(b.id) || takenBy !== undefined) &&
                            bedId2 !== b.id
                          return (
                            <Button
                              key={b.id}
                              type="button"
                              size="sm"
                              variant={bedId2 === b.id ? "default" : "outline"}
                              className={
                                unavailable ? "opacity-40 line-through" : ""
                              }
                              disabled={unavailable}
                              onClick={() =>
                                setBedId2(bedId2 === b.id ? "" : b.id)
                              }
                            >
                              {b.name}
                              {busy2.has(b.id)
                                ? " · ไม่ว่าง"
                                : takenBy !== undefined
                                  ? ` · คนที่ ${takenBy} ใช้อยู่`
                                  : ""}
                            </Button>
                          )
                        })}
                    </div>
                  </div>
                ))
              })()}
              <p className="text-xs text-slate-500">
                เว้นว่าง = ลูกค้าอยู่ห้องเดิมตลอด (รีเควสนวดยาวไม่ย้ายห้อง)
              </p>
            </div>
          )}

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
                (หมอได้ +{REQUEST_FEE} ฿ — ร้านจ่ายให้ ไม่บวกเงินลูกค้า)
              </span>
            </Label>
          </div>

          {/* ห้องสปาส่วนตัว — บริการเสริมผูกกับบริการหลัก ลูกค้าจ่ายเพิ่มตอนเก็บเงิน */}
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Checkbox
              id="q_private_room"
              name="private_room"
              checked={privateRoom}
              onCheckedChange={(v) => setPrivateRoom(v === true)}
            />
            <Label htmlFor="q_private_room" className="flex-1 cursor-pointer">
              ห้องสปาส่วนตัว{" "}
              <span className="font-normal text-slate-500">
                (+{PRIVATE_ROOM_FEE} ฿ คิดตอนเก็บเงิน)
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
              {/* บล็อกละคน เมนูเต็มความกว้าง — แบบบีบรวมบรรทัดเดียวเคยกดเลือกเมนูบนมือถือไม่ได้ */}
              {extraPeople.map((p, i) => (
                <div key={i} className="space-y-1.5 rounded-lg border bg-slate-50/60 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-600">
                      {p.sequential ? `ต่อเวลา ${i + 2}` : `คนที่ ${i + 2}`}{" "}
                      <span className="font-normal text-slate-400">
                        เริ่ม {minToTime(slots[i + 1].startMin)}
                      </span>
                    </span>
                    <div className="flex items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-1 text-xs text-slate-600">
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
                      <label className="flex cursor-pointer items-center gap-1 text-xs text-slate-600">
                        <Checkbox
                          checked={p.privateRoom ?? false}
                          onCheckedChange={(v) =>
                            setExtraPeople((arr) =>
                              arr.map((x, j) =>
                                j === i ? { ...x, privateRoom: v === true } : x
                              )
                            )
                          }
                          aria-label={`ห้องสปาคนที่ ${i + 2}`}
                        />
                        ห้องสปา
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
                  </div>
                  <ServiceCombobox
                    services={services}
                    value={p.serviceId}
                    onChange={(serviceId) =>
                      setExtraPeople((arr) =>
                        arr.map((x, j) => (j === i ? { ...x, serviceId } : x))
                      )
                    }
                    placeholder="— เลือกเมนู —"
                    aria-label={`เมนูคนที่ ${i + 2}`}
                    triggerClassName="h-11"
                  />
                  {/* หมอที่ติดคิวอื่น หรือคนอื่นในกลุ่มจองไปแล้ว เลือกไม่ได้
                      (server กันซ้ำอีกชั้น — ตรงนี้กันไม่ให้ต้องคีย์ใหม่ทั้งกลุ่ม) */}
                  {(() => {
                    const slot = slots[i + 1]
                    const busyT = busyTherapistIds(
                      otherEntries,
                      slot.startMin,
                      slot.durationMin
                    )
                    const takenByOthers = takenInGroup(i + 1, therapistOf)
                    return (
                      <select
                        value={p.therapistId ?? ""}
                        onChange={(e) =>
                          setExtraPeople((arr) =>
                            arr.map((x, j) =>
                              j === i
                                ? { ...x, therapistId: e.target.value || null }
                                : x
                            )
                          )
                        }
                        className="h-10 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none"
                        aria-label={`หมอนวดคนที่ ${i + 2}`}
                      >
                        <option value="">หมอ: ยังไม่ระบุ</option>
                        {therapists.map((t) => {
                          const takenBy = takenByOthers.get(t.id)
                          return (
                            <option
                              key={t.id}
                              value={t.id}
                              disabled={
                                (busyT.has(t.id) || takenBy !== undefined) &&
                                p.therapistId !== t.id
                              }
                            >
                              หมอ{t.name}
                              {busyT.has(t.id)
                                ? " · ติดคิว"
                                : takenBy !== undefined
                                  ? ` · คนที่ ${takenBy} จองแล้ว`
                                  : ""}
                            </option>
                          )
                        })}
                      </select>
                    )
                  })()}
                  {/* เตียง/ห้องรายคน — เคยเลือกได้เฉพาะคนแรก ที่เหลือต้องไปจิ้มจากการ์ดทีหลัง
                      เตียงจัดกลุ่มตามห้อง · ที่ไม่ว่างช่วงเวลาของ "คนนี้" เลือกไม่ได้
                      (รายการต่อเวลาเริ่มคนละเวลากับกลุ่ม เตียงว่างจึงไม่เหมือนกัน) */}
                  {(() => {
                    const slot = slots[i + 1]
                    const busy = busyBedIds(
                      otherEntries,
                      slot.startMin,
                      slot.durationMin
                    )
                    const takenByOthers = takenInGroup(i + 1, bedOf)
                    return (
                      <select
                        value={p.bedId ?? ""}
                        onChange={(e) =>
                          setExtraPeople((arr) =>
                            arr.map((x, j) =>
                              j === i
                                ? { ...x, bedId: e.target.value || null }
                                : x
                            )
                          )
                        }
                        className="h-10 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none"
                        aria-label={`เตียงคนที่ ${i + 2}`}
                      >
                        <option value="">เตียง: ยังไม่ระบุ</option>
                        {rooms.map((room) => (
                          <optgroup key={room} label={room}>
                            {beds
                              .filter((b) => b.room === room)
                              .map((b) => {
                                const takenBy = takenByOthers.get(b.id)
                                return (
                                  <option
                                    key={b.id}
                                    value={b.id}
                                    disabled={
                                      (busy.has(b.id) ||
                                        takenBy !== undefined) &&
                                      p.bedId !== b.id
                                    }
                                  >
                                    {b.name}
                                    {busy.has(b.id)
                                      ? " · ไม่ว่าง"
                                      : takenBy !== undefined
                                        ? ` · คนที่ ${takenBy} ใช้อยู่`
                                        : ""}
                                  </option>
                                )
                              })}
                          </optgroup>
                        ))}
                      </select>
                    )
                  })()}
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setExtraPeople((arr) => [
                      ...arr,
                      { therapistId: null, serviceId: "", bedId: null },
                    ])
                  }
                >
                  + เพิ่มคนในกลุ่ม
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setExtraPeople((arr) => {
                      // ลูกค้าคนเดิมทำต่ออีกคอร์ส — หมอ/เตียงเดิมเป็นค่าตั้งต้น แก้ได้
                      // (นวดต่อเตียงเดิมคือเคสปกติ · ย้ายเตียงก็แค่เปลี่ยนในช่อง)
                      // เตียงเดิมติดคิวอื่นในช่วงต่อเวลา = ไม่เติมให้ ปล่อยว่างไว้เลือกเอง
                      const prevBed =
                        arr.length > 0 ? arr[arr.length - 1].bedId : bedId || null
                      const nextStart = slots[slots.length - 1]
                      const startAfter = nextStart.startMin + nextStart.durationMin
                      const free =
                        prevBed !== null &&
                        !busyBedIds(otherEntries, startAfter, 60).has(prevBed)
                      return [
                        ...arr,
                        {
                          therapistId: therapistId || null,
                          serviceId: "",
                          bedId: free ? prevBed : null,
                          sequential: true,
                        },
                      ]
                    })
                  }
                >
                  + ต่อเวลา (คนเดิม)
                </Button>
              </div>
              {extraPeople.length > 0 && (
                <p className="text-xs text-slate-500">
                  รวม {extraPeople.length + 1} รายการ ·
                  แถว &quot;คนที่&quot; เริ่ม {startTime} พร้อมกัน · แถว
                  &quot;ต่อเวลา&quot; เริ่มต่อจากรายการก่อนหน้าจบ ·
                  เลือกเตียงได้ทุกคน (เตียงที่ไม่ว่างช่วงเวลานั้นเลือกไม่ได้)
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
            // การ์ดใบนี้จะกลายเป็นบิลของวันบอร์ด — ป้ายเครดิตต้องบอกสถานะ ณ วันนั้น ไม่ใช่วันนี้
            billDate={boardDate}
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

          {groupClash && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {groupClash}
            </p>
          )}

          <Button
            type="submit"
            disabled={
              pending ||
              !serviceId ||
              extraPeople.some((p) => !p.serviceId) ||
              groupClash !== null
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
