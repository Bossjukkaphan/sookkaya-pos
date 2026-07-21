-- เปลี่ยนชื่อจาก current_role (ชนกับ reserved keyword ของ SQL) เป็น app_role
create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ลบ policy เดิมทั้งหมดเพื่อสร้างใหม่ให้อ้าง app_role()
drop policy profiles_select_self on public.profiles;
drop policy profiles_admin_write on public.profiles;
drop policy therapists_read  on public.therapists;
drop policy therapists_write on public.therapists;
drop policy services_read    on public.services;
drop policy services_write   on public.services;
drop policy customers_all    on public.customers;
drop policy sales_all        on public.sales;
drop policy counters_all     on public.receipt_counters;
drop policy expenses_manager on public.expenses;
drop policy topups_read      on public.member_topups;
drop policy topups_write     on public.member_topups;
drop policy commission_read  on public.therapist_daily_commission;
drop policy commission_write on public.therapist_daily_commission;
drop policy settings_read    on public.settings;
drop policy settings_admin   on public.settings;

drop function public.current_role();

create policy profiles_select_self on public.profiles
  for select to authenticated using (id = auth.uid() or public.app_role() = 'admin');
create policy profiles_admin_write on public.profiles
  for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

create policy therapists_read on public.therapists
  for select to authenticated using (public.app_role() is not null);
create policy therapists_write on public.therapists
  for all to authenticated
  using (public.app_role() in ('admin','manager'))
  with check (public.app_role() in ('admin','manager'));

create policy services_read on public.services
  for select to authenticated using (public.app_role() is not null);
create policy services_write on public.services
  for all to authenticated
  using (public.app_role() in ('admin','manager'))
  with check (public.app_role() in ('admin','manager'));

-- งานประจำวัน: ต้องเป็นพนักงานที่มี profile จริงเท่านั้น (ไม่ใช่แค่ login ได้)
create policy customers_all on public.customers
  for all to authenticated
  using (public.app_role() is not null) with check (public.app_role() is not null);
create policy sales_all on public.sales
  for all to authenticated
  using (public.app_role() is not null) with check (public.app_role() is not null);
create policy counters_all on public.receipt_counters
  for all to authenticated
  using (public.app_role() is not null) with check (public.app_role() is not null);

create policy expenses_manager on public.expenses
  for all to authenticated
  using (public.app_role() in ('admin','manager'))
  with check (public.app_role() in ('admin','manager'));

create policy topups_read on public.member_topups
  for select to authenticated using (public.app_role() is not null);
create policy topups_write on public.member_topups
  for all to authenticated
  using (public.app_role() in ('admin','manager'))
  with check (public.app_role() in ('admin','manager'));

create policy commission_read on public.therapist_daily_commission
  for select to authenticated using (public.app_role() is not null);
create policy commission_write on public.therapist_daily_commission
  for all to authenticated
  using (public.app_role() in ('admin','manager'))
  with check (public.app_role() in ('admin','manager'));

create policy settings_read on public.settings
  for select to authenticated using (public.app_role() is not null);
create policy settings_admin on public.settings
  for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- ปิดไม่ให้เรียก internal function ผ่าน REST API ได้
revoke all on function public.handle_new_user()     from anon, authenticated, public;
revoke all on function public.sales_set_receipt_no() from anon, authenticated, public;
revoke all on function public.next_receipt_no(date)  from anon, authenticated, public;
revoke all on function public.app_role()             from anon, public;
grant execute on function public.app_role() to authenticated;
