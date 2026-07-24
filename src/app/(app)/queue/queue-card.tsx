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
import { PX_PER_MIN, minToX, overlaps, timeToMin } from "@/lib/queue"
import { approveBooking, rejectBooking, setQueueStatus } from "./queue-actions"
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
    <div className="w-full space-y-1.5 rounded-lg border border-red-200 p-2">
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
  bed,
  siblings,
  groupSize = 1,
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
  bed: Bed | null
  siblings: QueueEntry[]
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
  const [pending, startTransition] = useTransition()

  const startMin = timeToMin(entry.start_time)
  // ซ้อนเวลากับการ์ดอื่นในแถวเดียวกัน → ขอบส้มเตือน (ไม่บล็อก เผื่อนวดคู่)
  const hasOverlap = siblings.some(
    (s) =>
      s.status !== "cancelled" &&
      overlaps(startMin, entry.duration_min, timeToMin(s.start_time), s.duration_min)
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
        className={`absolute top-1.5 bottom-1.5 overflow-hidden rounded-lg border-2 px-2 py-1 text-left text-xs shadow-sm select-none touch-none ${
          hasOverlap
            ? "border-orange-400"
            : isOverduePending
              ? "border-dashed border-orange-400"
              : (STATUS_BORDER[entry.status] ?? "border-slate-300")
        } ${STATUS_BG[entry.status] ?? "bg-white"} ${
          dragging ? "z-30 opacity-80 ring-2 ring-violet-400" : "z-[5]"
        }`}
        style={{
          left: minToX(startMin),
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
          {bed && ` · ${shortBedName(bed)}`}
          {entry.is_request && (
            <span className="ml-1 rounded border border-amber-200 bg-amber-50 px-1 text-[10px] font-medium text-amber-700">
              รีเควส
            </span>
          )}
        </p>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{entry.service_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 text-sm text-slate-600">
            <p>
              จอง {entry.start_time.slice(0, 5)} น. · {entry.duration_min} นาที
              {entry.started_at &&
                ` · เริ่มจริง ${new Intl.DateTimeFormat("en-GB", {
                  timeZone: "Asia/Bangkok",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                }).format(new Date(entry.started_at))} น.`}
            </p>
            <p>ลูกค้า: {entry.customer_name || "ไม่ระบุ"}</p>
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
                ⚠️ เวลาซ้อนกับคิวอื่นของหมอคนเดียวกัน
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
              <Button disabled={pending} onClick={() => changeStatus("in_service")}>
                ▶ เริ่มนวด
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
    </>
  )
}
