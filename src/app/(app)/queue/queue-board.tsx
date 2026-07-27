"use client"

import { Fragment, useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { setRealtimeAuth } from "@/lib/supabase/realtime-auth"
import {
  BOARD_END_MIN,
  BOARD_START_MIN,
  PX_PER_MIN,
  bedStartMin,
  clampStart,
  countFreeTherapists,
  minToTime,
  minToX,
  overlaps,
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
// Bed/shortBedName ย้ายไป @/lib/beds — ไฟล์นี้เป็น "use client" ห้ามมี util
// ที่ฝั่ง server ต้องเรียก (หน้าประวัติบิลเคยพังเพราะ import จากที่นี่)
import type { Bed } from "@/lib/beds"
import { todayInShopTz } from "@/lib/datetime"
export type { Bed }

const ROW_H = 64
const BOARD_W = (BOARD_END_MIN - BOARD_START_MIN) * PX_PER_MIN

/**
 * จัดคิวที่เวลาชนกันในแถวเดียวกันให้แยก "เลน" เรียงลงมา ไม่ทับกัน —
 * greedy ตามเวลาเริ่ม: ใส่เลนแรกที่ว่าง ไม่มีก็เปิดเลนใหม่ แถวสูงตามจำนวนเลน
 */
function buildLayout(entries: QueueEntry[], rowIds: (string | null)[]) {
  const laneById = new Map<string, number>()
  const rowHeights: number[] = []
  for (const rowId of rowIds) {
    const rowEntries = entries
      .filter((e) => e.therapist_id === rowId)
      .slice()
      .sort(
        (a, b) =>
          timeToMin(a.start_time) - timeToMin(b.start_time) ||
          a.id.localeCompare(b.id)
      )
    const laneEnds: number[] = []
    for (const e of rowEntries) {
      const start = timeToMin(e.start_time)
      let lane = laneEnds.findIndex((end) => end <= start)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(start + e.duration_min)
      } else {
        laneEnds[lane] = start + e.duration_min
      }
      laneById.set(e.id, lane)
    }
    rowHeights.push(Math.max(1, laneEnds.length) * ROW_H)
  }
  const rowTops: number[] = []
  let acc = 0
  for (const h of rowHeights) {
    rowTops.push(acc)
    acc += h
  }
  return { laneById, rowHeights, rowTops }
}

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
  /** ตำแหน่ง Y ของการ์ด (รวมเลน) นับจากหัวตารางแถวแรก — แถวสูงไม่เท่ากันแล้ว
   * จะคำนวณแถวปลายทางจาก dy/ROW_H ตรงๆ ไม่ได้ ต้องเทียบพิกัดจริง */
  topAbs: number
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
  checkedInTherapistIds,
  turnAwayCount,
  autoOpenAdd = false,
}: {
  therapists: Therapist[]
  services: ServiceOption[]
  beds: Bed[]
  initialEntries: QueueEntry[]
  boardDate: string
  isToday: boolean
  /** หมอที่เช็คอินวันนี้ (หน้า /checkin) — คนที่ไม่อยู่ในลิสต์ = แถวปิดรับคิว */
  checkedInTherapistIds: string[]
  turnAwayCount: number
  /** มาจากปุ่ม "จองล่วงหน้า" หน้าบันทึกขาย — เปิดฟอร์มเพิ่มคิวให้เลย */
  autoOpenAdd?: boolean
}) {
  // มีข้อมูลเช็คอินของวันนั้นเมื่อไหร่ ค่อยบังคับ — วันที่ยังไม่ติ๊กเลย เปิดทุกแถวตามเดิม
  const hasCheckinData = checkedInTherapistIds.length > 0
  // บอร์ดวันเก่า: ทุกการ์ดถือว่าเสร็จสิ้นแล้ว (ใช้กับชิพสถานะบนการ์ด)
  const boardDateIsPast = !isToday && boardDate < todayInShopTz()
  const checkedIn = new Set(checkedInTherapistIds)
  const isAbsentRow = (therapistId: string | null) =>
    hasCheckinData && therapistId !== null && !checkedIn.has(therapistId)
  const [entries, setEntries] = useState(initialEntries)
  const [nowMin, setNowMin] = useState(nowMinInShopTz)
  const [drag, setDrag] = useState<DragState | null>(null)
  // ฟอร์มเพิ่ม/แก้คิว — mount เมื่อเปิดเท่านั้น state ในฟอร์มจะสดเสมอ
  // autoOpenAdd: มาจากปุ่ม "จองล่วงหน้า" หน้าบันทึกขาย → เปิดฟอร์มรอเลย
  const [form, setForm] = useState<null | {
    entry?: QueueEntry
    therapistId?: string | null
    startTime?: string
  }>(autoOpenAdd ? {} : null)
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
  // หมอที่ไม่ได้เช็คอินถูกดันลงล่างสุด — แถวที่ใช้งานจริงอยู่ติดกัน ไม่มีแถวปิดมาคั่นกลาง
  const rows: { id: string | null; name: string }[] = [
    { id: null, name: "ยังไม่ระบุหมอ" },
    ...therapists.filter((t) => !isAbsentRow(t.id)),
    ...therapists.filter((t) => isAbsentRow(t.id)),
  ]
  const workingRowCount = 1 + therapists.filter((t) => !isAbsentRow(t.id)).length

  // ตำแหน่งเลน/ความสูงแต่ละแถว — คิวเวลาชนกันเรียงลงมาให้เห็นครบทุกใบ
  const layout = buildLayout(entries, rows.map((r) => r.id))

  const refetch = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("queue_entries")
      .select("*")
      .eq("queue_date", boardDate)
      .not("status", "in", "(cancelled,rejected)")
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
    let cancelled = false
    const channel = supabase
      .channel("queue-board")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_entries" },
        refetch
      )
    setRealtimeAuth(supabase).then(() => {
      if (!cancelled) channel.subscribe()
    })
    return () => {
      cancelled = true
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
      topAbs:
        layout.rowTops[rowIndex] + (layout.laneById.get(entry.id) ?? 0) * ROW_H,
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
    // แถวสูงไม่เท่ากัน (ขยายตามจำนวนเลน) — หาแถวปลายทางจากจุดกึ่งกลางการ์ดเทียบพิกัดจริง
    const centerY = d.topAbs + d.dy + ROW_H / 2
    let newRow = layout.rowTops.findIndex(
      (top, i) => centerY >= top && centerY < top + layout.rowHeights[i]
    )
    if (newRow === -1) newRow = centerY < 0 ? 0 : rows.length - 1
    const therapistId = rows[newRow].id

    // ห้ามวางการ์ดใส่แถวหมอที่ไม่ได้เช็คอิน (ปิดรับคิว)
    if (isAbsentRow(therapistId)) {
      toast.error("หมอคนนี้ไม่ได้เข้างานวันนี้ — เช็คอินได้ที่หน้า เข้างาน")
      movedRef.current = false
      return
    }

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
  // เสียง "ติ๊ง" ตอนมีคำขอใหม่ย้ายไปตัวแจ้งเตือนรวม (components/queue-notifications
  // — mount ใน (app)/layout อยู่ทุกหน้ารวมหน้านี้) ถ้าดังเองที่นี่ด้วยจะซ้อนสองรอบ
  const pendingCount = entries.filter((e) => e.status === "pending").length

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
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <span className="rounded-full bg-sky-100 px-2 py-1 text-sm text-sky-800">
              ⏳ รออนุมัติ {pendingCount}
            </span>
          )}
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

      {/* สรุปสด ณ ตอนนี้ (ตามภาพตัวอย่าง): หมอที่เข้างานและว่าง + เตียงว่าง */}
      {isToday &&
        (() => {
          const busy = entries.filter((e) => {
            if (e.status === "pending" || !e.start_time) return false
            const s = timeToMin(e.start_time)
            return nowMin >= s && nowMin < s + e.duration_min
          })
          const busyTherapists = new Set(busy.map((e) => e.therapist_id).filter(Boolean))
          const availableTherapists = hasCheckinData
            ? therapists.filter((t) => checkedIn.has(t.id))
            : therapists
          const freeTherapists = availableTherapists.filter(
            (t) => !busyTherapists.has(t.id)
          ).length
          const busyBeds = new Set(busy.map((e) => e.bed_id).filter(Boolean))
          const freeBeds = beds.filter((b) => !busyBeds.has(b.id)).length
          return (
            <p className="text-sm font-medium text-slate-700">
              ตอนนี้ว่าง{" "}
              <span className={freeTherapists === 0 ? "text-red-600" : "text-emerald-700"}>
                {freeTherapists} คน
              </span>{" "}
              ·{" "}
              <span className={freeBeds === 0 ? "text-red-600" : "text-emerald-700"}>
                {freeBeds} เตียง
              </span>
              {hasCheckinData &&
                ` · เข้างาน ${checkedIn.size}/${therapists.length} คน`}
            </p>
          )
        })()}

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
                  // ตัวแรกห้ามกึ่งกลาง — ครึ่งซ้ายจะมุดใต้คอลัมน์ชื่อหมอที่ลอยทับอยู่ (เลข 10:00 เคยโดนบัง)
                  className={`absolute top-1.5 text-xs text-slate-500 ${
                    h * 60 === BOARD_START_MIN ? "" : "-translate-x-1/2"
                  }`}
                  style={{ left: minToX(h * 60) + (h * 60 === BOARD_START_MIN ? 4 : 0) }}
                >
                  {h}:00
                </span>
              ))}
            </div>
          </div>

          {rows.map((row, rowIndex) => (
            <Fragment key={row.id ?? "none"}>
              {/* คั่นก่อนกลุ่มหมอที่ไม่ได้เข้างาน — แถวใช้งานจริงจบตรงนี้ */}
              {rowIndex === workingRowCount && (
                <div className="flex border-b bg-slate-100">
                  <div className="sticky left-0 z-20 w-24 shrink-0 border-r bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                    ไม่เข้างาน
                  </div>
                  <div style={{ width: BOARD_W }} />
                </div>
              )}
              <div className="flex border-b last:border-b-0">
              <div className="sticky left-0 z-20 flex w-24 shrink-0 items-center gap-1.5 border-r bg-white px-2 text-sm font-medium">
                {/* วงแหวนเช็คอินแบบภาพตัวอย่าง: เขียว=มา แดง=ไม่มา (เฉพาะวันที่มีข้อมูลติ๊กแล้ว) */}
                {row.id !== null && hasCheckinData && (
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full border-[3px] ${
                      checkedIn.has(row.id) ? "border-emerald-500" : "border-red-400"
                    }`}
                  />
                )}
                <span className="truncate">{row.name}</span>
              </div>
              <div
                className={`relative ${
                  isAbsentRow(row.id)
                    ? "bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,rgba(100,67,67,0.07)_8px,rgba(100,67,67,0.07)_16px)]"
                    : ""
                }`}
                style={{ width: BOARD_W, height: layout.rowHeights[rowIndex] }}
                onClick={(e) => {
                  // แถวหมอที่ไม่เข้างาน — ปิดรับคิว แตะเพิ่มไม่ได้
                  if (isAbsentRow(row.id)) {
                    toast.error("หมอคนนี้ไม่ได้เข้างานวันนี้ — เช็คอินได้ที่หน้า เข้างาน")
                    return
                  }
                  // dialog ของการ์ดถูก portal ไปที่ body แต่ React ยัง bubble คลิกกลับมาตาม
                  // component tree ถึงแถวนี้ — เช็ค DOM จริง: target ไม่อยู่ในแถว = คลิกใน dialog
                  // (เคยทำช่อง "เหตุผลอื่น" ตอนปฏิเสธคิวไลน์ เผลอเปิดฟอร์มเพิ่มคิวซ้อนขึ้นมา)
                  if (!e.currentTarget.contains(e.target as Node)) return
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
                    className="absolute inset-y-0 z-[6] w-0.5 bg-violet-500"
                    style={{ left: minToX(nowMin) }}
                  />
                )}
                {entries
                  .filter((e) => e.therapist_id === row.id)
                  .map((e) => (
                    <QueueCard
                      key={e.id}
                      entry={e}
                      laneTop={(layout.laneById.get(e.id) ?? 0) * ROW_H}
                      therapistName={row.id ? row.name : null}
                      bed={beds.find((b) => b.id === e.bed_id) ?? null}
                      siblings={entries.filter(
                        (s) => s.therapist_id === row.id && s.id !== e.id
                      )}
                      bedConflict={
                        // เตียงมีจำกัด — ใบไหนใช้เตียงซ้อนกับใบอื่น (ข้ามช่องหมอ) ต้องเห็นทันที
                        !!e.bed_id &&
                        entries.some(
                          (s) =>
                            s.id !== e.id &&
                            s.bed_id === e.bed_id &&
                            s.status !== "cancelled" &&
                            overlaps(
                              bedStartMin(s),
                              s.duration_min,
                              bedStartMin(e),
                              e.duration_min
                            )
                        )
                      }
                      groupSize={
                        e.group_id
                          ? entries.filter((s) => s.group_id === e.group_id).length
                          : 1
                      }
                      nowMin={nowMin}
                      isToday={isToday}
                      boardDateIsPast={boardDateIsPast}
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
            </Fragment>
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
