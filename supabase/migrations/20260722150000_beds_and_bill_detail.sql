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
