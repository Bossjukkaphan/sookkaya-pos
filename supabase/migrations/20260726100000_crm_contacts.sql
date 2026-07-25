-- บันทึกผลการติดต่อลูกค้า (ศูนย์ดูแลลูกค้า /crm) — กันติดต่อซ้ำซ้อน + ประวัติย้อนหลัง
create table crm_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  list_type text not null check (list_type in ('birthday','winback','new_follow')),
  result text not null check (result in ('contacted','booked','declined','wrong_number')),
  note text,
  created_by text,
  created_at timestamptz not null default now()
);
create index crm_contacts_customer_idx on crm_contacts (customer_id, list_type, created_at desc);

alter table crm_contacts enable row level security;
revoke all on crm_contacts from anon;
create policy "authenticated read crm" on crm_contacts for select to authenticated using (true);
create policy "authenticated write crm" on crm_contacts for insert to authenticated with check (true);
