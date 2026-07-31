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
import {
  CARD_H,
  PX_PER_MIN,
  bedStartMin,
  clampStart,
  minToX,
  overlaps,
  timeToMin,
  busyBedIds,
  busyTherapistIds,
  canMoveCardWindow,
} from "@/lib/queue"
import { deriveCardStatus } from "@/lib/queue-status"
import {
  approveBooking,
  movePaidCard,
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
import { Time24Field } from "@/components/time24-field"

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

/** นาทีที่นวดไปแล้ว → ป้ายสั้นๆ เช่น "25 น." / "1:15 ชม." */
const fmtElapsed = (m: number) =>
  m < 60 ? `${m} น.` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} ชม.`

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
        {/* dropdown 24 ชม. — กัน AM/PM หลอกตาเหมือนฟอร์มเพิ่มคิว */}
        <Time24Field value={time} onChange={setTime} ariaLabel="เวลาเริ่มนวดจริง" />
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
  due = 0,
  nowMin,
  isToday,
  boardDateIsPast = false,
  dragging,
  dragOffset,
  movedRef,
  onPointerDown,
  onEdit,
  onChanged,
  therapists = [],
  beds = [],
  allEntries = [],
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
  /** ค้างรับของบิลที่ผูกกับการ์ดนี้ (v_bill_due ผ่าน sale_id) — มีความหมายเฉพาะการ์ดที่จ่ายแล้ว
   * (status==="paid") การ์ดเล็กเกินจะโชว์ปุ่มเก็บเพิ่ม — พนักงานไปกดที่ /today หรือ /history แทน */
  due?: number
  /** นาทีปัจจุบัน (เวลาไทย) — ใช้เช็คคำขอค้าง (pending) ที่เลยเวลานัดแล้ว */
  nowMin: number
  isToday: boolean
  /** บอร์ดกำลังดูวันที่ผ่านมาแล้ว — ทุกการ์ดถือว่าเสร็จสิ้น */
  boardDateIsPast?: boolean
  dragging: boolean
  dragOffset: { dx: number; dy: number } | null
  movedRef: React.RefObject<boolean>
  onPointerDown: (e: React.PointerEvent) => void
  onEdit: () => void
  onChanged: () => void
  /** รายชื่อหมอ/เตียง/คิวทั้งวัน — ใช้เฉพาะกล่องย้ายเตียง-เปลี่ยนหมอของการ์ดที่จ่ายแล้ว */
  therapists?: { id: string; name: string }[]
  beds?: Bed[]
  allEntries?: QueueEntry[]
}) {
  const [open, setOpen] = useState(false)
  // กล่องกรอกเวลาเริ่มจริง: "start" = กดเริ่มนวด · "edit" = แก้/เติมเวลาย้อนหลัง
  const [timeDialog, setTimeDialog] = useState<"start" | "edit" | null>(null)
  const [moveOpen, setMoveOpen] = useState(false)
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

  // สถานะแบบภาพ ThaiHand: ชิพนวด (รอ/กำลังนวด/เสร็จสิ้นอัตโนมัติ) + ชิพจ่าย แยกอิสระ
  // วันที่ผ่านมา = เสร็จหมดแล้ว · วันหน้า = ยังไม่เริ่ม · เฉพาะวันนี้ใช้เวลาจริง
  const statusNow = isToday ? nowMin : boardDateIsPast ? 24 * 60 * 2 : -1
  const derived = deriveCardStatus(entry, statusNow)
  // ป้ายสั้นเพราะการ์ด 60 นาทีกว้างแค่ 120px — สีคือตัวสื่อความหมายหลัก
  const SERVICE_CHIP: Record<string, { label: string; cls: string }> = {
    waiting: { label: "รอ", cls: "border-slate-300 bg-white text-slate-600" },
    in_service: { label: "นวดอยู่", cls: "border-violet-300 bg-violet-100 text-violet-700" },
    done: { label: "เสร็จ", cls: "border-emerald-300 bg-emerald-100 text-emerald-700" },
  }

  // ป้ายจับเวลามุมขวาบน — เลือกมาแสดงตัวเดียวตามลำดับความเร่งด่วน
  // (เตือนก่อน แล้วค่อยเวลาที่นวดไปแล้ว แล้วค่อยเวลาที่เหลือ)
  const timerBadge: { label: string; cls: string } | null =
    !isToday || entry.status === "pending"
      ? null
      : derived.overdueMin !== undefined
        ? { label: `⏳ เกิน ${derived.overdueMin} น.`, cls: "bg-red-500" }
        : derived.lateStartMin !== undefined && !derived.paid
          ? { label: `สาย ${derived.lateStartMin} น.`, cls: "bg-orange-500" }
          : entry.status === "in_service" &&
              actualStartMin !== null &&
              nowMin >= actualStartMin
            ? { label: `⏱ ${fmtElapsed(nowMin - actualStartMin)}`, cls: "bg-violet-600" }
            : derived.remainingMin !== undefined
              ? { label: `เหลือ ${derived.remainingMin} น.`, cls: "bg-violet-600" }
              : null

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
              : entry.status === "pending"
                ? STATUS_BORDER.pending
                : derived.awaitingPayment
                  ? "border-amber-400"
                  : (STATUS_BORDER[derived.service] ?? "border-slate-300")
        } ${
          entry.status === "pending"
            ? STATUS_BG.pending
            : derived.awaitingPayment
              ? "bg-amber-50"
              : (STATUS_BG[derived.service] ?? "bg-white")
        } ${dragging ? "z-30 opacity-80 ring-2 ring-violet-400" : "z-[5]"}`}
        style={{
          // clamp: การ์ดเวลานอกช่วงบอร์ด (ข้อมูลเก่า/คีย์ผิด) ต้องยังโผล่ริมขอบให้กดแก้ได้
          // — เคยล่องหนจนพนักงานคีย์ซ้ำ (server กันคีย์ใหม่นอกเวลาทำการแล้ว)
          left: minToX(clampStart(startMin, entry.duration_min)),
          top: laneTop + 6,
          height: CARD_H,
          width: entry.duration_min * PX_PER_MIN,
          transform: dragOffset
            ? `translate(${dragOffset.dx}px, ${dragOffset.dy}px)`
            : undefined,
        }}
      >
        {/* ทุกบรรทัดตัดคำแยกกัน และของที่ห้ามหาย (ป้าย/ชิพ) เป็นพี่น้อง shrink-0 เสมอ
            — เคยเอาชิพต่อท้ายบรรทัด truncate แล้วหายหมดในการ์ด 60 นาที (กว้าง 120px) */}
        <p className="flex items-center gap-1 leading-tight">
          <span className="min-w-0 flex-1 truncate font-semibold">
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
          </span>
          {/* ป้ายจับเวลาสด (เฉพาะวันนี้) — ตัวเดียวจบ เรียงตามความเร่งด่วน
              เดิมแยกเป็น 4 ก้อน absolute มุมเดียวกัน การ์ดที่กำลังนวดเลยมี ⏱ กับ "เหลือ" ทับกัน */}
          {timerBadge && (
            <span
              className={`shrink-0 rounded px-1 text-[10px] font-semibold text-white ${timerBadge.cls}`}
            >
              {timerBadge.label}
            </span>
          )}
        </p>
        <p className="truncate leading-tight text-slate-600">
          👤 {entry.customer_name || "ไม่ระบุลูกค้า"}
          {groupSize > 1 && ` · กลุ่ม ${groupSize} คน`}
          {entry.is_request && " · 💖รีเควส"}
        </p>
        <p className="truncate leading-tight text-slate-500">
          🕐 {minToHHMM(startMin)}–{minToHHMM(startMin + entry.duration_min)} ·{" "}
          {entry.duration_min} น.
          {/* เวลานวดจริงโชว์เมื่อไม่ตรงเวลาจอง — ตรงกันแล้วไม่ต้องรกการ์ด */}
          {actualLabel && actualStartMin !== startMin && ` · ▶${actualLabel}`}
          {warnNoStart && " · ⚠️ไม่มีเวลาเริ่ม"}
        </p>
        <p className="truncate leading-tight text-slate-500">
          📍 {bed ? `${bed.room} (${bed.name})` : "ยังไม่ระบุเตียง"}
          {bedConflict && " ⚠️ซ้อน"}
          {entry.private_room && " · ห้องสปา"}
        </p>
        {entry.status !== "pending" && (
          <p className="flex gap-0.5 leading-tight">
            <span
              className={`rounded border px-1 text-[10px] font-medium ${SERVICE_CHIP[derived.service].cls}`}
            >
              {SERVICE_CHIP[derived.service].label}
            </span>
            {/* ชิพจ่ายเงินโชว์เฉพาะตอนมีความหมาย — "ยังไม่ชำระ" ของคิวที่ยังไม่เริ่ม
                เป็นค่าปกติอยู่แล้ว ตัดออกเพื่อไม่ให้การ์ดรก */}
            {(derived.paid || derived.awaitingPayment) && (
              <span
                className={`rounded border px-1 text-[10px] font-medium ${
                  derived.paid
                    ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                    : "border-amber-400 bg-amber-100 text-amber-800"
                }`}
              >
                {derived.paid ? "ชำระแล้ว" : "ค้างจ่าย"}
              </span>
            )}
            {/* บิลนี้ "ชำระแล้ว" ในหน้าคิว แต่ยังมีค้างรับจริง (ต่อเวลา/แก้ยอดหลังปิดบิล) —
                การ์ดเล็กเกินจะโชว์จำนวนเงิน/ปุ่มเก็บเพิ่ม พนักงานไปกดที่ /today หรือ /history แทน */}
            {entry.status === "paid" && due > 0.005 && (
              <span className="rounded border border-red-400 bg-red-100 px-1 text-[10px] font-medium text-red-700">
                ค้างรับ
              </span>
            )}
          </p>
        )}
      </button>

      {/* เส้นเวลานวดจริง — ประกบขอบล่างของเลนการ์ด ลากจากเวลาเริ่มจริงถึงจบจริง
          แท่งการ์ดหลักยึดเวลาจอง เส้นนี้จึงเหลื่อมซ้าย/ขวาให้เห็นว่าเริ่มเร็วหรือช้ากว่าจอง */}
      {/* z-[6]: สูงกว่าการ์ด (z-[5]) แต่ต่ำกว่าแถบเมนูล่าง (z-10) — ไม่งั้นสกรอลล์แล้วเส้นลอยทับเมนู */}
      {actualStartMin !== null && !dragging && (
        <div
          className={`pointer-events-none absolute z-[6] h-1.5 rounded-full ${
            ACTUAL_LINE_COLOR[entry.status] ?? "bg-slate-400"
          }`}
          style={{
            left: minToX(actualStartMin),
            top: laneTop + 6 + CARD_H - 3,
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
              <p className="text-amber-700">รีเควสหมอ (หมอได้ +40 ฿ — ร้านจ่าย ไม่บวกเงินลูกค้า)</p>
            )}
            {entry.private_room && (
              <p className="text-teal-700">ห้องสปาส่วนตัว (+100 ฿ ลูกค้าจ่ายตอนเก็บเงิน)</p>
            )}
            {entry.notes && <p>หมายเหตุ: {entry.notes}</p>}
            <p>
              สถานะ:{" "}
              {entry.status === "pending"
                ? STATUS_LABEL.pending
                : `${SERVICE_CHIP[derived.service].label} · ${derived.paid ? "ชำระแล้ว" : "ยังไม่ชำระ"}`}
            </p>
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
            {/* ย้ายเตียง/เปลี่ยนหมอโดยไม่ยกเลิกบิล — เฉพาะการ์ดจ่ายแล้วของวันนี้
                และภายใน 15 นาทีแรกของการนวดจริง (server เช็คซ้ำอีกชั้น) */}
            {entry.status === "paid" &&
              entry.sale_id &&
              isToday &&
              canMoveCardWindow(entry, nowMin).allowed && (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setOpen(false)
                    setMoveOpen(true)
                  }}
                >
                  🔁 ย้ายเตียง/เปลี่ยนหมอ
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

      {moveOpen && (
        <MoveCardDialog
          entry={entry}
          therapists={therapists}
          beds={beds}
          allEntries={allEntries}
          pending={pending}
          onClose={() => setMoveOpen(false)}
          onSave={(v) =>
            startTransition(async () => {
              const r = await movePaidCard(entry.id, v)
              if (!r.ok) toast.error(r.error)
              else toast.success("ย้ายเรียบร้อย — บิลและการ์ดขยับพร้อมกัน")
              setMoveOpen(false)
              onChanged()
            })
          }
        />
      )}

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


/**
 * กล่องย้ายเตียง/เปลี่ยนหมอของการ์ดที่จ่ายแล้ว — เตียง/หมอที่ติดคิวช่วงเวลานวดนี้เลือกไม่ได้
 * เปลี่ยนหมอ = ค่ามือย้ายตามบิลไปหมอใหม่ · รีเควสให้ติ๊กตามข้อตกลงกับลูกค้าจริง
 */
function MoveCardDialog({
  entry,
  therapists,
  beds,
  allEntries,
  pending,
  onClose,
  onSave,
}: {
  entry: QueueEntry
  therapists: { id: string; name: string }[]
  beds: Bed[]
  allEntries: QueueEntry[]
  pending: boolean
  onClose: () => void
  onSave: (v: { bedId: string | null; therapistId: string; isRequest: boolean }) => void
}) {
  const [therapistId, setTherapistId] = useState(entry.therapist_id ?? "")
  const [bedId, setBedId] = useState(entry.bed_id ?? "")
  const [isRequest, setIsRequest] = useState(Boolean(entry.is_request))

  // ช่วงเวลาที่การ์ดนี้ใช้จริง (นับจากเวลาเริ่มจริงถ้ามี) — ใช้หาว่าใครว่าง
  const startMin = bedStartMin(entry)
  const others = allEntries.filter((e) => e.id !== entry.id)
  const busyT = busyTherapistIds(others, startMin, entry.duration_min)
  const busyB = busyBedIds(others, startMin, entry.duration_min)
  const therapistChanged = therapistId !== (entry.therapist_id ?? "")

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>🔁 ย้ายเตียง/เปลี่ยนหมอ</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">หมอนวด</p>
            <select
              value={therapistId}
              onChange={(e) => setTherapistId(e.target.value)}
              className="h-11 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none"
              aria-label="เลือกหมอนวดใหม่"
            >
              <option value="">— เลือกหมอ —</option>
              {therapists.map((t) => (
                <option
                  key={t.id}
                  value={t.id}
                  disabled={t.id !== entry.therapist_id && busyT.has(t.id)}
                >
                  {t.name}
                  {t.id !== entry.therapist_id && busyT.has(t.id) ? " (ติดคิว)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">เตียง</p>
            <select
              value={bedId}
              onChange={(e) => setBedId(e.target.value)}
              className="h-11 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none"
              aria-label="เลือกเตียงใหม่"
            >
              <option value="">— ไม่ระบุเตียง —</option>
              {beds.map((b) => (
                <option
                  key={b.id}
                  value={b.id}
                  disabled={b.id !== entry.bed_id && busyB.has(b.id)}
                >
                  {b.room} · {b.name}
                  {b.id !== entry.bed_id && busyB.has(b.id) ? " (ไม่ว่าง)" : ""}
                </option>
              ))}
            </select>
          </div>
          {therapistChanged && (
            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={isRequest}
                onChange={(e) => setIsRequest(e.target.checked)}
                className="h-4 w-4"
              />
              คิดรีเควสหมอ (+40 ฿ — ร้านจ่ายให้หมอ ลูกค้าไม่จ่ายเพิ่ม)
            </label>
          )}
          <p className="text-xs text-slate-500">
            ค่ามือย้ายตามบิลไปหมอใหม่ · ยอดบิลลูกค้าไม่เปลี่ยน · ย้ายได้ภายใน 15
            นาทีแรกของการนวด
          </p>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={pending || !therapistId}
              onClick={() =>
                onSave({ bedId: bedId || null, therapistId, isRequest })
              }
            >
              บันทึกย้าย
            </Button>
            <Button variant="outline" disabled={pending} onClick={onClose}>
              ยกเลิก
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
