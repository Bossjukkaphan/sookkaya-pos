-- อ่าน role ของผู้ใช้ปัจจุบัน (security definer เพื่อเลี่ยง recursion บน profiles)
create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- สร้าง profile อัตโนมัติเมื่อมีผู้ใช้ใหม่สมัคร
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    case when new.email = 'boss.jukkaphan@gmail.com' then 'admin' else 'staff' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles                  enable row level security;
alter table public.therapists                enable row level security;
alter table public.services                  enable row level security;
alter table public.customers                 enable row level security;
alter table public.sales                     enable row level security;
alter table public.expenses                  enable row level security;
alter table public.member_topups             enable row level security;
alter table public.settings                  enable row level security;
alter table public.therapist_daily_commission enable row level security;
alter table public.receipt_counters          enable row level security;

-- profiles: ดูของตัวเองได้ / admin ดูและแก้ได้ทุกคน
create policy profiles_select_self on public.profiles
  for select to authenticated using (id = auth.uid() or public.current_role() = 'admin');
create policy profiles_admin_write on public.profiles
  for all to authenticated
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- ข้อมูลหลัก: พนักงานทุกคนอ่านได้ / manager+admin แก้ไขได้
create policy therapists_read on public.therapists
  for select to authenticated using (true);
create policy therapists_write on public.therapists
  for all to authenticated
  using (public.current_role() in ('admin','manager'))
  with check (public.current_role() in ('admin','manager'));

create policy services_read on public.services
  for select to authenticated using (true);
create policy services_write on public.services
  for all to authenticated
  using (public.current_role() in ('admin','manager'))
  with check (public.current_role() in ('admin','manager'));

-- งานประจำวัน: พนักงานทุกคนทำได้
create policy customers_all on public.customers
  for all to authenticated using (true) with check (true);
create policy sales_all on public.sales
  for all to authenticated using (true) with check (true);
create policy counters_all on public.receipt_counters
  for all to authenticated using (true) with check (true);

-- รายจ่าย / สมาชิก / ค่ามือ: manager+admin เท่านั้น (staff อ่านค่ามือได้)
create policy expenses_manager on public.expenses
  for all to authenticated
  using (public.current_role() in ('admin','manager'))
  with check (public.current_role() in ('admin','manager'));

create policy topups_read on public.member_topups
  for select to authenticated using (true);
create policy topups_write on public.member_topups
  for all to authenticated
  using (public.current_role() in ('admin','manager'))
  with check (public.current_role() in ('admin','manager'));

create policy commission_read on public.therapist_daily_commission
  for select to authenticated using (true);
create policy commission_write on public.therapist_daily_commission
  for all to authenticated
  using (public.current_role() in ('admin','manager'))
  with check (public.current_role() in ('admin','manager'));

-- ตั้งค่าระบบ: อ่านได้ทุกคน แก้ได้เฉพาะ admin
create policy settings_read on public.settings
  for select to authenticated using (true);
create policy settings_admin on public.settings
  for all to authenticated
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
