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
