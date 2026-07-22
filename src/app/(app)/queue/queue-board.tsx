"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import {
  BOARD_END_MIN,
  BOARD_START_MIN,
  PX_PER_MIN,
  clampStart,
  countFreeTherapists,
  minToTime,
  minToX,
  snapMin,
  timeToMin,
} from "@/lib/queue"
import type { Tables } from "@/types/database"
import { moveQueueEntry } from "./queue-actions"
import { QueueFormDialog } from "./queue-form-dialog"
import { QueueCard } from "./queue-card"
import { TurnAwayButton } from "./turn-away-button"
import { Button } from "@/components/ui/button"

export type QueueEntry = Tables<"queue_entries">
export type Therapist = { id: string; name: string }
export type ServiceOption = { id: string; name: string; duration_min: number | null }
export type Bed = { id: string; room: string; name: string }

/** ชื่อเตียงแบบย่อไว้โชว์บนการ์ด เช่น "ไทย·3" "สปา1·2" */
export function shortBedName(bed: Bed): string {
  const room = bed.room.replace("ห้องนวดไทย", "ไทย").replace("ห้องสปา ", "สปา")
  const num = bed.name.replace("เตียง ", "")
  return `${room}·${num}`
}

const ROW_H = 64
const BOARD_W = (BOARD_END_MIN - BOARD_START_MIN) * PX_PER_MIN

function nowMinInShopTz(): number {
  const t = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date())
  return timeToMin(t)
}

type DragState = {
  id: string
  fromRow: number
  startMin: number
  duration: number
  dx: number
  dy: number
  lifted: boolean
}

export function QueueBoard({
  therapists,
  services,
  beds,
  initialEntries,
  boardDate,
  isToday,
  turnAwayCount,
}: {
  therapists: Therapist[]
  services: ServiceOption[]
  beds: Bed[]
  initialEntries: QueueEntry[]
  boardDate: string
  isToday: boolean
  turnAwayCount: number
}) {
  const [entries, setEntries] = useState(initialEntries)
  const [nowMin, setNowMin] = useState(nowMinInShopTz)
  const [drag, setDrag] = useState<DragState | null>(null)
  // ฟอร์มเพิ่ม/แก้คิว — mount เมื่อเปิดเท่านั้น state ในฟอร์มจะสดเสมอ
  const [form, setForm] = useState<null | {
    entry?: QueueEntry
    therapistId?: string | null
    startTime?: string
  }>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // ref คือแหล่งความจริงของการลาก อัปเดตทันทีใน handler — ถ้า sync ผ่าน effect
  // จะช้ากว่า event ถัดไปหนึ่งจังหวะ แล้วการขยับหลังครบ 300ms พอดีจะโดนตัดทิ้ง
  const dragRef = useRef<DragState | null>(null)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const captured = useRef(false)
  // กันแตะ-ปล่อยหลังลาก ไม่ให้เผลอเปิด dialog ของการ์ดที่เพิ่งย้าย
  const movedRef = useRef(false)

  // แถว 0 = ยังไม่ระบุหมอ (ที่พักคิว) · ที่เหลือแถวละหมอ
  const rows: { id: string | null; name: string }[] = [
    { id: null, name: "ยังไม่ระบุหมอ" },
    ...therapists,
  ]

  const refetch = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("queue_entries")
      .select("*")
      .eq("queue_date", boardDate)
      .neq("status", "cancelled")
      .order("start_time")
    if (data) setEntries(data)
  }, [boardDate])

  // เปลี่ยนวัน (กดลูกศร) → เริ่มจากข้อมูลของวันใหม่ที่ server ส่งมา
  // ปรับ state ระหว่าง render ตามสูตร React (ไม่ใช้ effect — เลี่ยง render ซ้อน)
  const [prevInitial, setPrevInitial] = useState(initialEntries)
  if (prevInitial !== initialEntries) {
    setPrevInitial(initialEntries)
    setEntries(initialEntries)
  }

  // เครื่องอื่นแก้คิว → ดึงใหม่ทั้งวัน (ข้อมูลวันละไม่กี่สิบแถว เอาถูกไว้ก่อน)
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("queue-board")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_entries" },
        refetch
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [refetch])

  useEffect(() => {
    const t = setInterval(() => setNowMin(nowMinInShopTz()), 60_000)
    return () => clearInterval(t)
  }, [])

  // วันนี้เลื่อนไปเวลาปัจจุบัน (เห็นย้อนหลัง 1 ชม.) · วันอื่นเริ่มที่หัววัน
  useEffect(() => {
    scrollRef.current?.scrollTo({
      left: isToday ? Math.max(0, minToX(nowMinInShopTz()) - 60 * PX_PER_MIN) : 0,
    })
  }, [isToday, boardDate])

  function onCardPointerDown(
    e: React.PointerEvent,
    entry: QueueEntry,
    rowIndex: number
  ) {
    if (entry.status === "paid") return // งานจบแล้ว ห้ามย้าย
    origin.current = { x: e.clientX, y: e.clientY }
    captured.current = false
    movedRef.current = false
    const base: DragState = {
      id: entry.id,
      fromRow: rowIndex,
      startMin: timeToMin(entry.start_time),
      duration: entry.duration_min,
      dx: 0,
      dy: 0,
      lifted: false,
    }
    dragRef.current = base
    setDrag(base)
    pressTimer.current = setTimeout(() => {
      // ครบ 300ms โดยไม่ขยับ = ตั้งใจยกการ์ด
      const d = dragRef.current
      if (d && d.id === base.id) {
        dragRef.current = { ...d, lifted: true }
        setDrag(dragRef.current)
        navigator.vibrate?.(10)
      }
    }, 300)
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d || !origin.current) return
    const dx = e.clientX - origin.current.x
    const dy = e.clientY - origin.current.y
    if (!d.lifted) {
      // ขยับก่อนครบ 300ms = ตั้งใจเลื่อนหน้าจอ ไม่ใช่ลากการ์ด
      if (Math.hypot(dx, dy) > 8) {
        if (pressTimer.current) clearTimeout(pressTimer.current)
        dragRef.current = null
        setDrag(null)
      }
      return
    }
    if (!captured.current) {
      // จับ pointer ไว้กับบอร์ด กันหลุดเมื่อนิ้วออกนอกการ์ด
      // บางกรณี (pointer หายไปแล้ว) จะ throw — ลากต่อได้แม้จับไม่สำเร็จ
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } catch {
        // ปล่อยผ่าน — ยังตาม pointermove ที่ bubble มาได้ตามปกติ
      }
      captured.current = true
    }
    if (Math.hypot(dx, dy) > 4) movedRef.current = true
    dragRef.current = { ...d, dx, dy }
    setDrag(dragRef.current)
  }

  function onPointerUp() {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    const d = dragRef.current
    origin.current = null
    dragRef.current = null
    setDrag(null)
    if (!d || !d.lifted || !movedRef.current) {
      movedRef.current = false
      return // แตะเฉยๆ → ปล่อยให้ onClick ของการ์ดเปิด dialog
    }

    const newStart = clampStart(snapMin(d.startMin + d.dx / PX_PER_MIN), d.duration)
    const newRow = Math.max(
      0,
      Math.min(rows.length - 1, d.fromRow + Math.round(d.dy / ROW_H))
    )
    const therapistId = rows[newRow].id

    // optimistic — เห็นผลทันที แล้วยืนยันกับเซิร์ฟเวอร์
    setEntries((prev) =>
      prev.map((en) =>
        en.id === d.id
          ? { ...en, therapist_id: therapistId, start_time: minToTime(newStart) }
          : en
      )
    )
    moveQueueEntry(d.id, therapistId, minToTime(newStart)).then((r) => {
      if (!r.ok) toast.error(r.error)
      refetch()
    })
    // ให้ click ที่ตามหลัง pointerup โดนกันไว้ก่อน แล้วค่อยรีเซ็ต
    setTimeout(() => {
      movedRef.current = false
    }, 150)
  }

  const freeCount = countFreeTherapists(
    therapists.map((t) => t.id),
    entries,
    nowMin
  )
  const waitingCount = entries.filter((e) => e.status === "waiting").length

  const hours = Array.from(
    { length: (BOARD_END_MIN - BOARD_START_MIN) / 60 },
    (_, i) => BOARD_START_MIN / 60 + i
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          {/* "ว่างตอนนี้" มีความหมายเฉพาะวันนี้ — วันอื่นบอกจำนวนคิวพอ */}
          {isToday && (
            <>
              ว่างตอนนี้{" "}
              <span className="font-semibold text-emerald-700">{freeCount} คน</span>
              {" · "}
            </>
          )}
          คิวรอ <span className="font-semibold">{waitingCount}</span>
          {" · "}ทั้งหมด <span className="font-semibold">{entries.length}</span>
        </p>
        <div className="flex gap-2">
          <TurnAwayButton boardDate={boardDate} initialCount={turnAwayCount} />
          <Button className="h-11" onClick={() => setForm({})}>
            + เพิ่มคิว
          </Button>
        </div>
      </div>

      {form && (
        <QueueFormDialog
          therapists={therapists}
          services={services}
          beds={beds}
          entries={entries}
          boardDate={boardDate}
          isToday={isToday}
          entry={form.entry}
          defaultTherapistId={form.therapistId}
          defaultStartTime={form.startTime}
          onClose={() => setForm(null)}
          onDone={refetch}
        />
      )}

      <div ref={scrollRef} className="overflow-x-auto rounded-lg border bg-white">
        <div
          style={{ width: BOARD_W + 96 }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* หัวเวลา */}
          <div className="flex border-b bg-slate-50">
            <div className="sticky left-0 z-20 w-24 shrink-0 border-r bg-slate-50" />
            <div className="relative h-8" style={{ width: BOARD_W }}>
              {hours.map((h) => (
                <span
                  key={h}
                  className="absolute top-1.5 -translate-x-1/2 text-xs text-slate-500"
                  style={{ left: minToX(h * 60) }}
                >
                  {h}:00
                </span>
              ))}
            </div>
          </div>

          {rows.map((row, rowIndex) => (
            <div key={row.id ?? "none"} className="flex border-b last:border-b-0">
              <div className="sticky left-0 z-20 flex w-24 shrink-0 items-center border-r bg-white px-2 text-sm font-medium">
                <span className="truncate">{row.name}</span>
              </div>
              <div
                className="relative"
                style={{ width: BOARD_W, height: ROW_H }}
                onClick={(e) => {
                  // แตะช่องว่าง = เพิ่มคิวให้หมอแถวนี้ที่เวลานั้น (การ์ดเป็น button — ไม่เข้าเงื่อนไขนี้)
                  if ((e.target as HTMLElement).closest("button")) return
                  if (movedRef.current) return // เพิ่งลากเสร็จ ไม่ใช่ตั้งใจแตะ
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  const min = clampStart(
                    snapMin(BOARD_START_MIN + (e.clientX - rect.left) / PX_PER_MIN),
                    60
                  )
                  setForm({ therapistId: row.id, startTime: minToTime(min) })
                }}
              >
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute inset-y-0 border-l border-slate-100"
                    style={{ left: minToX(h * 60) }}
                  />
                ))}
                {isToday && nowMin >= BOARD_START_MIN && nowMin <= BOARD_END_MIN && (
                  <div
                    className="absolute inset-y-0 z-10 w-0.5 bg-violet-500"
                    style={{ left: minToX(nowMin) }}
                  />
                )}
                {entries
                  .filter((e) => e.therapist_id === row.id)
                  .map((e) => (
                    <QueueCard
                      key={e.id}
                      entry={e}
                      bed={beds.find((b) => b.id === e.bed_id) ?? null}
                      siblings={entries.filter(
                        (s) => s.therapist_id === row.id && s.id !== e.id
                      )}
                      dragging={drag?.lifted === true && drag.id === e.id}
                      dragOffset={
                        drag?.lifted === true && drag.id === e.id
                          ? { dx: drag.dx, dy: drag.dy }
                          : null
                      }
                      movedRef={movedRef}
                      onPointerDown={(ev) => onCardPointerDown(ev, e, rowIndex)}
                      onEdit={() => setForm({ entry: e })}
                      onChanged={refetch}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-400">
        แตะการ์ดเพื่อดู/เปลี่ยนสถานะ · กดค้างแล้วลากเพื่อย้ายหมอหรือเลื่อนเวลา (ขยับทีละ 15
        นาที)
      </p>
    </div>
  )
}
