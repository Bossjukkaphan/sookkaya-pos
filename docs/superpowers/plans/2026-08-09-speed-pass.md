# Speed Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้ทุกการกดเมนูเห็นการตอบสนองภายใน ~100ms และลด round trip ของ layout จาก ~5 เหลือ 1 โดยไม่แตะกติกาธุรกิจใดๆ

**Architecture:** สามเฟสแยก deploy อิสระ — (1) `loading.tsx` + skeleton ทุกหน้า (2) Postgres RPC `layout_bootstrap()` แทน query 4 ชุดของ layout (3) cache ข้อมูลกึ่งนิ่งแบบ tag (`unstable_cache` + `updateTag`) และรวม query ที่รอกันโดยไม่จำเป็นเป็น `Promise.all`

**Tech Stack:** Next.js 16 (App Router, **ไม่เปิด** `cacheComponents`), Supabase (Postgres + RLS), vitest, TypeScript

**Spec:** `docs/superpowers/specs/2026-08-09-speed-pass-design.md`

## Global Constraints

- **Next.js 16 ไม่เหมือนรุ่นที่จำได้** — ก่อนแตะไฟล์ใดให้อ่าน guide ใน `node_modules/next/dist/docs/` (ถ้า `node_modules` หาย ให้ `npm ci` ก่อน) API ที่ตรวจแล้วจากเอกสารรุ่นนี้:
  - `unstable_cache(fn, keyParts, { tags })` ยังใช้ได้ (guide: `01-app/02-guides/caching-without-cache-components.md`) — เราใช้ตัวนี้ **ไม่ใช้** directive `"use cache"` เพราะต้องเปิด `cacheComponents: true` ซึ่งเปลี่ยนโมเดล render ทั้งแอป (เกินขอบเขต Speed Pass)
  - `updateTag(tag)` (จาก `next/cache`) — expire ทันที ใช้ได้เฉพาะใน Server Actions → ตรงกับที่สเปกสัญญา "บันทึกแล้วไม่มีทางเห็นข้อมูลเก่า" (`revalidateTag` แบบ arg เดียว deprecated, แบบ `profile:"max"` เป็น stale-while-revalidate ซึ่งขัดสัญญาสเปก — ห้ามใช้)
- **Migration ทำผ่าน Supabase MCP `apply_migration` เท่านั้น** แล้วเก็บสำเนา SQL ลง `supabase/migrations/<version>_<name>.sql` ให้ชื่อตรงกับที่ MCP บันทึก — **ห้าม** `supabase db push` / `db reset` เด็ดขาด (ดู README)
- **กติกาธุรกิจต้องเหมือนเดิมเป๊ะ**: นับคิว pending ทุกรายการไม่กรองวัน · วันเกิดกติกาเดียวกับ `/crm` (`daysUntilBirthday === 0`, มีเบอร์, ไม่ถูกบันทึกผล birthday ใน 30 วัน) · เตือนรายจ่ายกติกา `expense-reminders.ts` (รอบ 10/20/สิ้นเดือน, ขั้นต่ำ 10,000, หน้าต่าง D-3)
- Node อยู่ที่ `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"` (ถ้า `npm` ไม่อยู่ใน PATH)
- ทุก task จบด้วย `npm run test` และ `npm run lint` ผ่าน แล้ว commit (ข้อความ commit ภาษาไทยตามสไตล์ repo เช่น `feat(speed): ...`)
- comment ในโค้ดเป็นภาษาไทย อธิบาย "ทำไม" ตามสไตล์เดิมของ repo
- งานทั้งหมดอยู่บน branch `claude/system-improvement-brainstorm-102o97`

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `scripts/measure-ttfb.mjs` (สร้าง) | วัด TTFB ก่อน-หลัง ใช้ session cookie จาก env |
| `docs/ops/speed-pass-measurements.md` (สร้าง) | บันทึกตัวเลข baseline และหลังแก้ |
| `src/components/page-skeleton.tsx` (สร้าง) | บล็อก skeleton ใช้ร่วม โทนสีแบรนด์ |
| `src/app/(app)/loading.tsx` (สร้าง) | skeleton กลางของทุกหน้าในโซนพนักงาน |
| `src/app/(app)/{today,queue,pos,overview}/loading.tsx` (สร้าง) | skeleton เฉพาะทาง 4 หน้าหลัก |
| `supabase/migrations/<version>_layout_bootstrap.sql` (สร้าง) | RPC รวม query ของ layout |
| `src/lib/layout-bootstrap.ts` + `.test.ts` (สร้าง) | wrapper ฝั่ง TS: เรียก RPC, แปลงผล, map label |
| `src/app/(app)/layout.tsx` (แก้) | ใช้ wrapper แทน query 4 ชุดเดิม |
| `src/lib/cached-lookups.ts` (สร้าง) | ตัวอ่าน therapists/services/settings ผ่าน `unstable_cache` |
| `src/lib/supabase/service.ts` (แก้ comment) | เพิ่ม cached-lookups เป็นผู้เรียกที่อนุญาต |
| `src/app/(app)/settings/settings-actions.ts` (แก้) + `.test.ts` (สร้าง) | ยิง `updateTag` ตอนบันทึก |
| `src/app/(app)/{pos,queue,today,overview,history}/page.tsx` (แก้) | ใช้ cached lookups + รวม `Promise.all` |
| `src/types/database.ts` (regenerate) | เพิ่ม type ของ RPC ใหม่ |

---

### Task 1: สคริปต์วัดผล + บันทึก baseline

**Files:**
- Create: `scripts/measure-ttfb.mjs`
- Create: `docs/ops/speed-pass-measurements.md`

**Interfaces:**
- Produces: สคริปต์รันด้วย `node scripts/measure-ttfb.mjs` อ่าน env `MEASURE_BASE_URL` (default `https://sookkaya-pos.vercel.app`) และ `MEASURE_COOKIE` (คุกกี้ session ทั้งก้อน — ไม่บังคับ)

- [ ] **Step 1: เขียนสคริปต์**

```js
// scripts/measure-ttfb.mjs
// วัด TTFB ของหน้าหลัก ก่อน-หลัง Speed Pass — รัน 5 รอบเอาค่ามัธยฐาน กัน jitter รอบเดียวหลอกตา
// ใช้: MEASURE_COOKIE='sb-...=...' node scripts/measure-ttfb.mjs
const BASE = process.env.MEASURE_BASE_URL ?? "https://sookkaya-pos.vercel.app"
const COOKIE = process.env.MEASURE_COOKIE ?? ""
// ไม่มีคุกกี้วัดได้แค่ /login — หน้าในระบบโดน proxy เด้งไป /login ตัวเลขจะไม่ใช่ของจริง
const PAGES = COOKIE ? ["/", "/today", "/pos", "/queue", "/overview", "/history"] : ["/login"]
const ROUNDS = 5

async function ttfb(path) {
  const start = performance.now()
  const res = await fetch(BASE + path, {
    headers: COOKIE ? { cookie: COOKIE } : {},
    redirect: "manual",
  })
  await res.body?.getReader().read() // byte แรกของ body = TTFB จริง ไม่ใช่แค่ header
  return { ms: performance.now() - start, status: res.status }
}

for (const page of PAGES) {
  const runs = []
  for (let i = 0; i < ROUNDS; i++) runs.push(await ttfb(page))
  const sorted = runs.map((r) => r.ms).sort((a, b) => a - b)
  const median = sorted[Math.floor(ROUNDS / 2)]
  console.log(
    `${page.padEnd(12)} median ${median.toFixed(0)}ms  (status ${runs[0].status}, ${ROUNDS} รอบ: ${sorted.map((m) => m.toFixed(0)).join(" ")})`
  )
}
```

- [ ] **Step 2: รันเก็บ baseline**

Run: `node scripts/measure-ttfb.mjs` (ถ้ามี `MEASURE_COOKIE` ให้ใส่ด้วย — สถานะ 200 คือวัดได้จริง, 307 แปลว่าคุกกี้ใช้ไม่ได้/หมดอายุ ให้บันทึกไว้ตรงๆ ว่าวัดโหมดไหน)
Expected: ตารางค่ามัธยฐานต่อหน้า

- [ ] **Step 3: บันทึกผลลง `docs/ops/speed-pass-measurements.md`**

```markdown
# Speed Pass — ตัวเลขวัดจริง

เป้า: skeleton ภายใน ~100ms หลังกด · เนื้อหาจริง ~1s บนมือถือ 4G

## Baseline (ก่อนแก้ — วันที่วัด: <ใส่วันที่>)

| หน้า | TTFB มัธยฐาน | หมายเหตุ |
|---|---|---|
| <ผลจากสคริปต์> | | วัดด้วยคุกกี้จริง/วัดได้แค่ /login (ระบุ) |

จำนวนจังหวะรอเรียงกัน (นับจากโค้ด ณ baseline):
- layout: auth.getUser → profiles → Promise.all(queue/birthday/expense) = 3 จังหวะ (~5 query)
- ไม่มี loading.tsx ในทุก route · Suspense มีแค่ commission/summary

## หลังเฟส 1 / 2 / 3 (เติมเมื่อวัดซ้ำ)
```

- [ ] **Step 4: ตรวจและ commit**

Run: `npm run lint && npm run test`
Expected: ผ่านทั้งคู่ (สคริปต์ .mjs อยู่นอก src ไม่กระทบ)

```bash
git add scripts/measure-ttfb.mjs docs/ops/speed-pass-measurements.md
git commit -m "chore(speed): สคริปต์วัด TTFB + บันทึก baseline ก่อนยกเครื่อง"
```

---

### Task 2: บล็อก skeleton ใช้ร่วม + loading กลางของโซน (app)

**Files:**
- Create: `src/components/page-skeleton.tsx`
- Create: `src/app/(app)/loading.tsx`

**Interfaces:**
- Produces: `SkeletonBar({ className })`, `SkeletonCard({ lines, className })`, `PageSkeleton()` — Task 3 ใช้ประกอบ skeleton เฉพาะทาง

**ก่อนเริ่ม:** อ่าน `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md` — ยืนยันว่า `loading.tsx` ระดับ `(app)/` ครอบทุก route ลูกที่ไม่มี loading ของตัวเอง

- [ ] **Step 1: เขียน component**

```tsx
// src/components/page-skeleton.tsx
import { cn } from "@/lib/utils"

/**
 * บล็อก skeleton โทนแบรนด์ (น้ำตาลแดง #664343 จางบนพื้นครีม) — ไม่ใช้เทา default
 * ให้ทุกหน้าประกอบจากชิ้นเดียวกัน หน้าตาระหว่างรอจะได้เป็นระบบเดียว
 */
export function SkeletonBar({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-[#664343]/10", className)}
      aria-hidden
    />
  )
}

export function SkeletonCard({
  lines = 3,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={cn("space-y-2.5 rounded-lg border border-[#664343]/10 p-4", className)}>
      <SkeletonBar className="h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBar key={i} className="h-3.5 w-full" />
      ))}
    </div>
  )
}

/** skeleton กลาง — หัวเรื่อง + การ์ดเนื้อหา ใช้กับหน้าที่ไม่มีโครงเฉพาะทาง */
export function PageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="กำลังโหลด">
      <SkeletonBar className="h-7 w-44" />
      <SkeletonCard lines={4} />
      <SkeletonCard lines={6} />
    </div>
  )
}
```

- [ ] **Step 2: loading กลาง**

```tsx
// src/app/(app)/loading.tsx
import { PageSkeleton } from "@/components/page-skeleton"

/** โผล่ทันทีที่กดเมนู — ทุกหน้าในโซนพนักงานที่ไม่มี loading เฉพาะทางใช้ตัวนี้ */
export default function Loading() {
  return <PageSkeleton />
}
```

- [ ] **Step 3: ตรวจ build**

Run: `npm run lint && npm run test && npm run build`
Expected: ผ่านทั้งหมด (build จะ error ถ้าวางไฟล์ผิด convention)

- [ ] **Step 4: Commit**

```bash
git add src/components/page-skeleton.tsx "src/app/(app)/loading.tsx"
git commit -m "feat(speed): skeleton กลางทุกหน้า — กดเมนูแล้วเห็นตอบสนองทันที"
```

---

### Task 3: skeleton เฉพาะทาง 4 หน้าหลัก

**Files:**
- Create: `src/app/(app)/today/loading.tsx`
- Create: `src/app/(app)/queue/loading.tsx`
- Create: `src/app/(app)/pos/loading.tsx`
- Create: `src/app/(app)/overview/loading.tsx`

**Interfaces:**
- Consumes: `SkeletonBar`, `SkeletonCard` จาก `@/components/page-skeleton`

**ก่อนเริ่ม:** เปิด `page.tsx` ของแต่ละหน้าดูโครงจริงคร่าวๆ (แถวหัว, ตาราง/การ์ด/ฟอร์ม) แล้ววาง skeleton ให้เงาตามโครงนั้น — ไม่ต้องเป๊ะทุกช่อง เอาแค่ผู้ใช้รู้ว่า "หน้าที่กำลังมาคือหน้าเดิมที่คุ้น"

- [ ] **Step 1: เขียนทั้ง 4 ไฟล์** (ตัวอย่าง `today` — อีก 3 หน้าใช้แพตเทิร์นเดียวกันแต่โครงต่างกัน: `queue` = การ์ดคิวเรียงเป็นกริด, `pos` = ฟอร์มช่องกรอกเรียงลง, `overview` = แถวการ์ดตัวเลข 3-4 ใบ + กราฟ)

```tsx
// src/app/(app)/today/loading.tsx
import { SkeletonBar } from "@/components/page-skeleton"

/** เงาโครงหน้า "วันนี้" — แถบหัว + แถวรายการขาย ให้รู้ว่ากำลังมาหน้าเดิมที่คุ้น */
export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="กำลังโหลด">
      <div className="flex items-center justify-between">
        <SkeletonBar className="h-7 w-36" />
        <SkeletonBar className="h-9 w-28" />
      </div>
      <div className="flex gap-2">
        <SkeletonBar className="h-8 w-24" />
        <SkeletonBar className="h-8 w-24" />
        <SkeletonBar className="h-8 w-24" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonBar key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: ตรวจ build**

Run: `npm run lint && npm run test && npm run build`
Expected: ผ่านทั้งหมด

- [ ] **Step 3: Commit — จบเฟส 1**

```bash
git add "src/app/(app)/today/loading.tsx" "src/app/(app)/queue/loading.tsx" "src/app/(app)/pos/loading.tsx" "src/app/(app)/overview/loading.tsx"
git commit -m "feat(speed): skeleton เฉพาะทาง today/queue/pos/overview"
```

---

### Task 4: Migration — RPC `layout_bootstrap()`

**Files:**
- Create: `supabase/migrations/<version>_layout_bootstrap.sql` (version = timestamp ที่ MCP บันทึกจริง)
- Regenerate: `src/types/database.ts` (ผ่าน MCP `generate_typescript_types`)

**Interfaces:**
- Produces: RPC `public.layout_bootstrap(p_today date) returns jsonb` โครงผลลัพธ์:
  `{ "profile": {"id","email","full_name","role"} | null, "pending_count": number, "birthdays": [{"id","name","nickname"}], "expense_reminders": [{"duty":"therapist_fee"|"salary", "due":"YYYY-MM-DD"}] }`
  — `expense_reminders` ส่ง `due` ดิบ ให้ฝั่ง TS แปลงเป็น label เอง (`expenseReminderLabel()` มีอยู่แล้ว จะได้ไม่ต้องก๊อปข้อความไทยลง SQL)

- [ ] **Step 1: เขียน SQL**

```sql
-- RPC รวมข้อมูล layout ทุกหน้าให้เหลือ round trip เดียว (เดิม ~5 query เรียงกัน)
-- SECURITY INVOKER: วิ่งใต้ RLS ของผู้เรียกเหมือน query เดิมทุกประการ — สิทธิ์ไม่เปลี่ยน
-- กติกาต้องตรงกับ TS เป๊ะ: birthdayTodayCustomers (crm-birthday.ts) + expenseReminders (expense-reminders.ts)
create or replace function public.layout_bootstrap(p_today date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
select jsonb_build_object(
  'profile', (
    select to_jsonb(p) from (
      select id, email, full_name, role from profiles where id = auth.uid()
    ) p
  ),
  -- นับทุก pending ไม่กรองวัน — รายการค้างข้ามวันต้องไม่หายจากป้าย (ดู comment เดิมใน layout.tsx)
  'pending_count', (select count(*) from queue_entries where status = 'pending'),
  'birthdays', coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'nickname', c.nickname))
    from customers c
    where c.birthday is not null
      and c.phone is not null
      -- เดือน-วันเกิดตรงวันนี้ ด้วยสูตร "1 ม.ค. + (เดือน-1) + (วัน-1)" — วันเกิด 29 ก.พ.
      -- ปีที่ไม่มี 29 ก.พ. จะไหลไป 1 มี.ค. ตรงกับพฤติกรรม Date.UTC ของ daysUntilBirthday ใน TS
      and (make_date(extract(year from p_today)::int, 1, 1)
           + ((extract(month from c.birthday)::int - 1) * interval '1 month')
           + ((extract(day from c.birthday)::int - 1) * interval '1 day'))::date = p_today
      -- cooldown 30 วันนับจากเที่ยงคืน UTC — ตรงกับ cooldownSince ฝั่ง TS
      and not exists (
        select 1 from crm_contacts cc
        where cc.customer_id = c.id
          and cc.list_type = 'birthday'
          and cc.created_at >= ((p_today - 30)::timestamp at time zone 'UTC')
      )
  ), '[]'::jsonb),
  'expense_reminders', coalesce((
    with duties as (
      -- รอบค่ามือหมอล่าสุดที่ผ่านมา: >20 → วันที่ 20 เดือนนี้ · >10 → วันที่ 10 · ไม่งั้นสิ้นเดือนก่อน
      select 'therapist_fee' as duty,
        case
          when extract(day from p_today)::int > 20
            then make_date(extract(year from p_today)::int, extract(month from p_today)::int, 20)
          when extract(day from p_today)::int > 10
            then make_date(extract(year from p_today)::int, extract(month from p_today)::int, 10)
          else (date_trunc('month', p_today) - interval '1 day')::date
        end as due
      union all
      -- เงินเดือน: สิ้นเดือนก่อนหน้าเสมอ
      select 'salary', (date_trunc('month', p_today) - interval '1 day')::date
    )
    select jsonb_agg(jsonb_build_object('duty', d.duty, 'due', to_char(d.due, 'YYYY-MM-DD')))
    from duties d
    -- ยังไม่มีรายการรอบใหญ่ (≥10,000) ในหมวด ตั้งแต่ D-3 ของรอบ → ยังต้องเตือน
    where not exists (
      select 1 from expenses e
      where e.category = case d.duty
              when 'therapist_fee' then 'HR / payroll (ค่ามือหมอ)'
              else 'เงินเดือนพนักงานประจำ' end
        and e.expense_date >= d.due - 3
        and e.amount >= 10000
    )
  ), '[]'::jsonb)
)
$$;
```

**ก่อน apply ตรวจ 2 อย่างกับ schema จริง (MCP `list_tables` หรือเปิด `src/types/database.ts`):** (1) ชนิดคอลัมน์ `customers.birthday` และ `expenses.expense_date` เป็น `date` — ถ้าเป็น text ต้อง cast `::date` ก่อน extract (2) ค่า category ตรงกับ `DUTY_CATEGORY` ใน `expense-reminders.ts` ทุกตัวอักษร

- [ ] **Step 2: ทดสอบสูตรวันที่ก่อน apply** — ยิงผ่าน MCP `execute_sql` (ยังไม่สร้างฟังก์ชัน แค่ทดสอบ expression):

```sql
-- คู่ (birthday, today, คาดหวัง): 29 ก.พ. ปีอธิกสุรทิน/ไม่ใช่ · วันปกติ · คนละวัน
select b::date as birthday, t::date as today,
  ((make_date(extract(year from t::date)::int, 1, 1)
    + ((extract(month from b::date)::int - 1) * interval '1 month')
    + ((extract(day from b::date)::int - 1) * interval '1 day'))::date = t::date) as matched
from (values
  ('2000-02-29','2028-02-29', true),  -- ปีอธิกสุรทิน: ตรง 29 ก.พ.
  ('2000-02-29','2026-03-01', true),  -- ปีปกติ: ไหลไป 1 มี.ค. (พฤติกรรม TS เดิม)
  ('2000-02-29','2026-02-28', false),
  ('1990-08-09','2026-08-09', true),
  ('1990-08-10','2026-08-09', false)
) v(b, t, expected);
```

Expected: คอลัมน์ `matched` ตรงกับค่า expected ทุกแถว — และทดสอบสูตร due ของ expense ด้วยชุด `p_today` = วันที่ 5/11/21/1 ของเดือน เทียบมือกับผล `lastTherapistDue`/`lastSalaryDue` ใน TS (เช่น today `2026-08-21` → therapist due `2026-08-20`, salary due `2026-07-31`)

- [ ] **Step 3: Apply migration** ผ่าน MCP `apply_migration` ชื่อ `layout_bootstrap` แล้วเซฟสำเนา SQL ลง `supabase/migrations/<version>_layout_bootstrap.sql` (version จาก `supabase_migrations.schema_migrations`)

- [ ] **Step 4: เทียบผล RPC กับ query เดิมบนข้อมูลจริง** — ผ่าน MCP `execute_sql` (service role มองเห็นทุกแถว จึงเทียบเชิงข้อมูลได้ ส่วนพฤติกรรมใต้ RLS ของ role จริงไปยืนยันซ้ำที่ test ฝั่ง TS + ใช้งานจริง):

```sql
select public.layout_bootstrap(current_date) as rpc,
  (select count(*) from queue_entries where status='pending') as direct_pending;
-- แล้วเทียบ: rpc->>'pending_count' = direct_pending
-- เทียบ birthdays กับ query ตรงแบบเดียวกับ crm-birthday.ts และ expense_reminders กับสูตรมือ
-- ลองอย่างน้อย 3 ค่า p_today: current_date · วันที่ 15 · วันที่ 25 ของเดือนนี้
```

Expected: ค่าตรงกันทุกช่อง — ถ้าไม่ตรง ห้ามไปต่อ กลับไปแก้ SQL

- [ ] **Step 5: Regenerate types** — MCP `generate_typescript_types` แล้วเขียนทับ `src/types/database.ts` (ตรวจ diff ว่ามีแค่ของใหม่เพิ่ม ไม่มีของเดิมหาย)

- [ ] **Step 6: ตรวจและ commit**

Run: `npm run lint && npm run test`
Expected: ผ่าน (ยังไม่มีใครเรียก RPC — type ใหม่ต้อง compile ผ่าน)

```bash
git add supabase/migrations/*_layout_bootstrap.sql src/types/database.ts
git commit -m "feat(speed): RPC layout_bootstrap รวม 5 query ของ layout เหลือครั้งเดียว"
```

---

### Task 5: TS wrapper `layoutBootstrap()` (TDD)

**Files:**
- Create: `src/lib/layout-bootstrap.ts`
- Test: `src/lib/layout-bootstrap.test.ts`

**Interfaces:**
- Consumes: RPC `layout_bootstrap` (Task 4), `expenseReminderLabel(duty, due)` + type `ExpenseReminder` จาก `@/lib/expense-reminders`, type `MyProfile` จาก `@/lib/auth`
- Produces:
  ```ts
  export type LayoutBootstrap = {
    profile: MyProfile | null
    pendingCount: number
    birthdays: { id: string; name: string; nickname: string | null }[]
    expenseReminders: ExpenseReminder[]   // { duty, label } — label แปลงแล้ว
  }
  export function parseLayoutBootstrap(raw: unknown): LayoutBootstrap
  export async function layoutBootstrap(
    supabase: SupabaseClient<Database>, todayIso: string
  ): Promise<LayoutBootstrap>
  ```

- [ ] **Step 1: เขียน test ก่อน (ต้อง fail)**

```ts
// src/lib/layout-bootstrap.test.ts
import { describe, expect, it, vi } from "vitest"

import { layoutBootstrap, parseLayoutBootstrap } from "./layout-bootstrap"

const FULL = {
  profile: { id: "u1", email: "a@b.c", full_name: "บอส", role: "admin" },
  pending_count: 3,
  birthdays: [{ id: "c1", name: "สมชาย", nickname: "ชาย" }],
  expense_reminders: [
    { duty: "therapist_fee", due: "2026-08-20" },
    { duty: "salary", due: "2026-07-31" },
  ],
}

describe("parseLayoutBootstrap", () => {
  it("แปลงผล RPC ครบทุกช่อง และ map duty+due เป็น label ไทย", () => {
    const r = parseLayoutBootstrap(FULL)
    expect(r.profile?.role).toBe("admin")
    expect(r.pendingCount).toBe(3)
    expect(r.birthdays).toHaveLength(1)
    // label ต้องตรงกับ expenseReminderLabel เดิม — รอบ 20 ส.ค. และเงินเดือน ก.ค.
    expect(r.expenseReminders[0].label).toContain("ค่ามือหมอ")
    expect(r.expenseReminders[0].label).toContain("20")
    expect(r.expenseReminders[1].label).toContain("เงินเดือน")
  })

  it("profile null (คนนอก allowlist) และลิสต์ว่าง — ไม่พัง", () => {
    const r = parseLayoutBootstrap({
      profile: null, pending_count: 0, birthdays: [], expense_reminders: [],
    })
    expect(r.profile).toBeNull()
    expect(r.pendingCount).toBe(0)
    expect(r.expenseReminders).toEqual([])
  })

  it("ข้อมูลเพี้ยน (ไม่ใช่ object) → ค่า default ปลอดภัย ไม่ throw", () => {
    const r = parseLayoutBootstrap(null)
    expect(r).toEqual({ profile: null, pendingCount: 0, birthdays: [], expenseReminders: [] })
  })
})

describe("layoutBootstrap", () => {
  it("เรียก rpc ด้วยชื่อ/พารามิเตอร์ถูก และส่งผลผ่าน parse", async () => {
    const rpc = vi.fn(async () => ({ data: FULL, error: null }))
    const r = await layoutBootstrap({ rpc } as never, "2026-08-09")
    expect(rpc).toHaveBeenCalledWith("layout_bootstrap", { p_today: "2026-08-09" })
    expect(r.pendingCount).toBe(3)
  })

  it("RPC error → degrade เงียบเหมือนพฤติกรรม layout เดิม (ทุกอย่างว่าง ไม่ throw)", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }))
    const r = await layoutBootstrap({ rpc } as never, "2026-08-09")
    expect(r.profile).toBeNull()
    expect(r.pendingCount).toBe(0)
  })
})
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx vitest run src/lib/layout-bootstrap.test.ts`
Expected: FAIL — module ยังไม่มี

- [ ] **Step 3: เขียน implementation**

```ts
// src/lib/layout-bootstrap.ts
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"
import type { MyProfile } from "@/lib/auth"
import {
  expenseReminderLabel,
  type ExpenseDuty,
  type ExpenseReminder,
} from "@/lib/expense-reminders"

export type LayoutBootstrap = {
  profile: MyProfile | null
  pendingCount: number
  birthdays: { id: string; name: string; nickname: string | null }[]
  expenseReminders: ExpenseReminder[]
}

const EMPTY: LayoutBootstrap = {
  profile: null,
  pendingCount: 0,
  birthdays: [],
  expenseReminders: [],
}

/** แปลง jsonb จาก RPC — เพี้ยนตรงไหนคืนค่าว่างส่วนนั้น layout ต้องไม่ล้มเพราะแจ้งเตือน */
export function parseLayoutBootstrap(raw: unknown): LayoutBootstrap {
  if (!raw || typeof raw !== "object") return EMPTY
  const o = raw as Record<string, unknown>
  const reminders = Array.isArray(o.expense_reminders) ? o.expense_reminders : []
  return {
    profile: (o.profile as MyProfile | null) ?? null,
    pendingCount: typeof o.pending_count === "number" ? o.pending_count : 0,
    birthdays: Array.isArray(o.birthdays)
      ? (o.birthdays as LayoutBootstrap["birthdays"])
      : [],
    // SQL ส่ง duty+due ดิบ — ประกอบ label ไทยที่นี่ด้วยฟังก์ชันเดิม จะได้ไม่ก๊อปข้อความลง SQL
    expenseReminders: reminders.map((r) => {
      const { duty, due } = r as { duty: ExpenseDuty; due: string }
      return { duty, label: expenseReminderLabel(duty, due) }
    }),
  }
}

/**
 * ข้อมูล layout ทั้งชุดใน round trip เดียว — แทน getMyProfile + 3 query เดิม
 * error → degrade เงียบ (ทุกอย่างว่าง role ตก "staff") เท่าพฤติกรรมเดิมตอน query ล้ม
 */
export async function layoutBootstrap(
  supabase: SupabaseClient<Database>,
  todayIso: string
): Promise<LayoutBootstrap> {
  const { data, error } = await supabase.rpc("layout_bootstrap", { p_today: todayIso })
  if (error) {
    console.error("layout_bootstrap ล้ม — แจ้งเตือนบนกระดิ่งจะว่างชั่วคราว:", error)
    return EMPTY
  }
  return parseLayoutBootstrap(data)
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npx vitest run src/lib/layout-bootstrap.test.ts`
Expected: PASS ทุกข้อ

- [ ] **Step 5: Commit**

```bash
git add src/lib/layout-bootstrap.ts src/lib/layout-bootstrap.test.ts
git commit -m "feat(speed): wrapper layoutBootstrap — parse ผล RPC + map label เตือนรายจ่าย"
```

---

### Task 6: สลับ layout ไปใช้ RPC

**Files:**
- Modify: `src/app/(app)/layout.tsx` (ช่วง import ถึงจบส่วน fetch, ~บรรทัด 1–45)

**Interfaces:**
- Consumes: `layoutBootstrap()` จาก Task 5
- Produces: — (จุดสิ้นสุดของสาย)

- [ ] **Step 1: แก้ layout** — แทนที่ `getMyProfile()` + `Promise.all` 3 query เดิมด้วย:

```tsx
const supabase = await createClient()
const today = todayInShopTz()
// round trip เดียวแทน ~5 query เดิม — auth ไม่ต้อง getUser ซ้ำที่นี่:
// proxy เช็ค session ทุก request อยู่แล้ว และ RLS ใน RPC คุมสิทธิ์ข้อมูลอีกชั้น
const { profile, pendingCount, birthdays, expenseReminders: expenseDue } =
  await layoutBootstrap(supabase, today)
```

- JSX ส่วนล่างคงเดิมทั้งหมด แต่เปลี่ยนแหล่งค่า: `AppShell role={profile?.role ?? "staff"}`, `pendingCount={pendingCount}`, provider `initialCount={pendingCount} birthdayCount={birthdays.length} expenseReminders={expenseDue}`, header ใช้ `profile?.role` / `profile?.full_name` เหมือนเดิม
- **ห้ามลบ comment เดิม** เรื่อง "ห้ามกรองวันที่" — ย้ายสาระไปไว้เหนือบรรทัดเรียก `layoutBootstrap` และชี้ไปที่ SQL
- ลบ import ที่ไม่ใช้แล้ว (`getMyProfile`, `birthdayTodayCustomers`, `expenseReminders`) — ตัวฟังก์ชันใน lib **ห้ามลบ** (หน้า `/crm` และ cron ยังใช้)

- [ ] **Step 2: ตรวจทั้งชุด**

Run: `npm run lint && npm run test && npm run build`
Expected: ผ่านทั้งหมด

- [ ] **Step 3: ตรวจของจริงหลัง deploy branch** (ถ้ามี preview) — login แล้วดู: ป้ายเมนูคิว, กระดิ่ง (วันเกิด/เตือนรายจ่าย), role badge — ต้องเหมือนก่อนแก้ทุกช่อง

- [ ] **Step 4: Commit — จบเฟส 2**

```bash
git add "src/app/(app)/layout.tsx"
git commit -m "feat(speed): layout ใช้ layout_bootstrap round trip เดียว — เลิกรอ 5 query เรียงกัน"
```

---

### Task 7: cached lookups + `updateTag` ตอนบันทึก (TDD)

**Files:**
- Create: `src/lib/cached-lookups.ts`
- Modify: `src/lib/supabase/service.ts` (comment เท่านั้น)
- Modify: `src/app/(app)/settings/settings-actions.ts`
- Test: `src/app/(app)/settings/settings-actions.test.ts` (สร้างใหม่)

**Interfaces:**
- Produces:
  ```ts
  // ทุกตัวคืนแถวเต็ม (select *) — ผู้เรียกกรอง/เลือกคอลัมน์เอง เพื่อให้ cache เดียวใช้ได้ทุกหน้า
  export function getTherapistsCached(): Promise<Tables<"therapists">[]>   // order("name")
  export function getServicesCached(): Promise<Tables<"services">[]>       // order("name")
  export function getShopSettingsCached(): Promise<Tables<"settings">[]>
  ```
  tag ที่ใช้: `"therapists"`, `"services"`, `"settings"`

- [ ] **Step 1: เขียน test การ invalidate ก่อน (ต้อง fail)** — สไตล์เดียวกับ `overpay-credit-actions.test.ts` (mock `next/cache`, fake supabase):

```ts
// src/app/(app)/settings/settings-actions.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }))
vi.mock("@/lib/auth", () => ({ getMyProfile: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { updateTag } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { saveService, saveSetting, saveTherapist } from "./settings-actions"

/** supabase ปลอมที่ insert/update/upsert สำเร็จเสมอ — เทสต์นี้สนแค่ว่า tag ถูกล้างเมื่อไหร่ */
function okSupabase() {
  const chain: Record<string, unknown> = {}
  for (const m of ["update", "insert", "upsert", "select", "eq", "maybeSingle"]) {
    chain[m] = vi.fn(() => chain)
  }
  chain.then = (resolve: (v: { error: null }) => void) => resolve({ error: null })
  return { from: vi.fn(() => chain) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createClient).mockResolvedValue(okSupabase() as never)
})

function fd(pairs: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(pairs)) f.set(k, v)
  return f
}

describe("cache invalidation ของข้อมูลกึ่งนิ่ง", () => {
  it("บันทึกหมอนวดสำเร็จ → ล้าง tag therapists ทันที (updateTag ไม่ใช่ revalidateTag)", async () => {
    const r = await saveTherapist(fd({ name: "ครูใหม่", status: "active" }))
    expect(r.ok).toBe(true)
    expect(updateTag).toHaveBeenCalledWith("therapists")
  })

  it("บันทึกเมนูบริการสำเร็จ → ล้าง tag services", async () => {
    const r = await saveService(fd({ name: "นวดไทย", price: "300", commission: "100" }))
    expect(r.ok).toBe(true)
    expect(updateTag).toHaveBeenCalledWith("services")
  })

  it("บันทึกตั้งค่าสำเร็จ → ล้าง tag settings", async () => {
    const r = await saveSetting("shop_open", "10:00")
    expect(r.ok).toBe(true)
    expect(updateTag).toHaveBeenCalledWith("settings")
  })

  it("ข้อมูลไม่ผ่าน validation → ไม่แตะ cache", async () => {
    const r = await saveTherapist(fd({ name: "", status: "active" }))
    expect(r.ok).toBe(false)
    expect(updateTag).not.toHaveBeenCalled()
  })
})
```

หมายเหตุ: ก่อนเขียน fake ให้เปิด `settings-actions.ts` ดู chain จริงของ `saveService`/`saveSetting` (บรรทัด ~55, ~197) แล้วปรับ `okSupabase` ให้ครอบ method ที่ action เรียกจริง (แนวเดียวกับตัวอย่าง)

- [ ] **Step 2: รันให้ fail**

Run: `npx vitest run "src/app/(app)/settings/settings-actions.test.ts"`
Expected: FAIL — `updateTag` ยังไม่ถูกเรียกใน action

- [ ] **Step 3: เขียน `cached-lookups.ts`**

```ts
// src/lib/cached-lookups.ts
import { unstable_cache } from "next/cache"

import { createServiceClient } from "@/lib/supabase/service"
import type { Tables } from "@/types/database"

/**
 * ตัวอ่านข้อมูลกึ่งนิ่งที่ทุกหน้าใช้ซ้ำ — cache ข้ามผู้ใช้ ล้างด้วย updateTag ตอนกดบันทึก
 * (ไม่ตั้งเวลาหมดอายุ: ความสดผูกกับปุ่มบันทึกโดยตรง จึงไม่มีทางเห็นข้อมูลเก่า)
 *
 * ใช้ service client เพราะฟังก์ชันใน unstable_cache ห้ามอ่าน cookies (ข้อจำกัด Next)
 * ปลอดภัยเพราะ: สามตารางนี้ staff อ่านได้ตาม RLS อยู่แล้ว · เรียกได้จากหน้าในโซน (app)
 * ที่ proxy บังคับ login เท่านั้น · module นี้เป็น server-only ผ่าน service.ts
 */
export const getTherapistsCached = unstable_cache(
  async (): Promise<Tables<"therapists">[]> => {
    const { data, error } = await createServiceClient()
      .from("therapists").select("*").order("name")
    if (error) throw error
    return data
  },
  ["therapists-all"],
  { tags: ["therapists"] }
)

export const getServicesCached = unstable_cache(
  async (): Promise<Tables<"services">[]> => {
    const { data, error } = await createServiceClient()
      .from("services").select("*").order("name")
    if (error) throw error
    return data
  },
  ["services-all"],
  { tags: ["services"] }
)

export const getShopSettingsCached = unstable_cache(
  async (): Promise<Tables<"settings">[]> => {
    const { data, error } = await createServiceClient().from("settings").select("*")
    if (error) throw error
    return data
  },
  ["settings-all"],
  { tags: ["settings"] }
)
```

- [ ] **Step 4: อัปเดต comment ใน `service.ts`** — เพิ่มบรรทัดในคอมเมนต์เดิม: อนุญาต `src/lib/cached-lookups.ts` เป็นผู้เรียกอีกราย (อ่านตาราง lookup ที่ staff เห็นได้อยู่แล้ว) — ที่อื่นยังห้ามเหมือนเดิม

- [ ] **Step 5: เติม `updateTag` ใน `settings-actions.ts`** — `import { revalidatePath, updateTag } from "next/cache"` แล้ว:
  - `saveTherapist`: หลังบันทึกสำเร็จ (ก่อน `refresh()`) เพิ่ม `updateTag("therapists")`
  - `saveService`: เพิ่ม `updateTag("services")`
  - `saveSetting` (บรรทัด ~197): เพิ่ม `updateTag("settings")`
  - จุดล้มเหลว (validation/DB error) ต้อง return ก่อนถึง `updateTag` — ตามโครง action เดิมที่ `refresh()` อยู่หลังเช็ค error อยู่แล้ว

- [ ] **Step 6: รัน test ให้ผ่านทั้งหมด**

Run: `npm run test && npm run lint`
Expected: PASS ทุกไฟล์ (รวม test เดิม)

- [ ] **Step 7: Commit**

```bash
git add src/lib/cached-lookups.ts src/lib/supabase/service.ts "src/app/(app)/settings/settings-actions.ts" "src/app/(app)/settings/settings-actions.test.ts"
git commit -m "feat(speed): cache หมอนวด/เมนู/ตั้งค่าแบบ tag — ล้างทันทีตอนกดบันทึก"
```

---

### Task 8: หน้า pos + queue ใช้ cached lookups และรวม query

**Files:**
- Modify: `src/app/(app)/pos/page.tsx` (~บรรทัด 24–140)
- Modify: `src/app/(app)/queue/page.tsx` (~บรรทัด 22–95)

**Interfaces:**
- Consumes: `getTherapistsCached()`, `getServicesCached()` จาก Task 7

- [ ] **Step 1: แก้ `pos/page.tsx`**
  - แทน query `therapists`/`services` ใน `Promise.all` ด้วย cached + กรองเงื่อนไขเดิมใน JS:
    ```tsx
    const [allTherapists, allServices, { data: promotions }, { data: beds }, queueRes, groupRes] =
      await Promise.all([
        getTherapistsCached(),
        getServicesCached(),
        supabase.from("promotions").select("id, name, discount_pct")
          .eq("is_active", true).neq("kind", "internal").order("name"),
        supabase.from("beds").select("id, room, name").eq("is_active", true).order("sort"),
        // เดิมสองตัวนี้รอหลัง lookup เสร็จทั้งที่ไม่พึ่งกัน — ยุบมารอบเดียว
        queue
          ? supabase.from("queue_entries").select("*").eq("id", queue)
              .not("status", "in", "(paid,pending,rejected)").maybeSingle()
          : Promise.resolve({ data: null }),
        group
          ? supabase.from("queue_entries").select("*").eq("group_id", group)
              .not("status", "in", "(paid,cancelled,pending,rejected)").order("start_time")
          : Promise.resolve({ data: null }),
      ])
    // เงื่อนไขกรองเดิมของหน้า — ย้ายจาก .eq ใน query มาไว้ที่นี่ (ข้อมูลมาจาก cache รวม)
    const therapists = allTherapists
      .filter((t) => t.status === "active")
      .map((t) => ({ id: t.id, name: t.name }))
    const services = allServices
      .filter((s) => s.is_active)
      .map((s) => ({ id: s.id, name: s.name, price: s.price, commission: s.commission }))
    ```
  - ส่วน `groupEntries`/`queueEntry` ด้านล่างเปลี่ยนมาอ่านจาก `groupRes.data`/`queueRes.data` — ลำดับ logic เดิมทุกอย่าง (redirect เมื่อไม่เจอ ฯลฯ) · query `customers` ที่ตามหลังพึ่งผล queue จริงๆ ปล่อยไว้ที่เดิม

- [ ] **Step 2: แก้ `queue/page.tsx`** — แบบเดียวกัน: therapists/services จาก cached (คงเงื่อนไข/รูปคอลัมน์เดิมด้วย filter/map) และถ้า `turnAwayCount` (บรรทัด ~65) ไม่พึ่งผลจาก batch แรก ให้ย้ายเข้า `Promise.all` แรก — ถ้าพึ่ง (เช่นใช้ค่าจาก params ที่แปลงแล้วเท่านั้น = ไม่พึ่ง) ตัดสินจากโค้ดจริงตอนแก้

- [ ] **Step 3: ตรวจ**

Run: `npm run lint && npm run test && npm run build`
Expected: ผ่านทั้งหมด — แล้วไล่เช็คด้วยตาว่าคอลัมน์ที่ component ลูกใช้ (`PosForm`, `GroupPosForm`, queue board) ยังได้ครบรูปเดิม

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/pos/page.tsx" "src/app/(app)/queue/page.tsx"
git commit -m "feat(speed): pos/queue ใช้ cache หมอนวด-เมนู + ยุบ query ที่รอกันฟรี"
```

---

### Task 9: หน้า today + overview + history ใช้ cached lookups และรวม query

**Files:**
- Modify: `src/app/(app)/today/page.tsx` (จุดอ่าน therapists ~บรรทัด 83, services ~103)
- Modify: `src/app/(app)/overview/page.tsx` (จุดอ่าน settings ~บรรทัด 73, `getMyProfile` ~49)
- Modify: `src/app/(app)/history/page.tsx` (จุดอ่าน therapists ~บรรทัด 71)

**Interfaces:**
- Consumes: `getTherapistsCached()`, `getServicesCached()`, `getShopSettingsCached()` จาก Task 7

- [ ] **Step 1: แก้ทีละหน้า** — หลักเดียวกับ Task 8:
  - `today`: therapists (`id, name, status` ทุกสถานะ) + services → cached แล้ว map เป็นรูปคอลัมน์เดิม
  - `overview`: แถว `settings` → `getShopSettingsCached()` แล้วกรอง/หา key เดิมใน JS · ย้าย `await getMyProfile()` (บรรทัด ~49) เข้า `Promise.all` ใหญ่ของหน้า — ตอนนี้มันรอเดี่ยวก่อนใครทั้งที่ไม่มีใครพึ่ง
  - `history`: therapists (`id, name`) → cached + map
  - หน้าไหนใช้เงื่อนไข/คอลัมน์ที่ cache ไม่ครอบ (เช่น join พิเศษ) ให้คงไว้แบบเดิม — **อย่าฝืนย้ายทุก query** เอาเฉพาะสามตาราง lookup

- [ ] **Step 2: ตรวจ**

Run: `npm run lint && npm run test && npm run build`
Expected: ผ่านทั้งหมด

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/today/page.tsx" "src/app/(app)/overview/page.tsx" "src/app/(app)/history/page.tsx"
git commit -m "feat(speed): today/overview/history ใช้ cache lookup + จัด query วิ่งขนาน"
```

---

### Task 10: วัดซ้ำ + ตรวจปิดงาน

**Files:**
- Modify: `docs/ops/speed-pass-measurements.md`
- Modify: `docs/superpowers/specs/2026-08-09-speed-pass-design.md` (อัปเดตสถานะ)

- [ ] **Step 1: รันชุดตรวจสุดท้ายทั้งหมด**

Run: `npm run lint && npm run test && npm run build`
Expected: ผ่านทุกตัว — ถ้าไม่ผ่าน ห้ามไปขั้นต่อไป

- [ ] **Step 2: วัดซ้ำด้วยสคริปต์เดิม** (บน deployment ที่มีโค้ดใหม่ — ถ้ายังไม่ deploy ให้บันทึกว่า "รอวัดหลัง deploy" ห้ามแต่งตัวเลข)

Run: `node scripts/measure-ttfb.mjs` (เงื่อนไข cookie เดียวกับ baseline)

- [ ] **Step 3: เติมผลลง `docs/ops/speed-pass-measurements.md`** — ตารางหลังแก้เทียบ baseline + สรุปว่าถึงเป้า (~100ms feedback / ~1s เนื้อหา) หรือไม่ พร้อมเหตุผล

- [ ] **Step 4: อัปเดตสถานะในสเปก** — บรรทัด `**สถานะ:**` เปลี่ยนเป็น `implement ครบ 3 เฟสแล้ว — ผลวัดอยู่ใน docs/ops/speed-pass-measurements.md`

- [ ] **Step 5: Commit + push**

```bash
git add docs/ops/speed-pass-measurements.md docs/superpowers/specs/2026-08-09-speed-pass-design.md
git commit -m "docs(speed): ผลวัดหลังยกเครื่อง + ปิดสถานะสเปก"
git push -u origin claude/system-improvement-brainstorm-102o97
```

---

## หมายเหตุการตัดสินใจที่ต่างจากสเปก (บันทึกไว้ตรงๆ)

1. **ไม่ห่อกระดิ่งด้วย Suspense แยก** — สเปกส่วนที่ 1 วาดไว้ว่า "เปลือกขึ้นก่อน กระดิ่งตามมา" แต่เมื่อ layout เหลือ round trip เดียว (~เลขสิบ ms ใน region เดียวกัน) การ stream ค่าเข้า context provider ที่ครอบทั้งหน้า ต้องเพิ่มกลไก setter ซ้อนเข้าไปในโค้ดแจ้งเตือนที่ระวังเรื่องป้ายกระพริบอยู่แล้ว — ความซับซ้อนไม่คุ้มไม่กี่สิบ ms "เปลือกขึ้นก่อน" จึงส่งมอบผ่าน `loading.tsx` (เฟส 1) แทน ถ้าวัดผลแล้ว layout ยังหน่วงจริงค่อยเปิดประเด็นนี้ใหม่
2. **RPC ไม่เรียก `auth.getUser()` ก่อน** — proxy ตรวจ session ทุก request และ RLS คุมข้อมูลใน RPC อีกชั้น ผลคือ layout เหลือ **1** round trip (ดีกว่า ~2 ที่สเปกประเมิน)
