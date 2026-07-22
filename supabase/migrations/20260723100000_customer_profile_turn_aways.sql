-- Phase D: โปรไฟล์ลูกค้าเชิงลึก + บันทึกปฏิเสธลูกค้า (metadata ล้วน ไม่แตะเงิน)
alter table public.customers add column gender text
  check (gender is null or gender in ('ชาย','หญิง','อื่นๆ'));
alter table public.customers add column nationality text;

-- ปฏิเสธลูกค้า: กดบันทึกทุกครั้งที่คิวเต็มจนรับไม่ได้ — ตัวเลขสำคัญตอนตัดสินใจจ้างหมอเพิ่ม
create table public.turn_aways (
  id         uuid primary key default gen_random_uuid(),
  queue_date date not null,
  note       text,
  created_by text,
  created_at timestamptz not null default now()
);
create index turn_aways_date_idx on public.turn_aways (queue_date);
alter table public.turn_aways enable row level security;
create policy "authenticated read turn_aways" on public.turn_aways
  for select to authenticated using (true);
create policy "authenticated insert turn_aways" on public.turn_aways
  for insert to authenticated with check (true);
