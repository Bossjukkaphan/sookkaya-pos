-- ตัวนับเลขที่ใบเสร็จรายวัน (reset ทุกวัน เริ่มที่ 001)
create table public.receipt_counters (
  counter_date date primary key,
  last_number  integer not null default 0
);

-- สร้างเลขที่ใบเสร็จแบบ atomic กันเลขซ้ำเมื่อพนักงานหลายคนบันทึกพร้อมกัน
create or replace function public.next_receipt_no(p_date date default current_date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  insert into public.receipt_counters (counter_date, last_number)
  values (p_date, 1)
  on conflict (counter_date)
    do update set last_number = public.receipt_counters.last_number + 1
  returning last_number into v_next;

  return 'SK-' || to_char(p_date, 'YYYYMMDD') || '-' || lpad(v_next::text, 3, '0');
end;
$$;

-- ใส่เลขที่ใบเสร็จอัตโนมัติถ้าไม่ได้ระบุมา
create or replace function public.sales_set_receipt_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.receipt_no is null or new.receipt_no = '' then
    new.receipt_no := public.next_receipt_no(new.sale_date);
  end if;
  return new;
end;
$$;

alter table public.sales alter column receipt_no drop not null;

create trigger sales_receipt_no_trg
  before insert on public.sales
  for each row execute function public.sales_set_receipt_no();

-- ยอด Credit / Bonus คงเหลือของสมาชิก (ไม่นับรายการที่หมดอายุแล้ว)
create view public.member_balances
with (security_invoker = true) as
select
  c.id                                                        as customer_id,
  c.name,
  c.nickname,
  c.phone,
  coalesce(t.credit_added, 0)  - coalesce(s.credit_used, 0)   as credit_balance,
  coalesce(t.bonus_added, 0)   - coalesce(s.bonus_used, 0)    as bonus_balance,
  t.next_expiry
from public.customers c
left join lateral (
  select sum(credit_added) filter (where expiry_date >= current_date) as credit_added,
         sum(bonus_added)  filter (where expiry_date >= current_date) as bonus_added,
         min(expiry_date)  filter (where expiry_date >= current_date) as next_expiry
  from public.member_topups mt where mt.customer_id = c.id
) t on true
left join lateral (
  select sum(credit_used) as credit_used, sum(bonus_used) as bonus_used
  from public.sales sa where sa.customer_id = c.id
) s on true;
