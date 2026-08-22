# รู้จักลูกค้า (Customer Insights) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เร่งเก็บข้อมูลเพศ/วันเกิดผ่านท่อไลน์เดิม (เพิ่มทางเข้า 2 จุด) + แท็บ "กลุ่มลูกค้า" ในหน้าดูแลลูกค้า→วิเคราะห์ ที่ประกาศความครอบคลุมของข้อมูลตรงๆ เสมอ

**Architecture:** ไม่มี migration — ฝั่งเก็บข้อมูลแค่ขยายผลลัพธ์ของ action เดิมให้บอก `profileComplete` แล้วโชว์การ์ดชวนไปหน้าแต้ม (ฟอร์มเดิม) · ฝั่งวิเคราะห์เป็น server component ดึงบิล 90 วันผ่าน `fetchAllRows` (กันเพดานแถว) + ลูกค้า แล้วคำนวณด้วยฟังก์ชันบริสุทธิ์ใน `src/lib/demographics.ts` (TDD)

**Tech Stack:** Next.js 16 App Router · Supabase (PostgREST) · vitest

**Spec:** `docs/superpowers/specs/2026-08-21-customer-insights-design.md`

## Global Constraints

- นิยาม "โปรไฟล์ครบ" มีที่เดียว: `Boolean(birthday && gender)` (ตรงกับ `points-actions.ts:79`) — ห้ามเขียนนิยามที่สอง
- ห้ามเพิ่ม client round trip ใหม่ในหน้าจอง/หน้าการจองของฉัน — ขยายผลของ action ที่หน้าเรียกอยู่แล้วเท่านั้น
- ยอดใช้จ่ายใช้กติการายได้กลาง: `coalesce(revenue_recognize, net_amount)` ต่อบิล
- ดึงบิล 90 วันต้องผ่าน `fetchAllRows` (src/lib/fetch-all-rows.ts) พร้อม `order` ที่ปิดท้ายด้วยคอลัมน์ไม่ซ้ำ (`id`)
- แถว "ไม่ทราบ" ปรากฏเสมอเมื่อมีข้อมูลไม่ครบ ห้ามซ่อน · การ์ดความครอบคลุมอยู่บนสุดของแท็บ
- สิทธิ์แท็บกลุ่มลูกค้า = `canSeeInsights` (บังคับที่ `/crm` tab=insights อยู่แล้ว — ห้ามถอดด่านเดิม)
- commit message ภาษาไทย ห้ามระบุชื่อโมเดล AI · จบด้วย footer Co-Authored-By + Claude-Session ตามธรรมเนียมโปรเจกต์
- ก่อนเขียนโค้ดที่แตะ convention ของ Next ให้อ่าน `node_modules/next/dist/docs/` ก่อน (กติกา AGENTS.md)

---

### Task 1: ฟังก์ชันแจกแจงกลุ่มลูกค้า `src/lib/demographics.ts` (TDD)

**Files:**
- Create: `src/lib/demographics.ts`
- Test: `src/lib/demographics.test.ts`

**Interfaces:**
- Consumes: ไม่มี (ฟังก์ชันบริสุทธิ์)
- Produces (Task 4 ใช้):
  - `ageBucket(birthday: string | null, todayIso: string): string | null` — คืนป้ายช่วงอายุ หรือ `null` = ไม่ทราบ
  - `type GroupStat = { label: string; customers: number; revenue: number; avgPerCustomer: number; avgVisits: number }`
  - `type DemographicsResult = { population: number; unnamedBills: number; genderKnownPct: number; ageKnownPct: number; gender: GroupStat[]; age: GroupStat[]; nationality: GroupStat[] }`
  - `demographicBreakdown(customers: { id: string; gender: string | null; birthday: string | null; nationality: string | null }[], bills: { customer_id: string | null; net_amount: number | string; revenue_recognize: number | string | null }[], todayIso: string): DemographicsResult`

- [ ] **Step 1: เขียนเทสต์ให้ล้มก่อน**

```ts
// src/lib/demographics.test.ts
import { describe, expect, it } from "vitest"

import { ageBucket, demographicBreakdown } from "./demographics"

describe("ageBucket", () => {
  const today = "2026-08-21"

  it("แบ่งช่วงตามอายุจริง ณ วันนี้", () => {
    expect(ageBucket("2010-01-01", today)).toBe("ต่ำกว่า 20")
    expect(ageBucket("1998-05-10", today)).toBe("20-29")
    expect(ageBucket("1990-12-01", today)).toBe("30-39")
    expect(ageBucket("1980-01-15", today)).toBe("40-49")
    expect(ageBucket("1970-06-30", today)).toBe("50-59")
    expect(ageBucket("1960-02-02", today)).toBe("60+")
  })

  it("ขอบพอดี: ครบ 20/30 ปีวันนี้เข้าช่วงบน · พรุ่งนี้ค่อยครบยังอยู่ช่วงล่าง", () => {
    expect(ageBucket("2006-08-21", today)).toBe("20-29") // ครบ 20 วันนี้พอดี
    expect(ageBucket("2006-08-22", today)).toBe("ต่ำกว่า 20") // ครบ 20 พรุ่งนี้
    expect(ageBucket("1996-08-21", today)).toBe("30-39")
    expect(ageBucket("1996-08-22", today)).toBe("20-29")
  })

  it("วันเกิด 29 ก.พ. — ปีไม่มี 29 ก.พ. ถือว่าครบรอบเมื่อถึง 1 มี.ค. (แนวเดียวกับ daysUntilBirthday)", () => {
    // เกิด 2000-02-29 · วันนี้ 2026-02-28 → ยังไม่ครบ 26 = อายุ 25
    expect(ageBucket("2000-02-29", "2026-02-28")).toBe("20-29")
    // 2026-03-01 → ครบ 26 แล้ว (ยังช่วงเดิม แค่ยืนยันไม่พัง)
    expect(ageBucket("2000-02-29", "2026-03-01")).toBe("20-29")
  })

  it("ไม่มีวันเกิด → null (ไม่ทราบ)", () => {
    expect(ageBucket(null, today)).toBeNull()
  })
})

describe("demographicBreakdown", () => {
  const today = "2026-08-21"
  const cust = (
    id: string,
    gender: string | null,
    birthday: string | null,
    nationality: string | null = null
  ) => ({ id, gender, birthday, nationality })
  const bill = (
    customer_id: string | null,
    net: number,
    recognize: number | null = null
  ) => ({ customer_id, net_amount: net, revenue_recognize: recognize })

  it("นับลูกค้ายูนีค ยอดรวมทุกบิล และบิลไม่ระบุชื่อแยกไว้", () => {
    const r = demographicBreakdown(
      [cust("a", "หญิง", "1990-01-01"), cust("b", "ชาย", null)],
      [bill("a", 500), bill("a", 300), bill("b", 400), bill(null, 900)],
      today
    )
    expect(r.population).toBe(2)
    expect(r.unnamedBills).toBe(1)
    const female = r.gender.find((g) => g.label === "หญิง")!
    expect(female.customers).toBe(1)
    expect(female.revenue).toBe(800)
    expect(female.avgPerCustomer).toBe(800)
    expect(female.avgVisits).toBe(2)
  })

  it("รายได้ยึด revenue_recognize ก่อน net_amount (กติกากลาง) และรับค่า string จาก PostgREST", () => {
    const r = demographicBreakdown(
      [cust("a", "หญิง", null)],
      [{ customer_id: "a", net_amount: "1000", revenue_recognize: "250" }],
      today
    )
    expect(r.gender[0].revenue).toBe(250)
  })

  it("เพศ/อายุ/สัญชาติที่ไม่รู้ → แถว 'ไม่ทราบ' เสมอ และอยู่ท้ายลิสต์", () => {
    const r = demographicBreakdown(
      [cust("a", null, null), cust("b", "หญิง", "1990-01-01")],
      [bill("a", 100), bill("b", 100)],
      today
    )
    expect(r.gender[r.gender.length - 1].label).toBe("ไม่ทราบ")
    expect(r.age[r.age.length - 1].label).toBe("ไม่ทราบ")
    expect(r.nationality[r.nationality.length - 1].label).toBe("ไม่ทราบ")
  })

  it("ช่วงอายุเรียงตามลำดับช่วงเสมอ (ไม่ใช่ตามจำนวน)", () => {
    const r = demographicBreakdown(
      [cust("a", null, "1960-01-01"), cust("b", null, "1998-01-01")],
      [bill("a", 100), bill("b", 100)],
      today
    )
    expect(r.age.map((g) => g.label)).toEqual(["20-29", "60+", "ไม่ทราบ"])
  })

  it("เปอร์เซ็นต์ความครอบคลุมนับจากประชากรที่มีบิล ไม่ใช่ลูกค้าทั้งระบบ", () => {
    const r = demographicBreakdown(
      [
        cust("a", "หญิง", "1990-01-01"),
        cust("b", null, null),
        cust("no-bill", "ชาย", "1980-01-01"), // ไม่มีบิล — ต้องไม่ถูกนับ
      ],
      [bill("a", 100), bill("b", 100)],
      today
    )
    expect(r.population).toBe(2)
    expect(r.genderKnownPct).toBe(50)
    expect(r.ageKnownPct).toBe(50)
  })

  it("ไม่มีบิลเลย → ทุกอย่างเป็นศูนย์ ไม่มี NaN", () => {
    const r = demographicBreakdown([cust("a", "หญิง", null)], [], today)
    expect(r).toEqual({
      population: 0, unnamedBills: 0, genderKnownPct: 0, ageKnownPct: 0,
      gender: [], age: [], nationality: [],
    })
  })

  it("บิลของลูกค้าที่ไม่อยู่ในลิสต์ลูกค้า (ข้อมูลหลุดจังหวะ) → นับเป็นไม่ทราบ ไม่ throw", () => {
    const r = demographicBreakdown([], [bill("ghost", 100)], today)
    expect(r.population).toBe(1)
    expect(r.gender[0].label).toBe("ไม่ทราบ")
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run src/lib/demographics.test.ts`
Expected: FAIL (module `./demographics` ไม่มี)

- [ ] **Step 3: เขียน implementation ให้ผ่านขั้นต่ำ**

```ts
// src/lib/demographics.ts
/** แจกแจงกลุ่มลูกค้า (เพศ/ช่วงอายุ/สัญชาติ) จากบิลจริง — หัวใจของแท็บ "กลุ่มลูกค้า"
 *
 *  กติกาที่ตายตัว (สเปก 2026-08-21):
 *  · ประชากร = ลูกค้ายูนีคที่มีบิลในชุดที่ส่งเข้ามา (บิลไม่ระบุชื่อรายงานแยก)
 *  · รายได้ต่อบิล = coalesce(revenue_recognize, net_amount) — กติกากลางของทั้งระบบ
 *  · "ไม่ทราบ" เป็นแถวจริงเสมอและอยู่ท้ายลิสต์ — เห็นทั้งภาพและช่องว่างพร้อมกัน
 *  · % ความครอบคลุมนับจากประชากรที่มีบิล ไม่ใช่ลูกค้าทั้งระบบ */

const AGE_ORDER = ["ต่ำกว่า 20", "20-29", "30-39", "40-49", "50-59", "60+"] as const
const UNKNOWN = "ไม่ทราบ"

/** อายุเต็มปี ณ วันนี้ (เขตเวลาร้านคือคนส่ง todayIso เข้ามา) — เทียบเดือน/วันแบบ tuple
 *  ปีไม่มี 29 ก.พ.: (2,29) > (2,28) และ < (3,1) จึงครบรอบเมื่อถึง 1 มี.ค. โดยธรรมชาติ
 *  ตรงกับพฤติกรรม daysUntilBirthday ใน src/lib/crm.ts */
export function ageBucket(birthday: string | null, todayIso: string): string | null {
  if (!birthday) return null
  const [by, bm, bd] = birthday.split("-").map(Number)
  const [ty, tm, td] = todayIso.split("-").map(Number)
  if (!by || !bm || !bd) return null
  let age = ty - by
  if (tm < bm || (tm === bm && td < bd)) age -= 1
  if (age < 20) return AGE_ORDER[0]
  if (age < 30) return AGE_ORDER[1]
  if (age < 40) return AGE_ORDER[2]
  if (age < 50) return AGE_ORDER[3]
  if (age < 60) return AGE_ORDER[4]
  return AGE_ORDER[5]
}

export type GroupStat = {
  label: string
  customers: number
  revenue: number
  avgPerCustomer: number
  avgVisits: number
}

export type DemographicsResult = {
  population: number
  unnamedBills: number
  genderKnownPct: number
  ageKnownPct: number
  gender: GroupStat[]
  age: GroupStat[]
  nationality: GroupStat[]
}

type CustomerRow = {
  id: string
  gender: string | null
  birthday: string | null
  nationality: string | null
}
type BillRow = {
  customer_id: string | null
  net_amount: number | string
  revenue_recognize: number | string | null
}

export function demographicBreakdown(
  customers: CustomerRow[],
  bills: BillRow[],
  todayIso: string
): DemographicsResult {
  const custById = new Map(customers.map((c) => [c.id, c]))

  // ยอด/จำนวนครั้งต่อลูกค้า — รวมก่อนแล้วค่อยแจกเข้ากลุ่ม (ลูกค้าหนึ่งคนนับครั้งเดียวต่อมิติ)
  const perCustomer = new Map<string, { revenue: number; visits: number }>()
  let unnamedBills = 0
  for (const b of bills) {
    if (!b.customer_id) {
      unnamedBills++
      continue
    }
    const revenue = Number(b.revenue_recognize ?? b.net_amount) || 0
    const cur = perCustomer.get(b.customer_id) ?? { revenue: 0, visits: 0 }
    cur.revenue += revenue
    cur.visits += 1
    perCustomer.set(b.customer_id, cur)
  }

  const population = perCustomer.size
  if (population === 0) {
    return {
      population: 0, unnamedBills, genderKnownPct: 0, ageKnownPct: 0,
      gender: [], age: [], nationality: [],
    }
  }

  const round1 = (n: number) => Math.round(n * 10) / 10
  const build = (labelOf: (c: CustomerRow | undefined) => string | null) => {
    const groups = new Map<string, { customers: number; revenue: number; visits: number }>()
    for (const [customerId, stat] of perCustomer) {
      const label = labelOf(custById.get(customerId)) ?? UNKNOWN
      const g = groups.get(label) ?? { customers: 0, revenue: 0, visits: 0 }
      g.customers += 1
      g.revenue += stat.revenue
      g.visits += stat.visits
      groups.set(label, g)
    }
    return groups
  }
  const toStats = (
    groups: Map<string, { customers: number; revenue: number; visits: number }>,
    order: (a: string, b: string) => number
  ): GroupStat[] =>
    [...groups.entries()]
      .sort(([a], [b]) => {
        // "ไม่ทราบ" อยู่ท้ายเสมอ ไม่ว่าเรียงแบบไหน
        if (a === UNKNOWN) return 1
        if (b === UNKNOWN) return -1
        return order(a, b)
      })
      .map(([label, g]) => ({
        label,
        customers: g.customers,
        revenue: Math.round(g.revenue),
        avgPerCustomer: Math.round(g.revenue / g.customers),
        avgVisits: round1(g.visits / g.customers),
      }))

  const byCount = (groups: Map<string, { customers: number }>) =>
    (a: string, b: string) => (groups.get(b)!.customers - groups.get(a)!.customers) || a.localeCompare(b)
  const byAgeOrder = (a: string, b: string) =>
    AGE_ORDER.indexOf(a as (typeof AGE_ORDER)[number]) - AGE_ORDER.indexOf(b as (typeof AGE_ORDER)[number])

  const genderGroups = build((c) => c?.gender?.trim() || null)
  const ageGroups = build((c) => ageBucket(c?.birthday ?? null, todayIso))
  const nationGroups = build((c) => c?.nationality?.trim() || null)

  const knownPct = (groups: Map<string, { customers: number }>) =>
    Math.round(((population - (groups.get(UNKNOWN)?.customers ?? 0)) / population) * 100)

  return {
    population,
    unnamedBills,
    genderKnownPct: knownPct(genderGroups),
    ageKnownPct: knownPct(ageGroups),
    gender: toStats(genderGroups, byCount(genderGroups)),
    age: toStats(ageGroups, byAgeOrder),
    nationality: toStats(nationGroups, byCount(nationGroups)),
  }
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/lib/demographics.test.ts`
Expected: PASS ทุกเคส

- [ ] **Step 5: Commit**

```bash
git add src/lib/demographics.ts src/lib/demographics.test.ts
git commit -m "feat(crm): ฟังก์ชันแจกแจงกลุ่มลูกค้า เพศ/ช่วงอายุ/สัญชาติ จากบิลจริง"
```

---

### Task 2: หน้าจองชวนกรอกโปรไฟล์หลังจองสำเร็จ

**Files:**
- Modify: `src/app/book/actions.ts` (getLineStatus — เพิ่ม `profileComplete`)
- Modify: `src/app/book/wizard.tsx` (state + การ์ดใน done view)

**Interfaces:**
- Consumes: `getLineStatus(idToken)` เดิม
- Produces: `getLineStatus` คืน `{ ok: true; linked: true; customerName: string; profileComplete: boolean }`
  (Task 3 ไม่ใช้ตัวนี้ — mine ใช้ getMyBookings)

- [ ] **Step 1: ขยาย getLineStatus** — ใน `src/app/book/actions.ts` แก้ type และ select:

```ts
/** สถานะบัญชีไลน์: ผูกกับลูกค้าแล้วหรือยัง (เรียกตอนเปิดหน้า /book)
 *  profileComplete ติดมากับคำตอบเดิม — หน้าจองใช้ตัดสินว่าจะชวนกรอกโปรไฟล์ไหม
 *  โดยไม่ต้องยิงเพิ่มอีกรอบ (ห้ามเพิ่ม round trip — สเปก 2026-08-21) */
export async function getLineStatus(idToken: string): Promise<
  | { ok: true; linked: true; customerName: string; profileComplete: boolean }
  | { ok: true; linked: false; displayName: string | null }
  | Fail
> {
  const who = await verifyLineIdToken(idToken)
  if (!who) return AUTH_FAIL
  const db = createServiceClient()
  const { data } = await db
    .from("line_accounts")
    .select("customer_id, customers(name, birthday, gender)")
    .eq("line_user_id", who.userId)
    .maybeSingle()
  if (data) {
    const profile = (
      data as unknown as {
        customers: { name: string; birthday: string | null; gender: string | null } | null
      }
    ).customers
    return {
      ok: true,
      linked: true,
      customerName: cleanLineDisplayName(profile?.name) ?? "",
      // นิยามเดียวกับหน้าแต้ม (points-actions.ts) — ห้ามมีนิยามที่สอง
      profileComplete: Boolean(profile?.birthday && profile?.gender),
    }
  }
  return { ok: true, linked: false, displayName: cleanLineDisplayName(who.displayName) }
}
```

- [ ] **Step 2: wizard เก็บสถานะและแสดงการ์ด** — ใน `src/app/book/wizard.tsx`:

เพิ่ม state ข้างๆ `linked` (ราวบรรทัด 36):

```ts
  // โปรไฟล์ยังไม่ครบ (เพศ/วันเกิด) — ใช้ชวนกรอกหลังจองสำเร็จ ไม่รบกวนระหว่างจอง
  const [profileIncomplete, setProfileIncomplete] = useState(false)
```

ใน `.then()` ของ `getLineStatus` (ราวบรรทัด 66-72) หลัง `setLinked(r.linked)`:

```ts
      if (r.linked) setProfileIncomplete(!r.profileComplete)
```

ใน done view (ราวบรรทัด 154-163) เพิ่มการ์ดชวน **ก่อน**ลิงก์ "ดูการจองของฉัน":

```tsx
        {profileIncomplete && (
          // ชวนตอนจบเท่านั้น — ระหว่างจองห้ามมีอะไรคั่น (ลูกค้ากำลังจะจ่ายเงินให้ร้าน)
          <Link
            href="/book/points"
            className="mt-4 block rounded-xl bg-[#FFF0D1] px-4 py-3 text-left"
          >
            <p className="text-sm font-semibold text-[#664343]">
              กรอกโปรไฟล์ 1 นาที รับสิทธิ์แต้มสะสม 🌿
            </p>
            <p className="mt-0.5 text-xs text-[#664343]/80">
              บอกวันเกิดไว้ มีของขวัญวันเกิดจากร้านด้วยนะคะ
            </p>
          </Link>
        )}
```

- [ ] **Step 3: ตรวจด้วยมือ + อัตโนมัติ**

Run: `npx tsc --noEmit && npm run lint && npm run test`
Expected: ผ่านหมด (ไม่มีเทสต์ UI สำหรับ wizard — โปรเจกต์นี้ไม่มี react testing lib; ความถูกของ logic อยู่ที่ `profileComplete` ซึ่งเป็นนิยามบรรทัดเดียว)

- [ ] **Step 4: Commit**

```bash
git add src/app/book/actions.ts src/app/book/wizard.tsx
git commit -m "feat(book): ชวนกรอกโปรไฟล์หลังจองสำเร็จ — พาไปฟอร์มเดิมของหน้าแต้ม"
```

---

### Task 3: หน้า "การจองของฉัน" ชวนกรอกโปรไฟล์

**Files:**
- Modify: `src/app/book/actions.ts` (getMyBookings — เพิ่ม `profileComplete`)
- Modify: `src/app/book/mine/page.tsx` (แถบชวนเหนือรายการ)

**Interfaces:**
- Consumes: `getMyBookings(idToken)` เดิม
- Produces: ผลลัพธ์ ok เพิ่ม field `profileComplete: boolean`
  → `{ ok: true; upcoming: MyBooking[]; past: MyBooking[]; profileComplete: boolean }`

- [ ] **Step 1: ขยาย getMyBookings** — ใน `src/app/book/actions.ts` เปลี่ยน return type และเพิ่ม query โปรไฟล์ (query ที่สองอยู่ใน action เดียวกัน — ฝั่ง client ยังยิงครั้งเดียวเท่าเดิม):

```ts
export async function getMyBookings(idToken: string): Promise<
  { ok: true; upcoming: MyBooking[]; past: MyBooking[]; profileComplete: boolean } | Fail
> {
```

และก่อน `return { ok: true, upcoming, past }` เดิม เพิ่ม:

```ts
  // โปรไฟล์ครบหรือยัง — หน้า "การจองของฉัน" ใช้ตัดสินว่าจะโชว์แถบชวนกรอกไหม
  // นิยามเดียวกับหน้าแต้ม (points-actions.ts) — ห้ามมีนิยามที่สอง
  const { data: account } = await db
    .from("line_accounts")
    .select("customers(birthday, gender)")
    .eq("line_user_id", who.userId)
    .maybeSingle()
  const profile = (
    account as unknown as {
      customers: { birthday: string | null; gender: string | null } | null
    } | null
  )?.customers
  const profileComplete = Boolean(profile?.birthday && profile?.gender)

  return { ok: true, upcoming, past, profileComplete }
```

- [ ] **Step 2: แถบชวนในหน้า mine** — ใน `src/app/book/mine/page.tsx`:

เพิ่ม state (ข้าง `past` ราวบรรทัด 65): `const [profileIncomplete, setProfileIncomplete] = useState(false)`

ใน `load` callback หลัง `setUpcoming(r.upcoming); setPast(r.past)`:

```ts
      setProfileIncomplete(!r.profileComplete)
```

ใน JSX ใต้ `<h2 className="font-bold">การจองของฉัน</h2>` เพิ่ม:

```tsx
      {profileIncomplete && (
        <Link
          href="/book/points"
          className="block rounded-xl bg-[#FFF0D1] px-4 py-3"
        >
          <p className="text-sm font-semibold text-[#664343]">
            กรอกโปรไฟล์ 1 นาที รับสิทธิ์แต้มสะสม 🌿
          </p>
          <p className="mt-0.5 text-xs text-[#664343]/80">
            บอกวันเกิดไว้ มีของขวัญวันเกิดจากร้านด้วยนะคะ
          </p>
        </Link>
      )}
```

(ตรวจว่ามี `import Link from "next/link"` แล้ว — ถ้าไม่มีให้เพิ่ม)

- [ ] **Step 3: ตรวจ**

Run: `npx tsc --noEmit && npm run lint && npm run test`
Expected: ผ่านหมด

- [ ] **Step 4: Commit**

```bash
git add src/app/book/actions.ts src/app/book/mine/page.tsx
git commit -m "feat(book): แถบชวนกรอกโปรไฟล์ในหน้าการจองของฉัน"
```

---

### Task 4: แท็บ "กลุ่มลูกค้า" ใน /crm?tab=insights&sub=demo

**Files:**
- Create: `src/app/(app)/crm/demographics-view.tsx`
- Modify: `src/app/(app)/crm/customer-insights.tsx` (sub-tab ที่สาม + สลับ view)

**Interfaces:**
- Consumes: `demographicBreakdown`, `ageBucket` (Task 1) · `fetchAllRows` (src/lib/fetch-all-rows.ts) · `todayInShopTz` · `formatBaht`
- Produces: `DemographicsView` — async server component ไม่มี props

- [ ] **Step 1: สร้าง DemographicsView**

```tsx
// src/app/(app)/crm/demographics-view.tsx
import { createClient } from "@/lib/supabase/server"
import { fetchAllRows } from "@/lib/fetch-all-rows"
import { demographicBreakdown, type GroupStat } from "@/lib/demographics"
import { todayInShopTz } from "@/lib/datetime"
import { formatBaht } from "@/lib/constants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** เกณฑ์ป้ายเตือน: ความครอบคลุมต่ำกว่านี้ = ตัวเลขยังไม่แทนภาพรวมร้าน (สเปก 2026-08-21) */
const LOW_COVERAGE_PCT = 30

/**
 * แท็บ "กลุ่มลูกค้า" — เพศ/ช่วงอายุ/สัญชาติของลูกค้าที่ใช้บริการ 90 วันล่าสุด
 *
 * การ์ดความครอบคลุมต้องอยู่บนสุดเสมอ: วันนี้ข้อมูลเพศมีแค่ ~12% ของลูกค้าที่มีบิล
 * กราฟที่ดูน่าเชื่อถือบนฐานข้อมูลบางคืออันตรายกว่าไม่มีกราฟ — ผู้อ่านต้องเห็น
 * ข้อจำกัดก่อนเห็นตัวเลข (สเปก 2026-08-21)
 */
export async function DemographicsView() {
  const supabase = await createClient()
  const today = todayInShopTz()
  const from = shiftDate(today, -90)

  // บิล 90 วันอาจเกินเพดานแถว PostgREST — ต้องดึงผ่าน fetchAllRows เสมอ
  // (เคยได้ยอดขาด 83,631 บาทมาแล้วจากการดึงตรง — ดู src/lib/fetch-all-rows.ts)
  const bills = await fetchAllRows((offset, limit) =>
    supabase
      .from("sales")
      .select("customer_id, net_amount, revenue_recognize", { count: "exact" })
      .gte("sale_date", from)
      .order("id")
      .range(offset, offset + limit - 1)
  )

  const customerIds = [...new Set(bills.map((b) => b.customer_id).filter(Boolean))] as string[]
  const customers = customerIds.length
    ? await fetchAllRows((offset, limit) =>
        supabase
          .from("customers")
          .select("id, gender, birthday, nationality", { count: "exact" })
          .in("id", customerIds)
          .order("id")
          .range(offset, offset + limit - 1)
      )
    : []

  // ความคืบหน้าการเก็บข้อมูล (การ์ดท้ายหน้า) — เทียบ baseline 21/8/2569: ผูกไลน์ 140 / ครบ 90
  const [{ count: linkedCount }, { count: completeCount }] = await Promise.all([
    supabase.from("line_accounts").select("line_user_id", { count: "exact", head: true }),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .not("gender", "is", null)
      .not("birthday", "is", null),
  ])

  const r = demographicBreakdown(customers, bills, today)
  const lowCoverage = r.genderKnownPct < LOW_COVERAGE_PCT || r.ageKnownPct < LOW_COVERAGE_PCT

  return (
    <div className="space-y-4">
      {/* การ์ดความครอบคลุม — บนสุดเสมอ ห้ามย้าย (สเปก) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            ลูกค้าที่ใช้บริการ 90 วันล่าสุด {r.population} คน
          </CardTitle>
          {r.unnamedBills > 0 && (
            <p className="text-xs text-slate-500">
              (บิลไม่ระบุชื่ออีก {r.unnamedBills} ใบ ไม่อยู่ในตัวเลขนี้)
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          <CoverageBar label="รู้เพศ" pct={r.genderKnownPct} />
          <CoverageBar label="รู้อายุ" pct={r.ageKnownPct} />
          {lowCoverage && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              ⚠️ ตัวเลขด้านล่างมาจากลูกค้าส่วนน้อยที่มีข้อมูล อาจไม่แทนภาพรวมร้าน —
              ยิ่งลูกค้าผูกไลน์และกรอกโปรไฟล์มาก ตัวเลขยิ่งเชื่อถือได้
            </p>
          )}
        </CardContent>
      </Card>

      <BreakdownCard title="เพศ" rows={r.gender} />
      <BreakdownCard title="ช่วงอายุ" rows={r.age} />
      <BreakdownCard title="สัญชาติ" rows={r.nationality} />

      {/* ความคืบหน้าการเก็บข้อมูล — ไว้ดูว่าตัวชวนกรอกในไลน์ทำงานไหม */}
      <Card>
        <CardContent className="py-3 text-sm text-slate-600">
          การเก็บข้อมูล: ผูกไลน์แล้ว{" "}
          <span className="font-semibold">{linkedCount ?? 0}</span> คน · โปรไฟล์ครบ{" "}
          <span className="font-semibold">{completeCount ?? 0}</span> คน
          <span className="text-xs text-slate-400">
            {" "}(21 ส.ค. 2569 อยู่ที่ 140 / 90 — เพิ่มขึ้น = ตัวชวนในไลน์ทำงาน)
          </span>
        </CardContent>
      </Card>
    </div>
  )
}

function CoverageBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-14 shrink-0 text-slate-600">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-2 rounded-full ${pct >= 50 ? "bg-emerald-500" : pct >= 30 ? "bg-amber-500" : "bg-red-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-12 shrink-0 text-right font-medium tabular-nums">{pct}%</span>
    </div>
  )
}

function BreakdownCard({ title, rows }: { title: string; rows: GroupStat[] }) {
  if (rows.length === 0) return null
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-slate-500">
              <th className="py-1.5 font-medium">กลุ่ม</th>
              <th className="py-1.5 text-right font-medium">คน</th>
              <th className="py-1.5 text-right font-medium">ยอดรวม</th>
              <th className="py-1.5 text-right font-medium">เฉลี่ย/คน</th>
              <th className="py-1.5 text-right font-medium">ครั้ง/คน</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr
                key={g.label}
                className={`border-b last:border-0 ${g.label === "ไม่ทราบ" ? "text-slate-400" : ""}`}
              >
                <td className="py-1.5">{g.label}</td>
                <td className="py-1.5 text-right tabular-nums">{g.customers}</td>
                <td className="py-1.5 text-right tabular-nums">{formatBaht(g.revenue)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatBaht(g.avgPerCustomer)}</td>
                <td className="py-1.5 text-right tabular-nums">{g.avgVisits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: เสียบ sub-tab** — ใน `src/app/(app)/crm/customer-insights.tsx`:

แก้บรรทัดตัดสิน tab (บรรทัด 25):

```ts
  const tab = sub === "dormant" ? "dormant" : sub === "demo" ? "demo" : "ltv"
```

เพิ่ม import: `import { DemographicsView } from "./demographics-view"`

หลังบรรทัดตัดสิน tab เพิ่ม early branch (ก่อน query LTV เดิม — แท็บ demo ไม่ต้องจ่ายค่า query ที่ไม่ใช้):

```tsx
  if (tab === "demo") {
    return (
      <div className="space-y-3">
        <nav className="flex gap-2">
          <SubTabLink href="/crm?tab=insights" label="ยอดสะสมสูงสุด" active={false} />
          <SubTabLink href="/crm?tab=insights&sub=dormant&days=60" label="หายไปนาน" active={false} />
          <SubTabLink href="/crm?tab=insights&sub=demo" label="กลุ่มลูกค้า" active />
        </nav>
        <DemographicsView />
      </div>
    )
  }
```

และในแถบ nav เดิม (ราวบรรทัด 64-70) เพิ่มลิงก์ที่สาม:

```tsx
        <SubTabLink href="/crm?tab=insights&sub=demo" label="กลุ่มลูกค้า" active={false} />
```

หมายเหตุ: ต้องดูโครง JSX จริงของ nav เดิมก่อนแก้ — คงรูปแบบ props ของ `SubTabLink` ตามที่ไฟล์นั้นใช้ (href/label/active) ห้ามเปลี่ยน signature

- [ ] **Step 3: ตรวจ build + สิทธิ์**

Run: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
Expected: ผ่านหมด · ยืนยันในโค้ด `page.tsx` ว่า tab=insights ผ่าน `canSeeInsights` ก่อนถึง `CustomerInsights` (มีอยู่แล้ว — แค่ยืนยัน ไม่แก้)

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/crm/demographics-view.tsx" "src/app/(app)/crm/customer-insights.tsx"
git commit -m "feat(crm): แท็บกลุ่มลูกค้า — เพศ/ช่วงอายุ/สัญชาติ พร้อมการ์ดความครอบคลุม"
```

---

### Task 5: ปิดงาน — ตรวจเทียบข้อมูลจริง + PR

**Files:**
- ไม่มีไฟล์ใหม่ (ตรวจ + เอกสาร PR)

**Interfaces:** —

- [ ] **Step 1: ตรวจเทียบ SQL ตรงกับหน้าจอ (เกณฑ์ตรวจรับข้อ 3)**

รัน SQL ผ่าน Supabase MCP เทียบกับตัวเลขที่ฟังก์ชันคำนวณ:

```sql
with bills as (
  select customer_id, coalesce(revenue_recognize, net_amount) as rev
  from sales
  where sale_date >= (now() at time zone 'Asia/Bangkok')::date - 90
)
select
  count(distinct customer_id) as population,
  count(*) filter (where customer_id is null) as unnamed_bills,
  round(100.0 * count(distinct customer_id) filter (
    where exists (select 1 from customers c where c.id = bills.customer_id and c.gender is not null)
  ) / nullif(count(distinct customer_id), 0)) as gender_known_pct
from bills;
```

เทียบ population / unnamedBills / genderKnownPct กับผลของ `demographicBreakdown`
บนข้อมูลเดียวกัน (เขียนสคริปต์ชั่วคราวหรือเทียบกับหน้าจอจริงหลัง deploy) — ต้องตรงเป๊ะ
ถ้าไม่ตรง ห้ามปิดงาน ให้หาสาเหตุก่อน

- [ ] **Step 2: รันชุดตรวจเต็ม**

Run: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
Expected: ผ่านหมด (เทสต์เดิม + ใหม่)

- [ ] **Step 3: เปิด PR (ยังไม่ merge — เจ้าของร้านสั่ง merge เอง ตามธรรมเนียมช่วงหลัง)**

สรุปใน PR: ปัญหา (ข้อมูล 8%) · ตัวเร่ง 2 จุด · แท็บใหม่อยู่ไหน · กติกาที่ล็อก
(นิยามโปรไฟล์ครบที่เดียว, กติการายได้กลาง, fetchAllRows, ไม่ทราบไม่ซ่อน) · ผลตรวจเทียบ SQL

- [ ] **Step 4: อัปเดตสถานะสเปกเป็น "implement แล้ว" พร้อมหมายเหตุ deviation (ถ้ามี) แล้ว commit**
