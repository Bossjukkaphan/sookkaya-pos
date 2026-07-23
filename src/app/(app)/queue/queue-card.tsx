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
import { setQueueStatus } from "./queue-actions"
import { shortBedName, type Bed } from "@/lib/beds"
import { type QueueEntry } from "./queue-board"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

/** สีการ์ดตามสถานะ — รอ ขาว · กำลังนวด ม่วง · จ่ายแล้ว เขียว
 * แยกขอบกับพื้น เพราะขอบถูกแทนด้วยสีส้มเมื่อเวลาซ้อน (ผสม class ขอบสองสีแล้ว
 * ตัวชนะขึ้นกับลำดับใน stylesheet ไม่ใช่ลำดับที่เขียน — ต้องเลือกที่เดียว) */
const STATUS_BORDER: Record<string, string> = {
  waiting: "border-slate-300",
  in_service: "border-violet-300",
  paid: "border-emerald-300",
}
const STATUS_BG: Record<string, string> = {
  waiting: "bg-white",
  in_service: "bg-violet-50",
  paid: "bg-emerald-50",
}
const STATUS_LABEL: Record<string, string> = {
  waiting: "รอ",
  in_service: "กำลังนวด",
  paid: "ชำระแล้ว",
}

export function QueueCard({
  entry,
  bed,
  siblings,
  groupSize = 1,
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
            {entry.notes && <p>หมายเหตุ: {entry.notes}</p>}
            <p>สถานะ: {STATUS_LABEL[entry.status]}</p>
            {hasOverlap && (
              <p className="text-orange-600">
                ⚠️ เวลาซ้อนกับคิวอื่นของหมอคนเดียวกัน
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            {entry.status === "waiting" && (
              <Button disabled={pending} onClick={() => changeStatus("in_service")}>
                ▶ เริ่มนวด
              </Button>
            )}
            {entry.status === "in_service" && (
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
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => changeStatus("waiting")}
                >
                  ย้อนเป็นรอ
                </Button>
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
                <Button
                  variant="outline"
                  disabled={pending}
                  className="text-red-600"
                  onClick={() => changeStatus("cancelled")}
                >
                  ยกเลิกคิว
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
