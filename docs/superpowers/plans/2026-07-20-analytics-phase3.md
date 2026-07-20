# SOOKKAYA Analytics เฟส 3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: ใช้ superpowers:subagent-driven-development (แนะนำ)
> หรือ superpowers:executing-plans ลงมือทีละ Task · ทุก step เป็น checkbox (`- [ ]`) ให้ติ๊กตามจริง

**Goal:** ให้เจ้าของร้านรู้ว่า *ชั่วโมงไหนคนแน่น · โปรโมชั่นไหนคุ้ม · ลูกค้าคนไหนมีค่าที่สุด · ใครหายไปควรตามกลับ*

**Architecture:** ปัญหาใหญ่ที่สุดของเฟสนี้คือชื่อโปรโมชั่นพิมพ์มือจนแตกเป็น 120 แบบ
จึงเพิ่มตาราง `promotions` + `promotion_aliases` และฟังก์ชัน `promo_key()` ที่ทำให้ข้อความดิบ
กลายเป็นคีย์เดียวกัน (`Happy Hours` / `hApPy hOuRS` / `HappyHours` → `happyhours`)
ตรรกะการนับทั้งหมดอยู่ใน SQL view เหมือนเฟส 1–2 (`v_hourly_density`, `v_promo_roi`, `v_customer_ltv`)
หน้าเว็บมีหน้าที่แค่แสดงผล **ห้ามคำนวณสูตรเงินซ้ำในหน้าเว็บ** (กฎบัญชีข้อ 3 ใน README)

**Tech Stack:** Next.js 16 · Supabase Postgres · TypeScript · Tailwind + shadcn/ui · vitest

**Spec:** `docs/superpowers/specs/2026-07-20-analytics-phase3-design.md`
(ตัดสินใจแล้ว: ใช้ทางเลือก **ก + ค** — ตารางจับคู่ชื่อ *และ* dropdown ในหน้า POS)

**ก่อนรันทุกคำสั่ง:**

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
```

**Supabase project ref:** `jrioyrmicioqammeevgh` (ใช้กับ MCP tool `apply_migration` / `execute_sql`)

**ก่อนเขียนโค้ด Next.js:** อ่าน `node_modules/next/dist/docs/` ตาม `AGENTS.md` — Next.js 16
มี breaking change จากที่คุณเคยรู้ (`searchParams` เป็น Promise แล้ว ดูตัวอย่างใน
`src/app/(app)/reports/page.tsx`)

**เทสตอนนี้ผ่าน 23 ข้อ** — ทุก Task ที่เพิ่มเทสจะบอกว่าต้องได้เท่าไหร่

---

## File Structure

| ไฟล์ | หน้าที่ |
| ---- | ------- |
| `src/lib/promo.ts` | `promoKey()` — ฝั่ง TS ของฟังก์ชัน SQL `promo_key()` ใช้จัดกลุ่มพรีวิวในหน้าตั้งค่า |
| `src/lib/promo.test.ts` | เทสของข้างบน |
| `src/lib/insights.ts` | `heatIntensity()`, `daysSince()`, `isDormant()` — ฟังก์ชันบริสุทธิ์ล้วน |
| `src/lib/insights.test.ts` | เทสของข้างบน |
| `src/app/(app)/insights/shared.tsx` | การ์ด "ไม่มีสิทธิ์" + หัวข้อหน้าที่ใช้ร่วมกัน 3 หน้า |
| `src/app/(app)/insights/heatmap/page.tsx` | ตารางสีความหนาแน่น ชั่วโมง × วันในสัปดาห์ |
| `src/app/(app)/insights/promotions/page.tsx` | ROI ส่วนลดต่อโปรโมชั่น |
| `src/app/(app)/insights/customers/page.tsx` | LTV ลูกค้า + แท็บลูกค้าที่หายไปนาน |
| `src/app/(app)/settings/promotions-tab.tsx` | จัดการโปรโมชั่นและจับคู่ชื่อที่พิมพ์ผิด |
| `src/app/(app)/settings/settings-actions.ts` | *(แก้)* เพิ่ม `savePromotion`, `saveAlias` |
| `src/app/(app)/settings/page.tsx` | *(แก้)* เพิ่มแท็บ "โปรโมชั่น" |
| `src/app/(app)/pos/page.tsx` | *(แก้)* query `promotions` ส่งให้ฟอร์ม |
| `src/app/(app)/pos/pos-form.tsx` | *(แก้)* ช่องโปรโมชั่นเป็น dropdown + "อื่นๆ" |
| `src/app/(app)/more/page.tsx` | *(แก้)* เพิ่มลิงก์ 3 หน้าใหม่ |
| `src/types/database.ts` | *(แก้)* type ของตารางและ view ใหม่ |
| `supabase/reconciliation.sql` | *(แก้)* เพิ่มการตรวจเฟส 3 (14 → 18 ข้อ) |
| `README.md` | *(แก้)* ตารางหน้า + ติ๊กเฟส 3 |

---

## Task 1: ตาราง `promotions` + `promotion_aliases` + ฟังก์ชัน `promo_key()`

**Files:**
- Migration ผ่าน MCP `apply_migration` (project_id `jrioyrmicioqammeevgh`)

- [ ] **Step 1: apply migration ชื่อ `create_promotions_tables`**

```sql
-- ทำข้อความโปรโมชั่นดิบให้เป็นคีย์เดียวกัน
-- ตัดช่องว่างทั้งหมด + ตัวพิมพ์เล็ก แล้วยุบรหัสจอง Gowabi (มี 55 เลขไม่ซ้ำกันเลย) เป็น 'gowabi'
-- immutable เพราะต้องเอาไปทำ index ได้และ view ต้องใช้ได้
create or replace function public.promo_key(txt text)
returns text
language sql
immutable
as $$
  select case when k like 'gowabi%' then 'gowabi' else k end
  from (
    select lower(regexp_replace(coalesce(txt, ''), '\s+', '', 'g')) as k
  ) t
$$;

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  -- promotion = โปรฯ จริงที่ตั้งใจทำการตลาด · channel = ช่องทางขาย (Gowabi, KOL)
  -- internal = ไม่ใช่โปรฯ แต่เป็นเหตุผลภายใน (Member, ถ่ายคอนเทนต์) แยกไว้ไม่ให้ปน ROI
  kind text not null default 'promotion'
    check (kind in ('promotion', 'channel', 'internal')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- คีย์ดิบ 1 คีย์ → โปรโมชั่น 1 ตัว · promotion_id เป็น null = "ตรวจแล้ว ไม่ใช่โปรโมชั่น"
-- คีย์ที่ไม่มีแถวที่นี่เลย = "ยังไม่ได้ตรวจ" ซึ่งหน้าตั้งค่าจะเอามาโชว์ให้จับคู่
create table public.promotion_aliases (
  raw_key text primary key,
  promotion_id uuid references public.promotions(id) on delete cascade,
  sample_text text,
  updated_at timestamptz not null default now()
);

alter table public.promotions enable row level security;
alter table public.promotion_aliases enable row level security;

create policy promotions_read on public.promotions
  for select to authenticated
  using (public.app_role() = any (array['admin','manager','staff']));

create policy promotions_write on public.promotions
  for all to authenticated
  using (public.app_role() = any (array['admin','manager']))
  with check (public.app_role() = any (array['admin','manager']));

create policy promotion_aliases_read on public.promotion_aliases
  for select to authenticated
  using (public.app_role() = any (array['admin','manager','staff']));

create policy promotion_aliases_write on public.promotion_aliases
  for all to authenticated
  using (public.app_role() = any (array['admin','manager']))
  with check (public.app_role() = any (array['admin','manager']));

-- ค้นหาแถวขายตามคีย์โปรฯ ได้เร็ว (view ROI join ด้วยคีย์นี้)
create index sales_promo_key_idx on public.sales (public.promo_key(coupon_promo));
```

- [ ] **Step 2: ตรวจว่าฟังก์ชันยุบชื่อได้จริง** — รันด้วย `execute_sql`

```sql
select public.promo_key('Happy Hours')        as a,   -- happyhours
       public.promo_key('hApPy hOuRS')        as b,   -- happyhours
       public.promo_key('HappyHours')         as c,   -- happyhours
       public.promo_key('Gowabi 517620293')   as d,   -- gowabi
       public.promo_key('Gowabi224653839')    as e,   -- gowabi
       public.promo_key(null)                 as f;   -- (ว่าง)
```

Expected: `a = b = c = 'happyhours'` · `d = e = 'gowabi'` · `f = ''`
ถ้าไม่ตรงแม้ช่องเดียว **หยุด** แล้วแก้ฟังก์ชันก่อนไปต่อ

- [ ] **Step 3: Commit** (ยังไม่มีไฟล์เปลี่ยน — ข้ามไป Task 2 ได้เลย ถ้า `git status` ว่าง)

---

## Task 2: Seed โปรโมชั่นและการจับคู่ชื่อ

**Files:**
- Migration ผ่าน MCP `apply_migration`

รายการนี้มาจากการนับข้อมูลจริง 857 รายการ — อย่าเดาเพิ่มเอง

- [ ] **Step 1: apply migration ชื่อ `seed_promotions_and_aliases`**

```sql
insert into public.promotions (name, kind) values
  ('1 แถม 1',                'promotion'),
  ('60 แถม 30',              'promotion'),
  ('Happy Hours',            'promotion'),
  ('ลด 10%',                 'promotion'),
  ('ลด 15%',                 'promotion'),
  ('ผู้ติดตาม',              'promotion'),
  ('Gowabi',                 'channel'),
  ('KOL',                    'channel'),
  ('Member',                 'internal'),
  ('ถ่ายคอนเทนต์ / เทสนวด',  'internal')
on conflict (name) do nothing;

-- จับคู่ข้อความดิบทุกแบบที่พบจริงในฐานข้อมูล เข้ากับชื่อมาตรฐานด้านบน
insert into public.promotion_aliases (raw_key, promotion_id, sample_text)
select v.raw_key, p.id, v.sample_text
from (values
  ('1แถม1',                 '1 แถม 1',               '1แถม1'),
  ('โปรโบวชัวร์1แถม1',      '1 แถม 1',               'โปรโบวชัวร์ 1 แถม1'),
  ('1แถม1(คูปอง)',          '1 แถม 1',               '1 แถม 1 (คูปอง)'),
  ('โบชัวร์1แถม1',          '1 แถม 1',               'โบชัวร์1แถม1'),
  ('1แถม1(โบรชัวร์)',       '1 แถม 1',               '1 แถม 1 (โบรชัวร์)'),
  ('60แถม30',               '60 แถม 30',             '60แถม30'),
  ('60แถม30member',         '60 แถม 30',             '60แถม30 member'),
  ('happyhours',            'Happy Hours',           'Happy Hours'),
  ('happyhour',             'Happy Hours',           'Happy Hour'),
  ('ลด10%',                 'ลด 10%',                'ลด10%'),
  ('ลด15%',                 'ลด 15%',                'ลด15%'),
  ('ส่วนลด15%',             'ลด 15%',                'ส่วนลด15%'),
  ('ผู้ติดตาม',             'ผู้ติดตาม',             'ผู้ติดตาม'),
  ('gowabi',                'Gowabi',                'Gowabi 517620293'),
  ('kol',                   'KOL',                   'KOL'),
  ('member',                'Member',                'Member'),
  ('memberพนง.พันธ์ุไทย',   'Member',                'Member พนง.พันธ์ุไทย'),
  ('memberไม่เอาพี่โจ',     'Member',                'Member ไม่เอาพี่โจ'),
  ('ซื้อslivermember',      'Member',                'ซื้อSliver member'),
  ('ซื้อgoldmember',        'Member',                'ซื้อGold Member'),
  ('เคสถ่ายรีวิว',          'ถ่ายคอนเทนต์ / เทสนวด', 'เคสถ่ายรีวิว'),
  ('testก่อนถ่ายทำ',        'ถ่ายคอนเทนต์ / เทสนวด', 'test ก่อนถ่ายทำ'),
  ('ถ่ายคอนเทน',            'ถ่ายคอนเทนต์ / เทสนวด', 'ถ่ายคอนเทน'),
  ('content',               'ถ่ายคอนเทนต์ / เทสนวด', 'content'),
  ('เทสนวดรีเซฟชั่น',       'ถ่ายคอนเทนต์ / เทสนวด', 'เทสนวดรีเซฟชั่น'),
  ('เทสนวดหัว60นาที',       'ถ่ายคอนเทนต์ / เทสนวด', 'เทสนวดหัว 60นาที'),
  ('test',                  'ถ่ายคอนเทนต์ / เทสนวด', 'test'),
  ('ถ่ายคอนเทนต์/เทสนวด',   'ถ่ายคอนเทนต์ / เทสนวด', 'ถ่ายคอนเทนต์ / เทสนวด')
) as v(raw_key, promo_name, sample_text)
join public.promotions p on p.name = v.promo_name
on conflict (raw_key) do nothing;
```

> หมายเหตุ: alias ตัวสุดท้าย (`ถ่ายคอนเทนต์/เทสนวด`) คือคีย์ของชื่อมาตรฐานเอง
> จำเป็นเพราะ dropdown ใน POS จะบันทึกชื่อมาตรฐานลง `coupon_promo`
> ชื่ออื่นๆ คีย์ของตัวเองซ้ำกับ alias ที่ seed ไปแล้ว จึงไม่ต้องเพิ่ม

- [ ] **Step 2: ตรวจว่าจับคู่ได้ตามที่นับไว้** — `execute_sql`

```sql
select p.name, count(*) as uses, round(sum(s.discount)) as discount_given
from public.sales s
join public.promotion_aliases a on a.raw_key = public.promo_key(s.coupon_promo)
join public.promotions p on p.id = a.promotion_id
group by p.name order by uses desc;
```

Expected ครบทั้ง 10 แถว:

| name | uses | discount_given |
| ---- | ---- | -------------- |
| Member | 260 | 530 |
| 1 แถม 1 | 253 | 53530 |
| 60 แถม 30 | 113 | 36610 |
| Happy Hours | **89** | **17960** |
| Gowabi | 64 | 44700 |
| KOL | 15 | 14850 |
| ถ่ายคอนเทนต์ / เทสนวด | 14 | 10830 |
| ลด 15% | 12 | 1757 |
| ผู้ติดตาม | 9 | 3510 |
| ลด 10% | 8 | 598 |

ถ้า Happy Hours ยังได้ 38 แปลว่า alias ไม่ทำงาน **หยุด**

- [ ] **Step 3: ตรวจว่าเหลือค้างเท่าที่คาด** — `execute_sql`

```sql
select public.promo_key(coupon_promo) as raw_key, count(*) as n
from public.sales
where coupon_promo is not null and btrim(coupon_promo) <> ''
  and not exists (
    select 1 from public.promotion_aliases a
    where a.raw_key = public.promo_key(public.sales.coupon_promo)
  )
group by 1 order by n desc;
```

Expected: รวม **20 รายการ** (เป็นข้อความจดโน้ต เช่น เบอร์โทร, `ลืมจ่ายเงิน`, `add balm`)
ทั้งหมดนี้ตั้งใจปล่อยให้เจ้าของร้านมาจับคู่เองในหน้าตั้งค่า (Task 6)

---

## Task 3: View วิเคราะห์ 3 ตัว

**Files:**
- Migration ผ่าน MCP `apply_migration`
- Modify: `src/types/database.ts` (บล็อก `Views` ที่บรรทัด 448-507 และ `Tables`)

- [ ] **Step 1: apply migration ชื่อ `create_insights_views`**

```sql
-- 1) ความหนาแน่นชั่วโมง × วันในสัปดาห์
--    ใช้ได้เฉพาะ 1,578 รายการที่มีเวลา (จาก 2,255) หน้าเว็บต้องบอกสัดส่วนนี้เสมอ
create view public.v_hourly_density
with (security_invoker = true) as
select
  extract(dow  from s.sale_date)::int as weekday,     -- 0 = อาทิตย์
  extract(hour from s.sale_time)::int as hour,
  count(*)                            as sessions,
  round(sum(coalesce(s.revenue_recognize, s.net_amount))) as revenue
from public.sales s
where s.sale_time is not null
group by 1, 2;

-- 2) ROI ต่อโปรโมชั่น
--    returning_customers = ลูกค้าที่กลับมาซื้ออีกครั้ง "หลังวันที่ใช้โปรฯ ครั้งแรก"
--    เป็นตัวชี้ว่าโปรฯ สร้างลูกค้าประจำได้จริงไหม ไม่ใช่แค่ดึงคนมาใช้ส่วนลดครั้งเดียว
create view public.v_promo_roi
with (security_invoker = true) as
with used as (
  select p.id as promotion_id, p.name as promotion_name, p.kind,
         s.customer_id, s.sale_date, s.discount,
         coalesce(s.revenue_recognize, s.net_amount) as revenue
  from public.sales s
  join public.promotion_aliases a on a.raw_key = public.promo_key(s.coupon_promo)
  join public.promotions p        on p.id = a.promotion_id
),
first_use as (
  select promotion_id, customer_id, min(sale_date) as first_date
  from used where customer_id is not null
  group by 1, 2
),
returned as (
  select f.promotion_id, count(*) as returning_customers
  from first_use f
  where exists (
    select 1 from public.sales s2
    where s2.customer_id = f.customer_id and s2.sale_date > f.first_date
  )
  group by 1
)
select
  u.promotion_id,
  u.promotion_name,
  u.kind,
  count(*)                        as uses,
  round(sum(u.discount))          as discount_given,
  round(sum(u.revenue))           as revenue,
  count(distinct u.customer_id)   as customers,
  coalesce(r.returning_customers, 0) as returning_customers,
  min(u.sale_date)                as first_used,
  max(u.sale_date)                as last_used
from used u
left join returned r on r.promotion_id = u.promotion_id
group by u.promotion_id, u.promotion_name, u.kind, r.returning_customers;

-- 3) LTV ต่อลูกค้า
--    ใช้ revenue_recognize เป็นหลัก เพราะยอดที่จ่ายด้วยเครดิตสมาชิกมีส่วนที่เป็นของแถม
--    ไม่ใช่รายได้จริง (กฎบัญชีข้อ 1 ใน README)
--    ไม่มีคอลัมน์ "หายไปกี่วัน" ในนี้ตั้งใจ — ห้ามใช้ current_date ใน DB เพราะ server รัน UTC
--    หน้าเว็บคำนวณจาก last_visit เทียบกับวันนี้เวลาไทยเอง
create view public.v_customer_ltv
with (security_invoker = true) as
select
  c.id            as customer_id,
  c.name,
  c.nickname,
  c.phone,
  c.customer_type,
  count(s.id)     as visits,
  round(sum(coalesce(s.revenue_recognize, s.net_amount))) as lifetime_value,
  round(avg(coalesce(s.revenue_recognize, s.net_amount))) as avg_ticket,
  min(s.sale_date) as first_visit,
  max(s.sale_date) as last_visit
from public.customers c
join public.sales s on s.customer_id = c.id
group by c.id, c.name, c.nickname, c.phone, c.customer_type;
```

- [ ] **Step 2: ตรวจตัวเลขทั้ง 3 view** — `execute_sql`

```sql
select
  (select sum(sessions) from public.v_hourly_density)              as heat_sessions,
  (select count(*) from public.v_hourly_density where hour < 10)   as heat_odd_hours,
  (select uses from public.v_promo_roi where promotion_name = 'Happy Hours')  as hh_uses,
  (select returning_customers from public.v_promo_roi where promotion_name = 'Happy Hours') as hh_returning,
  (select count(*) from public.v_customer_ltv)                     as ltv_rows,
  (select round(max(lifetime_value)) from public.v_customer_ltv)   as ltv_top;
```

Expected: `heat_sessions = 1578` · `heat_odd_hours = 1` (มี 1 รายการเวลา 01:xx ที่กรอกผิด) ·
`hh_uses = 89` · `hh_returning = 21` · `ltv_rows = 872` · `ltv_top = 26535`

> ตัวเลข `heat_sessions`, `ltv_rows`, `ltv_top` จะขยับขึ้นเมื่อมีการขายใหม่ผ่านแอป
> ถ้าได้มากกว่าที่เขียนไว้เล็กน้อยถือว่าปกติ · ถ้า **น้อยกว่า** แปลว่า view ผิด **หยุด**

- [ ] **Step 3: ตรวจ security advisor** — MCP `get_advisors` type `security`

Expected: ไม่มี ERROR ใหม่ (view ทั้ง 3 เป็น `security_invoker` แล้ว จึงบังคับ RLS ตามผู้ใช้)

- [ ] **Step 4: เพิ่ม type ใน `src/types/database.ts`**

เพิ่มใน `Tables` (เรียงตามตัวอักษร วางต่อจาก `member_topups`):

```ts
      promotions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          kind: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
        }
        Relationships: []
      }
      promotion_aliases: {
        Row: {
          promotion_id: string | null
          raw_key: string
          sample_text: string | null
          updated_at: string
        }
        Insert: {
          promotion_id?: string | null
          raw_key: string
          sample_text?: string | null
          updated_at?: string
        }
        Update: {
          promotion_id?: string | null
          raw_key?: string
          sample_text?: string | null
          updated_at?: string
        }
        Relationships: []
      }
```

เพิ่มใน `Views` (ต่อจาก `v_daily_summary`):

```ts
      v_customer_ltv: {
        Row: {
          avg_ticket: number | null
          customer_id: string | null
          customer_type: string | null
          first_visit: string | null
          last_visit: string | null
          lifetime_value: number | null
          name: string | null
          nickname: string | null
          phone: string | null
          visits: number | null
        }
        Relationships: []
      }
      v_hourly_density: {
        Row: {
          hour: number | null
          revenue: number | null
          sessions: number | null
          weekday: number | null
        }
        Relationships: []
      }
      v_promo_roi: {
        Row: {
          customers: number | null
          discount_given: number | null
          first_used: string | null
          kind: string | null
          last_used: string | null
          promotion_id: string | null
          promotion_name: string | null
          returning_customers: number | null
          revenue: number | null
          uses: number | null
        }
        Relationships: []
      }
```

และเพิ่มใน `Functions` (ต่อจาก `next_receipt_no`):

```ts
      promo_key: { Args: { txt: string }; Returns: string }
```

- [ ] **Step 5: `npx tsc --noEmit`**

Expected: ไม่มี error

- [ ] **Step 6: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: ตารางโปรโมชั่นและ view วิเคราะห์เฟส 3"
```

---

## Task 4: `src/lib/promo.ts` + เทส (TDD)

หน้าตั้งค่าต้องจัดกลุ่มข้อความดิบให้ดูก่อนจับคู่ จึงต้องมี `promoKey()` ฝั่ง TS
ที่ให้ผลตรงกับ SQL เป๊ะ ถ้าสองฝั่งไม่ตรง หน้าจอจะโชว์กลุ่มหนึ่งแต่ DB นับอีกกลุ่ม

**Files:**
- Create: `src/lib/promo.ts`
- Test: `src/lib/promo.test.ts`

- [ ] **Step 1: เขียนเทสก่อน** — สร้าง `src/lib/promo.test.ts`

```ts
import { describe, expect, it } from "vitest"
import { promoKey } from "./promo"

describe("promoKey", () => {
  it("ยุบ Happy Hours ทุกแบบที่พนักงานเคยพิมพ์ให้เป็นคีย์เดียว", () => {
    expect(promoKey("Happy Hours")).toBe("happyhours")
    expect(promoKey("Happy hours")).toBe("happyhours")
    expect(promoKey("HappyHours")).toBe("happyhours")
    expect(promoKey("hApPy hOuRS")).toBe("happyhours")
    expect(promoKey("  happy   hours  ")).toBe("happyhours")
  })

  it("ยุบรหัสจอง Gowabi ทุกเลขให้เป็น gowabi เดียว", () => {
    expect(promoKey("Gowabi 517620293")).toBe("gowabi")
    expect(promoKey("Gowabi224653839")).toBe("gowabi")
    expect(promoKey("Gowabi    810131039")).toBe("gowabi")
  })

  it("ไม่ยุบชื่อที่ต่างกันจริง — happyhour กับ 1แถม1 ต้องคนละคีย์", () => {
    expect(promoKey("1 แถม 1")).toBe("1แถม1")
    expect(promoKey("1 แถม 1 (คูปอง)")).toBe("1แถม1(คูปอง)")
    expect(promoKey("60แถม30 member")).toBe("60แถม30member")
  })

  it("ค่าว่างและ null ให้คีย์ว่าง", () => {
    expect(promoKey(null)).toBe("")
    expect(promoKey("")).toBe("")
    expect(promoKey("   ")).toBe("")
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าไม่ผ่าน**

```bash
npm test
```

Expected: FAIL — `Failed to resolve import "./promo"`

- [ ] **Step 3: เขียน `src/lib/promo.ts`**

```ts
/**
 * ทำข้อความโปรโมชั่นที่พนักงานพิมพ์มือให้เป็นคีย์เดียวกัน
 *
 * ต้องให้ผลตรงกับฟังก์ชัน SQL `public.promo_key()` ทุกกรณี — ถ้าสองฝั่งไม่ตรง
 * หน้าตั้งค่าจะแสดงกลุ่มหนึ่งแต่รายงาน ROI จะนับอีกกลุ่ม
 *
 * รหัสจอง Gowabi ยุบเป็นคำเดียว เพราะเลขจองไม่ซ้ำกันเลยสักรายการ
 * ถ้าไม่ยุบจะกลายเป็นโปรโมชั่น 55 ตัวที่ใช้ตัวละ 1 ครั้ง
 */
export function promoKey(text: string | null | undefined): string {
  const key = (text ?? "").toLowerCase().replace(/\s+/g, "")
  return key.startsWith("gowabi") ? "gowabi" : key
}
```

- [ ] **Step 4: `npm test`**

Expected: PASS ทั้งหมด **27 ข้อ** (23 เดิม + 4 ใหม่)

- [ ] **Step 5: ตรวจว่า TS กับ SQL ให้ผลตรงกัน** — `execute_sql`

```sql
select public.promo_key('  happy   hours  ') as a,   -- happyhours
       public.promo_key('60แถม30 member')   as b,   -- 60แถม30member
       public.promo_key('1 แถม 1 (คูปอง)')  as c;   -- 1แถม1(คูปอง)
```

Expected: ตรงกับที่เทสฝั่ง TS คาดไว้ทุกช่อง

- [ ] **Step 6: Commit**

```bash
git add src/lib/promo.ts src/lib/promo.test.ts
git commit -m "feat: ฟังก์ชันยุบชื่อโปรโมชั่นพร้อมเทส"
```

---

## Task 5: `src/lib/insights.ts` + เทส (TDD)

**Files:**
- Create: `src/lib/insights.ts`
- Test: `src/lib/insights.test.ts`

- [ ] **Step 1: เขียนเทสก่อน** — สร้าง `src/lib/insights.test.ts`

```ts
import { describe, expect, it } from "vitest"
import { daysSince, heatIntensity, isDormant } from "./insights"

describe("heatIntensity", () => {
  it("ไล่ระดับ 0-4 ตามสัดส่วนของช่องที่แน่นที่สุด", () => {
    expect(heatIntensity(0, 20)).toBe(0)
    expect(heatIntensity(1, 20)).toBe(1)
    expect(heatIntensity(10, 20)).toBe(3)
    expect(heatIntensity(20, 20)).toBe(4)
  })

  it("ไม่หารด้วยศูนย์เมื่อยังไม่มีข้อมูลเลย", () => {
    expect(heatIntensity(0, 0)).toBe(0)
    expect(heatIntensity(5, 0)).toBe(0)
  })
})

describe("daysSince", () => {
  it("นับจำนวนวันเต็มระหว่างสองวัน", () => {
    expect(daysSince("2026-07-01", "2026-07-20")).toBe(19)
    expect(daysSince("2026-07-20", "2026-07-20")).toBe(0)
  })

  it("ข้ามเดือนและข้ามปีได้ถูกต้อง", () => {
    expect(daysSince("2026-06-28", "2026-07-01")).toBe(3)
    expect(daysSince("2025-12-31", "2026-01-01")).toBe(1)
  })
})

describe("isDormant", () => {
  it("นับเฉพาะลูกค้าที่เคยมาอย่างน้อย 2 ครั้ง — มาครั้งเดียวยังไม่ใช่ลูกค้าประจำที่หายไป", () => {
    expect(isDormant({ visits: 1, lastVisit: "2026-01-01" }, "2026-07-20", 60)).toBe(false)
    expect(isDormant({ visits: 2, lastVisit: "2026-01-01" }, "2026-07-20", 60)).toBe(true)
  })

  it("ใช้เกณฑ์ 'เกิน N วัน' ไม่ใช่ 'ครบ N วัน'", () => {
    expect(isDormant({ visits: 3, lastVisit: "2026-05-21" }, "2026-07-20", 60)).toBe(false)
    expect(isDormant({ visits: 3, lastVisit: "2026-05-20" }, "2026-07-20", 60)).toBe(true)
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าไม่ผ่าน**

```bash
npm test
```

Expected: FAIL — `Failed to resolve import "./insights"`

- [ ] **Step 3: เขียน `src/lib/insights.ts`**

```ts
export const WEEKDAY_LABELS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."] as const

/** ชั่วโมงที่ร้านเปิดจริง — ข้อมูลนอกช่วงนี้คือเวลาที่กรอกผิด ไม่เอามาระบายสี */
export const OPEN_HOURS = Array.from({ length: 12 }, (_, i) => i + 10) // 10:00–21:00

/**
 * ระดับความเข้มของสีในตาราง heatmap 0-4 เทียบกับช่องที่แน่นที่สุด
 * ใช้สัดส่วนแทนจำนวนดิบ เพราะร้านจะโตขึ้นเรื่อยๆ ถ้าตรึงเลขไว้อีกสามเดือนจะแดงหมดทั้งตาราง
 */
export function heatIntensity(sessions: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (max <= 0 || sessions <= 0) return 0
  const ratio = sessions / max
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}

/** จำนวนวันเต็มจาก `from` ถึง `to` (รูปแบบ YYYY-MM-DD ทั้งคู่) */
export function daysSince(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number)
  const [ty, tm, td] = to.split("-").map(Number)
  const ms = Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)
  return Math.round(ms / 86_400_000)
}

export type DormantInput = { visits: number; lastVisit: string }

/**
 * ลูกค้าที่ "หายไป" คือคนที่เคยกลับมาแล้วอย่างน้อยหนึ่งครั้ง (มา ≥ 2 ครั้ง) แต่หยุดมา
 * คนที่มาครั้งเดียวแล้วไม่มาอีกยังไม่เคยเป็นลูกค้าประจำ ตามกลับได้ผลน้อยกว่ามาก
 */
export function isDormant(
  row: DormantInput,
  todayIso: string,
  thresholdDays: number
): boolean {
  if (row.visits < 2) return false
  return daysSince(row.lastVisit, todayIso) > thresholdDays
}
```

- [ ] **Step 4: `npm test`**

Expected: PASS ทั้งหมด **33 ข้อ** (27 + 6 ใหม่)

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights.ts src/lib/insights.test.ts
git commit -m "feat: ฟังก์ชันช่วยคำนวณ heatmap และลูกค้าที่หายไป พร้อมเทส"
```

---

## Task 6: แท็บ "โปรโมชั่น" ในหน้าตั้งค่า

ถ้าไม่มีหน้านี้ ข้อความดิบแบบใหม่ที่พนักงานพิมพ์จะหลุดออกจากรายงานเงียบๆ ตลอดไป

**Files:**
- Create: `src/app/(app)/settings/promotions-tab.tsx`
- Modify: `src/app/(app)/settings/settings-actions.ts` (ต่อท้ายไฟล์)
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: เพิ่ม server action ต่อท้าย `settings-actions.ts`**

```ts
/* ---------------- โปรโมชั่น ---------------- */

const PROMO_KINDS = ["promotion", "channel", "internal"] as const

function refreshPromo() {
  revalidatePath("/settings")
  revalidatePath("/pos")
  revalidatePath("/insights/promotions")
}

export async function savePromotion(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const id = String(formData.get("id") ?? "").trim()
  const name = String(formData.get("name") ?? "").trim()
  const kind = String(formData.get("kind") ?? "promotion")
  const isActive = formData.get("is_active") === "on"

  if (!name) return { ok: false, error: "กรุณากรอกชื่อโปรโมชั่น" }
  if (!PROMO_KINDS.includes(kind as (typeof PROMO_KINDS)[number])) {
    return { ok: false, error: "ประเภทโปรโมชั่นไม่ถูกต้อง" }
  }

  const { data: saved, error } = id
    ? await supabase
        .from("promotions")
        .update({ name, kind, is_active: isActive })
        .eq("id", id)
        .select("id")
        .single()
    : await supabase
        .from("promotions")
        .insert({ name, kind, is_active: isActive })
        .select("id")
        .single()

  if (error) return fail(error)
  if (!saved) return { ok: false, error: "บันทึกไม่สำเร็จ" }

  // ชื่อมาตรฐานต้องจับคู่กับตัวเองเสมอ ไม่งั้นรายการที่บันทึกผ่าน dropdown
  // จะกลายเป็น "ยังไม่จับคู่" ทันทีที่บันทึก
  const { error: aliasError } = await supabase
    .from("promotion_aliases")
    .upsert(
      { raw_key: promoKey(name), promotion_id: saved.id, sample_text: name },
      { onConflict: "raw_key" }
    )

  if (aliasError) return fail(aliasError)

  refreshPromo()
  return { ok: true }
}

/** `promotionId` = null แปลว่า "ตรวจแล้ว ข้อความนี้ไม่ใช่โปรโมชั่น" */
export async function saveAlias(
  rawKey: string,
  promotionId: string | null,
  sampleText: string
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("promotion_aliases")
    .upsert(
      {
        raw_key: rawKey,
        promotion_id: promotionId,
        sample_text: sampleText,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "raw_key" }
    )

  if (error) return fail(error)
  refreshPromo()
  return { ok: true }
}
```

และเพิ่ม import ที่หัวไฟล์ (ใต้ `import { createClient } ...`):

```ts
import { promoKey } from "@/lib/promo"
```

- [ ] **Step 2: สร้าง `src/app/(app)/settings/promotions-tab.tsx`**

```tsx
"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { saveAlias, savePromotion } from "./settings-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Promotion = { id: string; name: string; kind: string; is_active: boolean }
type Unmatched = { raw_key: string; sample_text: string; uses: number }

const KIND_LABELS: Record<string, string> = {
  promotion: "โปรโมชั่น",
  channel: "ช่องทางขาย",
  internal: "ใช้ภายใน",
}

const NOT_A_PROMO = "__none__"

export function PromotionsTab({
  promotions,
  unmatched,
}: {
  promotions: Promotion[]
  unmatched: Unmatched[]
}) {
  const router = useRouter()
  const [newName, setNewName] = useState("")
  const [newKind, setNewKind] = useState("promotion")
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setSavingKey("new")
    startTransition(async () => {
      const result = await savePromotion(formData)
      if (result.ok) {
        toast.success("เพิ่มโปรโมชั่นแล้ว")
        setNewName("")
        router.refresh()
      } else {
        toast.error(result.error)
      }
      setSavingKey(null)
    })
  }

  function handleAlias(row: Unmatched, value: string) {
    setSavingKey(row.raw_key)
    startTransition(async () => {
      const result = await saveAlias(
        row.raw_key,
        value === NOT_A_PROMO ? null : value,
        row.sample_text
      )
      if (result.ok) {
        toast.success("จับคู่แล้ว")
        router.refresh()
      } else {
        toast.error(result.error)
      }
      setSavingKey(null)
    })
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">รายการโปรโมชั่น</h2>
          <p className="text-xs text-slate-500">
            ชื่อในรายการนี้จะขึ้นเป็นตัวเลือกในหน้าบันทึกขาย
            และเป็นชื่อที่ใช้รวมยอดในรายงาน ROI
          </p>
        </div>

        <ul className="space-y-2">
          {promotions.map((p) => (
            <li key={p.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-slate-500">
                      {KIND_LABELS[p.kind] ?? p.kind}
                      {!p.is_active && " · ปิดใช้แล้ว"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>

        <form onSubmit={handleCreate} className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">เพิ่มโปรโมชั่นใหม่</p>
          <div className="space-y-1">
            <Label htmlFor="promo-name">ชื่อ</Label>
            <Input
              id="promo-name"
              name="name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="เช่น ลด 20% วันเกิด"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="promo-kind">ประเภท</Label>
            <input type="hidden" name="kind" value={newKind} />
            <Select value={newKind} onValueChange={setNewKind}>
              <SelectTrigger id="promo-kind" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <input type="hidden" name="is_active" value="on" />
          <Button type="submit" disabled={savingKey === "new" || !newName.trim()}>
            เพิ่ม
          </Button>
        </form>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">ข้อความที่ยังไม่จับคู่</h2>
          <p className="text-xs text-slate-500">
            ข้อความที่เคยพิมพ์ในช่องโปรโมชั่นแต่ยังไม่รู้ว่าเป็นโปรฯ ตัวไหน
            ตราบใดที่ยังไม่จับคู่ ยอดพวกนี้จะไม่ถูกนับในรายงาน ROI
          </p>
        </div>

        {unmatched.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">
            จับคู่ครบทุกข้อความแล้ว
          </p>
        )}

        <ul className="space-y-2">
          {unmatched.map((row) => (
            <li key={row.raw_key}>
              <Card>
                <CardContent className="space-y-2 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 font-medium break-words">
                      {row.sample_text}
                    </p>
                    <span className="shrink-0 text-xs text-slate-500">
                      {row.uses} ครั้ง
                    </span>
                  </div>
                  <Select
                    disabled={savingKey === row.raw_key}
                    onValueChange={(v) => handleAlias(row, v)}
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue placeholder="— เลือกว่าเป็นโปรฯ ตัวไหน —" />
                    </SelectTrigger>
                    <SelectContent>
                      {promotions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                      <SelectItem value={NOT_A_PROMO}>
                        ไม่ใช่โปรโมชั่น (เป็นโน้ต)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: ต่อสายในหน้า `settings/page.tsx`**

เพิ่ม import:

```tsx
import { PromotionsTab } from "./promotions-tab"
```

เพิ่มใน `Promise.all` (ต่อจาก `recentExpenses`):

```tsx
    supabase
      .from("promotions")
      .select("id, name, kind, is_active")
      .order("name"),
    supabase
      .from("sales")
      .select("coupon_promo")
      .not("coupon_promo", "is", null),
    supabase.from("promotion_aliases").select("raw_key"),
```

และรับค่าเพิ่มใน destructuring: `{ data: promotions }, { data: promoSales }, { data: aliases }`

เพิ่มการคำนวณรายการที่ยังไม่จับคู่ (ใต้บรรทัด `const settings = ...`):

```tsx
  // นับข้อความดิบที่ยังไม่มีแถวใน promotion_aliases เพื่อให้เจ้าของร้านมาจับคู่
  const knownKeys = new Set((aliases ?? []).map((a) => a.raw_key))
  const unmatchedMap = new Map<string, { sample_text: string; uses: number }>()
  for (const row of promoSales ?? []) {
    const text = (row.coupon_promo ?? "").trim()
    if (!text) continue
    const key = promoKey(text)
    if (knownKeys.has(key)) continue
    const current = unmatchedMap.get(key) ?? { sample_text: text, uses: 0 }
    current.uses += 1
    unmatchedMap.set(key, current)
  }
  const unmatched = [...unmatchedMap.entries()]
    .map(([raw_key, v]) => ({ raw_key, ...v }))
    .sort((a, b) => b.uses - a.uses)
```

เพิ่ม import `promoKey`:

```tsx
import { promoKey } from "@/lib/promo"
```

เพิ่มแท็บใน `TabsList` (หลังแท็บ `cost-types`):

```tsx
          {canEditCatalog && (
            <TabsTrigger value="promotions" className="flex-1">
              โปรฯ
            </TabsTrigger>
          )}
```

และเนื้อหาแท็บ (หลัง `TabsContent` ของ `cost-types`):

```tsx
        {canEditCatalog && (
          <TabsContent value="promotions" className="pt-4">
            <PromotionsTab
              promotions={promotions ?? []}
              unmatched={unmatched}
            />
          </TabsContent>
        )}
```

- [ ] **Step 4: build + lint + test**

```bash
npm run build && npx eslint src && npm test
```

Expected: ผ่านทั้งหมด · เทส 33 ข้อ

- [ ] **Step 5: ตรวจบนหน้าจริง** — เปิด `/settings` แท็บ "โปรฯ"

ต้องเห็นโปรโมชั่น 10 ตัว และรายการ "ยังไม่จับคู่" **20 รายการ**
ลองจับคู่ 1 รายการแล้วรีเฟรช ต้องเหลือ 19

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/settings
git commit -m "feat: แท็บจัดการโปรโมชั่นและจับคู่ชื่อที่พิมพ์ต่างกัน"
```

---

## Task 7: dropdown โปรโมชั่นในหน้า POS

แก้ที่ต้นเหตุ — ตราบใดที่ยังพิมพ์อิสระ ปัญหาชื่อแตกจะกลับมาใหม่ทุกเดือน

**Files:**
- Modify: `src/app/(app)/pos/page.tsx`
- Modify: `src/app/(app)/pos/pos-form.tsx:172-186`

- [ ] **Step 1: ส่งรายการโปรโมชั่นเข้าฟอร์ม** — แก้ `pos/page.tsx` ทั้งไฟล์เป็น

```tsx
import { createClient } from "@/lib/supabase/server"
import { PosForm } from "./pos-form"

export const metadata = { title: "บันทึกขาย · สุขกายา POS" }

export default async function PosPage() {
  const supabase = await createClient()

  const [{ data: therapists }, { data: services }, { data: promotions }] =
    await Promise.all([
      supabase
        .from("therapists")
        .select("id, name")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("services")
        .select("id, name, price, commission")
        .eq("is_active", true)
        .order("name"),
      // ใช้ภายใน (Member / ถ่ายคอนเทนต์) ไม่ต้องขึ้นเป็นตัวเลือกให้พนักงานเลือกผิด
      supabase
        .from("promotions")
        .select("id, name")
        .eq("is_active", true)
        .neq("kind", "internal")
        .order("name"),
    ])

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">บันทึกขาย</h1>
      <PosForm
        therapists={therapists ?? []}
        services={services ?? []}
        promotions={promotions ?? []}
      />
    </div>
  )
}
```

- [ ] **Step 2: รับ prop ใหม่ใน `pos-form.tsx`**

เพิ่ม type และแก้ signature:

```tsx
type Therapist = { id: string; name: string }
type Service = { id: string; name: string; price: number; commission: number }
type Promotion = { id: string; name: string }

export function PosForm({
  therapists,
  services,
  promotions,
}: {
  therapists: Therapist[]
  services: Service[]
  promotions: Promotion[]
}) {
```

- [ ] **Step 3: เพิ่ม state โหมด "พิมพ์เอง"** — ใต้ `const [couponPromo, setCouponPromo] = useState("")`

```tsx
  // Gowabi ต้องพิมพ์รหัสจองเป็นเลขเสมอ จึงบังคับเป็นช่องพิมพ์
  // กรณีอื่นเริ่มจาก dropdown แล้วเปิดช่องพิมพ์เฉพาะเมื่อเลือก "อื่นๆ"
  const [customPromo, setCustomPromo] = useState(false)
```

และเพิ่ม `setCustomPromo(false)` ใน `resetForm()`

- [ ] **Step 4: แทนที่บล็อกช่องโปรโมชั่น** (`pos-form.tsx` บรรทัด 174-186 เดิม) ด้วย

```tsx
        <div className="space-y-2">
          <Label htmlFor="coupon_promo">
            {isGowabi ? "รหัส Gowabi" : "คูปอง / โปรโมชั่น"}
          </Label>
          {isGowabi || customPromo ? (
            <Input
              id="coupon_promo"
              name="coupon_promo"
              className="h-12"
              value={couponPromo}
              onChange={(e) => setCouponPromo(e.target.value)}
              placeholder={isGowabi ? "เช่น Gowabi 517620293" : "พิมพ์ชื่อโปรฯ"}
            />
          ) : (
            <select
              id="coupon_promo"
              name="coupon_promo"
              value={couponPromo}
              onChange={(e) => {
                if (e.target.value === "__custom__") {
                  setCustomPromo(true)
                  setCouponPromo("")
                  return
                }
                setCouponPromo(e.target.value)
              }}
              className="h-12 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">— ไม่มี —</option>
              {promotions.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
              <option value="__custom__">อื่นๆ (พิมพ์เอง)</option>
            </select>
          )}
        </div>
```

- [ ] **Step 5: build + lint + test**

```bash
npm run build && npx eslint src && npm test
```

Expected: ผ่านทั้งหมด

- [ ] **Step 6: ทดสอบบันทึกขายจริง** — เปิด `/pos` เลือกโปรฯ `Happy Hours` แล้วบันทึก 1 รายการ

ตรวจด้วย `execute_sql` ว่ารายการใหม่เข้ากลุ่มถูกทันที:

```sql
select uses from public.v_promo_roi where promotion_name = 'Happy Hours';
```

Expected: **90** (89 + รายการทดสอบ) — จากนั้นลบรายการทดสอบทิ้งที่หน้าแรก

- [ ] **Step 7: Commit**

```bash
git add src/app/\(app\)/pos
git commit -m "feat: เลือกโปรโมชั่นจากรายการแทนพิมพ์อิสระในหน้าขาย"
```

---

## Task 8: การ์ดสิทธิ์ที่ใช้ร่วมกัน + หน้า Heatmap

**Files:**
- Create: `src/app/(app)/insights/shared.tsx`
- Create: `src/app/(app)/insights/heatmap/page.tsx`

- [ ] **Step 1: สร้าง `src/app/(app)/insights/shared.tsx`**

```tsx
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

/** หน้าวิเคราะห์ทุกหน้ามีข้อมูลติดต่อลูกค้าหรือผลประกอบการ จึงจำกัดที่ manager ขึ้นไป */
export function InsightsAccessDenied({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{title}</h1>
      <Card>
        <CardContent className="space-y-3 py-6 text-sm text-slate-600">
          <p>
            หน้านี้แสดงข้อมูลเชิงลึกของร้านและข้อมูลติดต่อลูกค้า
            จึงจำกัดให้เฉพาะผู้จัดการและเจ้าของร้านเท่านั้นที่ดูได้
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/">กลับหน้าแรก</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export function canSeeInsights(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager"
}
```

- [ ] **Step 2: สร้าง `src/app/(app)/insights/heatmap/page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server"
import { InsightsAccessDenied, canSeeInsights } from "../shared"
import { OPEN_HOURS, WEEKDAY_LABELS, heatIntensity } from "@/lib/insights"
import { formatBaht } from "@/lib/constants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = { title: "ชั่วโมงคนแน่น · สุขกายา POS" }

const HEAT_CLASSES = [
  "bg-slate-50 text-slate-300",
  "bg-emerald-50 text-emerald-900",
  "bg-emerald-100 text-emerald-900",
  "bg-emerald-300 text-emerald-950",
  "bg-emerald-600 font-semibold text-white",
] as const

export default async function HeatmapPage() {
  const supabase = await createClient()
  const { data: profile } = await supabase.from("profiles").select("role").single()

  if (!canSeeInsights(profile?.role)) {
    return <InsightsAccessDenied title="ชั่วโมงคนแน่น" />
  }

  const [{ data: density }, { count: totalSales }] = await Promise.all([
    supabase.from("v_hourly_density").select("weekday, hour, sessions, revenue"),
    supabase.from("sales").select("id", { count: "exact", head: true }),
  ])

  const rows = density ?? []
  const counted = rows.reduce((sum, r) => sum + Number(r.sessions ?? 0), 0)
  const total = totalSales ?? 0

  // ช่องที่แน่นที่สุดคือฐานของสเกลสี — นับเฉพาะชั่วโมงที่ร้านเปิดจริง
  const cells = new Map<string, { sessions: number; revenue: number }>()
  let max = 0
  let outsideHours = 0
  for (const r of rows) {
    const hour = Number(r.hour ?? -1)
    const sessions = Number(r.sessions ?? 0)
    if (!OPEN_HOURS.includes(hour)) {
      outsideHours += sessions
      continue
    }
    cells.set(`${r.weekday}-${hour}`, {
      sessions,
      revenue: Number(r.revenue ?? 0),
    })
    if (sessions > max) max = sessions
  }

  const busiest = [...cells.entries()].sort(
    (a, b) => b[1].sessions - a[1].sessions
  )[0]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">ชั่วโมงคนแน่น</h1>
        <p className="text-sm text-slate-600">
          รวมทุกวันตั้งแต่เปิดร้าน แยกตามวันในสัปดาห์และชั่วโมง
        </p>
      </div>

      {/* ถ้าไม่บอกสัดส่วนนี้ จะเข้าใจว่าเป็นภาพรวมทั้งร้าน ทั้งที่ข้อมูลเก่ามีเวลาแค่ 70% */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="py-3 text-xs text-amber-900">
          คำนวณจาก {counted.toLocaleString()} รายการที่บันทึกเวลาไว้ จากทั้งหมด{" "}
          {total.toLocaleString()} รายการ (
          {total > 0 ? Math.round((counted / total) * 100) : 0}%) —
          ข้อมูลที่ import จากไฟล์เก่าบางส่วนไม่มีเวลาขาย
          {outsideHours > 0 &&
            ` · อีก ${outsideHours} รายการมีเวลานอกเวลาทำการ ไม่ถูกนำมาแสดง`}
        </CardContent>
      </Card>

      {busiest && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-slate-600">ช่วงที่แน่นที่สุด</p>
            <p className="text-2xl font-bold">
              {WEEKDAY_LABELS[Number(busiest[0].split("-")[0])]}{" "}
              {busiest[0].split("-")[1]}:00 น.
            </p>
            <p className="text-sm text-slate-600">
              {busiest[1].sessions} เซสชัน · {formatBaht(busiest[1].revenue)} บาท
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">ตารางความหนาแน่น</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-separate border-spacing-0.5 text-center text-xs">
            <thead>
              <tr>
                <th className="w-8" />
                {OPEN_HOURS.map((h) => (
                  <th key={h} className="font-normal text-slate-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WEEKDAY_LABELS.map((label, weekday) => (
                <tr key={label}>
                  <th className="pr-1 text-right font-normal text-slate-500">
                    {label}
                  </th>
                  {OPEN_HOURS.map((hour) => {
                    const cell = cells.get(`${weekday}-${hour}`)
                    const sessions = cell?.sessions ?? 0
                    return (
                      <td
                        key={hour}
                        className={`rounded py-1.5 ${HEAT_CLASSES[heatIntensity(sessions, max)]}`}
                        title={`${label} ${hour}:00 — ${sessions} เซสชัน`}
                      >
                        {sessions || "·"}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: build + lint + test**

```bash
npm run build && npx eslint src && npm test
```

Expected: ผ่านทั้งหมด

- [ ] **Step 4: ตรวจบนหน้าจริง** — เปิด `/insights/heatmap`

ต้องเห็นแถบเหลืองบอก "คำนวณจาก 1,578 รายการ ... (70%)" และตาราง 7 แถว × 12 คอลัมน์
ตัวเลขรวมทุกช่องต้องเท่ากับ 1,577 (1,578 ลบ 1 รายการเวลา 01:xx ที่นับเป็นนอกเวลาทำการ)

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/insights
git commit -m "feat: หน้า heatmap ชั่วโมงคนแน่น"
```

---

## Task 9: หน้า ROI ส่วนลด

**Files:**
- Create: `src/app/(app)/insights/promotions/page.tsx`

- [ ] **Step 1: สร้าง `src/app/(app)/insights/promotions/page.tsx`**

```tsx
import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { InsightsAccessDenied, canSeeInsights } from "../shared"
import { promoKey } from "@/lib/promo"
import { formatBaht } from "@/lib/constants"
import { formatThaiDate } from "@/lib/datetime"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = { title: "ROI ส่วนลด · สุขกายา POS" }

const KIND_LABELS: Record<string, string> = {
  promotion: "โปรโมชั่น",
  channel: "ช่องทางขาย",
  internal: "ใช้ภายใน",
}

export default async function PromotionsInsightPage() {
  const supabase = await createClient()
  const { data: profile } = await supabase.from("profiles").select("role").single()

  if (!canSeeInsights(profile?.role)) {
    return <InsightsAccessDenied title="ROI ส่วนลด" />
  }

  const [{ data: roi }, { data: promoSales }, { data: aliases }] =
    await Promise.all([
      supabase
        .from("v_promo_roi")
        .select(
          "promotion_id, promotion_name, kind, uses, discount_given, revenue, customers, returning_customers, first_used, last_used"
        ),
      supabase.from("sales").select("coupon_promo").not("coupon_promo", "is", null),
      supabase.from("promotion_aliases").select("raw_key"),
    ])

  const knownKeys = new Set((aliases ?? []).map((a) => a.raw_key))
  const unmatchedCount = (promoSales ?? []).filter((row) => {
    const text = (row.coupon_promo ?? "").trim()
    return text !== "" && !knownKeys.has(promoKey(text))
  }).length

  // เรียงตามส่วนลดที่จ่ายไป — โปรฯ ที่กินส่วนลดมากที่สุดคือตัวที่ต้องตัดสินใจก่อน
  const rows = [...(roi ?? [])].sort(
    (a, b) => Number(b.discount_given ?? 0) - Number(a.discount_given ?? 0)
  )
  const totalDiscount = rows.reduce((s, r) => s + Number(r.discount_given ?? 0), 0)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">ROI ส่วนลด</h1>
        <p className="text-sm text-slate-600">
          ส่วนลดที่จ่ายไปทั้งหมด {formatBaht(totalDiscount)} บาท
        </p>
      </div>

      {unmatchedCount > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-3 text-xs text-amber-900">
            มี {unmatchedCount} รายการที่พิมพ์ชื่อโปรฯ ไว้แต่ยังไม่ได้จับคู่
            จึงยังไม่ถูกนับในตารางนี้ —{" "}
            <Link href="/settings" className="underline">
              ไปจับคู่ที่หน้าตั้งค่า
            </Link>
          </CardContent>
        </Card>
      )}

      {rows.map((r) => {
        const customers = Number(r.customers ?? 0)
        const returning = Number(r.returning_customers ?? 0)
        const returnRate = customers > 0 ? Math.round((returning / customers) * 100) : 0
        return (
          <Card key={r.promotion_id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-baseline justify-between gap-2 text-base">
                <span className="min-w-0 truncate">{r.promotion_name}</span>
                <span className="shrink-0 text-xs font-normal text-slate-500">
                  {KIND_LABELS[r.kind ?? ""] ?? r.kind}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <Stat label="ใช้ไป" value={`${r.uses ?? 0} ครั้ง`} />
                <Stat
                  label="ส่วนลดที่ให้"
                  value={`${formatBaht(Number(r.discount_given ?? 0))} ฿`}
                />
                <Stat
                  label="ยอดขายที่เกิด"
                  value={`${formatBaht(Number(r.revenue ?? 0))} ฿`}
                />
                <Stat label="ลูกค้าที่ใช้" value={`${customers} คน`} />
              </div>

              <div className="border-t pt-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-slate-600">กลับมาซื้อซ้ำหลังใช้โปรฯ</span>
                  <span
                    className={`font-semibold ${
                      returnRate >= 50 ? "text-emerald-800" : "text-slate-700"
                    }`}
                  >
                    {returning} คน ({returnRate}%)
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {r.first_used && r.last_used
                    ? `ใช้ครั้งแรก ${formatThaiDate(r.first_used)} · ล่าสุด ${formatThaiDate(r.last_used)}`
                    : null}
                </p>
              </div>
            </CardContent>
          </Card>
        )
      })}

      {rows.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">
          ยังไม่มีโปรโมชั่นที่จับคู่ไว้
        </p>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
```

> หน้านี้นับ "ยังไม่จับคู่" ด้วย `promoKey` ฝั่ง TS ให้ตรงกับที่หน้าตั้งค่านับ
> ถ้าสองหน้าให้ตัวเลขไม่เท่ากัน แปลว่า `promoKey` กับ `promo_key()` ใน SQL เพี้ยนจากกันแล้ว

- [ ] **Step 2: build + lint + test**

```bash
npm run build && npx eslint src && npm test
```

Expected: ผ่านทั้งหมด

- [ ] **Step 3: ตรวจตัวเลขบนหน้าจริง** — เปิด `/insights/promotions`

ต้องเห็น:
- `1 แถม 1` — ใช้ไป 253 ครั้ง · ส่วนลด 53,530 ฿ · ลูกค้า 165 คน · กลับมาซื้อซ้ำ 87 คน (53%)
- `Happy Hours` — ใช้ไป **89** ครั้ง · ส่วนลด 17,960 ฿ · กลับมาซื้อซ้ำ 21 คน (44%)
- แถบเหลืองบอกว่ามี 20 รายการยังไม่จับคู่

ถ้า Happy Hours ยังขึ้น 38 ครั้ง แปลว่า alias ไม่ทำงาน **หยุด**

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/insights
git commit -m "feat: หน้า ROI ส่วนลดต่อโปรโมชั่น"
```

---

## Task 10: หน้า LTV ลูกค้า + ลูกค้าที่หายไป

**Files:**
- Create: `src/app/(app)/insights/customers/page.tsx`

- [ ] **Step 1: สร้าง `src/app/(app)/insights/customers/page.tsx`**

```tsx
import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { InsightsAccessDenied, canSeeInsights } from "../shared"
import { daysSince, isDormant } from "@/lib/insights"
import { formatBaht } from "@/lib/constants"
import { formatThaiDate, todayInShopTz } from "@/lib/datetime"
import { Card, CardContent } from "@/components/ui/card"

export const metadata = { title: "ลูกค้า · สุขกายา POS" }

const DAY_OPTIONS = [30, 60, 90]

export default async function CustomerInsightPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; days?: string }>
}) {
  const supabase = await createClient()
  const { data: profile } = await supabase.from("profiles").select("role").single()

  if (!canSeeInsights(profile?.role)) {
    return <InsightsAccessDenied title="ลูกค้า" />
  }

  const params = await searchParams
  const tab = params.tab === "dormant" ? "dormant" : "ltv"
  const days = DAY_OPTIONS.includes(Number(params.days)) ? Number(params.days) : 60

  const { data } = await supabase
    .from("v_customer_ltv")
    .select(
      "customer_id, name, nickname, phone, customer_type, visits, lifetime_value, avg_ticket, first_visit, last_visit"
    )
    .order("lifetime_value", { ascending: false })

  const rows = data ?? []
  const today = todayInShopTz()

  const dormant = rows.filter((r) =>
    isDormant(
      { visits: Number(r.visits ?? 0), lastVisit: r.last_visit ?? today },
      today,
      days
    )
  )

  const shown = tab === "dormant" ? dormant : rows.slice(0, 50)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">ลูกค้า</h1>
        <p className="text-sm text-slate-600">
          {tab === "ltv"
            ? `ลูกค้าที่เคยซื้อ ${rows.length} คน · แสดง 50 อันดับแรกตามยอดสะสม`
            : `เคยมาอย่างน้อย 2 ครั้ง แต่ไม่มาเกิน ${days} วัน — ${dormant.length} คน`}
        </p>
      </div>

      <div className="flex gap-2">
        <TabLink href="/insights/customers" label="ยอดสะสมสูงสุด" active={tab === "ltv"} />
        <TabLink
          href={`/insights/customers?tab=dormant&days=${days}`}
          label="หายไปนาน"
          active={tab === "dormant"}
        />
      </div>

      {tab === "dormant" && (
        <div className="flex gap-2">
          {DAY_OPTIONS.map((d) => (
            <Link
              key={d}
              href={`/insights/customers?tab=dormant&days=${d}`}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                d === days
                  ? "border-emerald-600 bg-emerald-50 font-medium text-emerald-900"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              เกิน {d} วัน
            </Link>
          ))}
        </div>
      )}

      <ul className="space-y-2">
        {shown.map((r) => (
          <li key={r.customer_id}>
            <Link href={`/customers/${r.customer_id}`}>
              <Card className="transition-colors hover:bg-slate-50">
                <CardContent className="space-y-1 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {r.name}
                        {r.nickname && (
                          <span className="text-slate-500"> ({r.nickname})</span>
                        )}
                        {r.customer_type === "สมาชิก" && (
                          <span className="ml-1 text-xs text-emerald-700">💳</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {r.visits} ครั้ง · เฉลี่ย {formatBaht(Number(r.avg_ticket ?? 0))} ฿
                        {r.phone && ` · ${r.phone}`}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold">
                      {formatBaht(Number(r.lifetime_value ?? 0))} ฿
                    </span>
                  </div>
                  {r.last_visit && (
                    <p className="text-xs text-slate-500">
                      มาล่าสุด {formatThaiDate(r.last_visit)} (
                      {daysSince(r.last_visit, today)} วันก่อน)
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      {shown.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">
          ไม่มีลูกค้าในเงื่อนไขนี้
        </p>
      )}
    </div>
  )
}

function TabLink({
  href,
  label,
  active,
}: {
  href: string
  label: string
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={`flex-1 rounded-md border px-3 py-2 text-center text-sm ${
        active
          ? "border-emerald-600 bg-emerald-50 font-medium text-emerald-900"
          : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </Link>
  )
}
```

- [ ] **Step 2: build + lint + test**

```bash
npm run build && npx eslint src && npm test
```

Expected: ผ่านทั้งหมด

- [ ] **Step 3: ตรวจตัวเลขบนหน้าจริง**

- `/insights/customers` — หัวข้อบอก "ลูกค้าที่เคยซื้อ 872 คน" · คนแรกยอดสะสม **26,535 ฿**
- `/insights/customers?tab=dormant&days=60` — **130 คน** (ตัวเลขจะขยับตามวันที่รัน
  ถ้ารันหลัง 20 ก.ค. 69 จะมากกว่านี้เล็กน้อย ถือว่าปกติ)
- `?days=90` — 64 คน · `?days=30` — 226 คน
- กดที่ลูกค้าคนใดคนหนึ่ง ต้องเด้งไปหน้า `/customers/<id>` ที่มีอยู่แล้ว

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/insights
git commit -m "feat: หน้า LTV ลูกค้าและลูกค้าที่หายไปนาน"
```

---

## Task 11: ต่อสายเมนู ตรวจตัวเลข และ deploy

**Files:**
- Modify: `src/app/(app)/more/page.tsx`
- Modify: `supabase/reconciliation.sql`
- Modify: `README.md`

- [ ] **Step 1: เพิ่มลิงก์ใน `more/page.tsx`**

แก้บรรทัด import icon เป็น:

```tsx
import {
  BadgePercent,
  CalendarClock,
  CreditCard,
  FileBarChart,
  PiggyBank,
  Settings,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react"
```

แล้วแทรก 3 รายการนี้ใน `ITEMS` ต่อจากรายการ `/finance`:

```tsx
  {
    href: "/insights/heatmap",
    label: "ชั่วโมงคนแน่น",
    description: "ดูว่าวันไหนเวลาไหนลูกค้าเยอะที่สุด",
    icon: CalendarClock,
  },
  {
    href: "/insights/promotions",
    label: "ROI ส่วนลด",
    description: "โปรฯ ไหนคุ้ม โปรฯ ไหนแค่แจกส่วนลด",
    icon: BadgePercent,
  },
  {
    href: "/insights/customers",
    label: "ลูกค้าและคนที่หายไป",
    description: "ยอดสะสมรายคน และคนที่ควรตามกลับ",
    icon: Users,
  },
```

- [ ] **Step 2: เพิ่มการตรวจใน `supabase/reconciliation.sql`**

เพิ่มใน `expected(...)` ต่อจาก `('profit_cash_2026_06', 88991)` (อย่าลืมใส่ comma
หลังบรรทัดเดิม):

```sql
  ,
  -- เฟส 3: การจับคู่ชื่อโปรโมชั่น — ตรวจเฉพาะข้อมูลถึง 19 ก.ค. ซึ่งเป็นข้อมูลที่ import มา
  -- ถ้าตัวเลขเหล่านี้ตก แปลว่า alias หลุดหรือ promo_key เปลี่ยนพฤติกรรม
  ('promo_happy_hours_uses',     89),
  ('promo_happy_hours_discount', 17960),
  ('promo_1get1_uses',           253),
  ('promo_unmatched_rows',       20)
```

และเพิ่มใน `actual(...)` ต่อท้าย:

```sql
  union all
  select 'promo_happy_hours_uses', count(*)
  from public.sales s
  join public.promotion_aliases a on a.raw_key = public.promo_key(s.coupon_promo)
  join public.promotions p on p.id = a.promotion_id
  where p.name = 'Happy Hours' and s.sale_date <= '2026-07-19'

  union all
  select 'promo_happy_hours_discount', round(sum(s.discount))
  from public.sales s
  join public.promotion_aliases a on a.raw_key = public.promo_key(s.coupon_promo)
  join public.promotions p on p.id = a.promotion_id
  where p.name = 'Happy Hours' and s.sale_date <= '2026-07-19'

  union all
  select 'promo_1get1_uses', count(*)
  from public.sales s
  join public.promotion_aliases a on a.raw_key = public.promo_key(s.coupon_promo)
  join public.promotions p on p.id = a.promotion_id
  where p.name = '1 แถม 1' and s.sale_date <= '2026-07-19'

  union all
  select 'promo_unmatched_rows', count(*)
  from public.sales s
  where s.coupon_promo is not null and btrim(s.coupon_promo) <> ''
    and s.sale_date <= '2026-07-19'
    and not exists (
      select 1 from public.promotion_aliases a
      where a.raw_key = public.promo_key(s.coupon_promo)
    )
```

- [ ] **Step 3: รันชุดตรวจ** — เอาเนื้อไฟล์ `supabase/reconciliation.sql` ไปรันด้วย `execute_sql`

Expected: PASS ครบ **18 ข้อ** · ถ้ามี FAIL แม้ข้อเดียว **หยุด** และแก้ก่อน

> ถ้า `promo_unmatched_rows` FAIL เพราะมีคนไปจับคู่เพิ่มในหน้าตั้งค่าระหว่างทำงาน
> ให้แก้ค่า expected ให้ตรงกับความจริง **หลังตรวจแล้วว่าจับคู่ถูก** — ห้ามแก้ให้ผ่านเฉยๆ

- [ ] **Step 4: `get_advisors` type `security`**

Expected: ไม่มี ERROR ใหม่จาก 3 view และ 2 ตารางที่เพิ่ม

- [ ] **Step 5: ตรวจครบชุดก่อน deploy**

```bash
npm test && npm run build && npx eslint src
```

Expected: เทส 33 ข้อผ่าน · build สำเร็จ · lint ไม่มี error

- [ ] **Step 6: ตรวจสิทธิ์ด้วยบัญชี staff**

เข้าด้วยผู้ใช้ role `staff` แล้วเปิด `/insights/heatmap`, `/insights/promotions`,
`/insights/customers` — ทั้งสามหน้าต้องขึ้นการ์ด "ไม่มีสิทธิ์" และ **ต้องไม่มี**
ข้อมูลลูกค้าหลุดออกมาใน HTML (ดูด้วย view-source)

- [ ] **Step 7: Deploy**

```bash
npx vercel deploy --prod
```

- [ ] **Step 8: อัปเดต `README.md`**

- เพิ่ม `/insights/heatmap`, `/insights/promotions`, `/insights/customers` ในตารางหน้า
- เปลี่ยน `- [ ] เฟส 3 — ...` (บรรทัด 87) เป็น
  `- [x] **เฟส 3 Analytics** — Heatmap · ROI ส่วนลด · LTV ลูกค้า · ลูกค้าที่หายไป`
- แก้กฎบัญชีข้อ 4 จาก "ต้อง PASS ครบ 14 ข้อ" เป็น "ต้อง PASS ครบ 18 ข้อ"
- เพิ่มกฎข้อ 6:

```markdown
**6. ชื่อโปรโมชั่นรวมยอดผ่านตาราง `promotion_aliases` เท่านั้น**
`coupon_promo` เป็นข้อความพิมพ์มือ — `Happy Hours` เคยแตกเป็น 8 แบบจนรายงานบอกว่าใช้ 38 ครั้ง
ทั้งที่จริง 89 ครั้ง ทุกการนับโปรฯ ต้อง join ผ่าน `public.promo_key(coupon_promo)`
ห้ามใช้ `group by coupon_promo` ตรงๆ · ข้อความแบบใหม่ที่ยังไม่จับคู่จะโผล่ในแท็บ
"โปรฯ" หน้าตั้งค่า ควรเข้าไปเคลียร์เดือนละครั้ง
```

- [ ] **Step 9: Commit**

```bash
git add README.md supabase/reconciliation.sql src/app/\(app\)/more/page.tsx
git commit -m "docs: อัปเดต README และเพิ่มการตรวจตัวเลขเฟส 3"
```

---

## เสร็จแล้วได้อะไร

- รู้ว่าวันไหนเวลาไหนคนแน่น — จัดตารางหมอตามความจริง ไม่ใช่ความรู้สึก
- รู้ว่าโปรฯ ไหนแจกส่วนลดแล้วได้ลูกค้าประจำกลับมา (1 แถม 1 = 53%) และตัวไหนแค่แจก (KOL = 13%)
- ตัวเลขโปรฯ ถูกต้องแล้ว — Happy Hours 89 ครั้ง ไม่ใช่ 38
- ปัญหาชื่อแตกไม่กลับมาอีก เพราะหน้า POS เลือกจากรายการแทนพิมพ์อิสระ
- เห็นลูกค้าที่มีค่าที่สุด และรายชื่อ 130 คนที่หายไปเกิน 60 วันพร้อมเบอร์โทร
