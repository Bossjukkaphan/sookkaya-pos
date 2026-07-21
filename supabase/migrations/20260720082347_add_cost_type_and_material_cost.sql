alter table public.expenses add column cost_type text not null default 'variable'
  check (cost_type in ('fixed','variable','onetime'));

create table public.expense_category_types (
  category  text primary key,
  cost_type text not null check (cost_type in ('fixed','variable','onetime'))
);

alter table public.expense_category_types enable row level security;

create policy ect_read on public.expense_category_types
  for select to authenticated using (public.app_role() in ('admin','manager','staff'));
create policy ect_write on public.expense_category_types
  for all to authenticated
  using (public.app_role() in ('admin','manager'))
  with check (public.app_role() in ('admin','manager'));

insert into public.expense_category_types (category, cost_type) values
  ('ค่าเช่าสถานที่', 'fixed'),
  ('ค่าน้ำ / ค่าไฟ / Internet', 'fixed'),
  ('HR / payroll (เงินประกัน ค่ามือ เงินเดือน)', 'variable'),
  ('วัสดุ-สิ้นเปลือง (น้ำมัน บาล์ม ฯลฯ)', 'variable'),
  ('ซักรีด', 'variable'),
  ('การตลาด / โฆษณา', 'onetime'),
  ('ชุดลูกค้า ชุดหมอ ชุดพนักงาน', 'onetime'),
  ('อื่นๆ', 'onetime');

alter table public.services add column material_cost numeric;

insert into public.settings (key, value) values ('monthly_target', '400000')
  on conflict (key) do nothing;
