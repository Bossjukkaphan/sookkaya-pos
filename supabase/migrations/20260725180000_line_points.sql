-- ระบบสะสมแต้ม: ของรางวัล + สมุดบัญชีแต้ม + คูปองแลก
-- ดู docs/superpowers/specs/2026-07-25-line-points-design.md

create table point_rewards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service_id uuid references services(id),
  points_cost integer not null check (points_cost > 0),
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create table point_redemptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  reward_id uuid not null references point_rewards(id),
  reward_name text not null,
  points_cost integer not null,
  code text not null unique,
  status text not null default 'issued' check (status in ('issued','used','cancelled','expired')),
  expires_at date not null,
  used_sale_id uuid references sales(id),
  used_by text,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table point_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  delta integer not null,
  reason text not null,
  sale_id uuid references sales(id) on delete cascade,
  topup_id uuid references member_topups(id) on delete cascade,
  redemption_id uuid references point_redemptions(id),
  -- เฉพาะรายการบวก: แต้มปีนี้ใช้ได้ถึงสิ้นปีถัดไป (การตัดจริงรอบแรกสิ้นปี 2027)
  expires_at date,
  created_by text,
  created_at timestamptz not null default now()
);
create index point_transactions_customer_idx on point_transactions (customer_id);
create index point_transactions_sale_idx on point_transactions (sale_id) where sale_id is not null;
create index point_redemptions_customer_idx on point_redemptions (customer_id);

-- แต้มคงเหลือต่อลูกค้า
create view v_point_balances
with (security_invoker = true) as
select customer_id, sum(delta)::integer as balance
from point_transactions
group by customer_id;

-- RLS แบบ line_accounts: ฝั่งลูกค้า (LIFF) ผ่าน service client ใน server action เท่านั้น
-- ฝั่งร้าน (authenticated) อ่าน-เขียนได้
alter table point_rewards enable row level security;
alter table point_transactions enable row level security;
alter table point_redemptions enable row level security;
revoke all on point_rewards, point_transactions, point_redemptions from anon;

create policy "authenticated read rewards" on point_rewards for select to authenticated using (true);
create policy "authenticated write rewards" on point_rewards for insert to authenticated with check (true);
create policy "authenticated update rewards" on point_rewards for update to authenticated using (true);

create policy "authenticated read point tx" on point_transactions for select to authenticated using (true);
create policy "authenticated write point tx" on point_transactions for insert to authenticated with check (true);
create policy "authenticated update point tx" on point_transactions for update to authenticated using (true);
create policy "authenticated delete point tx" on point_transactions for delete to authenticated using (true);

create policy "authenticated read redemptions" on point_redemptions for select to authenticated using (true);
create policy "authenticated update redemptions" on point_redemptions for update to authenticated using (true);
