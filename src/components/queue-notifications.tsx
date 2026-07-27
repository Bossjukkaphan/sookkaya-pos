"use client"

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell } from "lucide-react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { setRealtimeAuth } from "@/lib/supabase/realtime-auth"
import { playNotifySound } from "@/lib/notify-sound"
import { formatThaiDate } from "@/lib/datetime"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { Tables } from "@/types/database"

type QueueRow = Tables<"queue_entries">

/** ข้อมูลเท่าที่กระดิ่ง/ toast ต้องใช้ — ไม่เก็บทั้งแถวให้เปลืองความจำ */
export type PendingRequest = {
  id: string
  customer_name: string | null
  queue_date: string
  start_time: string
  service_name: string
  created_at: string
  /** ชื่อหมอที่ลูกค้ารีเควส — null = ตามคิว */
  therapist_name: string | null
}

function toPending(row: QueueRow, therapistNames: Map<string, string>): PendingRequest {
  return {
    id: row.id,
    customer_name: row.customer_name,
    queue_date: row.queue_date,
    start_time: row.start_time,
    service_name: row.service_name,
    created_at: row.created_at,
    therapist_name: row.therapist_id
      ? (therapistNames.get(row.therapist_id) ?? null)
      : null,
  }
}

/** ต่อท้ายข้อความเมื่อลูกค้ารีเควสหมอ — ร้านต้องเห็นตั้งแต่แจ้งเตือน ไม่ต้องกดเข้าไปดู */
function reqSuffix(name: string | null): string {
  return name ? ` · รีเควสหมอ${name}` : ""
}

type QueueNotificationsValue = {
  /** จำนวนคำขอจากไลน์ที่รออนุมัติ (ทุกวัน — นโยบายเดียวกับป้ายเมนูคิว) */
  pendingCount: number
  /** รายการรออนุมัติ เรียงใหม่สุดก่อน */
  pending: PendingRequest[]
}

/** export ไว้ให้หน้า preview/เทสต์ mock ค่าได้ — โค้ดจริงใช้ผ่าน hook ข้างล่าง */
export const QueueNotificationsContext =
  createContext<QueueNotificationsValue | null>(null)

/** อ่านสถานะแจ้งเตือนสด — คืน null เมื่ออยู่นอก provider (ใช้ค่า server แทน) */
export function usePendingQueue(): QueueNotificationsValue | null {
  return useContext(QueueNotificationsContext)
}

function shortTime(t: string): string {
  return t.slice(0, 5)
}

/**
 * ตัวแจ้งเตือนรวมของโซนพนักงาน — mount ครั้งเดียวใน (app)/layout ให้อยู่ทุกหน้า
 * ฟัง realtime บน queue_entries: คำขอจองใหม่จากไลน์ (INSERT status=pending)
 * → เสียงติ๊ง + toast ค้างจนกดปิด + Notification ของระบบเมื่อพับจอ/สลับแอปอยู่
 * และเลี้ยงตัวเลขป้ายเมนู/กระดิ่งให้สดโดยไม่ต้องรีเฟรชหน้า
 *
 * เสียงเป็นหน้าที่ของตัวนี้ที่เดียว — queue-board เลิกดังเองแล้ว ไม่งั้นเปิดหน้า
 * คิวอยู่จะดังซ้อนสองรอบ
 */
export function QueueNotificationsProvider({
  initialCount,
  children,
}: {
  /** ค่าจาก server ตอนโหลดหน้า — กันป้ายกระพริบ 0 ก่อนดึงรายการจริงเสร็จ */
  initialCount: number
  children: ReactNode
}) {
  const router = useRouter()
  const [pending, setPending] = useState<PendingRequest[]>([])
  const [loaded, setLoaded] = useState(false)
  // กัน StrictMode/remount แจ้งซ้ำ: จำ id ที่เคยเด้งเตือนไปแล้ว
  const notifiedIds = useRef(new Set<string>())

  // id หมอ → ชื่อ — ใช้แปะชื่อหมอรีเควสใน toast/กระดิ่ง (realtime ส่งแค่ id มา)
  const therapistNames = useRef(new Map<string, string>())

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    // โหลดชื่อหมอก่อนลิสต์ pending — แถวที่ fetch มาจะได้แปลง id เป็นชื่อได้เลย
    const namesReady = supabase
      .from("therapists")
      .select("id, name")
      .then(({ data }) => {
        if (cancelled) return
        for (const t of data ?? []) therapistNames.current.set(t.id, t.name)
      })

    // นับ/ลิสต์ทุก pending ไม่กรองวันที่ — นโยบายเดียวกับป้ายเมนู (ดู (app)/layout.tsx):
    // คำขอที่ค้างข้ามวันลูกค้ายังเห็น "รอร้านยืนยัน" อยู่ ต้องโผล่จนกว่าจะรับ/ปฏิเสธ
    namesReady.then(() =>
      supabase
        .from("queue_entries")
        .select(
          "id, customer_name, queue_date, start_time, service_name, created_at, therapist_id"
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          if (cancelled || !data) return
          const rows = data.map((d) => ({
            ...d,
            therapist_name: d.therapist_id
              ? (therapistNames.current.get(d.therapist_id) ?? null)
              : null,
          }))
          setPending((prev) => {
            const fetched = new Set(rows.map((d) => d.id))
            // เก็บแถวที่ realtime เพิ่งยัดเข้ามาระหว่างรอ fetch (ไม่อยู่ในผลลัพธ์) ไว้ด้วย
            return [...prev.filter((p) => !fetched.has(p.id)), ...rows]
          })
          setLoaded(true)
        })
    )

    const notifyNewRequest = (row: QueueRow) => {
      if (notifiedIds.current.has(row.id)) return
      notifiedIds.current.add(row.id)

      playNotifySound()

      const name = row.customer_name?.trim() || "ลูกค้า"
      const time = shortTime(row.start_time)
      const req = reqSuffix(
        row.therapist_id ? (therapistNames.current.get(row.therapist_id) ?? "ที่เลือกไว้") : null
      )
      const gotoQueue = () => router.push(`/queue?date=${row.queue_date}`)

      // toast ค้างจนพนักงานกดเอง — id = id คิว จะได้ตามไปปิดเมื่อมีคนอนุมัติจากเครื่องอื่น
      toast("มีคิวจองใหม่จากไลน์ 🌿", {
        id: row.id,
        description: `${name} · ${formatThaiDate(row.queue_date)} ${time} น. · ${row.service_name}${req}`,
        duration: Infinity,
        closeButton: true,
        action: { label: "ดูคิว", onClick: gotoQueue },
      })

      // พับจอ/สลับแอปอยู่ → เด้ง Notification ของระบบ (ถ้าเคยกดอนุญาตไว้)
      if (
        document.hidden &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        try {
          const n = new Notification(`มีคิวจองใหม่จากไลน์ 🌿 ${name} · ${time} น.`, {
            body: `${formatThaiDate(row.queue_date)} · ${row.service_name}${req}`,
            tag: row.id, // แถวเดิมไม่เด้งซ้อน
          })
          n.onclick = () => {
            window.focus()
            gotoQueue()
            n.close()
          }
        } catch {
          // บางเบราว์เซอร์ (Android Chrome) ห้าม new Notification ตรงๆ — ข้ามไป
        }
      }
    }

    const removePending = (id: string) => {
      setPending((prev) => prev.filter((p) => p.id !== id))
      toast.dismiss(id) // เครื่องอื่นรับ/ปฏิเสธไปแล้ว — เก็บ toast ที่ค้างอยู่ด้วย
    }

    // replica identity ของตารางเป็น default → payload.old มีแค่ id
    // เลยตัดสินจาก state ฝั่งเรา + new.status แทนการเทียบ old.status
    const channel = supabase
      .channel("queue-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "queue_entries" },
        (payload) => {
          const row = payload.new as QueueRow
          if (row.status !== "pending") return
          setPending((prev) =>
            prev.some((p) => p.id === row.id)
              ? prev
              : [toPending(row, therapistNames.current), ...prev]
          )
          notifyNewRequest(row)
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "queue_entries" },
        (payload) => {
          const row = payload.new as QueueRow
          if (row.status === "pending") {
            // เคสหายาก (แก้กลับมาเป็น pending) — เข้าลิสต์เงียบๆ ไม่ต้องเด้งเสียง
            setPending((prev) =>
              prev.some((p) => p.id === row.id)
                ? prev.map((p) =>
                    p.id === row.id ? toPending(row, therapistNames.current) : p
                  )
                : [toPending(row, therapistNames.current), ...prev]
            )
          } else {
            removePending(row.id)
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "queue_entries" },
        (payload) => {
          const old = payload.old as { id?: string }
          if (old.id) removePending(old.id)
        }
      )
    setRealtimeAuth(supabase).then(() => {
      if (!cancelled) channel.subscribe()
    })

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [router])

  // ก่อนดึงลิสต์เสร็จ: ค่า server + ที่ realtime เพิ่งเข้ามา — ป้ายไม่กระพริบ 0
  const pendingCount = loaded ? pending.length : initialCount + pending.length

  return (
    <QueueNotificationsContext.Provider value={{ pendingCount, pending }}>
      {children}
    </QueueNotificationsContext.Provider>
  )
}

/**
 * กระดิ่งบนแถบหัว — ป้ายจำนวนรออนุมัติ + กดเปิดลิสต์คำขอล่าสุด
 * แต่ละรายการลิงก์ไปหน้าคิวของวันนั้น · มีปุ่มขออนุญาต Notification ของเบราว์เซอร์
 */
export function QueueBell() {
  const live = usePendingQueue()
  const [open, setOpen] = useState(false)
  // Notification.permission: server ไม่มีคลาสนี้ → "unsupported" (dropdown ยังไม่
  // render ตอน hydrate เพราะ open=false เสมอ เลยไม่มีปัญหา server/client ไม่ตรง)
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  )
  const rootRef = useRef<HTMLDivElement>(null)

  // กดนอกกล่อง → ปิด
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  const count = live?.pendingCount ?? 0
  const items = live?.pending ?? []

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={
          count > 0 ? `การแจ้งเตือน — รออนุมัติ ${count} รายการ` : "การแจ้งเตือน"
        }
        aria-expanded={open}
        className={cn(
          // size-10 = 40px — เป้าแตะขั้นต่ำที่นิ้วกดโดน (เดิม size-9 = 36px)
          "relative flex size-10 items-center justify-center rounded-full transition-colors",
          open ? "bg-[#FFF0D1]/70 text-[#664343]" : "text-slate-500 hover:bg-slate-100"
        )}
      >
        <Bell className="size-5" aria-hidden />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-semibold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border bg-white shadow-lg">
          <p className="border-b bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            คำขอจองจากไลน์ที่รออนุมัติ
          </p>
          {items.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-500">
              ไม่มีคำขอที่รออนุมัติ
            </p>
          ) : (
            <ul className="max-h-72 divide-y overflow-y-auto">
              {items.slice(0, 10).map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/queue?date=${p.queue_date}`}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2.5 hover:bg-slate-50"
                  >
                    <span className="block text-sm font-medium text-slate-800">
                      {p.customer_name?.trim() || "ลูกค้า"}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {formatThaiDate(p.queue_date)} {shortTime(p.start_time)} น. ·{" "}
                      {p.service_name}
                      {reqSuffix(p.therapist_name)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {perm === "default" && (
            <div className="border-t p-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  // ขอครั้งเดียวจาก user gesture — เบราว์เซอร์บล็อกการขอแบบ auto
                  Notification.requestPermission().then(setPerm)
                }}
              >
                เปิดการแจ้งเตือนบนเครื่องนี้
              </Button>
              <p className="px-1 pt-1 text-[11px] text-slate-400">
                จะเด้งเตือนแม้พับจอหรือสลับไปแอปอื่น
              </p>
            </div>
          )}
          {perm === "denied" && (
            <p className="border-t px-3 py-2 text-[11px] text-slate-400">
              การแจ้งเตือนถูกปิดไว้ในเบราว์เซอร์ — เปิดได้จากตั้งค่าเว็บไซต์
            </p>
          )}
        </div>
      )}
    </div>
  )
}
