# LINE Online Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ลูกค้าจองคิวจาก LINE OA → การ์ด "รออนุมัติ" บนบอร์ดคิว → พนักงานรับ/ปฏิเสธ → push แจ้งกลับไลน์

**Architecture:** หน้า `/book` (LIFF, public, wizard) ในโปรเจกต์ Next.js เดิม · server actions ตรวจ LIFF idToken กับ LINE ทุกครั้งแล้วใช้ Supabase service-role client แบบประตูแคบ · คำขอ = แถว `queue_entries` สถานะใหม่ `pending` (ใช้บอร์ด/realtime/กลุ่ม เดิมทั้งหมด) · push ผ่าน Messaging API

**Tech Stack:** Next.js 16 (โปรเจกต์เดิม — อ่าน `node_modules/next/dist/docs/` ก่อนแตะ API ที่ไม่แน่ใจ), Supabase (service role เฉพาะ actions ใหม่), `@line/liff`, vitest

**Spec:** `docs/superpowers/specs/2026-07-24-line-booking-design.md` — อ่านก่อนเริ่ม (รวมส่วน "บทเรียนจาก ThaiHand" ท้ายไฟล์)

**กติกาโปรเจกต์ที่ต้องรู้ (ไม่รู้แล้วพัง):**
- ทุกคำสั่ง npm/npx ต้อง `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"` ก่อน
- Migration: รันผ่าน Supabase MCP `apply_migration` (project jrioyrmicioqammeevgh) + เก็บไฟล์ซ้ำใน `supabase/migrations/` เสมอ · types แก้มือใน `src/types/database.ts`
- ห้าม export ฟังก์ชันจากไฟล์ `"use client"` แล้ว import จากฝั่ง server (เคยพัง production) — util ใช้ร่วมไว้ `src/lib/`
- อ่านโปรไฟล์ตัวเองใช้ `getMyProfile()` จาก `src/lib/auth.ts` เท่านั้น
- ก่อน commit: `npx eslint src && npx tsc --noEmit && npx vitest run && npm run build` ต้องเขียวหมด
- หลัง migration ใดๆ: รัน reconciliation 21 ข้อ (`supabase/reconciliation.sql` เป็น aggregate query ผ่าน MCP `execute_sql`) ต้อง 21/21
- ตอน verify ภาพ: สร้าง `src/app/preview/page.tsx` ชั่วคราว + เพิ่ม `"/preview"` ใน PUBLIC_ROUTES ของ `src/lib/supabase/proxy.ts` — **ห้าม commit ทั้งคู่** (`rm -rf src/app/preview && git checkout src/lib/supabase/proxy.ts` ก่อน commit เสมอ)

---

## Task 0: Prerequisites (เจ้าของร้านทำเอง — บล็อกเฉพาะการทดสอบบน LINE จริง)

โค้ดทุก task เขียนและเทสได้โดยไม่ต้องรอ แต่ E2E จริง (Task 9) ต้องมีของครบ:

- [ ] ใน [LINE Developers Console](https://developers.line.biz): สร้าง **Messaging API channel** ผูก OA ของร้าน → จด `Channel access token (long-lived)`
- [ ] สร้าง **LINE Login channel** + เพิ่ม LIFF app (Size: Full, Endpoint URL: `https://sookkaya-pos.vercel.app/book`, Scope: `profile openid`) → จด `LIFF ID` และ `Channel ID` ของ Login channel
- [ ] OA Manager: rich menu ปุ่ม "จองคิว" → ลิงก์ `https://liff.line.me/<LIFF_ID>`
- [ ] Supabase Dashboard → Settings → API → จด `service_role` key
- [ ] เพิ่ม env ทั้งใน `.env.local` และ Vercel (Production):
  ```
  LINE_CHANNEL_ACCESS_TOKEN=...   # Messaging API (push)
  LINE_LOGIN_CHANNEL_ID=...       # ตรวจ idToken
  NEXT_PUBLIC_LIFF_ID=...
  SUPABASE_SERVICE_ROLE_KEY=...
  ```

---

## Task 1: Migration + types — `line_accounts` และสถานะคิวใหม่

**Files:**
- Create: `supabase/migrations/20260724150000_line_booking.sql`
- Modify: `src/types/database.ts` (แก้มือ)

- [ ] **Step 1: เขียนไฟล์ migration**

```sql
-- จองออนไลน์ผ่าน LINE (spec: docs/superpowers/specs/2026-07-24-line-booking-design.md)
-- ตารางผูกบัญชีไลน์ ↔ ลูกค้า — ฐานของเฟส CRM point ด้วย
create table public.line_accounts (
  line_user_id text primary key,   -- ได้จากการ verify idToken กับ LINE เท่านั้น
  customer_id  uuid not null references public.customers(id),
  display_name text,
  picture_url  text,
  phone        text,               -- เบอร์ที่กรอกตอนผูก (ช่วยพนักงานตรวจ ไม่ใช่ตัวยืนยันสิทธิ์)
  created_at   timestamptz not null default now()
);
-- ไม่มี policy ใดๆ = anon/authenticated เข้าไม่ได้เลย
-- เข้าถึงผ่าน service-role ใน server actions ที่ตรวจ idToken แล้วเท่านั้น
alter table public.line_accounts enable row level security;

-- คิว: สถานะใหม่ pending (รออนุมัติ) / rejected (ปฏิเสธ — ไม่ขึ้นบอร์ด)
alter table public.queue_entries drop constraint queue_entries_status_check;
alter table public.queue_entries add constraint queue_entries_status_check
  check (status in ('waiting','in_service','paid','cancelled','pending','rejected'));
alter table public.queue_entries add column line_user_id text;
alter table public.queue_entries add column reject_reason text;
```

- [ ] **Step 2: apply ผ่าน Supabase MCP** — `apply_migration(name: line_booking, query: <เนื้อไฟล์>)` → สำเร็จ · ถ้า drop constraint ล้มเพราะชื่อไม่ตรง: `select conname from pg_constraint where conrelid='public.queue_entries'::regclass and contype='c'` แล้วแก้ชื่อ

- [ ] **Step 3: แก้ types มือ** — ใน `src/types/database.ts`:
  - เพิ่มบล็อกตาราง `line_accounts` (Row/Insert/Update — Insert บังคับเฉพาะ `line_user_id`, `customer_id`)
  - `queue_entries` ทั้ง Row/Insert/Update: เพิ่ม `line_user_id: string | null`, `reject_reason: string | null` (Insert/Update เป็น optional)
  - ⚠️ กับดักเดิม: อย่าใช้ regex/สคริปต์แทรก — เคยแทรกผิดตาราง 2 ครั้ง (`services` ก็มี commission, `queue_entries` Insert มี duration_min required) ใช้ Edit เจาะบล็อกตรงๆ

- [ ] **Step 4: ตรวจ** — `npx tsc --noEmit` ผ่าน · รัน reconciliation ผ่าน MCP → 21/21 (คอลัมน์/สถานะใหม่ต้องไม่กระทบเงิน)

- [ ] **Step 5: Commit** — `git add supabase/migrations/20260724150000_line_booking.sql src/types/database.ts && git commit -m "feat: ตาราง line_accounts + สถานะคิว pending/rejected (LINE booking)"`

---

## Task 2: `lib/booking-slots.ts` — กติกาช่วงเวลา (TDD)

**Files:**
- Create: `src/lib/booking-slots.ts`
- Test: `src/lib/booking-slots.test.ts`

- [ ] **Step 1: เขียนเทสก่อน**

```ts
import { describe, expect, it } from "vitest"
import { computeSlots, isBookableDate, canCancelAt, MAX_ADVANCE_DAYS } from "./booking-slots"

describe("computeSlots", () => {
  it("วันล่วงหน้า: ทุก 30 นาที ตั้งแต่ 10:00 และคิวต้องจบภายใน 22:00", () => {
    const slots = computeSlots({ date: "2026-08-01", today: "2026-07-24", nowMin: 900, durationMin: 120 })
    expect(slots[0]).toBe("10:00")
    expect(slots.at(-1)).toBe("20:00") // 20:00+120 = 22:00 พอดี · 20:30 ไม่ทัน
    expect(slots).toContain("14:30")
  })
  it("เมนู 60 นาที จองได้ถึง 21:00", () => {
    const slots = computeSlots({ date: "2026-08-01", today: "2026-07-24", nowMin: 0, durationMin: 60 })
    expect(slots.at(-1)).toBe("21:00")
  })
  it("วันนี้: เริ่มได้อย่างเร็ว ตอนนี้+60 นาที ปัดขึ้นเป็นช่อง 30 นาที", () => {
    // ตอนนี้ 13:10 → +60 = 14:10 → ช่องแรก 14:30
    const slots = computeSlots({ date: "2026-07-24", today: "2026-07-24", nowMin: 13 * 60 + 10, durationMin: 60 })
    expect(slots[0]).toBe("14:30")
  })
  it("วันนี้แต่สายจนไม่เหลือช่อง → ว่างเปล่า", () => {
    expect(computeSlots({ date: "2026-07-24", today: "2026-07-24", nowMin: 21 * 60, durationMin: 60 })).toEqual([])
  })
})

describe("isBookableDate", () => {
  it("วันนี้ถึง +14 วันจองได้ · อดีต/ไกลกว่านั้นไม่ได้", () => {
    expect(isBookableDate("2026-07-24", "2026-07-24")).toBe(true)
    expect(isBookableDate("2026-08-07", "2026-07-24")).toBe(true)  // +14
    expect(isBookableDate("2026-08-08", "2026-07-24")).toBe(false) // +15
    expect(isBookableDate("2026-07-23", "2026-07-24")).toBe(false)
    expect(MAX_ADVANCE_DAYS).toBe(14)
  })
})

describe("canCancelAt", () => {
  it("ยกเลิกได้เมื่อเหลือ ≥120 นาทีก่อนนัด", () => {
    expect(canCancelAt("2026-07-24", "16:00", "2026-07-24", 14 * 60)).toBe(true)  // เหลือ 120 พอดี
    expect(canCancelAt("2026-07-24", "16:00", "2026-07-24", 14 * 60 + 1)).toBe(false)
    expect(canCancelAt("2026-07-25", "10:00", "2026-07-24", 23 * 60)).toBe(true)  // คนละวัน
    expect(canCancelAt("2026-07-23", "16:00", "2026-07-24", 0)).toBe(false)       // วันผ่านไปแล้ว
  })
})
```

- [ ] **Step 2: รันให้ fail** — `npx vitest run booking-slots` → FAIL (module ไม่มี)

- [ ] **Step 3: implement**

```ts
/**
 * กติกาช่วงเวลาที่เปิดให้จองจากไลน์ — logic ล้วน ใช้ได้ทั้ง server/client
 * เวลาเป็น "นาทีจากเที่ยงคืน" แบบเดียวกับ lib/queue.ts · วันที่ YYYY-MM-DD (เวลาไทยเสมอ)
 */
export const OPEN_MIN = 10 * 60          // ร้านเปิด 10:00
export const CLOSE_MIN = 22 * 60         // ปิด 22:00 — คิวต้องจบก่อนหรือพอดี
export const SLOT_STEP = 30
export const MIN_LEAD_MIN = 60           // จองวันนี้ต้องล่วงหน้า ≥1 ชม.
export const MAX_ADVANCE_DAYS = 14
export const CANCEL_CUTOFF_MIN = 120     // ยกเลิกเองได้ถึงก่อนนัด 2 ชม.

const toHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`

export function computeSlots(opts: {
  date: string
  today: string
  nowMin: number
  durationMin: number
}): string[] {
  let earliest = OPEN_MIN
  if (opts.date === opts.today) {
    const lead = opts.nowMin + MIN_LEAD_MIN
    earliest = Math.max(OPEN_MIN, Math.ceil(lead / SLOT_STEP) * SLOT_STEP)
  }
  const latestStart = CLOSE_MIN - opts.durationMin
  const slots: string[] = []
  for (let m = earliest; m <= latestStart; m += SLOT_STEP) slots.push(toHHMM(m))
  return slots
}

export function isBookableDate(date: string, today: string): boolean {
  if (date < today) return false
  const diffDays =
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000
  return diffDays <= MAX_ADVANCE_DAYS
}

export function canCancelAt(
  queueDate: string,
  startTime: string, // "HH:MM"
  today: string,
  nowMin: number
): boolean {
  if (queueDate > today) return true
  if (queueDate < today) return false
  const [h, m] = startTime.split(":").map(Number)
  return h * 60 + m - nowMin >= CANCEL_CUTOFF_MIN
}
```

- [ ] **Step 4: รันให้ผ่าน** — `npx vitest run booking-slots` → PASS ทั้งหมด
- [ ] **Step 5: Commit** — `git add src/lib/booking-slots.* && git commit -m "feat: booking-slots — กติกาช่วงเวลาจองไลน์ (TDD)"`

---

## Task 3: LINE API + service client + ข้อความ 4 จังหวะ (TDD ข้อความ)

**Files:**
- Create: `src/lib/line.ts`, `src/lib/line-messages.ts`, `src/lib/supabase/service.ts`
- Test: `src/lib/line-messages.test.ts`

- [ ] **Step 1: service client** — `src/lib/supabase/service.ts`:

```ts
import "server-only"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

/**
 * Client สิทธิ์เต็ม (service role) — ใช้เฉพาะ server actions ของโซน /book
 * ที่ตรวจ LINE idToken แล้วเท่านั้น ห้าม import จากที่อื่น
 * (ลูกค้าไลน์ไม่ใช่ผู้ใช้ Supabase auth จึงผ่าน RLS แบบพนักงานไม่ได้)
 */
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
```

- [ ] **Step 2: LINE wrapper** — `src/lib/line.ts`:

```ts
import "server-only"

export type LineIdentity = { userId: string; displayName?: string; pictureUrl?: string }

/** ตรวจ idToken กับ LINE โดยตรง — ทางเดียวที่เชื่อได้ว่าใครเป็นใคร */
export async function verifyLineIdToken(idToken: string): Promise<LineIdentity | null> {
  if (!idToken) return null
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      id_token: idToken,
      client_id: process.env.LINE_LOGIN_CHANNEL_ID!,
    }),
    cache: "no-store",
  })
  if (!res.ok) return null
  const d = (await res.json()) as { sub?: string; name?: string; picture?: string }
  if (!d.sub) return null
  return { userId: d.sub, displayName: d.name, pictureUrl: d.picture }
}

/** push ข้อความ text — คืน false เมื่อส่งไม่สำเร็จ (ห้าม throw: การจองต้องเดินต่อ) */
export async function pushLineMessage(to: string, text: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
    })
    return res.ok
  } catch {
    return false
  }
}
```

- [ ] **Step 3: เทสข้อความก่อน** — `src/lib/line-messages.test.ts` (แยกไฟล์จาก line.ts เพราะ server-only เทสไม่ได้):

```ts
import { describe, expect, it } from "vitest"
import { msgRequested, msgConfirmed, msgRejected, msgCancelled } from "./line-messages"

const booking = {
  dateLabel: "ศุกร์ 25 ก.ค.",
  time: "14:00",
  services: ["นวดน้ำมันอโรมา 120 นาที", "นวดแผนไทย 90 นาที"],
  therapistNote: "มีรีเควสหมอ (+40฿/ท่านที่เลือก)",
}

describe("ข้อความไลน์ 4 จังหวะ", () => {
  it("msgRequested มีวันเวลา เมนูทุกคน จำนวนท่าน และคำว่ารอร้านยืนยัน", () => {
    const t = msgRequested(booking)
    expect(t).toContain("ได้รับคำขอจอง")
    expect(t).toContain("ศุกร์ 25 ก.ค.")
    expect(t).toContain("14:00")
    expect(t).toContain("นวดน้ำมันอโรมา 120 นาที")
    expect(t).toContain("(2 ท่าน)")
    expect(t).toContain("รอร้านยืนยัน")
  })
  it("msgConfirmed ยืนยัน + วิธีชำระ + มาก่อนเวลานัด (แบบ ThaiHand)", () => {
    const t = msgConfirmed(booking)
    expect(t).toContain("ยืนยันคิวเรียบร้อย")
    expect(t).toContain("ชำระเงินที่ร้าน")
    expect(t).toContain("ก่อนเวลานัด 15 นาที")
  })
  it("msgRejected มีเหตุผลที่ร้านเลือก", () => {
    expect(msgRejected(booking, "คิวช่วงนั้นเต็ม")).toContain("คิวช่วงนั้นเต็ม")
  })
  it("msgCancelled ยืนยันการยกเลิก", () => {
    expect(msgCancelled(booking)).toContain("ยกเลิกการจองแล้ว")
  })
  it("คนเดียวไม่ต้องมีวงเล็บจำนวนท่าน", () => {
    expect(msgRequested({ ...booking, services: ["นวดเท้า 60 นาที"] })).not.toContain("ท่าน)")
  })
})
```

- [ ] **Step 4: รันให้ fail แล้ว implement** — `src/lib/line-messages.ts`:

```ts
/** ข้อความไลน์ 4 จังหวะ — โทนสุภาพแบบร้านสปา ตาม mockup ใน spec */
export type BookingInfo = {
  dateLabel: string
  time: string
  services: string[]
  therapistNote?: string
}

const lines = (b: BookingInfo) =>
  [
    `${b.dateLabel} · ${b.time}`,
    b.services.length > 1
      ? `${b.services.join(" / ")} (${b.services.length} ท่าน)`
      : b.services[0],
    b.therapistNote,
  ].filter(Boolean).join("\n")

export const msgRequested = (b: BookingInfo) =>
  `🌿 SOOK KAYA ได้รับคำขอจองของคุณแล้ว\n\n${lines(b)}\n\n⏳ รอร้านยืนยัน — จะแจ้งผลให้เร็วที่สุดค่ะ`

export const msgConfirmed = (b: BookingInfo) =>
  `✅ ยืนยันคิวเรียบร้อยค่ะ\n\n${lines(b)}\n\n💵 ชำระเงินที่ร้าน\n🕐 กรุณามาถึงก่อนเวลานัด 15 นาทีนะคะ\n\nแล้วพบกันค่ะ 💆‍♀️`

export const msgRejected = (b: BookingInfo, reason: string) =>
  `🙏 ขออภัยค่ะ ${reason}\n\n(${b.dateLabel} · ${b.time})\nรบกวนเลือกเวลาใหม่ได้เลยนะคะ`

export const msgCancelled = (b: BookingInfo) =>
  `📋 ยกเลิกการจองแล้วค่ะ\n\n${lines(b)}\n\nไว้โอกาสหน้าแวะมาใหม่นะคะ 🌿`
```

- [ ] **Step 5: รันให้ผ่าน + commit** — `npx vitest run line-messages` PASS → `git add src/lib/line.ts src/lib/line-messages.* src/lib/supabase/service.ts && git commit -m "feat: LINE verify/push + ข้อความ 4 จังหวะ + service client"`

---

## Task 4: server actions โซน /book (ประตูแคบ)

**Files:**
- Create: `src/app/book/actions.ts`

กฎเหล็ก: ทุก action ตรวจ idToken ก่อนเสมอ → ได้ `userId` ที่เชื่อได้ → ค่อยแตะ DB ผ่าน service client · **ห้าม** import อะไรจากโซน `(app)/`

- [ ] **Step 1: เขียน actions ทั้งไฟล์**

```ts
"use server"

import { createServiceClient } from "@/lib/supabase/service"
import { pushLineMessage, verifyLineIdToken } from "@/lib/line"
import { msgCancelled, msgRequested, type BookingInfo } from "@/lib/line-messages"
import { canCancelAt, computeSlots, isBookableDate } from "@/lib/booking-slots"
import { formatThaiDate, nowTimeInShopTz, todayInShopTz } from "@/lib/datetime"
import { REQUEST_FEE } from "@/lib/constants"

type Fail = { ok: false; error: string }

const nowMin = () => {
  const [h, m] = nowTimeInShopTz().split(":").map(Number)
  return h * 60 + m
}

/** สถานะบัญชีไลน์: ผูกกับลูกค้าแล้วหรือยัง (เรียกตอนเปิดหน้า /book) */
export async function getLineStatus(idToken: string): Promise<
  | { ok: true; linked: true; customerName: string }
  | { ok: true; linked: false; displayName: string | null }
  | Fail
> {
  const who = await verifyLineIdToken(idToken)
  if (!who) return { ok: false, error: "เปิดหน้านี้จากไลน์อีกครั้งนะคะ" }
  const db = createServiceClient()
  const { data } = await db
    .from("line_accounts")
    .select("customer_id, customers(name)")
    .eq("line_user_id", who.userId)
    .maybeSingle()
  if (data)
    return {
      ok: true, linked: true,
      customerName: (data as unknown as { customers: { name: string } | null }).customers?.name ?? "",
    }
  return { ok: true, linked: false, displayName: who.displayName ?? null }
}

/** ผูกบัญชีครั้งแรกด้วยเบอร์โทร — เบอร์ช่วยจับคู่เท่านั้น ไม่ใช่ตัวให้สิทธิ์ */
export async function linkLineAccount(
  idToken: string,
  phone: string
): Promise<{ ok: true; customerName: string } | Fail> {
  const who = await verifyLineIdToken(idToken)
  if (!who) return { ok: false, error: "เปิดหน้านี้จากไลน์อีกครั้งนะคะ" }
  const clean = phone.replace(/\D/g, "")
  if (!/^0\d{8,9}$/.test(clean)) return { ok: false, error: "เบอร์โทรไม่ถูกต้อง" }

  const db = createServiceClient()
  const { data: matches } = await db.from("customers").select("id, name").eq("phone", clean)
  let customerId: string
  let customerName: string
  if (!matches || matches.length === 0) {
    const { data: created, error } = await db
      .from("customers")
      .insert({ name: who.displayName ?? "ลูกค้า LINE", phone: clean })
      .select("id, name").single()
    if (error) return { ok: false, error: "สร้างข้อมูลลูกค้าไม่สำเร็จ ลองใหม่นะคะ" }
    customerId = created.id
    customerName = created.name
  } else if (matches.length === 1) {
    customerId = matches[0].id
    customerName = matches[0].name
  } else {
    // เบอร์ซ้ำหลายคน → เลือกคนที่มีบิลล่าสุด (ตาม spec)
    const { data: latest } = await db
      .from("sales").select("customer_id")
      .in("customer_id", matches.map((m) => m.id))
      .order("sale_date", { ascending: false }).limit(1).maybeSingle()
    const pick = matches.find((m) => m.id === latest?.customer_id) ?? matches[0]
    customerId = pick.id
    customerName = pick.name
  }
  const { error } = await db.from("line_accounts").upsert({
    line_user_id: who.userId,
    customer_id: customerId,
    display_name: who.displayName ?? null,
    picture_url: who.pictureUrl ?? null,
    phone: clean,
  })
  if (error) return { ok: false, error: "ผูกบัญชีไม่สำเร็จ ลองใหม่นะคะ" }
  return { ok: true, customerName }
}

/** เมนู+หมอสำหรับ wizard (เปิดเผยเฉพาะ ชื่อ/ราคา/ระยะเวลา) */
export async function getBookingOptions(): Promise<{
  services: { id: string; name: string; price: number; durationMin: number }[]
  therapists: { id: string; name: string }[]
}> {
  const db = createServiceClient()
  const [{ data: services }, { data: therapists }] = await Promise.all([
    db.from("services").select("id, name, price, duration_min").eq("is_active", true).order("name"),
    db.from("therapists").select("id, name").eq("status", "active").order("name"),
  ])
  return {
    services: (services ?? []).map((s) => ({
      id: s.id, name: s.name, price: Number(s.price), durationMin: s.duration_min ?? 60,
    })),
    therapists: therapists ?? [],
  }
}

export type BookingPersonInput = { serviceId: string; therapistId: string | null }

export async function createBookingRequest(
  idToken: string,
  input: { date: string; time: string; people: BookingPersonInput[]; note: string }
): Promise<{ ok: true } | Fail> {
  const who = await verifyLineIdToken(idToken)
  if (!who) return { ok: false, error: "เปิดหน้านี้จากไลน์อีกครั้งนะคะ" }
  const db = createServiceClient()

  const { data: account } = await db
    .from("line_accounts").select("customer_id, phone, display_name")
    .eq("line_user_id", who.userId).maybeSingle()
  if (!account) return { ok: false, error: "กรุณายืนยันเบอร์โทรก่อนจองค่ะ" }

  if (input.people.length < 1 || input.people.length > 4)
    return { ok: false, error: "จองได้ครั้งละ 1–4 ท่านค่ะ" }
  const today = todayInShopTz()
  if (!isBookableDate(input.date, today))
    return { ok: false, error: "เลือกวันได้ตั้งแต่วันนี้ถึงล่วงหน้า 14 วันค่ะ" }
  if (!/^\d{2}:\d{2}$/.test(input.time)) return { ok: false, error: "เวลาไม่ถูกต้อง" }
  const note = input.note.trim().slice(0, 500)

  const { data: services } = await db
    .from("services").select("id, name, duration_min").eq("is_active", true)
    .in("id", input.people.map((p) => p.serviceId))
  const serviceById = new Map((services ?? []).map((s) => [s.id, s]))
  if (input.people.some((p) => !serviceById.has(p.serviceId)))
    return { ok: false, error: "มีเมนูที่ไม่พร้อมให้จอง รีเฟรชแล้วลองใหม่นะคะ" }
  const maxDuration = Math.max(
    ...input.people.map((p) => serviceById.get(p.serviceId)!.duration_min ?? 60))
  const validSlots = computeSlots({ date: input.date, today, nowMin: nowMin(), durationMin: maxDuration })
  if (!validSlots.includes(input.time))
    return { ok: false, error: "ช่วงเวลานี้ไม่เปิดรับจองแล้ว เลือกเวลาอื่นนะคะ" }

  // ประตูแคบ: pending ค้าง ≤3 · กันกดซ้ำใน 1 นาที
  const { data: existing } = await db
    .from("queue_entries")
    .select("id, queue_date, start_time, created_at, group_id")
    .eq("line_user_id", who.userId).eq("status", "pending")
  const distinctPending = new Set((existing ?? []).map((e) => e.group_id ?? e.id))
  if (distinctPending.size >= 3)
    return { ok: false, error: "มีคิวรอร้านยืนยันอยู่แล้ว 3 รายการ รอสักครู่นะคะ" }
  const dup = (existing ?? []).some(
    (e) => e.queue_date === input.date && e.start_time.startsWith(input.time) &&
      Date.now() - Date.parse(e.created_at) < 60_000)
  if (dup) return { ok: true } // เพิ่งส่งรายการเดียวกันไป — สำเร็จเงียบๆ ไม่สร้างซ้ำ

  const groupId = input.people.length > 1 ? crypto.randomUUID() : null
  const { error } = await db.from("queue_entries").insert(
    input.people.map((p) => ({
      queue_date: input.date,
      start_time: input.time,
      service_id: p.serviceId,
      service_name: serviceById.get(p.serviceId)!.name,
      duration_min: serviceById.get(p.serviceId)!.duration_min ?? 60,
      therapist_id: p.therapistId,
      is_request: p.therapistId !== null,   // เลือกหมอ = รีเควส (spec)
      customer_id: account.customer_id,
      customer_name: account.display_name,
      customer_phone: account.phone,
      notes: note || null,
      status: "pending",
      source: "booking",
      booking_channel: "line",
      line_user_id: who.userId,
      group_id: groupId,
    })))
  if (error) return { ok: false, error: "ส่งคำขอไม่สำเร็จ ลองใหม่อีกครั้งนะคะ" }

  const info: BookingInfo = {
    dateLabel: formatThaiDate(input.date),
    time: input.time,
    services: input.people.map((p) => serviceById.get(p.serviceId)!.name),
    therapistNote: input.people.some((p) => p.therapistId)
      ? `มีรีเควสหมอ (+${REQUEST_FEE}฿/ท่านที่เลือก)` : undefined,
  }
  await pushLineMessage(who.userId, msgRequested(info)) // ส่งไม่ผ่านก็ไม่เป็นไร
  return { ok: true }
}

export type MyBooking = {
  id: string; groupId: string | null; date: string; dateLabel: string
  time: string; services: string[]; serviceIds: string[]; status: string; canCancel: boolean
}

/** การจองข้างหน้า (pending/waiting) + ที่ผ่านมา 5 รายการ (ปุ่มจองซ้ำ — แบบ ThaiHand) */
export async function getMyBookings(idToken: string): Promise<
  { ok: true; upcoming: MyBooking[]; past: MyBooking[] } | Fail
> {
  const who = await verifyLineIdToken(idToken)
  if (!who) return { ok: false, error: "เปิดหน้านี้จากไลน์อีกครั้งนะคะ" }
  const db = createServiceClient()
  const today = todayInShopTz()
  const { data } = await db
    .from("queue_entries")
    .select("id, group_id, queue_date, start_time, service_id, service_name, status")
    .eq("line_user_id", who.userId)
    .order("queue_date", { ascending: false }).order("start_time", { ascending: false })
    .limit(60)
  const group = (rows: NonNullable<typeof data>): MyBooking[] => {
    const byKey = new Map<string, MyBooking>()
    for (const e of rows) {
      const key = e.group_id ?? e.id
      const time = e.start_time.slice(0, 5)
      const cur = byKey.get(key)
      if (cur) {
        cur.services.push(e.service_name)
        cur.serviceIds.push(e.service_id)
        continue
      }
      byKey.set(key, {
        id: e.id, groupId: e.group_id, date: e.queue_date,
        dateLabel: formatThaiDate(e.queue_date), time,
        services: [e.service_name], serviceIds: [e.service_id], status: e.status,
        canCancel: e.status !== "paid" && e.status !== "cancelled" && e.status !== "rejected" &&
          canCancelAt(e.queue_date, time, today, nowMin()),
      })
    }
    return [...byKey.values()]
  }
  const rows = data ?? []
  const upcoming = group(rows.filter(
    (e) => e.queue_date >= today && (e.status === "pending" || e.status === "waiting")))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  const past = group(rows.filter(
    (e) => e.status === "paid" || e.status === "cancelled" || e.status === "rejected" ||
      e.queue_date < today)).slice(0, 5)
  return { ok: true, upcoming, past }
}

export async function cancelBooking(
  idToken: string,
  target: { id: string; groupId: string | null }
): Promise<{ ok: true } | Fail> {
  const who = await verifyLineIdToken(idToken)
  if (!who) return { ok: false, error: "เปิดหน้านี้จากไลน์อีกครั้งนะคะ" }
  const db = createServiceClient()
  // อ่านก่อน — ยืนยันว่าเป็นของตัวเอง + ยังยกเลิกทัน
  const q = db.from("queue_entries")
    .select("id, queue_date, start_time, service_name, status")
    .eq("line_user_id", who.userId).in("status", ["pending", "waiting"])
  const { data } = target.groupId
    ? await q.eq("group_id", target.groupId)
    : await q.eq("id", target.id)
  if (!data || data.length === 0) return { ok: false, error: "ไม่พบการจองนี้ค่ะ" }
  const today = todayInShopTz()
  const time = data[0].start_time.slice(0, 5)
  if (!canCancelAt(data[0].queue_date, time, today, nowMin()))
    return { ok: false, error: "ใกล้เวลานัดแล้ว รบกวนโทรแจ้งร้านโดยตรงนะคะ" }

  const upd = db.from("queue_entries")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("line_user_id", who.userId).in("status", ["pending", "waiting"])
  const { error } = target.groupId
    ? await upd.eq("group_id", target.groupId)
    : await upd.eq("id", target.id)
  if (error) return { ok: false, error: "ยกเลิกไม่สำเร็จ ลองใหม่นะคะ" }

  await pushLineMessage(who.userId, msgCancelled({
    dateLabel: formatThaiDate(data[0].queue_date), time,
    services: data.map((d) => d.service_name),
  }))
  return { ok: true }
}
```

- [ ] **Step 2: ตรวจว่า `formatThaiDate`/`nowTimeInShopTz`/`todayInShopTz` มีจริงใน `src/lib/datetime.ts`** — ถ้าชื่อจริงต่างไป ใช้ของที่มี (ห้ามสร้าง util ซ้ำ) แล้วไล่แก้ทุกจุดในไฟล์นี้ให้ตรง
- [ ] **Step 3: ตรวจ** — `npx tsc --noEmit && npx eslint src` ผ่าน (UI ยังไม่เรียก — คอมไพล์ต้องผ่านก่อน)
- [ ] **Step 4: Commit** — `git add src/app/book/actions.ts && git commit -m "feat: server actions โซน /book (idToken ทุกทาง + ประตูแคบ + จองซ้ำ)"`

---

## Task 5: หน้า /book — layout + LIFF hook + PUBLIC_ROUTES

**Files:**
- Create: `src/app/book/layout.tsx`, `src/app/book/liff.tsx`
- Modify: `src/lib/supabase/proxy.ts`, `package.json`

- [ ] **Step 1:** `npm i @line/liff`

- [ ] **Step 2: เปิดทางเข้า public** — ใน `src/lib/supabase/proxy.ts` เพิ่ม `"/book"` เข้า PUBLIC_ROUTES (อันนี้ **commit ได้** — ต่างจาก `"/preview"` ที่ห้าม):

```ts
const PUBLIC_ROUTES = ["/login", "/auth", "/book"]
```
(ดูค่าปัจจุบันในไฟล์ก่อน — คงรายการเดิมไว้ทั้งหมด แค่เพิ่ม `"/book"`)

- [ ] **Step 3: layout โซนลูกค้า** — `src/app/book/layout.tsx` (ธีม CI, ไม่มี shell พนักงาน):

```tsx
export const metadata = { title: "จองคิว · SOOK KAYA" }

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "#f8f6f3" }}>
      <header className="px-4 py-3" style={{ background: "#664343" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-cream.png" alt="SOOK KAYA" className="mx-auto h-10 w-auto" />
      </header>
      <main className="mx-auto max-w-md p-4">{children}</main>
    </div>
  )
}
```

- [ ] **Step 4: LIFF hook** — `src/app/book/liff.tsx` (client, ใช้ร่วมทั้งสองหน้า):

```tsx
"use client"

import { useEffect, useState } from "react"
import liff from "@line/liff"

export type LiffState =
  | { phase: "loading" }
  | { phase: "ready"; idToken: string }
  | { phase: "error"; message: string }

/** init LIFF ครั้งเดียว → ได้ idToken สำหรับแนบทุก server action */
export function useLiff(): LiffState {
  const [state, setState] = useState<LiffState>({ phase: "loading" })
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! })
        if (!liff.isLoggedIn()) {
          liff.login()
          return
        }
        const idToken = liff.getIDToken()
        if (!idToken) throw new Error("no token")
        if (!cancelled) setState({ phase: "ready", idToken })
      } catch {
        if (!cancelled)
          setState({ phase: "error", message: "เปิดหน้านี้จากเมนูในไลน์ของร้านนะคะ" })
      }
    })()
    return () => { cancelled = true }
  }, [])
  return state
}
```

- [ ] **Step 5: ตรวจ + commit** — tsc/eslint ผ่าน → `git add src/app/book/layout.tsx src/app/book/liff.tsx src/lib/supabase/proxy.ts package.json package-lock.json && git commit -m "feat: โซน /book public + layout CI + LIFF hook"`

---

## Task 6: Wizard 5 ขั้น + หน้าการจองของฉัน

**Files:**
- Create: `src/app/book/page.tsx`, `src/app/book/wizard.tsx`, `src/app/book/mine/page.tsx`

- [ ] **Step 1: หน้า server บาง** — `src/app/book/page.tsx`:

```tsx
import { getBookingOptions } from "./actions"
import { BookingWizard } from "./wizard"

export const dynamic = "force-dynamic"

export default async function BookPage() {
  const options = await getBookingOptions()
  return <BookingWizard services={options.services} therapists={options.therapists} />
}
```

- [ ] **Step 2: wizard ตัวเต็ม** — `src/app/book/wizard.tsx` (ขั้น: คน → เมนูรายคน → วันเวลา → หมอ → สรุป · รองรับจองซ้ำผ่าน sessionStorage):

```tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useLiff } from "./liff"
import {
  createBookingRequest, getLineStatus, linkLineAccount,
  type BookingPersonInput,
} from "./actions"
import { computeSlots, isBookableDate, MAX_ADVANCE_DAYS } from "@/lib/booking-slots"
import { formatThaiDate, nowTimeInShopTz, todayInShopTz } from "@/lib/datetime"
import { REQUEST_FEE } from "@/lib/constants"

type Service = { id: string; name: string; price: number; durationMin: number }
type Therapist = { id: string; name: string }

const BTN = "w-full rounded-xl py-3 font-semibold text-[#FFF0D1] bg-[#664343] disabled:opacity-40"
const CARD = "rounded-xl border bg-white p-4"
const PICK = "rounded-lg border px-3 py-2 text-sm"
const PICKED = "rounded-lg border px-3 py-2 text-sm border-[#664343] bg-[#FFF0D1] font-medium"

/** อาการต้องห้ามนวด — โชว์ใน dialog เงื่อนไข (แนวเดียวกับ consent ของ ThaiHand แต่ไม่เพิ่มขั้นตอน) */
const HEALTH_LIST = [
  "มีไข้ บาดเจ็บ หรือเพิ่งผ่าตัดมาไม่เกิน 1 เดือน",
  "ความดันสูงที่คุมไม่ได้ / โรคหัวใจรุนแรง",
  "ผิวหนังอักเสบ แผลเปิด หรือติดเชื้อบริเวณที่นวด",
  "กระดูกพรุนรุนแรง หรือกระดูกหักที่ยังไม่หาย",
  "กำลังตั้งครรภ์ (โปรดแจ้งร้านก่อน)",
]

export function BookingWizard({ services, therapists }: {
  services: Service[]; therapists: Therapist[]
}) {
  const liffState = useLiff()
  const [linked, setLinked] = useState<null | boolean>(null)
  const [phone, setPhone] = useState("")
  const [linkError, setLinkError] = useState("")

  const [step, setStep] = useState(1) // 1 คน · 2 เมนู · 3 วันเวลา · 4 หมอ · 5 สรุป
  const [count, setCount] = useState(1)
  const [people, setPeople] = useState<BookingPersonInput[]>([{ serviceId: "", therapistId: null }])
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [note, setNote] = useState("")
  const [showHealth, setShowHealth] = useState(false)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")

  const today = todayInShopTz()
  const idToken = liffState.phase === "ready" ? liffState.idToken : ""

  useEffect(() => {
    if (!idToken) return
    getLineStatus(idToken).then((r) => setLinked(r.ok ? r.linked : false))
  }, [idToken])

  // จองซ้ำ: /book/mine เก็บเมนูเดิมไว้ให้ (ThaiHand-style rebook)
  useEffect(() => {
    const raw = sessionStorage.getItem("rebook")
    if (!raw) return
    sessionStorage.removeItem("rebook")
    try {
      const ids = JSON.parse(raw) as string[]
      const valid = ids.filter((id) => services.some((s) => s.id === id))
      if (valid.length === 0) return
      setCount(valid.length)
      setPeople(valid.map((serviceId) => ({ serviceId, therapistId: null })))
      setStep(3) // ข้ามไปเลือกวันเวลาเลย
    } catch { /* ค่าเสีย — เริ่มจองปกติ */ }
  }, [services])

  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services])
  const maxDuration = Math.max(60,
    ...people.filter((p) => p.serviceId).map((p) => serviceById.get(p.serviceId)?.durationMin ?? 60))
  const nowMinVal = (() => { const [h, m] = nowTimeInShopTz().split(":").map(Number); return h * 60 + m })()
  const slots = date ? computeSlots({ date, today, nowMin: nowMinVal, durationMin: maxDuration }) : []
  const dates = Array.from({ length: MAX_ADVANCE_DAYS + 1 }, (_, i) =>
    new Date(Date.parse(`${today}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10)
  ).filter((d) => isBookableDate(d, today))

  if (liffState.phase === "loading")
    return <p className="py-16 text-center text-slate-500">กำลังเชื่อมต่อไลน์…</p>
  if (liffState.phase === "error")
    return <p className="py-16 text-center text-slate-600">{liffState.message}</p>

  if (linked === false)
    return (
      <div className={CARD}>
        <h2 className="mb-1 font-bold">ยืนยันเบอร์โทรครั้งแรก</h2>
        <p className="mb-3 text-sm text-slate-600">ใช้จับคู่กับประวัติลูกค้าของร้าน — ครั้งเดียวจบค่ะ</p>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel"
          placeholder="08x-xxx-xxxx" className="mb-2 w-full rounded-lg border px-3 py-3" />
        {linkError && <p className="mb-2 text-sm text-red-600">{linkError}</p>}
        <button className={BTN} disabled={phone.replace(/\D/g, "").length < 9}
          onClick={async () => {
            const r = await linkLineAccount(idToken, phone)
            if (r.ok) setLinked(true)
            else setLinkError(r.error)
          }}>ยืนยัน</button>
      </div>
    )
  if (linked === null)
    return <p className="py-16 text-center text-slate-500">กำลังตรวจสอบบัญชี…</p>

  if (done)
    return (
      <div className={`${CARD} text-center`}>
        <p className="text-3xl">⏳</p>
        <h2 className="mt-2 font-bold">ส่งคำขอจองแล้วค่ะ</h2>
        <p className="mt-1 text-sm text-slate-600">
          {formatThaiDate(date)} · {time}<br />รอร้านยืนยัน — แจ้งผลทางไลน์นะคะ</p>
        <Link href="/book/mine" className="mt-4 block text-sm text-[#664343] underline">ดูการจองของฉัน</Link>
      </div>
    )

  const stepReady = [count >= 1, people.every((p) => p.serviceId), Boolean(date && time), true]

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} className="h-1.5 flex-1 rounded-full"
            style={{ background: s <= step ? "#664343" : "#e5e0da" }} />
        ))}
      </div>

      {step === 1 && (
        <div className={CARD}>
          <h2 className="mb-3 font-bold">มากี่ท่านคะ?</h2>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((n) => (
              <button key={n} className={n === count ? PICKED : PICK}
                onClick={() => {
                  setCount(n)
                  setPeople((arr) => Array.from({ length: n }, (_, i) =>
                    arr[i] ?? { serviceId: "", therapistId: null }))
                }}>{n}</button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className={CARD}>
          <h2 className="mb-3 font-bold">เลือกเมนูรายท่าน</h2>
          {people.map((p, i) => (
            <div key={i} className="mb-3">
              <p className="mb-1 text-sm text-slate-600">ท่านที่ {i + 1}</p>
              <select value={p.serviceId} className="w-full rounded-lg border px-2 py-3"
                onChange={(e) => setPeople((arr) =>
                  arr.map((x, j) => (j === i ? { ...x, serviceId: e.target.value } : x)))}>
                <option value="">— เลือกเมนู —</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} · {s.price}฿</option>
                ))}
              </select>
            </div>
          ))}
          {count > 1 && people[0].serviceId && (
            <button className="text-sm text-[#664343] underline"
              onClick={() => setPeople((arr) =>
                arr.map((x) => ({ ...x, serviceId: arr[0].serviceId })))}>
              ใช้เมนูเดียวกับท่านที่ 1 ทุกคน
            </button>
          )}
        </div>
      )}

      {step === 3 && (
        <div className={CARD}>
          <h2 className="mb-3 font-bold">เลือกวันและเวลา</h2>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {dates.map((d) => (
              <button key={d} className={`${d === date ? PICKED : PICK} shrink-0`}
                onClick={() => { setDate(d); setTime("") }}>
                {formatThaiDate(d)}
              </button>
            ))}
          </div>
          {date && (slots.length === 0
            ? <p className="text-sm text-slate-500">วันนี้ไม่เหลือช่วงเวลาแล้ว เลือกวันอื่นนะคะ</p>
            : <div className="grid grid-cols-4 gap-2">
                {slots.map((t) => (
                  <button key={t} className={t === time ? PICKED : PICK}
                    onClick={() => setTime(t)}>{t}</button>
                ))}
              </div>)}
        </div>
      )}

      {step === 4 && (
        <div className={CARD}>
          <h2 className="mb-1 font-bold">เลือกหมอนวด (ไม่บังคับ)</h2>
          <p className="mb-3 text-xs text-slate-500">
            เลือกหมอ = รีเควส +{REQUEST_FEE}฿/ท่าน · ไม่เลือก ร้านจัดให้ค่ะ</p>
          {people.map((p, i) => (
            <div key={i} className="mb-3">
              <p className="mb-1 text-sm text-slate-600">ท่านที่ {i + 1}</p>
              <select value={p.therapistId ?? ""} className="w-full rounded-lg border px-2 py-3"
                onChange={(e) => setPeople((arr) =>
                  arr.map((x, j) => (j === i ? { ...x, therapistId: e.target.value || null } : x)))}>
                <option value="">ให้ร้านจัดให้</option>
                {therapists.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} (รีเควส +{REQUEST_FEE}฿)</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {step === 5 && (
        <div className={CARD}>
          <h2 className="mb-3 font-bold">สรุปการจอง</h2>
          <p className="mb-1 text-sm">{formatThaiDate(date)} · {time} · {count} ท่าน</p>
          <ul className="mb-3 list-inside list-disc text-sm text-slate-700">
            {people.map((p, i) => (
              <li key={i}>
                {serviceById.get(p.serviceId)?.name}
                {p.therapistId &&
                  ` · หมอ${therapists.find((t) => t.id === p.therapistId)?.name} (รีเควส +${REQUEST_FEE}฿)`}
              </li>
            ))}
          </ul>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            placeholder="ความต้องการพิเศษ (ถ้ามี) เช่น เน้นบ่า งดน้ำหอม"
            className="mb-2 w-full rounded-lg border px-3 py-2 text-sm" />
          <p className="mb-1 text-xs text-slate-500">ชำระเงินที่ร้าน · ร้านจะยืนยันคิวทางไลน์ค่ะ</p>
          <p className="mb-3 text-xs text-slate-500">
            การกดจอง = ยืนยันว่าไม่มีอาการต้องห้ามนวด{" "}
            <button className="underline" onClick={() => setShowHealth(true)}>ดูรายการ</button>
          </p>
          {showHealth && (
            <div className="mb-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <ul className="list-inside list-disc space-y-1">
                {HEALTH_LIST.map((h) => <li key={h}>{h}</li>)}
              </ul>
              <button className="mt-2 underline" onClick={() => setShowHealth(false)}>ปิด</button>
            </div>
          )}
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <button className={BTN} disabled={sending} onClick={async () => {
            setSending(true)
            setError("")
            const r = await createBookingRequest(idToken, { date, time, people, note })
            if (r.ok) setDone(true)
            else { setError(r.error); setSending(false) }
          }}>{sending ? "กำลังส่ง…" : "ส่งคำขอจอง"}</button>
        </div>
      )}

      <div className="flex gap-2">
        {step > 1 && (
          <button className="flex-1 rounded-xl border py-3" onClick={() => setStep(step - 1)}>← ก่อนหน้า</button>
        )}
        {step < 5 && (
          <button className={`flex-1 ${BTN}`} disabled={!stepReady[step - 1]}
            onClick={() => setStep(step + 1)}>ถัดไป →</button>
        )}
      </div>
      <Link href="/book/mine" className="block text-center text-sm text-[#664343] underline">
        ดูการจองของฉัน</Link>
    </div>
  )
}
```

- [ ] **Step 3: หน้า "การจองของฉัน"** — `src/app/book/mine/page.tsx` (ข้างหน้า + ที่ผ่านมา + จองซ้ำ):

```tsx
"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLiff } from "../liff"
import { cancelBooking, getMyBookings, type MyBooking } from "../actions"

const STATUS_TH: Record<string, { label: string; cls: string }> = {
  pending: { label: "รอร้านยืนยัน", cls: "bg-sky-100 text-sky-700" },
  waiting: { label: "ยืนยันแล้ว", cls: "bg-emerald-100 text-emerald-700" },
  paid: { label: "ใช้บริการแล้ว", cls: "bg-slate-100 text-slate-600" },
  cancelled: { label: "ยกเลิกแล้ว", cls: "bg-red-50 text-red-500" },
  rejected: { label: "ร้านรับไม่ได้", cls: "bg-orange-50 text-orange-600" },
}

export default function MyBookingsPage() {
  const liffState = useLiff()
  const router = useRouter()
  const [upcoming, setUpcoming] = useState<MyBooking[] | null>(null)
  const [past, setPast] = useState<MyBooking[]>([])
  const [confirmKey, setConfirmKey] = useState<string | null>(null)
  const idToken = liffState.phase === "ready" ? liffState.idToken : ""

  const load = useCallback(() => {
    if (!idToken) return
    getMyBookings(idToken).then((r) => {
      if (r.ok) { setUpcoming(r.upcoming); setPast(r.past) }
    })
  }, [idToken])
  useEffect(load, [load])

  if (liffState.phase === "error")
    return <p className="py-16 text-center text-slate-600">{liffState.message}</p>
  if (liffState.phase !== "ready" || upcoming === null)
    return <p className="py-16 text-center text-slate-500">กำลังโหลด…</p>

  const rebook = (b: MyBooking) => {
    sessionStorage.setItem("rebook", JSON.stringify(b.serviceIds))
    router.push("/book")
  }

  const Card = ({ b, showCancel }: { b: MyBooking; showCancel: boolean }) => {
    const key = b.groupId ?? b.id
    const st = STATUS_TH[b.status] ?? STATUS_TH.pending
    return (
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold">{b.dateLabel} · {b.time}</p>
          <span className={`rounded-full px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {b.services.join(" / ")}{b.services.length > 1 && ` (${b.services.length} ท่าน)`}</p>
        <div className="mt-2 flex items-center gap-4">
          <button className="text-sm text-[#664343] underline" onClick={() => rebook(b)}>
            ↺ จองซ้ำ</button>
          {showCancel && (b.canCancel ? (
            <button className={`text-sm ${confirmKey === key ? "font-bold text-red-600" : "text-red-500"}`}
              onClick={async () => {
                if (confirmKey !== key) { setConfirmKey(key); return }
                const r = await cancelBooking(idToken, { id: b.id, groupId: b.groupId })
                if (r.ok) { setConfirmKey(null); load() }
              }}>
              {confirmKey === key ? "แตะอีกครั้งเพื่อยืนยันยกเลิก" : "ยกเลิกการจอง"}
            </button>
          ) : (
            <span className="text-xs text-slate-400">ใกล้เวลานัด — ยกเลิกโทรแจ้งร้านนะคะ</span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h2 className="font-bold">การจองของฉัน</h2>
      {upcoming.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">ยังไม่มีคิวข้างหน้าค่ะ</p>
      )}
      {upcoming.map((b) => <Card key={b.groupId ?? b.id} b={b} showCancel />)}
      {past.length > 0 && (
        <>
          <h3 className="pt-2 text-sm font-semibold text-slate-500">ที่ผ่านมา</h3>
          {past.map((b) => <Card key={b.groupId ?? b.id} b={b} showCancel={false} />)}
        </>
      )}
      <Link href="/book" className="block text-center text-sm text-[#664343] underline">← จองคิวใหม่</Link>
    </div>
  )
}
```

- [ ] **Step 4: ตรวจ + verify ภาพ** — eslint/tsc/vitest/build เขียว · LIFF init จะ error นอกไลน์ ดังนั้น verify layout ผ่าน `/preview` ชั่วคราวที่ mock step UI (render `BookingWizard` ไม่ได้ตรงๆ — ทำ preview ที่ก็อป JSX ของ step 1/3/5 มาแสดงด้วยข้อมูลปลอมพอดูสัดส่วน/สี) แล้ว**เก็บกวาดก่อน commit**
- [ ] **Step 5: Commit** — `git add src/app/book && git commit -m "feat: wizard จองไลน์ 5 ขั้น + การจองของฉัน + จองซ้ำ + consent สุขภาพ"`

---

## Task 7: ฝั่งร้าน — การ์ด pending + รับ/ปฏิเสธ + แจ้งเตือน

**Files:**
- Modify: `src/app/(app)/queue/queue-actions.ts`, `src/app/(app)/queue/queue-card.tsx`, `src/app/(app)/queue/queue-board.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/app-shell.tsx`

- [ ] **Step 1: actions รับ/ปฏิเสธ** — เพิ่มท้าย `queue-actions.ts` (โซนพนักงาน — ใช้ auth client เดิมของไฟล์ ไม่ใช่ service client) พร้อม import เพิ่ม:

```ts
import { pushLineMessage } from "@/lib/line"
import { msgConfirmed, msgRejected, type BookingInfo } from "@/lib/line-messages"
import { formatThaiDate } from "@/lib/datetime"

/** โหลดคำขอ pending ทั้งชุด (ทั้งกลุ่มถ้ามี) — ใช้ร่วม approve/reject */
async function loadPendingSet(id: string) {
  const supabase = await createClient()
  const { data: one } = await supabase
    .from("queue_entries")
    .select("id, group_id, queue_date, start_time, service_name, line_user_id, status")
    .eq("id", id).maybeSingle()
  if (!one || one.status !== "pending") return null
  if (!one.group_id) return { entries: [one] }
  const { data: all } = await supabase
    .from("queue_entries")
    .select("id, group_id, queue_date, start_time, service_name, line_user_id, status")
    .eq("group_id", one.group_id).eq("status", "pending")
  return { entries: all && all.length > 0 ? all : [one] }
}

const bookingInfoOf = (
  entries: { queue_date: string; start_time: string; service_name: string }[]
): BookingInfo => ({
  dateLabel: formatThaiDate(entries[0].queue_date),
  time: entries[0].start_time.slice(0, 5),
  services: entries.map((e) => e.service_name),
})

/** รับคำขอจากไลน์ — ทั้งกลุ่มพร้อมกัน + push ยืนยัน */
export async function approveBooking(id: string): Promise<Result> {
  const set = await loadPendingSet(id)
  if (!set) return { ok: false, error: "คำขอนี้ถูกจัดการไปแล้ว" }
  const supabase = await createClient()
  const ids = set.entries.map((e) => e.id)
  const { error } = await supabase
    .from("queue_entries")
    .update({ status: "waiting", updated_at: new Date().toISOString() })
    .in("id", ids).eq("status", "pending")
  if (error) return { ok: false, error: error.message }
  const to = set.entries[0].line_user_id
  if (to) {
    const sent = await pushLineMessage(to, msgConfirmed(bookingInfoOf(set.entries)))
    if (!sent)
      await supabase.from("queue_entries")
        .update({ notes: "⚠️ ส่งไลน์ไม่ผ่าน — โทรแจ้งลูกค้า" }).in("id", ids)
  }
  revalidatePath("/queue")
  return { ok: true }
}

/** ปฏิเสธ — เหตุผลแนบไปกับข้อความไลน์ · การ์ดหายจากบอร์ด */
export async function rejectBooking(id: string, reason: string): Promise<Result> {
  const set = await loadPendingSet(id)
  if (!set) return { ok: false, error: "คำขอนี้ถูกจัดการไปแล้ว" }
  const cleanReason = reason.trim() || "คิวช่วงเวลานั้นเต็ม"
  const supabase = await createClient()
  const { error } = await supabase
    .from("queue_entries")
    .update({
      status: "rejected", reject_reason: cleanReason,
      updated_at: new Date().toISOString(),
    })
    .in("id", set.entries.map((e) => e.id)).eq("status", "pending")
  if (error) return { ok: false, error: error.message }
  const to = set.entries[0].line_user_id
  if (to) await pushLineMessage(to, msgRejected(bookingInfoOf(set.entries), cleanReason))
  revalidatePath("/queue")
  return { ok: true }
}
```
(ถ้าไฟล์นี้ไม่มี type `Result` อยู่แล้ว ใช้ type ผลลัพธ์แบบเดียวกับ action อื่นในไฟล์ — ดูของจริงก่อน)

- [ ] **Step 2: การ์ด pending** — ใน `queue-card.tsx`:
  - map สถานะ (label/border/bg — ดูชื่อ const จริงในไฟล์) เพิ่ม `pending`: label "รออนุมัติ", ขอบ `border-sky-400 border-dashed`, พื้น `bg-sky-50`
  - บนการ์ด: ถ้า pending แสดงป้าย `<span className="rounded bg-sky-500 px-1 text-[10px] text-white">LINE·รออนุมัติ</span>` (แนว mockup ใน spec)
  - **เลยเวลานัด**: การ์ด pending ของวันนี้ที่ `start_time` ผ่านไปแล้ว → ขอบ `border-orange-400` แทน sky (คำนวณจากเวลาไทยแบบเดียวกับ logic เวลาปัจจุบันที่บอร์ดใช้อยู่)
  - dialog: เมื่อ pending แสดงชุดปุ่มอนุมัติแทนชุดปกติ (ปุ่ม เริ่มนวด/เก็บเงิน ต้องไม่โชว์):

```tsx
{entry.status === "pending" && (
  <>
    <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={pending}
      onClick={() => startTransition(async () => {
        const r = await approveBooking(entry.id)
        if (!r.ok) toast.error(r.error)
        setOpen(false)
        onChanged()
      })}>
      ✓ รับจอง{groupSize > 1 ? ` (${groupSize} คน)` : ""}
    </Button>
    <RejectButton entryId={entry.id} pending={pending}
      startTransition={startTransition} onDone={() => { setOpen(false); onChanged() }} />
    {/* ✏️ แก้ไขก่อนรับ = ปุ่มแก้ไขเดิมของการ์ด ใช้กับ pending ได้เลย */}
  </>
)}
```

  - `RejectButton` ในไฟล์เดียวกัน (import `Input`, `approveBooking`, `rejectBooking` เพิ่ม):

```tsx
const REJECT_REASONS = ["คิวช่วงเวลานั้นเต็ม", "หมอที่เลือกไม่อยู่ในวันนั้น"] as const

function RejectButton({ entryId, pending, startTransition, onDone }: {
  entryId: string
  pending: boolean
  startTransition: React.TransitionStartFunction
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
      <Button variant="outline" className="border-red-300 text-red-600"
        disabled={pending} onClick={() => setPicking(true)}>✕ ปฏิเสธ…</Button>
    )
  return (
    <div className="w-full space-y-1.5 rounded-lg border border-red-200 p-2">
      {REJECT_REASONS.map((r) => (
        <Button key={r} variant="outline" size="sm" className="w-full justify-start"
          disabled={pending} onClick={() => send(r)}>{r}</Button>
      ))}
      <div className="flex gap-1.5">
        <Input value={custom} onChange={(e) => setCustom(e.target.value)}
          placeholder="เหตุผลอื่น…" className="h-9" />
        <Button size="sm" disabled={pending || !custom.trim()}
          onClick={() => send(custom)}>ส่ง</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: บอร์ด** — ใน `queue-board.tsx`:
  - หาจุดที่กรอง `cancelled` ออกจากการ์ด/การนับชน → เพิ่ม `rejected` ที่จุดเดียวกัน
  - แถบสรุปเหนือบอร์ด: `const pendingCount = entries.filter((e) => e.status === "pending").length` → ถ้า >0: `<span className="rounded-full bg-sky-100 px-2 py-1 text-sm text-sky-800">⏳ รออนุมัติ {pendingCount}</span>`
  - เสียงติ๊งเมื่อมีคำขอใหม่ (realtime มีอยู่แล้ว — แค่เทียบจำนวน):

```tsx
const prevPending = useRef(pendingCount)
useEffect(() => {
  if (pendingCount > prevPending.current) {
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 880
      gain.gain.value = 0.05
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.15)
    } catch { /* autoplay policy — ไม่เป็นไร */ }
  }
  prevPending.current = pendingCount
}, [pendingCount])
```

- [ ] **Step 4: ป้ายเลขบนเมนูคิว** — `(app)/layout.tsx`: query `count` ของ pending (วันนี้ขึ้นไป) แล้วส่งเป็น prop:

```ts
const { count: pendingCount } = await supabase
  .from("queue_entries")
  .select("id", { count: "exact", head: true })
  .eq("status", "pending")
  .gte("queue_date", todayInShopTz())
```
ใน `app-shell.tsx`: prop ใหม่ `pendingCount?: number` — ลิงก์ไป `/queue` (ทั้ง sidebar และแถบล่างมือถือ) เติม `{pendingCount ? <span className="ml-1 rounded-full bg-sky-500 px-1.5 text-[10px] text-white">{pendingCount}</span> : null}`

- [ ] **Step 5: กันเคสหลุด**
  - ปุ่ม "เก็บเงิน/เริ่มนวด" ต้องไม่ขึ้นกับการ์ด pending (เงื่อนไขเดิมเช็ค waiting/in_service อยู่แล้ว — ยืนยันด้วยตา)
  - `pos/page.tsx` โหมด group: filter สถานะให้ตัด `pending` และ `rejected` ออกด้วย (ปัจจุบันตัดเฉพาะ paid,cancelled)
- [ ] **Step 6: ตรวจ + visual + commit** — ครบชุด + verify การ์ด pending ผ่าน `/preview` mock (เก็บกวาดก่อน commit) → `git commit -m "feat: การ์ดรออนุมัติจากไลน์ + รับ/ปฏิเสธ + ป้าย/เสียงแจ้งเตือน"`

---

## Task 8: ตรวจรวม + deploy

- [ ] **Step 1:** `npx eslint src && npx tsc --noEmit && npx vitest run && npm run build` — เขียวหมด (เทสเดิม 123 + ใหม่ทั้งหมด)
- [ ] **Step 2:** reconciliation ผ่าน MCP → 21/21
- [ ] **Step 3:** commit ที่ค้าง + `npx vercel deploy --prod` → เห็น "Aliased" + READY · เช็ค runtime error ด้วย Vercel MCP `get_runtime_errors` หลังเปิดหน้า /book จากมือถือ
- [ ] **Step 4:** อัปเดต README (ฟีเจอร์ + env ใหม่ 4 ตัว) + commit

---

## Task 9: E2E บน LINE จริง (ต้องมี Task 0 ครบ)

- [ ] จองเดี่ยว ไม่เลือกหมอ ใส่หมายเหตุ → การ์ด pending ขึ้นบอร์ด (เห็นหมายเหตุใน dialog) · ได้ push ①
- [ ] จองกลุ่ม 3 คน ใช้ปุ่ม "ใช้เมนูเดียวกับท่านที่ 1" + เลือกหมอ 1 คน → 3 การ์ดผูกกลุ่ม · การ์ดคนเลือกหมอมีป้ายรีเควส
- [ ] พนักงานกดรับ → การ์ดเป็นรอคิว · push ② มี "ชำระเงินที่ร้าน · มาก่อน 15 นาที" · เก็บเงินจากการ์ด → POS ติ๊กรีเควส +40 ให้เอง
- [ ] ปฏิเสธพร้อมเหตุผล → การ์ดหายจากบอร์ด · push ③ มีเหตุผล
- [ ] ลูกค้ายกเลิกจาก /book/mine (>2 ชม. ก่อนนัด) → การ์ดหาย · push ④ · เคส <2 ชม. → ปุ่มยกเลิกไม่ขึ้น
- [ ] จองซ้ำจากรายการที่ผ่านมา → เข้า wizard ขั้น 3 พร้อมเมนูเดิม
- [ ] ความปลอดภัย: ยิง action ด้วย idToken ปลอม (curl) → error สุภาพ ไม่มีข้อมูลหลุด · จองซ้ำใน 1 นาที → ไม่เกิดการ์ดซ้ำ · pending ค้าง 3 → คำขอที่ 4 ถูกกัน

---

## Self-review (ทำแล้ว)

- **Spec coverage:** identity/ผูกเบอร์ (T4) · wizard 5 ขั้น (T6) · กลุ่ม 1–4 + รีเควส +40 (T4,T6) · กติกาเวลา/ยกเลิก 2 ชม./dedupe/ลิมิต 3 (T2,T4) · push 4 จังหวะ + ส่งไม่ผ่านติดหมายเหตุ (T3,T7) · pending ไม่บล็อกช่อง (ไม่มีโค้ดบล็อก) + เลยนัดขอบส้ม + แก้ไขก่อนรับ (T7) · ป้ายเลข/เสียง/แถบสรุป (T7) · ความปลอดภัย service-role + RLS ปิด (T1,T3,T4) · ThaiHand: หมายเหตุ, เมนูเดียวกันทุกคน, ข้อความชำระ+15นาที, จองซ้ำ+ประวัติ, consent สุขภาพ (T3,T4,T6) · prerequisites (T0) · E2E (T9)
- **Placeholders:** ไม่มี TBD/TODO — จุดที่ต้องดูโค้ดจริงก่อนแก้ (ชื่อ const ในไฟล์เดิม) ระบุวิธีหาไว้ชัดแล้ว
- **Type consistency:** `BookingPersonInput`/`MyBooking` (มี serviceIds สำหรับจองซ้ำ)/`BookingInfo`/`LineIdentity` นิยามที่เดียว เรียกตรงกันทุก task · `createBookingRequest` รับ `note` ตรงกันระหว่าง T4 กับ T6 · `approveBooking`/`rejectBooking` ตรงกันระหว่าง T7 step 1 กับ step 2
