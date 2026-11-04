-- เครดิตสมาชิกเปลี่ยนจาก "กระปุกเดียวหมดอายุพร้อมกัน" → "แยกก้อนตามใบเติม" (ตัดสินใจ 2026-11-03)
-- แต่ละใบมี วันหมดอายุ/ยอดคงเหลือ/สถานะ ของตัวเอง · บิลระบุชัดว่าตัดจากใบไหนบ้าง (แบ่งได้หลายใบ)
-- ใบหมดอายุ = ใช้ไม่ได้ ยอดโชว์แต่ตัดไม่ได้ · เติมใหม่ไม่ฟื้นใบเก่า · ยืดอายุรายใบได้ (มี audit log)
-- บทเรียนจากรอบ FIFO ส.ค.: ห้ามให้ระบบ "เดา" ว่าบิลตัดก้อนไหน — รอบนี้บันทึกจริงเป็นรายบิล
-- (applied บน production ผ่าน MCP apply_migration 2026-11-03 — ไฟล์นี้คือสำเนาเต็มตามกติกา README)

-- 1) สถานะเปิด/ปิดใช้งานรายใบ (toggle ในกล่องแก้ไขแพ็กเกจ)
alter table public.member_topups add column is_active boolean not null default true;

-- 2) บิลตัดเครดิตจากใบไหนบ้าง — ที่เดียวที่ตอบคำถามนี้ ลบบิลแล้วแถวหายตาม (เครดิตคืนใบเดิมอัตโนมัติ)
--    topup_id เป็น RESTRICT — ใบที่มีบิลตัดอยู่ลบไม่ได้ จนกว่าจะจัดการบิลก่อน
create table public.sale_credit_allocations (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  topup_id uuid not null references public.member_topups(id) on delete restrict,
  amount numeric not null,
  created_at timestamptz not null default now(),
  unique (sale_id, topup_id)
);
create index sale_credit_allocations_topup_idx on public.sale_credit_allocations (topup_id);
create index sale_credit_allocations_sale_idx on public.sale_credit_allocations (sale_id);
alter table public.sale_credit_allocations enable row level security;
create policy alloc_read on public.sale_credit_allocations for select to authenticated using (true);
create policy alloc_write on public.sale_credit_allocations for all to authenticated using (true) with check (true);
create policy assistant_readonly_select on public.sale_credit_allocations for select to assistant_readonly using (true);

-- 3) ปรับยอดคงเหลือรายใบแบบมีร่องรอย — เก็บเป็น delta ไม่เขียนทับ ยอดตรวจย้อนได้เสมอ
create table public.member_topup_adjustments (
  id uuid primary key default gen_random_uuid(),
  topup_id uuid not null references public.member_topups(id) on delete cascade,
  delta numeric not null,
  reason text,
  edited_by text,
  created_at timestamptz not null default now()
);
create index member_topup_adjustments_topup_idx on public.member_topup_adjustments (topup_id);
alter table public.member_topup_adjustments enable row level security;
create policy adj_read on public.member_topup_adjustments for select to authenticated using (true);
create policy adj_write on public.member_topup_adjustments for all to authenticated using (true) with check (true);
create policy assistant_readonly_select on public.member_topup_adjustments for select to assistant_readonly using (true);

-- 4) ประวัติการแก้ไขรายใบ (ยืดอายุ/ปรับยอด/เปิดปิด) — ใครแก้อะไรจากค่าไหนเป็นค่าไหนเมื่อไหร่
create table public.member_topup_edits (
  id uuid primary key default gen_random_uuid(),
  topup_id uuid not null references public.member_topups(id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  edited_by text,
  created_at timestamptz not null default now()
);
create index member_topup_edits_topup_idx on public.member_topup_edits (topup_id);
alter table public.member_topup_edits enable row level security;
create policy edits_read on public.member_topup_edits for select to authenticated using (true);
create policy edits_write on public.member_topup_edits for all to authenticated using (true) with check (true);
create policy assistant_readonly_select on public.member_topup_edits for select to assistant_readonly using (true);

-- 5) ย้ายข้อมูลเก่า: จับคู่บิลเครดิต 755 ใบเข้าใบเติม (ตรวจแล้ว 2026-11-03: รวม 599,680 บาท
--    ตรงเป๊ะทุกใบ ไม่มี orphan/ใช้ตอนหมดอายุ/ยอดเกิน) กติกา: ใบที่ซื้อก่อนวันขายและยังไม่หมดอายุ
--    ณ วันขาย ใกล้หมดอายุก่อน · เศษตกค้าง (ไม่พบจริง) ลงใบอายุไกลสุดที่ซื้อแล้ว กันยอดหาย
do $$
declare
  s record; t record; need numeric; take numeric;
begin
  for s in
    select id, customer_id, sale_date, credit_used from public.sales
    where credit_used > 0 and customer_id is not null
    order by customer_id, sale_date, created_at, id
  loop
    need := s.credit_used;
    for t in
      select mt.id,
        mt.credit_added - coalesce((select sum(a.amount) from public.sale_credit_allocations a where a.topup_id = mt.id), 0) as remaining
      from public.member_topups mt
      where mt.customer_id = s.customer_id
        and mt.topup_date <= s.sale_date and mt.expiry_date >= s.sale_date
      order by mt.expiry_date, mt.topup_date, mt.id
    loop
      exit when need <= 0;
      take := least(need, t.remaining);
      if take > 0 then
        insert into public.sale_credit_allocations (sale_id, topup_id, amount) values (s.id, t.id, take);
        need := need - take;
      end if;
    end loop;
    if need > 0 then
      select mt.id into t from public.member_topups mt
      where mt.customer_id = s.customer_id and mt.topup_date <= s.sale_date
      order by mt.expiry_date desc, mt.topup_date desc limit 1;
      if t.id is not null then
        insert into public.sale_credit_allocations (sale_id, topup_id, amount) values (s.id, t.id, need)
        on conflict (sale_id, topup_id) do update set amount = sale_credit_allocations.amount + excluded.amount;
      end if;
    end if;
  end loop;
end $$;

-- 6) ยอดรายใบ — แหล่งความจริงเดียวของ "ใบนี้เหลือเท่าไหร่ สถานะอะไร"
--    status: inactive (ปิดมือ) > depleted (หมดยอด) > expired (เลยวันหมดอายุ) > active
create view public.v_topup_balances
with (security_invoker = true) as
with shop_today as (
  select (now() at time zone 'Asia/Bangkok')::date as d
)
select
  mt.id as topup_id,
  mt.customer_id,
  mt.tier,
  mt.topup_date,
  mt.expiry_date,
  mt.payment_method,
  mt.notes,
  mt.is_active,
  mt.credit_added,
  mt.bonus_added,
  mt.cash_received,
  round(mt.credit_added + coalesce(adj.delta, 0) - coalesce(al.used, 0), 2) as remaining,
  round(coalesce(al.used, 0), 2) as used_total,
  round(coalesce(adj.delta, 0), 2) as adjusted_total,
  case when mt.credit_added > 0 then round(mt.cash_received / mt.credit_added, 6) else 1 end as recognize_ratio,
  case
    when not mt.is_active then 'inactive'
    when round(mt.credit_added + coalesce(adj.delta, 0) - coalesce(al.used, 0), 2) <= 0 then 'depleted'
    when s.d > mt.expiry_date then 'expired'
    else 'active'
  end as status
from public.member_topups mt
cross join shop_today s
left join lateral (
  select sum(a.amount) as used from public.sale_credit_allocations a where a.topup_id = mt.id
) al on true
left join lateral (
  select sum(j.delta) as delta from public.member_topup_adjustments j where j.topup_id = mt.id
) adj on true;

-- 7) member_balances ใหม่: ยอดรวมจากผลรวมรายใบ (รวมรายการปรับยอด) + usable_balance
--    next_expiry = วันหมดอายุไกลสุดของใบที่เปิดใช้และยังมียอด → สูตร credit_expired เดิม
--    ของทุกหน้าจอยังถูกต้องใต้กติกาใหม่ (หมดอายุ = ไม่มีใบไหนใช้ได้เลย)
create or replace view public.member_balances
with (security_invoker = true) as
with shop_today as (
  select (now() at time zone 'Asia/Bangkok')::date as d
),
bucket as (
  select
    mt.customer_id,
    mt.expiry_date,
    mt.is_active,
    mt.credit_added,
    mt.bonus_added,
    mt.cash_received,
    mt.credit_added + coalesce(adj.delta, 0) - coalesce(al.used, 0) as remaining
  from public.member_topups mt
  left join lateral (
    select sum(a.amount) as used from public.sale_credit_allocations a where a.topup_id = mt.id
  ) al on true
  left join lateral (
    select sum(j.delta) as delta from public.member_topup_adjustments j where j.topup_id = mt.id
  ) adj on true
),
agg as (
  select
    b.customer_id,
    sum(b.remaining) as balance_raw,
    sum(b.credit_added) as credit_added,
    sum(b.bonus_added) as bonus_added,
    sum(b.cash_received) as cash_received,
    max(b.expiry_date) filter (where b.is_active and b.remaining > 0) as last_expiry
  from bucket b
  group by b.customer_id
),
usable as (
  select b.customer_id, sum(b.remaining) as usable_balance
  from bucket b cross join shop_today s
  where b.is_active and b.remaining > 0 and b.expiry_date >= s.d
  group by b.customer_id
)
select
  c.id as customer_id,
  c.name,
  c.nickname,
  c.phone,
  round(coalesce(a.balance_raw, 0::numeric), 2) as credit_balance,
  coalesce(a.credit_added, 0::numeric) as credit_granted,
  coalesce(a.bonus_added, 0::numeric) as bonus_granted,
  coalesce(a.cash_received, 0::numeric) as cash_paid,
  a.last_expiry as next_expiry,
  c.customer_type,
  c.created_at,
  (a.last_expiry is null or s.d > a.last_expiry) as credit_expired,
  round(coalesce(u.usable_balance, 0::numeric), 2) as usable_balance
from public.customers c
cross join shop_today s
left join agg a on a.customer_id = c.id
left join usable u on u.customer_id = c.id;
