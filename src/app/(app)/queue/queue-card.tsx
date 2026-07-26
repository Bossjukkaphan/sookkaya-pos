"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"

import {
  CHANNEL_LABEL,
  SOURCE_BADGE,
  SOURCE_LABEL,
  isBookingChannel,
  isCustomerSource,
} from "@/lib/customer-source"
import { PX_PER_MIN, bedStartMin, minToX, overlaps, timeToMin } from "@/lib/queue"
import {
  approveBooking,
  rejectBooking,
  setActualStartTime,
  setQueueStatus,
  startMassage,
} from "./queue-actions"
import { shortBedName, type Bed } from "@/lib/beds"
import { type QueueEntry } from "./queue-board"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/** สีการ์ดตามสถานะ — รอ ขาว · กำลังนวด ม่วง · จ่ายแล้ว เขียว
 * แยกขอบกับพื้น เพราะขอบถูกแทนด้วยสีส้มเมื่อเวลาซ้อน (ผสม class ขอบสองสีแล้ว
 * ตัวชนะขึ้นกับลำดับใน stylesheet ไม่ใช่ลำดับที่เขียน — ต้องเลือกที่เดียว) */
const STATUS_BORDER: Record<string, string> = {
  waiting: "border-slate-300",
  in_service: "border-violet-300",
  paid: "border-emerald-300",
  pending: "border-dashed border-sky-400",
}
const STATUS_BG: Record<string, string> = {
  waiting: "bg-white",
  in_service: "bg-violet-50",
  paid: "bg-emerald-50",
  pending: "bg-sky-50",
}
const STATUS_LABEL: Record<string, string> = {
  waiting: "รอ",
  in_service: "กำลังนวด",
  paid: "ชำระแล้ว",
  pending: "รออนุมัติ",
}

/** timestamptz → HH:MM เวลาไทย */
const bkkTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso))

/** เวลาปัจจุบันของร้าน (HH:MM) — ค่าตั้งต้นของกล่องกรอกเวลาเริ่มนวด */
const nowBkk = () => bkkTime(new Date().toISOString())

/** นาทีในวัน → HH:MM — คำนวณเวลาจบจากเวลาเริ่มจริง + นาทีโปรแกรม */
const minToHHMM = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`

/** สีเส้นเวลานวดจริงบนไทม์ไลน์ — เข้มกว่าสีการ์ดให้เห็นเหลื่อมจากเวลาจองชัดๆ */
const ACTUAL_LINE_COLOR: Record<string, string> = {
  in_service: "bg-violet-500",
  paid: "bg-emerald-500",
}

/**
 * กล่องกรอกเวลาเริ่มนวดจริง — เด้งตอนกด ▶ เริ่มนวด (ค่าตั้งต้น = ตอนนี้ แก้ได้)
 * และใช้ซ้ำตอนแก้เวลาย้อนหลัง/เติมเวลาที่ลืมบันทึก
 */
function StartTimeDialog({
  open,
  title,
  initial,
  pending,
  onSave,
  onClose,
}: {
  open: boolean
  title: string
  initial: string
  pending: boolean
  onSave: (time: string) => void
  onClose: () => void
}) {
  const [time, setTime] = useState(initial)
  // รีเซ็ตเฉพาะจังหวะ "เปิด" — ห้ามอิงค่า initial ระหว่างเปิดอยู่
  // (ค่าตั้งต้นคือเวลาปัจจุบันซึ่งเปลี่ยนทุกนาที ถ้าอิงตลอดจะล้างค่าที่พนักงานพิมพ์ค้างไว้)
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setTime(initial)
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600">
          เวลาเริ่มนวดจริง — แก้ได้ถ้ากดปุ่มช้ากว่าตอนที่เริ่มจริง
        </p>
        <Input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="text-center text-lg"
        />
        <Button disabled={pending || !time} onClick={() => onSave(time)}>
          บันทึกเวลาเริ่มนวด
        </Button>
      </DialogContent>
    </Dialog>
  )
}

/** เหตุผลปฏิเสธที่พิมพ์บ่อย — เลือกไวได้ พิมพ์เองก็ได้ */
const REJECT_REASONS = ["คิวช่วงเวลานั้นเต็ม", "หมอที่เลือกไม่อยู่ในวันนั้น"] as const

/** ปุ่มปฏิเสธคำขอจากไลน์ — กดแล้วค่อยเลือกเหตุผล (กันกดพลาด + เหตุผลแนบไปกับข้อความหาลูกค้า) */
function RejectButton({
  entryId,
  pending,
  startTransition,
  onDone,
}: {
  entryId: string
  pending: boolean
  startTransition: (callback: () => void | Promise<void>) => void
  onDone: () => void
}) {
  const [picking, setPicking] = useState(false)
  const [custom, setCustom] = useState("")

  const send = (reason: string) =>
    startTransition(async () => {
      const r = await rejectBooking(entryId, reason)
      if (!r.ok) toast.error(r.error)
      else if (r.warning) toast.warning(r.warning)
      onDone()
    })

  if (!picking)
    return (
      <Button
        variant="outline"
        className="border-red-300 text-red-600"
        disabled={pending}
        onClick={() => setPicking(true)}
      >
        ✕ ปฏิเสธ…
      </Button>
    )

  return (
    // กันคลิก/แตะรั่วขึ้นไปหา handler ของบอร์ด (React bubble ข้าม portal ได้) —
    // เคยทำให้แตะช่องพิมพ์เหตุผลแล้วฟอร์มเพิ่มคิวเปิดซ้อนแทนที่จะได้พิมพ์
    <div
      className="w-full space-y-1.5 rounded-lg border border-red-200 p-2"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {REJECT_REASONS.map((r) => (
        <Button
          key={r}
          variant="outline"
          size="sm"
          className="w-full justify-start"
          disabled={pending}
          onClick={() => send(r)}
        >
          {r}
        </Button>
      ))}
      <div className="flex gap-1.5">
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="เหตุผลอื่น…"
          className="h-9"
          // เปิด picker แล้วพร้อมพิมพ์เลย — ไม่ต้องแตะช่องซ้ำ (ลดโอกาสแตะพลาดบนมือถือ)
          autoFocus
        />
        <Button size="sm" disabled={pending || !custom.trim()} onClick={() => send(custom)}>
          ส่ง
        </Button>
      </div>
    </div>
  )
}

export function QueueCard({
  entry,
  laneTop,
  therapistName,
  bed,
  siblings,
  groupSize = 1,
  bedConflict = false,
  nowMin,
  isToday,
  dragging,
  dragOffset,
  movedRef,
  onPointerDown,
  onEdit,
  onChanged,
}: {
  entry: QueueEntry
  /** ระยะจากขอบบนแถว — คิวเวลาชนกันถูกจัดลงเลนถัดไป ไม่วางทับกัน */
  laneTop: number
  /** ชื่อหมอของแถวนี้ — null = ยังไม่ระบุหมอ (ใช้บอกใน dialog ว่าคิว/รีเควสของหมอท่านไหน) */
  therapistName: string | null
  bed: Bed | null
  siblings: QueueEntry[]
  /** เตียงใบนี้ถูกคิวใบอื่นใช้คร่อมเวลากัน (ข้ามช่องหมอ) — เตียงมีจำกัด ต้องรีบแก้ */
  bedConflict?: boolean
  /** จำนวนคนทั้งกลุ่มของการ์ดนี้ (นับตัวเองด้วย) — 1 = มาคนเดียว */
  groupSize?: number
  /** นาทีปัจจุบัน (เวลาไทย) — ใช้เช็คคำขอค้าง (pending) ที่เลยเวลานัดแล้ว */
  nowMin: number
  isToday: boolean
  dragging: boolean
  dragOffset: { dx: number; dy: number } | null
  movedRef: React.RefObject<boolean>
  onPointerDown: (e: React.PointerEvent) => void
  onEdit: () => void
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  // กล่องกรอกเวลาเริ่มจริง: "start" = กดเริ่มนวด · "edit" = แก้/เติมเวลาย้อนหลัง
  const [timeDialog, setTimeDialog] = useState<"start" | "edit" | null>(null)
  const [pending, startTransition] = useTransition()

  const startMin = timeToMin(entry.start_time)
  // เวลานวดจริง (นาทีในวัน) — มีเมื่อกดเริ่มนวดแล้ว · จบจริง = เริ่มจริง + นาทีโปรแกรม
  const actualStartMin = entry.started_at ? timeToMin(bkkTime(entry.started_at)) : null
  const actualEndMin = actualStartMin !== null ? actualStartMin + entry.duration_min : null
  const actualLabel =
    actualStartMin !== null && actualEndMin !== null
      ? `${minToHHMM(actualStartMin)}–${minToHHMM(actualEndMin)}`
      : null
  // จ่ายเงินแล้วแต่ไม่เคยกดเริ่มนวด — ข้อมูลเวลาโหว่ ต้องเตือนให้เติมย้อนหลัง
  const paidWithoutStart = entry.status === "paid" && !entry.started_at
  // ป้ายเตือนดังเฉพาะบอร์ดวันนี้ — การ์ดเก่าก่อนมีระบบเวลาเริ่มจริงมีเป็นสิบใบ ไม่ต้องประจานย้อนหลัง
  // (ปุ่มใส่เวลาย้อนหลังยังกดได้ทุกวันจาก dialog ของการ์ด)
  const warnNoStart = paidWithoutStart && isToday
  // ซ้อนเวลากับการ์ดอื่นในแถวหมอเดียวกัน → ขอบส้มเตือน — นับจากเวลานวดจริง
  // (server กันเพิ่มใหม่แล้ว แต่การเริ่มช้า/เร็วกว่าจองอาจทำให้เวลาจริงไปทับกันทีหลัง)
  const hasOverlap = siblings.some(
    (s) =>
      s.status !== "cancelled" &&
      overlaps(bedStartMin(entry), entry.duration_min, bedStartMin(s), s.duration_min)
  )
  // คำขอจากไลน์ที่ยังไม่อนุมัติ แต่เลยเวลานัดของวันนี้ไปแล้ว → เตือนสีส้ม (รีบตัดสินใจ)
  const isOverduePending = entry.status === "pending" && isToday && startMin < nowMin

  function changeStatus(status: string) {
    startTransition(async () => {
      const r = await setQueueStatus(entry.id, status)
      if (!r.ok) toast.error(r.error)
      setOpen(false)
      onChanged()
    })
  }

  return (
    <>
      <button
        type="button"
        onPointerDown={onPointerDown}
        onClick={() => {
          // เพิ่งลากเสร็จ — อย่าเปิด dialog ของการ์ดที่เพิ่งย้าย
          if (!movedRef.current) setOpen(true)
        }}
        className={`absolute overflow-hidden rounded-lg border-2 px-2 py-1 text-left text-xs shadow-sm select-none touch-none ${
          hasOverlap || bedConflict
            ? "border-orange-400"
            : isOverduePending
              ? "border-dashed border-orange-400"
              : (STATUS_BORDER[entry.status] ?? "border-slate-300")
        } ${STATUS_BG[entry.status] ?? "bg-white"} ${
          dragging ? "z-30 opacity-80 ring-2 ring-violet-400" : "z-[5]"
        }`}
        style={{
          left: minToX(startMin),
          top: laneTop + 6,
          height: 52, // ROW_H 64 - ระยะขอบบนล่างเท่าเดิม (top-1.5/bottom-1.5)
          width: entry.duration_min * PX_PER_MIN,
          transform: dragOffset
            ? `translate(${dragOffset.dx}px, ${dragOffset.dy}px)`
            : undefined,
        }}
      >
        <p className="truncate font-semibold">
          {/* คำขอจากไลน์ที่ยังไม่อนุมัติ — เด่นสุดในบรรดาป้าย เพราะต้องรีบตัดสินใจ */}
          {entry.status === "pending" && (
            <span className="mr-1 rounded bg-sky-500 px-1 text-[10px] text-white">
              LINE·รออนุมัติ
            </span>
          )}
          {/* ป้ายเฉพาะจอง/agency — walk-in คือกรณีปกติไม่ติดป้าย */}
          {isCustomerSource(entry.source) && SOURCE_BADGE[entry.source] && (
            <span
              className={`mr-1 rounded border px-1 text-[10px] font-medium ${SOURCE_BADGE[entry.source]}`}
            >
              {SOURCE_LABEL[entry.source]}
            </span>
          )}
          {entry.service_name}
        </p>
        <p className="truncate text-slate-500">
          {groupSize > 1 && (
            <span className="mr-1 rounded border border-sky-200 bg-sky-50 px-1 text-[10px] font-medium text-sky-700">
              กลุ่ม {groupSize} คน
            </span>
          )}
          {entry.customer_name || "ไม่ระบุลูกค้า"} · {STATUS_LABEL[entry.status]}
          {/* เวลานวดจริงบนการ์ด — เห็นทันทีไม่ต้องเปิด dialog */}
          {actualLabel && ` · ▶${actualLabel}`}
          {warnNoStart && " · ⚠️ไม่มีเวลาเริ่ม"}
          {bed && ` · ${shortBedName(bed)}`}
          {bedConflict && " ⚠️ซ้อน"}
          {entry.is_request && (
            <span className="ml-1 rounded border border-amber-200 bg-amber-50 px-1 text-[10px] font-medium text-amber-700">
              รีเควส
            </span>
          )}
        </p>
      </button>

      {/* เส้นเวลานวดจริง — ประกบขอบล่างของเลนการ์ด ลากจากเวลาเริ่มจริงถึงจบจริง
          แท่งการ์ดหลักยึดเวลาจอง เส้นนี้จึงเหลื่อมซ้าย/ขวาให้เห็นว่าเริ่มเร็วหรือช้ากว่าจอง */}
      {actualStartMin !== null && !dragging && (
        <div
          className={`pointer-events-none absolute z-10 h-1.5 rounded-full ${
            ACTUAL_LINE_COLOR[entry.status] ?? "bg-slate-400"
          }`}
          style={{
            left: minToX(actualStartMin),
            top: laneTop + 6 + 52 - 3,
            width: entry.duration_min * PX_PER_MIN,
          }}
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{entry.service_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 text-sm text-slate-600">
            <p>
              จอง {entry.start_time.slice(0, 5)} น. · {entry.duration_min} นาที
              {actualStartMin !== null &&
                actualEndMin !== null &&
                ` · เริ่มจริง ${minToHHMM(actualStartMin)} → จบ ~${minToHHMM(actualEndMin)} น.`}
            </p>
            {warnNoStart && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-amber-800">
                ⚠️ ชำระเงินแล้วแต่ยังไม่บันทึกเวลาเริ่มนวด — กดใส่ย้อนหลังให้ข้อมูลครบ
              </p>
            )}
            <p>ลูกค้า: {entry.customer_name || "ไม่ระบุ"}</p>
            <p>
              หมอ: {therapistName ?? "ยังไม่ระบุ"}
              {entry.is_request && therapistName && (
                <span className="ml-1 rounded border border-amber-200 bg-amber-50 px-1 text-[11px] font-medium text-amber-700">
                  ลูกค้ารีเควส
                </span>
              )}
            </p>
            <p>
              มาจาก:{" "}
              {isCustomerSource(entry.source) ? SOURCE_LABEL[entry.source] : "ไม่ทราบ"}
              {entry.booking_channel &&
                isBookingChannel(entry.booking_channel) &&
                ` (${CHANNEL_LABEL[entry.booking_channel]})`}
            </p>
            {bed && (
              <p>
                เตียง: {bed.room} {bed.name}
              </p>
            )}
            {entry.customer_phone && <p>เบอร์โทร: {entry.customer_phone}</p>}
            {entry.is_request && (
              <p className="text-amber-700">รีเควสหมอ (+40 ฿ คิดตอนเก็บเงิน)</p>
            )}
            {entry.notes && <p>หมายเหตุ: {entry.notes}</p>}
            <p>สถานะ: {STATUS_LABEL[entry.status]}</p>
            {hasOverlap && (
              <p className="text-orange-600">
                ⚠️ เวลาซ้อนกับคิวอื่น
                {therapistName ? `ของหมอ${therapistName}` : "ในช่องยังไม่ระบุหมอ"}
              </p>
            )}
            {bedConflict && (
              <p className="text-orange-600">
                ⚠️ เตียง{bed ? ` ${shortBedName(bed)}` : ""}
                ถูกคิวอื่นใช้ช่วงเวลาเดียวกัน — เตียงหนึ่งใช้ได้ทีละคน
                กดแก้ไขเพื่อเปลี่ยนเตียงหรือเวลา
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            {/* หน้างานจริงบางร้านเก็บเงินก่อนเริ่มนวด บางทีเริ่มก่อนค่อยเก็บ —
                จึงให้กดได้ทั้งสองปุ่มตั้งแต่สถานะ "รอคิว" ไม่บังคับลำดับ */}
            {(entry.status === "waiting" || entry.status === "in_service") && (
              <>
                <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
                  <Link href={`/pos?queue=${entry.id}`}>💰 เก็บเงิน</Link>
                </Button>
                {groupSize > 1 && entry.group_id && (
                  <Button
                    asChild
                    variant="outline"
                    className="border-emerald-600 text-emerald-700"
                  >
                    <Link href={`/pos?group=${entry.group_id}`}>
                      💰 เก็บเงินทั้งกลุ่ม ({groupSize} คน)
                    </Link>
                  </Button>
                )}
              </>
            )}
            {entry.status === "waiting" && (
              <Button
                disabled={pending}
                onClick={() => {
                  // เด้งกล่องยืนยันเวลาเริ่มจริงก่อนบันทึก — ไม่ stamp เวลาเงียบๆ
                  setOpen(false)
                  setTimeDialog("start")
                }}
              >
                ▶ เริ่มนวด
              </Button>
            )}
            {entry.started_at && entry.status !== "waiting" && (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setOpen(false)
                  setTimeDialog("edit")
                }}
              >
                🕐 แก้เวลาเริ่ม
              </Button>
            )}
            {paidWithoutStart && (
              <Button
                className="bg-amber-500 hover:bg-amber-600"
                disabled={pending}
                onClick={() => {
                  setOpen(false)
                  setTimeDialog("edit")
                }}
              >
                🕐 ใส่เวลาเริ่มนวด
              </Button>
            )}
            {entry.status === "in_service" && (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => changeStatus("waiting")}
              >
                ย้อนเป็นรอ
              </Button>
            )}
            {entry.status === "pending" && (
              <>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await approveBooking(entry.id)
                      if (!r.ok) toast.error(r.error)
                      else if (r.warning) toast.warning(r.warning)
                      setOpen(false)
                      onChanged()
                    })
                  }
                >
                  ✓ รับจอง{groupSize > 1 ? ` (${groupSize} คน)` : ""}
                </Button>
                <RejectButton
                  entryId={entry.id}
                  pending={pending}
                  startTransition={startTransition}
                  onDone={() => {
                    setOpen(false)
                    onChanged()
                  }}
                />
              </>
            )}
            {entry.status !== "paid" && (
              <>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    // ปิดกล่องนี้ก่อน แล้วให้บอร์ดเปิดฟอร์มแก้ไข (แก้เวลาแล้วการ์ดเลื่อนตามเอง)
                    setOpen(false)
                    onEdit()
                  }}
                >
                  ✏️ แก้ไข
                </Button>
                {/* pending ใช้ "ปฏิเสธ" แทน — ต้องแนบเหตุผลและแจ้งลูกค้าทางไลน์ ไม่ให้ยกเลิกเงียบๆ */}
                {entry.status !== "pending" && (
                  <Button
                    variant="outline"
                    disabled={pending}
                    className="text-red-600"
                    onClick={() => changeStatus("cancelled")}
                  >
                    ยกเลิกคิว
                  </Button>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <StartTimeDialog
        open={timeDialog !== null}
        title={timeDialog === "start" ? "▶ เริ่มนวด" : "🕐 เวลาเริ่มนวดจริง"}
        // มีเวลาเดิมใช้เวลาเดิม (รวมเคสย้อนเป็นรอแล้วเริ่มใหม่) · ไม่มีก็เวลาปัจจุบัน
        initial={entry.started_at ? bkkTime(entry.started_at) : nowBkk()}
        pending={pending}
        onClose={() => setTimeDialog(null)}
        onSave={(t) =>
          startTransition(async () => {
            const r =
              timeDialog === "start"
                ? await startMassage(entry.id, t)
                : await setActualStartTime(entry.id, t)
            if (!r.ok) toast.error(r.error)
            setTimeDialog(null)
            onChanged()
          })
        }
      />
    </>
  )
}
