# การ์ดคิวถือได้สองห้อง — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้การ์ดคิวหนึ่งใบถือห้องได้สองห้องแบ่งครึ่งตามเวลา สำหรับเมนูที่ลูกค้าย้ายห้องกลางคัน (นวดคลายเท้า & คอบ่าไหล่ 90/120 นาที)

**Architecture:** เพิ่ม `queue_entries.bed_id_2` และ `services.splits_room` · สร้างสูตรกลาง `bedSegments()` ที่ตอบว่าการ์ดหนึ่งใบยึดห้องไหนช่วงไหน (คืน 1 หรือ 2 ช่วง) แล้วให้ทุกจุดที่ถามว่า "ห้องว่างไหม" ผ่านสูตรนี้ · ฟังก์ชันเดิมที่ไม่เกี่ยวกับเตียง (`firstClash` สำหรับหมอ) ไม่แตะเลย

**Tech Stack:** Next.js 16 (App Router, Server Actions) · TypeScript · Supabase Postgres · vitest · Tailwind + shadcn/ui

**สเปก:** `docs/superpowers/specs/2026-08-15-two-room-queue-design.md`

## Global Constraints

- **จุดแบ่งคือครึ่งหนึ่งของ `duration_min` เสมอ** ไม่เก็บเป็นข้อมูล คำนวณเอาทุกครั้งด้วย `Math.floor(duration_min / 2)`
- ห้องที่สองว่างได้เสมอ — ว่าง = อยู่ห้องเดียวตลอด = **พฤติกรรมเดิมทุกประการ**
- ทุกจุดที่ถามว่า "ห้องนี้ว่างไหม" ต้องผ่านสูตรกลางตัวเดียว **ห้ามเขียนช่วงเวลาเอง**
- เวลาที่ใช้ตัดสินการครองห้องคือ `bedStartMin()` เดิม (เริ่มจริงถ้ามี ไม่งั้นเวลาจอง) — **ห้ามเปลี่ยน**
- **เทสต์เดิมทั้งหมดใน `src/lib/queue.test.ts` และ `src/lib/bed-clash.test.ts` ต้องผ่านโดยไม่แก้แม้แต่ตัวอักษรเดียว** ถ้าต้องแก้แปลว่าเผลอเปลี่ยนพฤติกรรมของการ์ดห้องเดียว ซึ่งผิดเจตนา — `bed_id_2` จึงต้องเป็นฟิลด์ **optional** ในทุก type
- คอมเมนต์และข้อความบนหน้าจอเป็นภาษาไทย · ชื่อตัวแปรเป็นภาษาอังกฤษเสมอ
- migration ใช้ MCP `apply_migration` (project `jrioyrmicioqammeevgh`) แล้ว**เก็บสำเนาไฟล์ลง `supabase/migrations/` ด้วยทุกครั้ง** ห้ามรัน `supabase db push` หรือ `supabase db reset`
- ทุกครั้งที่ generate `src/types/database.ts` ใหม่ ต้องใส่คอมเมนต์หัวไฟล์สี่บรรทัดนี้กลับเข้าไปก่อน `export type Json =`:
  ```ts
  /**
   * Types สร้างจาก Supabase schema
   * อัปเดตใหม่ด้วย: npx supabase gen types typescript --project-id jrioyrmicioqammeevgh
   */
  ```
- **ห้ามแก้ข้อมูลคิวคู่ที่ `bed_double_booked` ฟ้อง (9 ส.ค. 2026)** — พนักงานทำถูกแล้ว ระบบบันทึกไม่ครบเอง
- ขึ้น production: push เข้า main แล้วสั่ง `vercel deploy --prod` เอง — push **ไม่ได้** deploy อัตโนมัติ และต้องเช็ค alias หลัง deploy ว่าชี้ build ใหม่จริง

## แผนผังไฟล์

| ไฟล์ | หน้าที่ | สถานะ |
|---|---|---|
| `src/lib/queue.ts` | `bedSegments()` ใหม่ · `busyBedIds()` เปลี่ยนไส้ใน | แก้ (Task 1, 2) |
| `src/lib/queue.test.ts` | เทสต์สูตรกลาง | แก้ (Task 1, 2) |
| `src/lib/bed-clash.ts` | `firstBedClash()` ใหม่ · `CLASH_COLUMNS` เพิ่มคอลัมน์ | แก้ (Task 2) |
| `src/lib/bed-clash.test.ts` | เทสต์การชน รวมเคสจริง 9 ส.ค. | แก้ (Task 2) |
| `supabase/migrations/20260815100000_two_room_queue.sql` | `bed_id_2` + `splits_room` | สร้าง (Task 3) |
| `src/types/database.ts` | type จากฐานข้อมูล | regenerate (Task 3) |
| `src/app/(app)/queue/queue-actions.ts` | รับ/ตรวจ `bed_id_2` | แก้ (Task 4) |
| `src/app/(app)/sale-actions.ts` | ด่านเตือนเตียงชนตอนเก็บเงิน | แก้ (Task 4) |
| `src/app/(app)/queue/queue-form-dialog.tsx` | ช่องเลือกห้องที่สอง | แก้ (Task 5) |
| `src/app/(app)/queue/queue-card.tsx` | กล่องย้ายเตียง + ป้ายบนการ์ด | แก้ (Task 5) |
| `supabase/reconciliation.sql` | ข้อ `bed_double_booked` เข้าใจสองห้อง | แก้ (Task 6) |

**ไฟล์ที่ตั้งใจไม่แก้ แม้จะเกี่ยวข้อง:** `src/app/(app)/pos/pos-form.tsx:673` เรียก `busyBedIds`
ตอนเลือกเตียงในหน้าเก็บเงิน — Task 2 เปลี่ยนแค่ไส้ในโดยคง signature เดิม ไฟล์นี้จึงได้พฤติกรรมใหม่
มาเองโดยไม่ต้องแตะ **ถ้าพบว่าต้องแก้ไฟล์นี้ แปลว่า Task 2 เผลอเปลี่ยน signature — ให้กลับไปแก้ Task 2 แทน**

---

## Task 1: สูตรกลาง `bedSegments()`

**Files:**
- Modify: `src/lib/queue.ts`
- Test: `src/lib/queue.test.ts`

**Interfaces:**
- Produces: `bedSegments(entry): BedSegment[]` และ `type BedSegment = { bedId: string; startMin: number; durationMin: number }` export จาก `@/lib/queue` — Task 2, 4, 5 ใช้ทั้งคู่

**บริบท:** ไฟล์นี้มี `bedStartMin(e)` อยู่แล้ว คืนนาทีในวันที่การ์ดเริ่มครองเตียงจริง (ใช้ `started_at` ถ้ากดเริ่มนวดแล้ว ไม่งั้นใช้ `start_time`) **ต้องใช้ตัวนี้ ห้ามคำนวณเวลาเริ่มเอง**

`bed_id_2` ต้องเป็นฟิลด์ **optional** (`bed_id_2?: string | null`) เพราะเทสต์เดิมและโค้ดเดิมส่งอ็อบเจกต์ที่ไม่มีคีย์นี้มา ถ้าประกาศเป็น required ทุกที่จะ type error ทันที

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

ต่อท้าย `src/lib/queue.test.ts`:

```ts
describe("bedSegments — การ์ดหนึ่งใบยึดห้องไหน ช่วงไหนบ้าง", () => {
  const base = { start_time: "10:00", duration_min: 120, status: "waiting" }

  it("ไม่มีห้องที่สอง — ช่วงเดียว ยาวเต็มโปรแกรม (พฤติกรรมเดิมเป๊ะ)", () => {
    expect(bedSegments({ ...base, bed_id: "b1" })).toEqual([
      { bedId: "b1", startMin: 600, durationMin: 120 },
    ])
  })

  it("มีห้องที่สอง 120 นาที — สองช่วงละ 60 ต่อกันพอดี ไม่มีรู ไม่ทับกัน", () => {
    expect(bedSegments({ ...base, bed_id: "b1", bed_id_2: "b2" })).toEqual([
      { bedId: "b1", startMin: 600, durationMin: 60 },
      { bedId: "b2", startMin: 660, durationMin: 60 },
    ])
  })

  it("นาทีคี่ — ครึ่งหลังได้เศษ รวมสองช่วงต้องเท่าโปรแกรมเป๊ะ", () => {
    const segs = bedSegments({
      ...base, duration_min: 45, bed_id: "b1", bed_id_2: "b2",
    })
    expect(segs).toEqual([
      { bedId: "b1", startMin: 600, durationMin: 22 },
      { bedId: "b2", startMin: 622, durationMin: 23 },
    ])
    expect(segs[0].durationMin + segs[1].durationMin).toBe(45)
  })

  it("ไม่มีห้องแรกเลย — ไม่ยึดอะไรทั้งนั้น", () => {
    expect(bedSegments({ ...base, bed_id: null })).toEqual([])
    expect(bedSegments({ ...base, bed_id: null, bed_id_2: "b2" })).toEqual([])
  })

  it("ห้องที่สองเป็นห้องเดียวกับห้องแรก — ยังเป็นสองช่วงที่ต่อกัน ไม่ยุบรวม", () => {
    // ลูกค้าอยู่ห้องเดิมแต่พนักงานกรอกซ้ำ — ผลลัพธ์ต้องเท่ากับครองยาวอยู่ดี
    expect(bedSegments({ ...base, bed_id: "b1", bed_id_2: "b1" })).toEqual([
      { bedId: "b1", startMin: 600, durationMin: 60 },
      { bedId: "b1", startMin: 660, durationMin: 60 },
    ])
  })

  it("กดเริ่มนวดแล้ว — ทั้งสองช่วงเลื่อนตามเวลาเริ่มจริง", () => {
    // จอง 10:00 เริ่มจริง 10:30 (03:30Z = 10:30 เวลาไทย) → ครึ่งแรก 10:30 ครึ่งหลัง 11:30
    expect(
      bedSegments({
        ...base, bed_id: "b1", bed_id_2: "b2",
        started_at: "2026-07-26T03:30:00+00:00",
      })
    ).toEqual([
      { bedId: "b1", startMin: 630, durationMin: 60 },
      { bedId: "b2", startMin: 690, durationMin: 60 },
    ])
  })
})
```

เพิ่ม `bedSegments` เข้าบล็อก import บนสุดของไฟล์เทสต์ (เรียงตามลำดับเดิมของบล็อกนั้น)

- [ ] **Step 2: รันเทสต์ให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run src/lib/queue.test.ts`
Expected: FAIL — ไม่มี export ชื่อ `bedSegments`

- [ ] **Step 3: เขียนฟังก์ชันใน `src/lib/queue.ts`**

วางต่อจาก `bedStartMin` (ก่อน `busyTherapistIds`):

```ts
/** ช่วงที่การ์ดหนึ่งใบครองห้องหนึ่งห้อง — การ์ดที่ย้ายห้องกลางคันจะมีสองช่วงต่อกัน */
export type BedSegment = { bedId: string; startMin: number; durationMin: number }

/**
 * การ์ดใบนี้ยึดห้องไหน ช่วงไหนบ้าง — **สูตรเดียวที่ทุกจุดต้องใช้ตอบว่าห้องว่างไหม**
 *
 * เมนู "นวดคลายเท้า & คอบ่าไหล่ 90/120 นาที" ลูกค้านวดเท้าบนโซฟาครึ่งแรก แล้วย้ายไป
 * คอบ่าไหล่บนเตียงไทยครึ่งหลัง เดิมระบบเก็บได้ห้องเดียวจึงเข้าใจผิดสองทางพร้อมกัน:
 * คิดว่าโซฟายังไม่ว่างทั้งที่ลูกค้าย้ายไปแล้ว และคิดว่าเตียงไทยว่างทั้งที่มีคนอยู่
 *
 * จุดแบ่งคือครึ่งหนึ่งของโปรแกรมเสมอ (60=30+30 · 90=45+45 · 120=60+60 ตามที่หน้าร้านทำจริง)
 * ใช้ floor ให้ครึ่งหลังรับเศษไป เมนูจริงหารลงตัวหมด แต่ต้องไม่พังถ้าวันหนึ่งมีเมนูนาทีคี่
 *
 * ไม่มี bed_id_2 = อยู่ห้องเดียวตลอด → คืนช่วงเดียวยาวเต็มโปรแกรม = พฤติกรรมเดิมเป๊ะ
 */
export function bedSegments(e: {
  bed_id: string | null
  bed_id_2?: string | null
  start_time: string
  duration_min: number
  started_at?: string | null
}): BedSegment[] {
  if (!e.bed_id) return []
  const startMin = bedStartMin(e)
  if (!e.bed_id_2) {
    return [{ bedId: e.bed_id, startMin, durationMin: e.duration_min }]
  }
  const firstHalf = Math.floor(e.duration_min / 2)
  return [
    { bedId: e.bed_id, startMin, durationMin: firstHalf },
    {
      bedId: e.bed_id_2,
      startMin: startMin + firstHalf,
      durationMin: e.duration_min - firstHalf,
    },
  ]
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/lib/queue.test.ts`
Expected: PASS ทุกข้อ รวมเทสต์เดิมทั้งหมดของไฟล์นี้โดยไม่แก้อะไรเลย

- [ ] **Step 5: Commit**

```bash
git add src/lib/queue.ts src/lib/queue.test.ts
git commit -m "feat: bedSegments — สูตรกลางบอกว่าการ์ดคิวยึดห้องไหนช่วงไหน"
```

---

## Task 2: ให้ตัวเช็คห้องว่างเข้าใจสองช่วง

**Files:**
- Modify: `src/lib/queue.ts` (`busyBedIds`)
- Modify: `src/lib/bed-clash.ts`
- Test: `src/lib/queue.test.ts` · `src/lib/bed-clash.test.ts`

**Interfaces:**
- Consumes: `bedSegments` · `type BedSegment` จาก `@/lib/queue` (Task 1)
- Produces: `firstBedClash(rows, bedId, startMin, durationMin, excludeIds): ClashRow | null` export จาก `@/lib/bed-clash` — Task 4 ใช้
- Produces: `CLASH_COLUMNS` มี `bed_id, bed_id_2` เพิ่มเข้ามา — Task 4 ใช้ query ตามนี้
- `busyBedIds` **signature เดิมไม่เปลี่ยน** — ผู้เรียกทั้ง 5 จุดไม่ต้องแก้

**บริบทสำคัญ:** `firstClash` เดิมใช้กับ**ทั้งเตียงและหมอ** (`findResourceClash` ใน `queue-actions.ts:76` รับ `column: "bed_id" | "therapist_id"`) หมอไม่มีเรื่องแบ่งครึ่งห้อง **ห้ามแก้ `firstClash`** — ให้เพิ่มตัวใหม่สำหรับเตียงโดยเฉพาะแทน เทสต์เดิมของ `firstClash` จะได้ไม่ต้องแตะ

เดิมผู้เรียกกรองแถวด้วย `.eq("bed_id", bedId)` มาก่อน `firstClash` จึงไม่ต้องรู้จัก bedId
ตอนนี้กรองแบบนั้นไม่ได้แล้ว เพราะการ์ดที่ใช้ห้องนี้เป็น**ห้องที่สอง**จะหลุด `firstBedClash`
จึงรับ `bedId` เข้าไปเองแล้วเลือกเทียบเฉพาะช่วงที่ตรงกับห้องนั้น

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน — `src/lib/bed-clash.test.ts`**

ต่อท้ายไฟล์:

```ts
describe("firstBedClash — เข้าใจการ์ดที่ย้ายห้องกลางคัน", () => {
  // เคสจริง 9 ส.ค. 2026 ที่ reconciliation ฟ้องมาสองวัน:
  // เอ็ม เมธี เมนู 120 นาที เริ่ม 13:55 บนเก้าอี้ 3 แล้วย้ายเตียงไทยตอน 14:55
  // กอล์ฟฟี่ เมนู 90 นาที เริ่ม 15:00 บนเก้าอี้ 3 — ไม่ได้ชนเลย พนักงานทำถูกมาตลอด
  const emm = {
    id: "emm", customer_name: "เอ็ม เมธี", service_name: "นวดคลายเท้า & คอบ่าไหล่ 120 นาที",
    duration_min: 120, start_time: "13:55", started_at: null,
    bed_id: "chair3", bed_id_2: "thai2",
  }

  it("การ์ดที่ย้ายห้องแล้ว — ห้องแรกว่างตั้งแต่ครึ่งทาง คิวถัดไปจองได้", () => {
    // กอล์ฟฟี่ 15:00 (900) 90 นาที บนเก้าอี้ 3 — เอ็มออกจากเก้าอี้ตอน 14:55 (895)
    expect(firstBedClash([emm], "chair3", 900, 90, [])).toBeNull()
  })

  it("การ์ดเดียวกันแต่ไม่ได้ระบุห้องที่สอง — ยังชนเหมือนเดิม (พฤติกรรมเดิมไม่เปลี่ยน)", () => {
    const oneRoom = { ...emm, bed_id_2: null }
    expect(firstBedClash([oneRoom], "chair3", 900, 90, [])?.id).toBe("emm")
  })

  it("ครึ่งหลังของการ์ดชนกับคิวใหม่บนเตียงไทย — ต้องจับได้", () => {
    // เอ็มอยู่เตียงไทย 14:55–15:55 (895–955) · คิวใหม่ 15:30 (930) 60 นาที
    expect(firstBedClash([emm], "thai2", 930, 60, [])?.id).toBe("emm")
  })

  it("ห้องที่ไม่เกี่ยวกับการ์ดนี้เลย — ไม่ชน", () => {
    expect(firstBedClash([emm], "thai5", 900, 60, [])).toBeNull()
  })

  it("ชนขอบพอดีไม่นับชน — เหมือนกติกาเดิม", () => {
    // ครึ่งแรกของเอ็มจบ 14:55 (895) คิวใหม่เริ่ม 14:55 พอดี
    expect(firstBedClash([emm], "chair3", 895, 60, [])).toBeNull()
  })

  it("ใบที่อยู่ใน excludeIds ไม่นับ — ใช้ตอนแก้การ์ดของตัวเอง", () => {
    expect(firstBedClash([emm], "thai2", 930, 60, ["emm"])).toBeNull()
  })
})
```

เพิ่ม `firstBedClash` เข้าบรรทัด import ของไฟล์เทสต์

- [ ] **Step 2: เขียนเทสต์ที่ยังไม่ผ่าน — `src/lib/queue.test.ts`**

ต่อท้าย `describe("busyBedIds")` **เป็น describe ใหม่** (อย่าแก้ของเดิม):

```ts
describe("busyBedIds — การ์ดที่ย้ายห้องกลางคัน", () => {
  const moved = [
    {
      bed_id: "chair3", bed_id_2: "thai2",
      start_time: "13:55", duration_min: 120, status: "paid",
    },
  ]

  it("เก้าอี้ว่างหลังลูกค้าย้ายออก แต่เตียงไทยไม่ว่าง", () => {
    // 15:00–16:30 (900, 90 นาที): เก้าอี้ว่างแล้ว (ออกตอน 14:55) เตียงไทยยังอยู่ถึง 15:55
    expect(busyBedIds(moved, 900, 90)).toEqual(new Set(["thai2"]))
  })

  it("ช่วงครึ่งแรกยังติดเก้าอี้ ยังไม่ติดเตียงไทย", () => {
    // 14:00–14:30 (840, 30 นาที)
    expect(busyBedIds(moved, 840, 30)).toEqual(new Set(["chair3"]))
  })
})
```

- [ ] **Step 3: รันเทสต์ให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run src/lib/queue.test.ts src/lib/bed-clash.test.ts`
Expected: FAIL — ไม่มี export `firstBedClash` และ `busyBedIds` ยังไม่รู้จักห้องที่สอง

- [ ] **Step 4: แก้ `busyBedIds` ใน `src/lib/queue.ts`**

เพิ่ม `bed_id_2?: string | null` เข้า type `BedLike` (บรรทัด 55-61) แล้วแทนที่ตัวฟังก์ชัน:

```ts
/**
 * เตียงที่มีคิว (ไม่นับยกเลิก) คร่อมช่วงเวลานี้ — ใช้ทำปุ่มเตียงขึ้น "ไม่ว่าง"
 *
 * ไล่เป็นช่วง ๆ ผ่าน bedSegments เพราะการ์ดที่ย้ายห้องกลางคันยึดสองห้องคนละช่วงเวลา
 * การ์ดห้องเดียวได้ช่วงเดียวยาวเต็มโปรแกรม ผลจึงเท่าเดิมทุกประการ
 */
export function busyBedIds(
  entries: BedLike[],
  startMin: number,
  durationMin: number
): Set<string> {
  const busy = new Set<string>()
  for (const e of entries) {
    if (e.status === "cancelled") continue
    for (const seg of bedSegments(e)) {
      if (overlaps(seg.startMin, seg.durationMin, startMin, durationMin)) {
        busy.add(seg.bedId)
      }
    }
  }
  return busy
}
```

- [ ] **Step 5: แก้ `src/lib/bed-clash.ts`**

`CLASH_COLUMNS` เพิ่มสองคอลัมน์:

```ts
export const CLASH_COLUMNS =
  "id, customer_name, service_name, duration_min, start_time, started_at, bed_id, bed_id_2"
```

`ClashRow` เพิ่มสองฟิลด์แบบ optional (ต้อง optional ไม่งั้นเทสต์เดิมของ `firstClash` พัง):

```ts
export type ClashRow = {
  id: string
  customer_name: string | null
  service_name: string
  duration_min: number
  start_time: string
  started_at: string | null
  /** เตียงของการ์ด — จำเป็นเฉพาะตอนเช็คเตียง (firstBedClash) ตอนเช็คหมอไม่ได้ใช้ */
  bed_id?: string | null
  /** เตียงช่วงครึ่งหลังของการ์ดที่ย้ายห้องกลางคัน */
  bed_id_2?: string | null
}
```

เพิ่มฟังก์ชันใหม่ต่อจาก `firstClash` (import `bedSegments` จาก `./queue`):

```ts
/**
 * ใบแรกที่ครอง **ห้องนี้** คร่อมช่วงเวลานี้ — ไม่พบคืน null
 *
 * ต่างจาก firstClash ตรงที่รับ bedId เข้ามาเอง เพราะการ์ดหนึ่งใบครองได้สองห้องคนละช่วง
 * ผู้เรียกจึงกรองแถวด้วย .eq("bed_id", x) มาก่อนไม่ได้อีกแล้ว — การ์ดที่ใช้ห้องนี้เป็น
 * ห้องที่สองจะหลุดตัวกรองไปทั้งที่ครองห้องอยู่จริง
 *
 * firstClash เดิมยังใช้กับ "หมอ" ต่อไป หมอไม่มีเรื่องแบ่งครึ่งห้อง จึงไม่ต้องแก้
 */
export function firstBedClash(
  rows: ClashRow[],
  bedId: string,
  startMin: number,
  durationMin: number,
  excludeIds: string[]
): ClashRow | null {
  return (
    rows.find(
      (e) =>
        !excludeIds.includes(e.id) &&
        bedSegments({
          bed_id: e.bed_id ?? null,
          bed_id_2: e.bed_id_2,
          start_time: e.start_time,
          duration_min: e.duration_min,
          started_at: e.started_at,
        }).some(
          (seg) =>
            seg.bedId === bedId &&
            overlaps(seg.startMin, seg.durationMin, startMin, durationMin)
        )
    ) ?? null
  )
}
```

`overlaps` มาจาก `./queue` — เพิ่มเข้าบรรทัด import เดิมของไฟล์นี้

- [ ] **Step 6: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/lib/queue.test.ts src/lib/bed-clash.test.ts`
Expected: PASS ทุกข้อ **รวมเทสต์เดิมทั้งหมดที่ไม่ได้แก้**

- [ ] **Step 7: พิสูจน์ว่าเทสต์เคส 9 ส.ค. จับได้จริง**

แก้ `busyBedIds` ชั่วคราวให้เรียก `bedSegments` แล้วใช้เฉพาะช่วงแรก (`bedSegments(e).slice(0, 1)`) แล้วรันเทสต์

Run: `npx vitest run src/lib/queue.test.ts`
Expected: FAIL ที่เทสต์ `"เก้าอี้ว่างหลังลูกค้าย้ายออก แต่เตียงไทยไม่ว่าง"`

แล้ว**คืนโค้ดกลับ**และรันซ้ำให้ผ่าน — ถ้าไม่ล้มแปลว่าเทสต์ไม่ได้ทดสอบอะไร ต้องแก้เทสต์ก่อนไปต่อ

- [ ] **Step 8: เทสต์ทั้งชุด + type check**

Run: `npm test && npx tsc --noEmit`
Expected: PASS ทั้งหมด

- [ ] **Step 9: Commit**

```bash
git add src/lib/queue.ts src/lib/queue.test.ts src/lib/bed-clash.ts src/lib/bed-clash.test.ts
git commit -m "feat: ตัวเช็คห้องว่างเข้าใจการ์ดที่ย้ายห้องกลางคัน"
```

---

## Task 3: คอลัมน์ในฐานข้อมูล

**Files:**
- Create: `supabase/migrations/20260815100000_two_room_queue.sql`
- Modify: `src/types/database.ts` (regenerate)

**Interfaces:**
- Produces: `queue_entries.bed_id_2 (uuid, null ได้)` · `services.splits_room (boolean, not null, default false)` — Task 4, 5 ใช้

**บริบท:** `splits_room` เป็น `true` เฉพาะสองเมนู เพราะเมนู 60 นาทีนวดคอบ่าไหล่ครึ่งหลัง**บนโซฟาเดิม** ไม่ได้ย้ายห้อง

- [ ] **Step 1: ยืนยัน id ของเมนูจากฐานข้อมูลก่อน**

รันผ่าน MCP `execute_sql`:

```sql
select id, name, duration_min from public.services
where name ilike '%คลายเท้า%' order by duration_min;
```

จดค่า id ของแถว 90 นาที และ 120 นาทีไว้ใช้ใน Step 2
**ห้ามคัดลอก id จากเอกสาร** — เคยพลาดมาแล้วเมื่อ 13 ส.ค. (ใส่ id ของบิลอื่นลงสเปก)

- [ ] **Step 2: เขียนไฟล์ migration**

สร้าง `supabase/migrations/20260815100000_two_room_queue.sql` โดยแทน `<ID_90>` และ `<ID_120>`
ด้วยค่าจริงจาก Step 1:

```sql
-- การ์ดคิวถือได้สองห้อง — เมนูที่ลูกค้าย้ายห้องกลางคัน
--
-- เมนู "นวดคลายเท้า & คอบ่าไหล่ 90/120 นาที" ลูกค้านวดเท้าบนโซฟาครึ่งแรก
-- แล้วย้ายไปคอบ่าไหล่บนเตียงไทยครึ่งหลัง เดิมเก็บได้ห้องเดียวต่อการ์ด ระบบจึง
-- ล็อกโซฟาเกินจริงจนคิวถัดไปจองไม่ได้ และมองไม่เห็นว่าเตียงไทยถูกใช้อยู่
-- (คิวเมนูนี้ 40 ใบในระบบ ลงเก้าอี้ 33 ใบ ลงเตียงศูนย์ใบ)
--
-- เมนู 60 นาทีไม่ตั้ง splits_room เพราะครึ่งหลังนวดคอบ่าไหล่บนโซฟาเดิม ไม่ย้ายห้อง
-- ลูกค้ารีเควสอยู่ห้องเดียวตลอดได้ ฟิลด์ bed_id_2 จึงว่างได้เสมอ = พฤติกรรมเดิม

alter table public.queue_entries
  add column if not exists bed_id_2 uuid references public.beds(id);

alter table public.services
  add column if not exists splits_room boolean not null default false;

comment on column public.queue_entries.bed_id_2 is
  'ห้องของช่วงครึ่งหลัง — null = อยู่ห้องเดียวตลอด · จุดแบ่งคือครึ่งหนึ่งของ duration_min';
comment on column public.services.splits_room is
  'เมนูนี้ย้ายห้องกลางคันเป็นค่าตั้งต้นไหม — หน้าจอใช้ตัดสินว่าจะขึ้นช่องเลือกห้องที่สองหรือไม่';

update public.services set splits_room = true where id in ('<ID_90>', '<ID_120>');
```

- [ ] **Step 3: apply migration ผ่าน MCP**

ใช้ MCP `apply_migration` ชื่อ `two_room_queue` กับ project `jrioyrmicioqammeevgh`
ห้ามรัน `supabase db push`

- [ ] **Step 4: ตรวจผล**

```sql
select name, duration_min, splits_room from public.services
where name ilike '%คลายเท้า%' order by duration_min;
```

Expected: 60 นาที → `false` · 90 นาที → `true` · 120 นาที → `true`

```sql
select count(*) as แถวทั้งหมด, count(bed_id_2) as มีห้องที่สอง from public.queue_entries;
select count(*) filter (where splits_room) as เมนูที่ย้ายห้อง from public.services;
```

Expected: `มีห้องที่สอง = 0` (ยังไม่มีใครกรอก) · `เมนูที่ย้ายห้อง = 2` (ไม่ใช่มากกว่านี้)

- [ ] **Step 5: regenerate types**

ใช้ MCP `generate_typescript_types` เขียนทับ `src/types/database.ts` แล้วใส่คอมเมนต์หัวไฟล์
สี่บรรทัดกลับเข้าไปก่อน `export type Json =` (ดู Global Constraints)

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260815100000_two_room_queue.sql src/types/database.ts
git commit -m "feat(db): queue_entries.bed_id_2 และ services.splits_room"
```

---

## Task 4: server actions รับและตรวจห้องที่สอง

**Files:**
- Modify: `src/app/(app)/queue/queue-actions.ts`
- Modify: `src/app/(app)/sale-actions.ts:47-66`
- Modify: `src/lib/queue.ts` (`queueMirrorFromSale`)
- Test: `src/lib/queue.test.ts`

**Interfaces:**
- Consumes: `firstBedClash` · `CLASH_COLUMNS` จาก `@/lib/bed-clash` (Task 2) · คอลัมน์จาก Task 3

**บริบทสำคัญสองข้อ:**

**(1) ตัวกรอง query ต้องเปลี่ยน** `findResourceClash` (`queue-actions.ts:76-92`) กรองด้วย `.eq(column, value)` ซึ่งใช้ไม่ได้กับเตียงอีกแล้ว — การ์ดที่ใช้ห้องนี้เป็น**ห้องที่สอง**จะหลุดตัวกรอง ต้องแยกทางเตียงออกมาใช้ `.or("bed_id.eq.X,bed_id_2.eq.X")` ส่วนทางหมอคงเดิมทุกอย่าง

**(2) `queueMirrorFromSale` มีกับดักอยู่แล้ว** (`src/lib/queue.ts:199-208`) คอมเมนต์ในโค้ดอธิบายว่าฟอร์มแก้บิลไม่มีช่องเตียง ถ้าไม่มีคีย์ส่งมาต้อง**ไม่แตะ** ไม่ใช่เขียน null ทับ — **`bed_id_2` ต้องได้รับการปฏิบัติแบบเดียวกัน** ฟอร์มแก้บิลไม่มีช่องห้องที่สองเช่นกัน

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน — `queueMirrorFromSale`**

ต่อท้าย `describe("queueMirrorFromSale")` เดิมใน `src/lib/queue.test.ts`:

```ts
  it("ฟอร์มไม่ส่ง bed_id_2 มา — ต้องไม่แตะห้องที่สองของการ์ด", () => {
    // ฟอร์มแก้บิลไม่มีช่องห้องที่สอง ถ้าเขียน null ทับจะลบห้องที่พนักงานเลือกไว้ทิ้ง
    const fd = new FormData()
    fd.set("customer_name", "ทดสอบ")
    const patch = queueMirrorFromSale(fd, "svc1", { name: "นวดไทย", duration_min: 60 }, "th1")
    expect(Object.keys(patch)).not.toContain("bed_id_2")
  })

  it("ฟอร์มส่ง bed_id_2 ค่าว่างมา — ตั้งใจเอาห้องที่สองออก เขียน null ถูกแล้ว", () => {
    const fd = new FormData()
    fd.set("bed_id_2", "")
    const patch = queueMirrorFromSale(fd, "svc1", { name: "นวดไทย", duration_min: 60 }, "th1")
    expect(patch).toMatchObject({ bed_id_2: null })
  })
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run src/lib/queue.test.ts`
Expected: FAIL ที่เทสต์ข้อสอง — ยังไม่มีการจัดการ `bed_id_2`

- [ ] **Step 3: แก้ `queueMirrorFromSale` ใน `src/lib/queue.ts`**

ทำกับ `bed_id_2` แบบเดียวกับที่โค้ดเดิมทำกับ `bed_id` เป๊ะ ๆ — อ่านค่าด้วย `formData.get("bed_id_2")`
แล้วใส่คีย์ลงอ็อบเจกต์ผลลัพธ์**เฉพาะเมื่อคีย์นั้นถูกส่งมา** (ไม่ใช่ `null`) พร้อมคอมเมนต์ภาษาไทย
อธิบายเหตุผลเดียวกัน อ่านโค้ดเดิมรอบ ๆ บรรทัด 205-208 แล้วทำตามรูปแบบนั้น

- [ ] **Step 4: แก้ `findResourceClash` และ `bedConflictError` ใน `queue-actions.ts`**

แยกเส้นทางเตียงออกจากเส้นทางหมอ:

```ts
/** หาคิวใบแรกที่ใช้ **หมอ** คนเดียวกันคร่อมช่วงเวลานี้ในวันเดียวกัน */
async function findTherapistClash(
  supabase: Awaited<ReturnType<typeof createClient>>,
  therapistId: string,
  queueDate: string,
  startMin: number,
  durationMin: number,
  excludeIds: string[]
) {
  const { data } = await supabase
    .from("queue_entries")
    .select(CLASH_COLUMNS)
    .eq("queue_date", queueDate)
    .eq("therapist_id", therapistId)
    .not("status", "in", CLASH_STATUS_FILTER)
  return firstClash(data ?? [], startMin, durationMin, excludeIds)
}

/**
 * หาคิวใบแรกที่ครอง **ห้องนี้** คร่อมช่วงเวลานี้ในวันเดียวกัน
 *
 * กรองด้วย .or เพราะการ์ดที่ใช้ห้องนี้เป็นห้องที่สอง (ย้ายห้องกลางคัน) จะหลุด
 * ตัวกรอง .eq("bed_id", ...) แบบเดิมไปทั้งที่ครองห้องอยู่จริง
 */
async function findBedClash(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bedId: string,
  queueDate: string,
  startMin: number,
  durationMin: number,
  excludeIds: string[]
) {
  const { data } = await supabase
    .from("queue_entries")
    .select(CLASH_COLUMNS)
    .eq("queue_date", queueDate)
    .or(`bed_id.eq.${bedId},bed_id_2.eq.${bedId}`)
    .not("status", "in", CLASH_STATUS_FILTER)
  return firstBedClash(data ?? [], bedId, startMin, durationMin, excludeIds)
}
```

แก้ผู้เรียกเดิมให้ใช้ตัวที่ถูกต้อง (ทางหมอ → `findTherapistClash` · ทางเตียง → `findBedClash`)
แล้วลบ `findResourceClash` ทิ้ง

`bedConflictError` ต้องตรวจ**ทั้งสองช่วง**: รับ `bedId2` เพิ่ม แล้วเรียก `findBedClash` สองครั้ง —
ครั้งแรกด้วย `bedId` กับช่วงครึ่งแรก ครั้งที่สองด้วย `bedId2` กับช่วงครึ่งหลัง
ใช้ `bedSegments` คำนวณช่วงแทนการหารเอง (นำเข้าจาก `@/lib/queue`) เพื่อไม่ให้สูตรแตกเป็นสองที่

- [ ] **Step 5: ให้ createQueueEntry / updateQueueEntry / moveQueueEntry รับ `bed_id_2`**

ทุกจุดที่อ่าน `bed_id` จากฟอร์ม (`queue-actions.ts` บรรทัด 192, 488 และจุดที่เขียน `bed_id:` ลงตาราง
บรรทัด 273, 388, 554) ให้อ่าน/เขียน `bed_id_2` คู่กันในรูปแบบเดียวกัน:

```ts
  const bedId2 = String(form.get("bed_id_2") ?? "") || null
```

และส่ง `bedId2` เข้า `bedConflictError` ทุกจุดที่เรียก

- [ ] **Step 6: แก้ `bedClashWarning` ใน `sale-actions.ts:47-66`**

เปลี่ยนตัวกรองและตัวตรวจให้เหมือน `findBedClash`:

```ts
  const { data } = await supabase
    .from("queue_entries")
    .select(CLASH_COLUMNS)
    .eq("queue_date", saleDate)
    .or(`bed_id.eq.${bedId},bed_id_2.eq.${bedId}`)
    .not("status", "in", CLASH_STATUS_FILTER)
  const clash = firstBedClash(data ?? [], bedId, timeToMin(startTime), durationMin, excludeIds)
```

แก้ import จาก `firstClash` เป็น `firstBedClash` และอัปเดตคอมเมนต์หัวฟังก์ชันที่อ้างถึงเคส
9 ส.ค. 2026 ให้ตรงความจริงใหม่ — เคสนั้นไม่ใช่การจองซ้อน แต่เป็นการ์ดที่ย้ายห้องซึ่งระบบเดิมมองไม่เห็น

- [ ] **Step 7: เทสต์ทั้งชุด + type check + build**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: PASS ทั้งหมด

- [ ] **Step 8: Commit**

```bash
git add src/lib/queue.ts src/lib/queue.test.ts "src/app/(app)/queue/queue-actions.ts" "src/app/(app)/sale-actions.ts"
git commit -m "feat: server ตรวจการชนของห้องทั้งสองช่วง"
```

---

## Task 5: หน้าจอเลือกห้องที่สอง

**Files:**
- Modify: `src/app/(app)/queue/queue-form-dialog.tsx`
- Modify: `src/app/(app)/queue/queue-card.tsx`

**Interfaces:**
- Consumes: `bedSegments` · `busyBedIds` จาก `@/lib/queue` (Task 1, 2) · `services.splits_room` และ `queue_entries.bed_id_2` (Task 3) · ฟอร์มส่งฟิลด์ชื่อ `bed_id_2` ตามที่ Task 4 อ่าน

**บริบท:** `queue-form-dialog.tsx` มีช่องเลือกเตียงอยู่แล้ว 3 จุด (บรรทัด 385, 592, 675) และเก็บค่าไว้ที่ state `bedId` (บรรทัด 113) ส่งออกเป็น hidden input ชื่อ `bed_id` (บรรทัด 242)

`queue-card.tsx` มีกล่อง "🔁 ย้ายเตียง/เปลี่ยนหมอ" ที่เช็คห้องว่างเฉพาะ**ช่วงที่เหลือ** ของการนวด
(`checkStart = Math.max(startMin, nowMin)` บรรทัด 746-753) — **ตรรกะนั้นถูกและต้องคงไว้**

- [ ] **Step 1: ช่องเลือกห้องที่สองในกล่องสร้าง/แก้คิว**

ใน `queue-form-dialog.tsx` เพิ่ม state คู่กับ `bedId`:

```tsx
  // ห้องช่วงครึ่งหลัง — ขึ้นเฉพาะเมนูที่ย้ายห้องกลางคัน · ว่างได้ = อยู่ห้องเดียวตลอด
  const [bedId2, setBedId2] = useState(entry?.bed_id_2 ?? "")
```

เพิ่ม hidden input คู่กับของเดิม:

```tsx
          <input type="hidden" name="bed_id_2" value={bedId2} />
```

ใต้ช่องเลือกเตียงเดิม เพิ่มบล็อกที่ขึ้นเฉพาะเมื่อเมนูที่เลือกมี `splits_room`:

```tsx
        {selectedService?.splits_room && (
          <div className="space-y-1">
            <p className="text-sm font-medium">
              ห้องช่วงครึ่งหลัง · {secondHalfLabel}
            </p>
            {/* คัดลอกบล็อก select ของช่องเตียงเดิมมาทั้งก้อน แล้วเปลี่ยนสามอย่าง:
                value → bedId2 · onChange → setBedId2 · ตัวแปรที่ใช้เช็คว่าง →
                ชุดที่คำนวณจากช่วงครึ่งหลัง (ดู Step 1 ย่อหน้าถัดไป)
                ตัวเลือกเตียงใช้รายการ beds ชุดเดียวกับช่องแรก ไม่ต้องกรองอะไรเพิ่ม */}
            <p className="text-xs text-slate-500">
              เว้นว่าง = ลูกค้าอยู่ห้องเดิมตลอด (รีเควสนวดยาวไม่ย้ายห้อง)
            </p>
          </div>
        )}
```

`secondHalfLabel` คำนวณจาก `bedSegments` ของค่าที่กรอกอยู่ แล้วแปลงนาทีเป็นเวลาด้วย `minToTime`
ที่มีอยู่แล้วใน `@/lib/queue` เช่นได้ข้อความว่า `15:00–16:00 น.` — **ห้ามเขียนป้ายลอย ๆ ว่า "ห้องที่ 2"**
พนักงานต้องเห็นช่วงเวลาจริงเพื่อเลือกห้องได้ถูก

ช่องเลือกเตียง**ช่องแรก**เช็คว่างด้วยช่วงครึ่งแรก ช่องที่สองเช็คด้วยช่วงครึ่งหลัง —
เรียก `busyBedIds` สองครั้งด้วยช่วงคนละช่วงจาก `bedSegments` ไม่ใช่ช่วงเดียวทั้งโปรแกรม

`selectedService` ต้องมีฟิลด์ `splits_room` ติดมาด้วย — ไล่ดูว่ารายการเมนูถูกส่งเข้าคอมโพเนนต์นี้
จากไหนแล้วเพิ่มคอลัมน์ใน select ต้นทางให้ครบ

- [ ] **Step 2: ช่องห้องที่สองในกล่องย้ายเตียง**

ใน `queue-card.tsx` กล่อง "🔁 ย้ายเตียง/เปลี่ยนหมอ" (บรรทัด ~753-805) เพิ่ม state `bedId2`
และ select ที่สองในรูปแบบเดียวกับช่องเตียงเดิม แล้วส่งค่าออกไปทาง `onSave`
(ขยาย type ของ `onSave` จาก `{ bedId, therapistId, isRequest }` เป็นมี `bedId2` ด้วย
แล้วไล่แก้ผู้เรียกให้ส่งต่อไปถึง action)

การเช็คว่างยังใช้ `checkStart`/`remainMin` เดิม แต่แยกคิดรายช่วง: ช่องแรกเทียบกับช่วงครึ่งแรก
ที่ยังเหลือ ช่องที่สองเทียบกับช่วงครึ่งหลังที่ยังเหลือ

- [ ] **Step 3: ป้ายบนการ์ดคิว**

หาจุดที่การ์ดแสดงชื่อเตียงด้วย:

```bash
grep -n "room\b\|bedLabel\|\.name}" "src/app/(app)/queue/queue-card.tsx" | head -20
```

เมื่อการ์ดมี `bed_id_2` และไม่เท่ากับ `bed_id` ให้แสดงเป็น `เก้าอี้ 3 → ห้องนวดไทย เตียง 2`
(ห้องแรก ลูกศร ห้องที่สอง) ถ้าไม่มีห้องที่สองหรือเป็นห้องเดียวกัน แสดงเหมือนเดิมทุกประการ
เพื่อให้พนักงานเห็นจากกระดานได้เลยว่าคิวนี้ย้ายห้อง ไม่ต้องเปิดการ์ด

- [ ] **Step 4: type check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS — type error เรื่อง prop ที่ขาดแปลว่ายังส่ง `bedId2` ไม่ครบทุกจุด

- [ ] **Step 5: เทสต์ทั้งชุด**

Run: `npm test`
Expected: PASS ทั้งหมด

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/queue/queue-form-dialog.tsx" "src/app/(app)/queue/queue-card.tsx"
git commit -m "feat: เลือกห้องช่วงครึ่งหลังได้ในกล่องคิวและกล่องย้ายเตียง"
```

---

## Task 6: ข้อตรวจ `bed_double_booked` เข้าใจสองห้อง

**Files:**
- Modify: `supabase/reconciliation.sql`

**บริบท:** ข้อตรวจนี้อยู่ที่บรรทัด ~280-290 จับคู่คิวสองใบที่ `b.bed_id = a.bed_id` แล้วดูว่าช่วงเวลาทับกันเกิน 20 นาทีไหม ตอนนี้มันมองเห็นแค่ห้องแรก จึงฟ้องเคส 9 ส.ค. ที่ไม่ได้ผิดจริง และจะฟ้องผิดกับทุกคิวที่ย้ายห้องนับจากนี้

- [ ] **Step 1: เขียนข้อตรวจใหม่**

แทนที่บล็อก `select 'bed_double_booked', count(*)` เดิมด้วยเวอร์ชันที่กางการ์ดเป็นช่วง ๆ ก่อนจับคู่
ใช้ `lateral` แตกแต่ละใบเป็น 1-2 ช่วง (ห้อง · เวลาเริ่ม · นาที) ด้วยกติกาเดียวกับ `bedSegments`:
เวลาเริ่ม = `started_at` ตามเวลาไทยถ้ามี ไม่งั้น `start_time` · ครึ่งแรก = `floor(duration_min / 2)`
แล้วจับคู่ช่วงที่ `bed_id` เดียวกันและทับกันเกิน 20 นาที

ใส่คอมเมนต์ภาษาไทยเหนือข้อตรวจอธิบายว่าทำไมต้องกางเป็นช่วง พร้อมอ้างเคส 9 ส.ค. 2026 ว่า
เดิมฟ้องผิดเพราะระบบเก็บได้ห้องเดียว

- [ ] **Step 2: รันทั้งไฟล์**

รันเนื้อ `supabase/reconciliation.sql` ผ่าน MCP `execute_sql`

Expected: **ทุกแถว `result = PASS` รวม `bed_double_booked` ที่ต้องกลายเป็น 0**
ข้อนี้ FAIL มาตั้งแต่ 9 ส.ค. เพราะข้อตรวจเองมองไม่เห็นการย้ายห้อง — พอแก้แล้วต้องหายไป
โดยไม่ต้องแตะข้อมูลสักแถว

ถ้ายัง FAIL อยู่ ให้ query ดูว่าคู่ไหนที่ยังฟ้อง **อย่าแก้ข้อมูลเพื่อให้ผ่าน** — รายงานกลับมา

- [ ] **Step 3: Commit**

```bash
git add supabase/reconciliation.sql
git commit -m "fix: ข้อตรวจเตียงจองซ้อนเข้าใจการ์ดที่ย้ายห้องกลางคัน"
```

---

## Task 7: ตรวจรับและขึ้น production

**Files:** ไม่มีไฟล์ใหม่

- [ ] **Step 1: ชุดตรวจทั้งหมด**

Run: `npm test`
Expected: PASS และจำนวนเทสต์มากกว่าเดิม (ก่อนเริ่มงานนี้ 712 ตัว)

Run: `npx tsc --noEmit`
Expected: ไม่มี error

Run: `npm run lint`
Expected: 0 error (มี warning เดิม 1 ตัวเรื่อง `MAX_PAYMENT_LINES` ใน `src/lib/payments.test.ts` ซึ่งมีอยู่ก่อนงานนี้)

Run: `npm run build`
Expected: build ผ่าน

- [ ] **Step 2: reconciliation ทั้งไฟล์**

Expected: **ทุกข้อ PASS ไม่มีข้อยกเว้นอีกต่อไป** — `bed_double_booked` ที่เคย FAIL ต้องเป็น PASS แล้ว

- [ ] **Step 3: ยอดเงินต้องไม่ขยับ**

```sql
select sum(volume) as volume, sum(net_revenue) as revenue, sum(cash_in) as cash_in
from public.v_daily_summary where sale_date between '2026-08-01' and '2026-08-14';
```

จดค่าก่อนเริ่ม Task 1 ไว้เทียบ — งานนี้ไม่แตะเรื่องเงินเลย ตัวเลขต้องเท่าเดิมทุกตัว
(ยอดจะสูงขึ้นได้ถ้าพนักงานคีย์บิลใหม่ระหว่างทำงาน ที่ต้องตกใจคือตัวเลข**ลดลง**)

- [ ] **Step 4: merge แล้ว deploy**

```bash
git fetch && git rebase origin/main
```

แก้ conflict ถ้ามี merge เข้า main รันเทสต์บนผลลัพธ์ที่ merge แล้ว จากนั้น:

```bash
git push origin main
npx vercel deploy --prod --yes
```

การ push **ไม่ได้** deploy อัตโนมัติ ต้องสั่งเอง

- [ ] **Step 5: ยืนยันว่า production ขึ้นจริง**

Run: `npx vercel inspect sookkaya-pos.vercel.app`
Expected: `status ● Ready` และ `created` เป็นเวลาไม่กี่นาทีที่ผ่านมา —
**ถ้า `created` ยังเป็นของ build เก่า แปลว่า deploy ไม่ผ่าน ต้องสั่งใหม่** (เคยเกิดมาแล้ว 15 ส.ค.)

Run: `curl -s -o /dev/null -w "%{http_code}" -L https://sookkaya-pos.vercel.app/login`
Expected: `200`

- [ ] **Step 6: รายงาน Boss**

บอกวิธีใช้: เปิดการ์ดคิวของเมนูนวดคลายเท้า & คอบ่าไหล่ 90 หรือ 120 นาที จะมีช่องเลือก
"ห้องช่วงครึ่งหลัง" ขึ้นมาเอง พร้อมบอกช่วงเวลาจริง · เว้นว่างได้ถ้าลูกค้ารีเควสอยู่ห้องเดียว

และแจ้งว่าข้อตรวจ `bed_double_booked` ที่ค้างมาตั้งแต่ 9 ส.ค. หายไปแล้วโดยไม่ได้แก้ข้อมูลเลย
เพราะคิวคู่นั้นไม่เคยผิด — ระบบต่างหากที่บันทึกความจริงไม่ครบ

- [ ] **Step 7: อัปเดตความจำโปรเจกต์**

บันทึกว่าการ์ดคิวถือได้สองห้องแล้ว สูตรกลางคือ `bedSegments()` ใน `src/lib/queue.ts`
ทุกจุดที่ถามว่าห้องว่างไหมต้องผ่านตัวนี้ · `firstClash` ใช้กับหมอ `firstBedClash` ใช้กับเตียง ·
จุดแบ่งคือครึ่งหนึ่งของ `duration_min` เสมอ · เมนูที่ย้ายห้องดูจาก `services.splits_room`
