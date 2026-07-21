-- ระบุ role ที่ยอมรับให้ชัด แทน "is not null" เผื่อมี role แปลกปลอมหลุดเข้ามา
drop policy therapists_read on public.therapists;
create policy therapists_read on public.therapists
  for select to authenticated using (public.app_role() in ('admin','manager','staff'));

drop policy services_read on public.services;
create policy services_read on public.services
  for select to authenticated using (public.app_role() in ('admin','manager','staff'));

drop policy customers_all on public.customers;
create policy customers_all on public.customers
  for all to authenticated
  using (public.app_role() in ('admin','manager','staff'))
  with check (public.app_role() in ('admin','manager','staff'));

drop policy sales_all on public.sales;
create policy sales_all on public.sales
  for all to authenticated
  using (public.app_role() in ('admin','manager','staff'))
  with check (public.app_role() in ('admin','manager','staff'));

drop policy counters_all on public.receipt_counters;
create policy counters_all on public.receipt_counters
  for all to authenticated
  using (public.app_role() in ('admin','manager','staff'))
  with check (public.app_role() in ('admin','manager','staff'));

drop policy topups_read on public.member_topups;
create policy topups_read on public.member_topups
  for select to authenticated using (public.app_role() in ('admin','manager','staff'));

drop policy commission_read on public.therapist_daily_commission;
create policy commission_read on public.therapist_daily_commission
  for select to authenticated using (public.app_role() in ('admin','manager','staff'));

drop policy settings_read on public.settings;
create policy settings_read on public.settings
  for select to authenticated using (public.app_role() in ('admin','manager','staff'));
