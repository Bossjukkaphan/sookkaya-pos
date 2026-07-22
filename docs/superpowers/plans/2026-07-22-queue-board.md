# บอร์ดคิวหมอนวด "คิววันนี้" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** หน้า `/queue` บอร์ด timeline รายหมอ การ์ดคิวลากย้ายหมอ/เลื่อนเวลาได้ เชื่อมเก็บเงินเข้า POS

**Architecture:** ตาราง `queue_entries` (ไม่มีเงิน) + ฟังก์ชัน pure ใน `lib/queue.ts` (TDD) + client board ลากด้วย pointer events + Supabase Realtime refetch + server actions เขียนทุกอย่าง · เก็บเงินผ่าน `/pos?queue={id}` แล้ว `createSale` ผูก `sale_id`

**Tech Stack:** Next.js 16 App Router · Supabase (MCP migration) · Tailwind · vitest

**Spec:** `docs/superpowers/specs/2026-07-22-queue-board-design.md`

ข้อควรรู้ codebase:
- ทำงานบน branch `queue-board` แตกจาก `main`
- `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"` ก่อนทุกคำสั่ง npm/npx
- migration ใช้ MCP `apply_migration` + เก็บสำเนาใน `supabase/migrations/`
- ตรวจภาพจริงผ่านหน้า `/preview` ชั่วคราว + เพิ่ม "/preview" ใน PUBLIC_ROUTES ของ `src/lib/supabase/proxy.ts` (ห้าม commit สองอย่างนี้)

---

### Task 1: ฐานข้อมูล — queue_entries + services.duration_min

**Files:**
- Create: `supabase/migrations/20260722130000_queue_entries.sql`
- Modify: `src/types/database.ts` (เพิ่ม queue_entries + duration_min)

- [ ] **Step 1: migration ผ่าน MCP `apply_migration` (name: queue_entries)**

```sql
-- บอร์ดคิวสดวันนี้ — ตารางนี้คือ "ผังงาน" ห้ามมีคอลัมน์เงิน
-- รายได้เกิดที่ตาราง sales ผ่าน createSale เท่านั้น ผูกกันแค่ sale_id
create table public.queue_entries (
  id            uuid primary key default gen_random_uuid(),
  queue_date    date not null,
  therapist_id  uuid references public.therapists(id),
  service_id    uuid references public.services(id),
  service_name  text not null,
  duration_min  int  not null check (duration_min between 15 and 240),
  customer_id   uuid references public.customers(id),
  customer_name text,
  start_time    time not null,
  status        text not null default 'waiting'
                check (status in ('waiting','in_service','paid','cancelled')),
  sale_id       uuid references public.sales(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index queue_entries_date_idx on public.queue_entries (queue_date);

alter table public.queue_entries enable row level security;

-- พนักงานทุกคนคือคนจัดคิว — ทุก role ที่ล็อกอินอ่าน/เขียนได้
create policy "authenticated read queue" on public.queue_entries
  for select to authenticated using (true);
create policy "authenticated write queue" on public.queue_entries
  for insert to authenticated with check (true);
create policy "authenticated update queue" on public.queue_entries
  for update to authenticated using (true);

-- realtime ต้องประกาศตารางเข้า publication เอง
alter publication supabase_realtime add table public.queue_entries;

-- ระยะเวลาของเมนู เติมจากชื่อ เช่น "นวดไทย 60 นาที" → 60
alter table public.services add column duration_min int;
update public.services
set duration_min = (regexp_match(name, '(\d+)\s*นาที'))[1]::int
where name ~ '\d+\s*นาที';
```

- [ ] **Step 2: บันทึกสำเนา migration ลงไฟล์ตาม path ข้างบน (เนื้อหาเดียวกัน)**

- [ ] **Step 3: ตรวจว่าเติม duration สำเร็จ**

Run (MCP execute_sql): `select count(*) filter (where duration_min is null) as no_dur, count(*) from services where is_active=true;`
Expected: no_dur ควรเป็น 0 หรือน้อย (เมนูที่ชื่อไม่มี "นาที")

- [ ] **Step 4: อัปเดต `src/types/database.ts`**

เพิ่มใน `Tables` (เรียงตามตัวอักษร ก่อน `receipt_counters`):

```ts
      queue_entries: {
        Row: {
          created_at: string
          customer_id: string | null
          customer_name: string | null
          duration_min: number
          id: string
          queue_date: string
          sale_id: string | null
          service_id: string | null
          service_name: string
          start_time: string
          status: string
          therapist_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          duration_min: number
          id?: string
          queue_date: string
          sale_id?: string | null
          service_id?: string | null
          service_name: string
          start_time: string
          status?: string
          therapist_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          duration_min?: number
          id?: string
          queue_date?: string
          sale_id?: string | null
          service_id?: string | null
          service_name?: string
          start_time?: string
          status?: string
          therapist_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
```

และในตาราง `services` ทุก block (Row/Insert/Update) เพิ่ม `duration_min: number | null` (Insert/Update เป็น optional)

- [ ] **Step 5: รัน reconciliation 21 ข้อ (MCP execute_sql ใช้ไฟล์ `supabase/reconciliation.sql`) — ต้อง PASS ครบ · แล้ว commit**

```bash
git add supabase/migrations/20260722130000_queue_entries.sql src/types/database.ts
git commit -m "feat: ตาราง queue_entries + services.duration_min (คิวไม่มีคอลัมน์เงิน)"
```

---

### Task 2: `src/lib/queue.ts` — คณิตของบอร์ด (TDD)

**Files:**
- Create: `src/lib/queue.test.ts` แล้วค่อย `src/lib/queue.ts`

- [ ] **Step 1: เขียนเทสก่อน**

```ts
import { describe, expect, it } from "vitest"
import {
  BOARD_END_MIN,
  BOARD_START_MIN,
  PX_PER_MIN,
  clampStart,
  countFreeTherapists,
  minToTime,
  minToX,
  overlaps,
  snapMin,
  timeToMin,
} from "./queue"

describe("timeToMin / minToTime", () => {
  it("แปลง HH:MM และ HH:MM:SS", () => {
    expect(timeToMin("10:00")).toBe(600)
    expect(timeToMin("14:30:00")).toBe(870)
    expect(minToTime(870)).toBe("14:30")
    expect(minToTime(600)).toBe("10:00")
  })
})

describe("พิกัด x", () => {
  it("10:00 คือขอบซ้าย และสเกลตาม PX_PER_MIN", () => {
    expect(minToX(BOARD_START_MIN)).toBe(0)
    expect(minToX(660)).toBe(60 * PX_PER_MIN)
  })
})

describe("snapMin + clampStart", () => {
  it("snap ทีละ 15 นาที", () => {
    expect(snapMin(607)).toBe(600)
    expect(snapMin(608)).toBe(615)
  })
  it("การ์ดไม่หลุดขอบบอร์ด", () => {
    expect(clampStart(500, 60)).toBe(BOARD_START_MIN)
    // ปลายการ์ดชนขอบขวา: เริ่มช้าสุด = 22:00 - duration
    expect(clampStart(2000, 60)).toBe(BOARD_END_MIN - 60)
  })
})

describe("overlaps", () => {
  it("ทับกันจริงเท่านั้น (ชนขอบพอดีไม่นับ)", () => {
    expect(overlaps(600, 60, 630, 60)).toBe(true)
    expect(overlaps(600, 60, 660, 60)).toBe(false)
    expect(overlaps(700, 30, 600, 200)).toBe(true)
  })
})

describe("countFreeTherapists", () => {
  const entries = [
    { therapist_id: "a", start_time: "10:00", duration_min: 60, status: "in_service" },
    { therapist_id: "b", start_time: "12:00", duration_min: 60, status: "waiting" },
    { therapist_id: "a", start_time: "13:00", duration_min: 60, status: "cancelled" },
    { therapist_id: null, start_time: "10:00", duration_min: 60, status: "waiting" },
  ]
  it("นับหมอที่ไม่มีคิวคร่อมเวลานี้ (ยกเลิก/จ่ายแล้วไม่นับว่าติด)", () => {
    // 10:30 — a ติด (in_service คร่อม), b ว่าง, c ว่าง · คิวไม่ระบุหมอไม่นับ
    expect(countFreeTherapists(["a", "b", "c"], entries, 630)).toBe(2)
    // 12:30 — b ติด (waiting คร่อม = จองไว้)
    expect(countFreeTherapists(["a", "b", "c"], entries, 750)).toBe(2)
    // 13:30 — a ว่าง (คิว 13:00 ถูกยกเลิก)
    expect(countFreeTherapists(["a", "b", "c"], entries, 810)).toBe(3)
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าตก**

Run: `npx vitest run src/lib/queue.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: implement `src/lib/queue.ts`**

```ts
/** บอร์ดคิว 10:00–22:00 · หน่วยภายในคือ "นาทีตั้งแต่เที่ยงคืน" */
export const BOARD_START_MIN = 10 * 60
export const BOARD_END_MIN = 22 * 60
export const SLOT_MIN = 15
/** 1 นาที = 2px → ชั่วโมงละ 120px · บอร์ดกว้าง 1,440px */
export const PX_PER_MIN = 2

export function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

export function minToTime(min: number): string {
  const h = String(Math.floor(min / 60)).padStart(2, "0")
  const m = String(min % 60).padStart(2, "0")
  return `${h}:${m}`
}

export function minToX(min: number): number {
  return (min - BOARD_START_MIN) * PX_PER_MIN
}

export function snapMin(min: number): number {
  return Math.round(min / SLOT_MIN) * SLOT_MIN
}

/** หนีบให้การ์ดอยู่ในบอร์ดทั้งใบ — เริ่มช้าสุดคือปิดร้านลบระยะเวลา */
export function clampStart(startMin: number, durationMin: number): number {
  return Math.max(BOARD_START_MIN, Math.min(startMin, BOARD_END_MIN - durationMin))
}

/** ทับกันจริงเท่านั้น ชนขอบพอดี (จบ 11:00 เริ่ม 11:00) ไม่นับ */
export function overlaps(
  aStart: number, aDur: number, bStart: number, bDur: number
): boolean {
  return aStart < bStart + bDur && bStart < aStart + aDur
}

type QueueLike = {
  therapist_id: string | null
  start_time: string
  duration_min: number
  status: string
}

/** หมอว่าง = ไม่มีคิว (ที่ยังไม่ยกเลิก/ยังไม่จ่าย) คร่อมเวลานี้ · คิวไม่ระบุหมอไม่ทำให้ใครติด */
export function countFreeTherapists(
  therapistIds: string[],
  entries: QueueLike[],
  nowMin: number
): number {
  const busy = new Set(
    entries
      .filter(
        (e) =>
          e.therapist_id !== null &&
          (e.status === "waiting" || e.status === "in_service") &&
          overlaps(timeToMin(e.start_time), e.duration_min, nowMin, 1)
      )
      .map((e) => e.therapist_id)
  )
  return therapistIds.filter((id) => !busy.has(id)).length
}
```

- [ ] **Step 4: รันเทสผ่าน + ทั้ง suite**

Run: `npx vitest run` — Expected: 105 + ใหม่ทั้งหมด PASS

- [ ] **Step 5: Commit** `git add src/lib/queue.* && git commit -m "feat: คณิตบอร์ดคิว (TDD)"`

---

### Task 3: `src/app/(app)/queue/queue-actions.ts` — server actions

**Files:**
- Create: `src/app/(app)/queue/queue-actions.ts`

- [ ] **Step 1: implement**

```ts
"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { todayInShopTz } from "@/lib/datetime"

type Result = { ok: true } | { ok: false; error: string }

const STATUSES = ["waiting", "in_service", "cancelled"] as const

/** เพิ่มคิวใหม่ของวันนี้ · service_name เอาจาก DB ไม่เชื่อ client */
export async function createQueueEntry(form: FormData): Promise<Result> {
  const supabase = await createClient()
  const serviceId = String(form.get("service_id") ?? "")
  const startTime = String(form.get("start_time") ?? "")
  const durationMin = Number(form.get("duration_min") ?? 0)
  const therapistId = String(form.get("therapist_id") ?? "") || null
  const customerId = String(form.get("customer_id") ?? "") || null
  const customerName = String(form.get("customer_name") ?? "").trim() || null

  if (!serviceId) return { ok: false, error: "เลือกเมนูก่อน" }
  if (!/^\d{2}:\d{2}$/.test(startTime)) return { ok: false, error: "เวลาเริ่มไม่ถูกต้อง" }
  if (durationMin < 15 || durationMin > 240)
    return { ok: false, error: "ระยะเวลาไม่ถูกต้อง" }

  const { data: service } = await supabase
    .from("services").select("name").eq("id", serviceId).single()
  if (!service) return { ok: false, error: "ไม่พบเมนูนี้" }

  const { error } = await supabase.from("queue_entries").insert({
    queue_date: todayInShopTz(),
    therapist_id: therapistId,
    service_id: serviceId,
    service_name: service.name,
    duration_min: durationMin,
    customer_id: customerId,
    customer_name: customerName,
    start_time: startTime,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath("/queue")
  return { ok: true }
}

/** ลากการ์ด: ย้ายหมอ/เลื่อนเวลา · การ์ดที่จ่ายแล้วห้ามย้าย */
export async function moveQueueEntry(
  id: string,
  therapistId: string | null,
  startTime: string
): Promise<Result> {
  if (!/^\d{2}:\d{2}$/.test(startTime)) return { ok: false, error: "เวลาไม่ถูกต้อง" }
  const supabase = await createClient()
  const { error } = await supabase
    .from("queue_entries")
    .update({ therapist_id: therapistId, start_time: startTime, updated_at: new Date().toISOString() })
    .eq("id", id)
    .neq("status", "paid")
  if (error) return { ok: false, error: error.message }
  revalidatePath("/queue")
  return { ok: true }
}

/** เปลี่ยนสถานะ (paid ทำได้ทาง createSale เท่านั้น — ห้ามรับจากหน้านี้) */
export async function setQueueStatus(id: string, status: string): Promise<Result> {
  if (!STATUSES.includes(status as (typeof STATUSES)[number]))
    return { ok: false, error: "สถานะไม่ถูกต้อง" }
  const supabase = await createClient()
  const { error } = await supabase
    .from("queue_entries")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .neq("status", "paid")
  if (error) return { ok: false, error: error.message }
  revalidatePath("/queue")
  return { ok: true }
}
```

- [ ] **Step 2: `npx eslint src` ผ่าน + commit** `feat: server actions ของคิว`

---

### Task 4: หน้า `/queue` — บอร์ด (ยังไม่มีลาก) + เพิ่มคิว + เมนูซ้าย

**Files:**
- Create: `src/app/(app)/queue/page.tsx`, `queue-board.tsx`, `queue-card.tsx`, `add-queue-dialog.tsx`
- Modify: `src/components/app-shell.tsx` (เมนู "คิววันนี้" icon `CalendarClock` ใต้ "บันทึกขาย")

- [ ] **Step 1: `page.tsx` (server)**

```tsx
import { createClient } from "@/lib/supabase/server"
import { formatThaiDate, todayInShopTz } from "@/lib/datetime"
import { QueueBoard } from "./queue-board"

export const metadata = { title: "คิววันนี้ · สุขกายา POS" }

export default async function QueuePage() {
  const supabase = await createClient()
  const today = todayInShopTz()

  const [{ data: therapists }, { data: services }, { data: entries }] =
    await Promise.all([
      supabase.from("therapists").select("id, name").eq("status", "active").order("name"),
      supabase
        .from("services")
        .select("id, name, duration_min")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("queue_entries")
        .select("*")
        .eq("queue_date", today)
        .neq("status", "cancelled")
        .order("start_time"),
    ])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">คิววันนี้</h1>
        <p className="text-sm text-slate-600">{formatThaiDate(today)}</p>
      </div>
      <QueueBoard
        therapists={therapists ?? []}
        services={services ?? []}
        initialEntries={entries ?? []}
        today={today}
      />
    </div>
  )
}
```

- [ ] **Step 2: `queue-board.tsx` (client) — โครง + เส้นเวลา + realtime (ยังไม่มีลาก)**

```tsx
"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { createClient } from "@/lib/supabase/client"
import {
  BOARD_END_MIN, BOARD_START_MIN, PX_PER_MIN,
  countFreeTherapists, minToX, timeToMin,
} from "@/lib/queue"
import type { Tables } from "@/types/database"
import { AddQueueDialog } from "./add-queue-dialog"
import { QueueCard } from "./queue-card"

export type QueueEntry = Tables<"queue_entries">
export type Therapist = { id: string; name: string }
export type ServiceOption = { id: string; name: string; duration_min: number | null }

const ROW_H = 64
const BOARD_W = (BOARD_END_MIN - BOARD_START_MIN) * PX_PER_MIN

function nowMinInShopTz(): number {
  const t = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date())
  return timeToMin(t)
}

export function QueueBoard({
  therapists, services, initialEntries, today,
}: {
  therapists: Therapist[]
  services: ServiceOption[]
  initialEntries: QueueEntry[]
  today: string
}) {
  const [entries, setEntries] = useState(initialEntries)
  const [nowMin, setNowMin] = useState(nowMinInShopTz)
  const scrollRef = useRef<HTMLDivElement>(null)

  // แถว 0 = ยังไม่ระบุหมอ · ที่เหลือแถวละหมอ
  const rows: { id: string | null; name: string }[] = [
    { id: null, name: "ยังไม่ระบุหมอ" },
    ...therapists,
  ]

  const refetch = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("queue_entries").select("*")
      .eq("queue_date", today).neq("status", "cancelled").order("start_time")
    if (data) setEntries(data)
  }, [today])

  // เครื่องอื่นแก้คิว → ดึงใหม่ทั้งวัน (ข้อมูลวันละไม่กี่สิบแถว เอาถูกไว้ก่อน)
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("queue-board")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "queue_entries" }, refetch)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [refetch])

  useEffect(() => {
    const t = setInterval(() => setNowMin(nowMinInShopTz()), 60_000)
    return () => clearInterval(t)
  }, [])

  // เปิดหน้ามาเลื่อนไปเวลาปัจจุบัน (ให้เห็นย้อนหลัง 1 ชม.)
  useEffect(() => {
    scrollRef.current?.scrollTo({ left: Math.max(0, minToX(nowMin) - 60 * PX_PER_MIN) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const freeCount = countFreeTherapists(
    therapists.map((t) => t.id), entries, nowMin
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
          ว่างตอนนี้ <span className="font-semibold text-emerald-700">{freeCount} คน</span>
          {" · "}คิวรอ <span className="font-semibold">{waitingCount}</span>
        </p>
        <AddQueueDialog therapists={therapists} services={services} onDone={refetch} />
      </div>

      <div ref={scrollRef} className="overflow-x-auto rounded-lg border bg-white">
        <div style={{ width: BOARD_W + 96 }}>
          {/* หัวเวลา */}
          <div className="flex border-b bg-slate-50">
            <div className="sticky left-0 z-10 w-24 shrink-0 bg-slate-50" />
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

          {rows.map((row) => (
            <div key={row.id ?? "none"} className="flex border-b last:border-b-0">
              <div className="sticky left-0 z-10 flex w-24 shrink-0 items-center border-r bg-white px-2 text-sm font-medium">
                {row.name}
              </div>
              <div className="relative" style={{ width: BOARD_W, height: ROW_H }}>
                {/* เส้นแบ่งชั่วโมง */}
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute inset-y-0 border-l border-slate-100"
                    style={{ left: minToX(h * 60) }}
                  />
                ))}
                {/* เส้นเวลาปัจจุบัน */}
                {nowMin >= BOARD_START_MIN && nowMin <= BOARD_END_MIN && (
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
                      siblings={entries.filter(
                        (s) => s.therapist_id === row.id && s.id !== e.id
                      )}
                      onChanged={refetch}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-400">
        แตะการ์ดเพื่อดู/เปลี่ยนสถานะ · กดค้างแล้วลากเพื่อย้ายหมอหรือเลื่อนเวลา
      </p>
    </div>
  )
}
```

- [ ] **Step 3: `queue-card.tsx` (client) — การ์ด + dialog สถานะ (ลากเพิ่มใน Task 5)**

```tsx
"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"

import { minToX, overlaps, timeToMin } from "@/lib/queue"
import { setQueueStatus } from "./queue-actions"
import type { QueueEntry } from "./queue-board"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

/** สีการ์ดตามสถานะ — รอ ขาว · กำลังนวด ม่วง · จ่ายแล้ว เขียว */
const STATUS_CLASS: Record<string, string> = {
  waiting: "border-slate-300 bg-white",
  in_service: "border-violet-300 bg-violet-50",
  paid: "border-emerald-300 bg-emerald-50",
}
const STATUS_LABEL: Record<string, string> = {
  waiting: "รอ", in_service: "กำลังนวด", paid: "ชำระแล้ว",
}

export function QueueCard({
  entry, siblings, onChanged,
}: {
  entry: QueueEntry
  siblings: QueueEntry[]
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
        data-queue-card={entry.id}
        onClick={() => setOpen(true)}
        className={`absolute top-1.5 bottom-1.5 z-[5] overflow-hidden rounded-lg border-2 px-2 py-1 text-left text-xs shadow-sm ${
          STATUS_CLASS[entry.status] ?? "border-slate-300 bg-white"
        } ${hasOverlap ? "border-orange-400" : ""}`}
        style={{
          left: minToX(startMin),
          width: entry.duration_min * 2, // PX_PER_MIN
        }}
      >
        <p className="truncate font-semibold">{entry.service_name}</p>
        <p className="truncate text-slate-500">
          {entry.customer_name || "ไม่ระบุลูกค้า"} · {STATUS_LABEL[entry.status]}
        </p>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{entry.service_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 text-sm text-slate-600">
            <p>เริ่ม {entry.start_time.slice(0, 5)} น. · {entry.duration_min} นาที</p>
            <p>ลูกค้า: {entry.customer_name || "ไม่ระบุ"}</p>
            <p>สถานะ: {STATUS_LABEL[entry.status]}</p>
            {hasOverlap && (
              <p className="text-orange-600">⚠️ เวลาซ้อนกับคิวอื่นของหมอคนเดียวกัน</p>
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
                <Button
                  variant="outline" disabled={pending}
                  onClick={() => changeStatus("waiting")}
                >
                  ย้อนเป็นรอ
                </Button>
              </>
            )}
            {entry.status !== "paid" && (
              <Button
                variant="outline" disabled={pending}
                className="text-red-600"
                onClick={() => changeStatus("cancelled")}
              >
                ยกเลิกคิว
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 4: `add-queue-dialog.tsx` (client)**

```tsx
"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { CustomerPicker } from "@/app/(app)/pos/customer-picker"
import { snapMin, minToTime } from "@/lib/queue"
import { createQueueEntry } from "./queue-actions"
import type { ServiceOption, Therapist } from "./queue-board"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const DURATIONS = [30, 45, 60, 90, 120]

function nowRounded(): string {
  const t = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date())
  const [h, m] = t.split(":").map(Number)
  return minToTime(snapMin(h * 60 + m))
}

export function AddQueueDialog({
  therapists, services, onDone,
}: {
  therapists: Therapist[]
  services: ServiceOption[]
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [therapistId, setTherapistId] = useState("")
  const [serviceId, setServiceId] = useState("")
  const [duration, setDuration] = useState(60)
  const [startTime, setStartTime] = useState(nowRounded)
  const [customerId, setCustomerId] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [pending, startTransition] = useTransition()

  function reset() {
    setTherapistId(""); setServiceId(""); setDuration(60)
    setStartTime(nowRounded()); setCustomerId(""); setCustomerName(""); setCustomerPhone("")
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const r = await createQueueEntry(fd)
      if (r.ok) { toast.success("เพิ่มคิวแล้ว"); reset(); setOpen(false); onDone() }
      else toast.error(r.error)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-11">+ เพิ่มคิว</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>เพิ่มคิว</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <input type="hidden" name="therapist_id" value={therapistId} />
          <input type="hidden" name="duration_min" value={duration} />

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
                  key={t.id} type="button"
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
              id="q_service" name="service_id" value={serviceId}
              onChange={(e) => {
                setServiceId(e.target.value)
                const s = services.find((x) => x.id === e.target.value)
                if (s?.duration_min) setDuration(s.duration_min)
              }}
              className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-base"
            >
              <option value="">— เลือกเมนู —</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="q_start">เวลาเริ่ม</Label>
              <Input
                id="q_start" name="start_time" type="time" className="h-11"
                value={startTime} onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>ระยะเวลา</Label>
              <div className="flex flex-wrap gap-1">
                {DURATIONS.map((d) => (
                  <Button
                    key={d} type="button" size="sm"
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
              setCustomerId(c.id); setCustomerName(c.name); setCustomerPhone(c.phone ?? "")
            }}
            onNameChange={(n) => { setCustomerName(n); setCustomerId("") }}
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
```

- [ ] **Step 5: เมนูซ้าย** — ใน `src/components/app-shell.tsx` เพิ่ม `CalendarClock` เข้า import lucide และเพิ่มรายการหลัง "บันทึกขาย":

```ts
  { href: "/queue", label: "คิววันนี้", icon: CalendarClock },
```

- [ ] **Step 6: eslint + build + ตรวจภาพจริง (บอร์ดแสดง การ์ดแสดงตามเวลา เพิ่มคิวได้ เปลี่ยนสถานะได้) ผ่าน /preview + mock · commit** `feat: หน้าคิววันนี้ (บอร์ด+เพิ่มคิว+สถานะ ยังไม่มีลาก)`

---

### Task 5: ลากการ์ด (กดค้าง 300ms → ย้ายหมอ/เลื่อนเวลา)

**Files:**
- Modify: `queue-board.tsx` (เพิ่ม drag state + pointer handlers ระดับบอร์ด), `queue-card.tsx` (จุดเริ่ม pointerdown)

- [ ] **Step 1: เพิ่ม drag ใน `queue-board.tsx`**

หลักการ: `pointerdown` บนการ์ด → ตั้ง timer 300ms · ถ้าขยับเกิน 8px ก่อนครบ = ผู้ใช้ตั้งใจ scroll ยกเลิก timer · ครบ 300ms = "ยกการ์ด" `setPointerCapture` แล้วตามนิ้ว · ปล่อย = snap 15 นาที + แถวใหม่ → เรียก `moveQueueEntry` (optimistic: อัปเดต state ก่อน แล้ว refetch)

```tsx
// state เพิ่มใน QueueBoard
const [drag, setDrag] = useState<{
  id: string
  fromRow: number
  startMin: number
  duration: number
  dx: number
  dy: number
  lifted: boolean
} | null>(null)
const dragRef = useRef<typeof drag>(null)
dragRef.current = drag
const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
const origin = useRef<{ x: number; y: number } | null>(null)

function onCardPointerDown(
  e: React.PointerEvent, entry: QueueEntry, rowIndex: number
) {
  if (entry.status === "paid") return // งานจบแล้ว ห้ามย้าย
  origin.current = { x: e.clientX, y: e.clientY }
  const base = {
    id: entry.id, fromRow: rowIndex,
    startMin: timeToMin(entry.start_time), duration: entry.duration_min,
    dx: 0, dy: 0, lifted: false,
  }
  pressTimer.current = setTimeout(() => {
    setDrag({ ...base, lifted: true })
    navigator.vibrate?.(10)
  }, 300)
  setDrag(base)
}

function onPointerMove(e: React.PointerEvent) {
  const d = dragRef.current
  if (!d || !origin.current) return
  const dx = e.clientX - origin.current.x
  const dy = e.clientY - origin.current.y
  if (!d.lifted) {
    // ขยับก่อนครบ 300ms = ตั้งใจเลื่อนหน้าจอ ไม่ใช่ลากการ์ด
    if (Math.hypot(dx, dy) > 8 && pressTimer.current) {
      clearTimeout(pressTimer.current)
      setDrag(null)
    }
    return
  }
  e.preventDefault()
  setDrag({ ...d, dx, dy })
}

function onPointerUp() {
  if (pressTimer.current) clearTimeout(pressTimer.current)
  const d = dragRef.current
  origin.current = null
  if (!d) return
  setDrag(null)
  if (!d.lifted || (d.dx === 0 && d.dy === 0)) return // แตะเฉยๆ → ให้ onClick เปิด dialog

  const newStart = clampStart(snapMin(d.startMin + d.dx / PX_PER_MIN), d.duration)
  const newRow = Math.max(0, Math.min(rows.length - 1,
    d.fromRow + Math.round(d.dy / ROW_H)))
  const therapistId = rows[newRow].id

  // optimistic — เห็นผลทันที แล้วค่อยยืนยันกับเซิร์ฟเวอร์
  setEntries((prev) => prev.map((e) =>
    e.id === d.id
      ? { ...e, therapist_id: therapistId, start_time: minToTime(newStart) }
      : e
  ))
  moveQueueEntry(d.id, therapistId, minToTime(newStart)).then((r) => {
    if (!r.ok) toast.error(r.error)
    refetch()
  })
}
```

- container บอร์ด (div ที่ครอบทุกแถว) ใส่ `onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}`
- การ์ดที่กำลังลาก: render ด้วย `transform: translate(dx, dy)` + `z-20 opacity-80 ring-2 ring-violet-400` + `touch-none`
- QueueCard รับ props เพิ่ม `onPointerDown` + `dragging` แล้วผูกที่ปุ่มการ์ด · ระหว่าง `lifted` ปุ่มต้องไม่ fire onClick (เช็คใน onClick ว่า drag แล้วขยับหรือยัง)

- [ ] **Step 2: ตรวจภาพจริงบน /preview: ลากขึ้นลง/ซ้ายขวา snap ถูก แถวถูก · แตะสั้นเปิด dialog เหมือนเดิม · scroll บอร์ดยังทำงาน**

- [ ] **Step 3: eslint + `npx vitest run` + commit** `feat: ลากการ์ดคิว ย้ายหมอ/เลื่อนเวลา snap 15 นาที`

---

### Task 6: เชื่อม POS — เก็บเงินจากคิว

**Files:**
- Modify: `src/app/(app)/pos/page.tsx` (อ่าน `searchParams.queue` → โหลด entry → ส่ง initial)
- Modify: `src/app/(app)/pos/pos-form.tsx` (รับ `initial`, ตั้ง state เริ่มต้น, hidden input `queue_entry_id`)
- Modify: `src/app/(app)/sale-actions.ts` (`createSale`: หลัง insert สำเร็จ ถ้ามี queue_entry_id → update คิวเป็น paid + ผูก sale_id)

- [ ] **Step 1: `pos/page.tsx`**

```tsx
export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string }>
}) {
  const supabase = await createClient()
  const { queue } = await searchParams

  const [{ data: therapists }, { data: services }, { data: promotions }] = ...เดิม...

  // มาจากการ์ดคิว → กรอกหมอ/เมนู/ลูกค้าให้ล่วงหน้า
  const { data: queueEntry } = queue
    ? await supabase
        .from("queue_entries").select("*").eq("id", queue)
        .neq("status", "paid").maybeSingle()
    : { data: null }

  const { data: queueCustomer } = queueEntry?.customer_id
    ? await supabase.from("customers").select("id, name, phone")
        .eq("id", queueEntry.customer_id).maybeSingle()
    : { data: null }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">บันทึกขาย</h1>
      {queueEntry && (
        <p className="rounded-md bg-violet-50 px-3 py-2 text-sm text-violet-800">
          เก็บเงินจากคิว: {queueEntry.service_name}
          {queueEntry.customer_name ? ` · ${queueEntry.customer_name}` : ""}
        </p>
      )}
      <PosForm
        therapists={therapists ?? []}
        services={services ?? []}
        promotions={promotions ?? []}
        initial={
          queueEntry
            ? {
                queueEntryId: queueEntry.id,
                therapistId: queueEntry.therapist_id ?? "",
                serviceId: queueEntry.service_id ?? "",
                customerId: queueCustomer?.id ?? "",
                customerName: queueCustomer?.name ?? queueEntry.customer_name ?? "",
                customerPhone: queueCustomer?.phone ?? "",
              }
            : undefined
        }
      />
    </div>
  )
}
```

- [ ] **Step 2: `pos-form.tsx`** — เพิ่ม prop และใช้เป็นค่าเริ่มของ state ที่มีอยู่:

```ts
export type PosInitial = {
  queueEntryId: string
  therapistId: string
  serviceId: string
  customerId: string
  customerName: string
  customerPhone: string
}
// ใน component: initial?: PosInitial
const [therapistId, setTherapistId] = useState(initial?.therapistId ?? "")
const [serviceId, setServiceId] = useState(initial?.serviceId ?? "")
const [customerId, setCustomerId] = useState(initial?.customerId ?? "")
const [customerName, setCustomerName] = useState(initial?.customerName ?? "")
const [customerPhone, setCustomerPhone] = useState(initial?.customerPhone ?? "")
```

และในฟอร์มเพิ่ม `{initial && <input type="hidden" name="queue_entry_id" value={initial.queueEntryId} />}`

- [ ] **Step 3: `sale-actions.ts` — ท้าย createSale หลัง insert สำเร็จ (ก่อน return ok)**

```ts
// มาจากบอร์ดคิว → ปิดคิวเป็นชำระแล้ว + ผูกใบขาย
// (สองคำสั่งแยกกัน ถ้าอัปเดตคิวพลาด ใบขายยังถูกต้อง การ์ดยังค้างสถานะเดิม
//  พนักงานกดเก็บเงินซ้ำได้ ไม่เกิดใบขายซ้ำเพราะหน้า POS กรอง status=paid ออกแล้ว)
const queueEntryId = String(formData.get("queue_entry_id") ?? "")
if (queueEntryId) {
  await supabase
    .from("queue_entries")
    .update({ status: "paid", sale_id: saleId, updated_at: new Date().toISOString() })
    .eq("id", queueEntryId)
    .neq("status", "paid")
  revalidatePath("/queue")
}
```

(`saleId` = id ของใบขายที่เพิ่ง insert — ถ้าโค้ดเดิมไม่ได้ select id กลับมา ให้เพิ่ม `.select("id").single()` ตอน insert)

- [ ] **Step 4: eslint + vitest + build + commit** `feat: เก็บเงินจากการ์ดคิว เด้ง POS พร้อมข้อมูล ปิดคิวเป็นชำระแล้ว`

---

### Task 7: ตรวจปลายทาง + deploy

- [ ] **Step 1: ตรวจภาพจริงครบวงจรบน /preview + mock**: เพิ่มคิว → ลาก → เริ่มนวด → เก็บเงิน (URL ถูก) · และตรวจ /pos?queue= ด้วย mock initial
- [ ] **Step 2: `npx eslint src` + `npx vitest run` + `npm run build` ผ่าน**
- [ ] **Step 3: reconciliation 21 ข้อผ่าน (MCP)**
- [ ] **Step 4: ลบ /preview + คืน proxy.ts + merge `queue-board` เข้า `main` + `npx vercel deploy --prod`**

## Self-review

- Spec coverage: ตาราง✓ duration✓ บอร์ด✓ ลาก✓ สถานะ✓ POS✓ realtime✓ เมนูซ้าย✓ เส้นเวลา✓ ซ้อนเตือน✓ ว่างกี่คน✓
- ไม่มี TBD/placeholder — โค้ดจริงทุก step ยกเว้นจุดที่อ้างโค้ดเดิม (ระบุไฟล์/ตำแหน่งชัด)
- ชื่อ type/ฟังก์ชันสอดคล้อง: `QueueEntry`/`moveQueueEntry`/`clampStart`/`snapMin`/`PX_PER_MIN` ใช้ตรงกันทุก task
