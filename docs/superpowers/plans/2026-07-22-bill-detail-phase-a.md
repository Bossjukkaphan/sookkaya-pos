# Phase A ข้อมูลบิลละเอียด — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เตียง/ห้อง · เวลาเริ่มจริง · ช่องทางจองย่อย · หมายเหตุ+edited_by ครบทั้งคิวและใบขาย (metadata ล้วน ไม่แตะเงิน)

**Architecture:** migration เดียว (beds + คอลัมน์ใหม่) → lib pure functions (TDD) → ต่อ UI คิวและ POS ตาม pattern เดิมที่มีอยู่แล้วทุกจุด

**Tech Stack:** Next.js 16 · Supabase MCP migration · vitest

**Spec:** `docs/superpowers/specs/2026-07-22-bill-detail-phase-a-design.md`
**Branch:** `bill-detail-a` · PATH nvm ก่อน npm ทุกครั้ง · ตรวจภาพผ่าน /preview ชั่วคราว (ห้าม commit)

---

### Task 1: Migration + types

**Files:** Create `supabase/migrations/20260722150000_beds_and_bill_detail.sql` · Modify `src/types/database.ts`

- [ ] **Step 1: apply ผ่าน MCP (name: beds_and_bill_detail) + สำเนาไฟล์**

```sql
-- เตียงในร้าน (ข้อมูลจริงจากเจ้าของ): นวดไทย 5 · สปา1 2 · สปา2 2 · สปา3 1
create table public.beds (
  id        uuid primary key default gen_random_uuid(),
  room      text not null,
  name      text not null,
  sort      int  not null,
  is_active boolean not null default true
);
alter table public.beds enable row level security;
create policy "authenticated read beds" on public.beds
  for select to authenticated using (true);

insert into public.beds (room, name, sort) values
  ('ห้องนวดไทย','เตียง 1',1),('ห้องนวดไทย','เตียง 2',2),('ห้องนวดไทย','เตียง 3',3),
  ('ห้องนวดไทย','เตียง 4',4),('ห้องนวดไทย','เตียง 5',5),
  ('ห้องสปา 1','เตียง 1',11),('ห้องสปา 1','เตียง 2',12),
  ('ห้องสปา 2','เตียง 1',21),('ห้องสปา 2','เตียง 2',22),
  ('ห้องสปา 3','เตียง 1',31);

-- ทุกคอลัมน์เป็น metadata — ไม่มีผลต่อสูตรเงินใดๆ
alter table public.queue_entries add column bed_id uuid references public.beds(id);
alter table public.queue_entries add column started_at timestamptz;
alter table public.queue_entries add column booking_channel text
  check (booking_channel is null or booking_channel in ('line','phone','facebook'));
alter table public.queue_entries add column notes text;

alter table public.sales add column bed_id uuid references public.beds(id);
alter table public.sales add column booking_channel text
  check (booking_channel is null or booking_channel in ('line','phone','facebook'));
alter table public.sales add column notes text;
alter table public.sales add column edited_by text;
```

- [ ] **Step 2: types** — เพิ่มตาราง `beds` (Row/Insert/Update: id, is_active, name, room, sort) เรียงก่อน `customers` · เพิ่มใน `queue_entries` ทั้ง 3 block: `bed_id: string | null`, `booking_channel: string | null`, `notes: string | null`, `started_at: string | null` (Insert/Update optional) · เพิ่มใน `sales` ทั้ง 3 block: `bed_id`, `booking_channel`, `notes`, `edited_by` (string | null, optional)
- [ ] **Step 3: reconciliation 21 ข้อผ่าน (MCP) · commit** `feat: ตาราง beds + คอลัมน์บิลละเอียด (metadata)`

### Task 2: lib (TDD)

**Files:** Modify `src/lib/customer-source.ts`, `src/lib/queue.test.ts` แล้ว `src/lib/queue.ts`

- [ ] **Step 1: เทสก่อน — ต่อท้าย queue.test.ts**

```ts
describe("busyBedIds", () => {
  const entries = [
    { bed_id: "b1", start_time: "10:00", duration_min: 60, status: "waiting" },
    { bed_id: "b2", start_time: "11:00", duration_min: 60, status: "cancelled" },
    { bed_id: null, start_time: "10:00", duration_min: 60, status: "waiting" },
    { bed_id: "b3", start_time: "12:00", duration_min: 60, status: "paid" },
  ]
  it("เตียงไม่ว่าง = มีคิว(ไม่นับยกเลิก)คร่อมช่วงเวลา", () => {
    expect(busyBedIds(entries, 630, 60)).toEqual(new Set(["b1"]))
    expect(busyBedIds(entries, 660, 30)).toEqual(new Set())      // b2 ยกเลิก
    expect(busyBedIds(entries, 720, 60)).toEqual(new Set(["b3"])) // paid ยังครองเตียงตามเวลา
  })
})
```

- [ ] **Step 2: รันตก → implement ใน queue.ts**

```ts
type BedLike = {
  bed_id: string | null
  start_time: string
  duration_min: number
  status: string
}

/** เตียงที่มีคิว (ไม่นับยกเลิก) คร่อมช่วงเวลานี้ — ใช้ทำปุ่มเตียงขึ้นจาง "ไม่ว่าง" */
export function busyBedIds(
  entries: BedLike[],
  startMin: number,
  durationMin: number
): Set<string> {
  return new Set(
    entries
      .filter(
        (e) =>
          e.bed_id !== null &&
          e.status !== "cancelled" &&
          overlaps(timeToMin(e.start_time), e.duration_min, startMin, durationMin)
      )
      .map((e) => e.bed_id as string)
  )
}
```

- [ ] **Step 3: customer-source.ts เพิ่ม**

```ts
/** ช่องทางย่อยของประเภท "จองล่วงหน้า" */
export const BOOKING_CHANNELS = ["line", "phone", "facebook"] as const
export type BookingChannel = (typeof BOOKING_CHANNELS)[number]
export const CHANNEL_LABEL: Record<BookingChannel, string> = {
  line: "ไลน์",
  phone: "โทรศัพท์",
  facebook: "Facebook",
}
export function isBookingChannel(v: string): v is BookingChannel {
  return (BOOKING_CHANNELS as readonly string[]).includes(v)
}
```

- [ ] **Step 4: vitest ทั้ง suite ผ่าน · commit** `feat: busyBedIds + ช่องทางจองย่อย (TDD)`

### Task 3: คิว — actions + dialog + การ์ด + บอร์ด

**Files:** Modify `queue/queue-actions.ts`, `queue/add-queue-dialog.tsx`, `queue/queue-card.tsx`, `queue/queue-board.tsx`, `queue/page.tsx`

- [ ] **Step 1: queue-actions**
  - `createQueueEntry`: อ่าน `bed_id` (string || null), `booking_channel` (validate ด้วย isBookingChannel เมื่อไม่ว่าง — ส่งได้เฉพาะเมื่อ source==='booking' ไม่งั้น null), `notes` (trim || null) → ใส่ใน insert
  - `setQueueStatus`: เมื่อ status==='in_service' → update เพิ่ม `started_at` เฉพาะแถวที่ยังเป็น null:
    ```ts
    if (status === "in_service") {
      // เวลาเริ่มจริง — ครั้งแรกเท่านั้น กดย้อนไปมาไม่ทับ
      await supabase
        .from("queue_entries")
        .update({ started_at: new Date().toISOString() })
        .eq("id", id)
        .is("started_at", null)
    }
    ```
- [ ] **Step 2: page.tsx โหลด beds** — `supabase.from("beds").select("id, room, name").eq("is_active", true).order("sort")` เพิ่มใน Promise.all แล้วส่ง `beds` ผ่าน QueueBoard → AddQueueDialog · type `Bed = { id: string; room: string; name: string }` export จาก queue-board
- [ ] **Step 3: add-queue-dialog**
  - state เพิ่ม: `bedId` (""), `bookingChannel` ("" — reset เมื่อ source ≠ booking), `notes` ("")
  - hidden inputs: `bed_id`, `booking_channel` (ส่งเฉพาะเมื่อ source==='booking'), `notes` เป็น `<Input name="notes">` ธรรมดา
  - ใต้แถว "ลูกค้ามาจาก": เมื่อ `source === "booking"` โชว์แถวปุ่ม `BOOKING_CHANNELS` (label จาก CHANNEL_LABEL, ไม่บังคับ กดซ้ำเพื่อยกเลิก)
  - ส่วนเลือกเตียง: จัดกลุ่มตามห้อง —
    ```tsx
    const busy = busyBedIds(entries, timeToMin(startTime || "10:00"), duration)
    // rooms = [...new Set(beds.map(b => b.room))]
    {rooms.map((room) => (
      <div key={room}>
        <p className="text-xs text-slate-500">{room}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {beds.filter((b) => b.room === room).map((b) => (
            <Button key={b.id} type="button" size="sm"
              variant={bedId === b.id ? "default" : "outline"}
              className={busy.has(b.id) && bedId !== b.id ? "opacity-40" : ""}
              onClick={() => setBedId(bedId === b.id ? "" : b.id)}>
              {b.name}{busy.has(b.id) ? " ·ไม่ว่าง" : ""}
            </Button>
          ))}
        </div>
      </div>
    ))}
    ```
    ต้องส่ง `entries` (คิววันเดียวกัน) เข้า dialog ด้วย — เพิ่ม prop จาก QueueBoard
- [ ] **Step 4: queue-card** — บรรทัดลูกค้า: ต่อท้ายด้วยชื่อเตียงย่อถ้ามี (`bedName` prop ที่ board คำนวณจาก map id→"ไทย·3"/"สปา1·2") · dialog รายละเอียดเพิ่ม: เตียง (ชื่อเต็ม) · ช่องทางจอง (CHANNEL_LABEL) · "เริ่มจริง HH:MM" จาก `started_at` (แปลงเวลาไทย) · หมายเหตุ
- [ ] **Step 5: queue-board** — โหลด/ส่ง beds + bedName map + entries เข้า dialog/การ์ด
- [ ] **Step 6: eslint + ตรวจภาพผ่าน /preview mock (ปุ่มเตียงจัดกลุ่ม/จาง · ช่องทางย่อยโผล่เมื่อเลือกจอง · การ์ดโชว์เตียง) · commit** `feat: คิวเก็บเตียง/ช่องทางย่อย/หมายเหตุ/เวลาเริ่มจริง`

### Task 4: POS + แก้บิล

**Files:** Modify `pos/pos-form.tsx`, `pos/page.tsx`, `sale-actions.ts`, `today/edit-sale-dialog.tsx` (ตรวจชื่อไฟล์จริงก่อนแก้)

- [ ] **Step 1: pos-form** — `PosInitial` เพิ่ม `bedId`, `bookingChannel`, `notes` · state ตาม + reset · UI: แถวช่องทางย่อยโผล่เมื่อ source==='booking' (โค้ดเดียวกับ dialog คิว) · ปุ่มเตียงจัดกลุ่มตามห้อง (props `beds` ใหม่จาก page — ไม่มีข้อมูลคิวใน POS จึงไม่โชว์ไม่ว่าง แค่เลือก) · `<Input name="notes">` ท้ายฟอร์มก่อนสรุปยอด · hidden inputs bed_id / booking_channel
- [ ] **Step 2: pos/page.tsx** — โหลด beds ส่งเข้า form · prefill จาก queueEntry: `bedId: queueEntry.bed_id ?? ""`, `bookingChannel: queueEntry.booking_channel ?? ""`, `notes: queueEntry.notes ?? ""`
- [ ] **Step 3: sale-actions createSale** — อ่าน 3 field แบบเดียวกับ source (validate channel ด้วย isBookingChannel, เพี้ยน→null) ใส่ใน insert
- [ ] **Step 4: updateSale (แก้บิล)** — insert `edited_by: profile?.full_name ?? user.email ?? null` ใน update payload + ช่องหมายเหตุใน edit dialog (`notes`) ถ้าโครง dialog เอื้อ (ช่อง Input เดียว ไม่รื้อ layout)
- [ ] **Step 5: /today รายการขาย** — แถวรายละเอียด: เตียง (ชื่อย่อ) ถ้ามี · notes บรรทัดเล็กสีเทาถ้ามี (โหลด beds map ใน page)
- [ ] **Step 6: eslint + vitest + build + ตรวจภาพ POS (เตียง/ช่องทาง/หมายเหตุ + prefill) · commit** `feat: POS บันทึกเตียง/ช่องทางย่อย/หมายเหตุ + edited_by`

### Task 5: ปิดงาน

- [ ] reconciliation 21/21 (MCP) — ต้องผ่าน
- [ ] ลบ /preview + คืน proxy.ts + kill dev server
- [ ] merge `bill-detail-a` → main · vitest + build · `npx vercel deploy --prod` · ยืนยัน Aliased READY

## Self-review

- Spec coverage: beds+seed✓ bed_id คิว/ขาย✓ started_at✓ booking_channel✓ notes✓ edited_by✓ UI คิว✓ UI POS✓ prefill✓ /today โชว์✓ ไม่บังคับกรอก✓ ไม่แตะเงิน✓
- ไม่มี placeholder — โค้ดจริงหรือชี้ pattern เดิมพร้อมไฟล์ชัดเจน
- ชื่อสอดคล้อง: `busyBedIds`/`BOOKING_CHANNELS`/`CHANNEL_LABEL`/`isBookingChannel`/`Bed` ใช้ตรงกันทุก task
