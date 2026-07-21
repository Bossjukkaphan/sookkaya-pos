-- บันทึกขาย (POS หลัก)
create table public.sales (
  id                uuid primary key default gen_random_uuid(),
  receipt_no        text unique not null,
  sale_date         date not null,
  sale_time         time,
  customer_id       uuid references public.customers(id) on delete set null,
  customer_name     text,
  customer_phone    text,
  therapist_id      uuid references public.therapists(id),
  service_id        uuid references public.services(id),
  service_name      text,
  price_normal      numeric not null,
  coupon_promo      text,
  discount          numeric not null default 0,
  net_amount        numeric not null,
  commission        numeric,
  payment_method    text not null check (payment_method in
                      ('QR Code','บัตรเครดิต','Gowabi','KOL','Member Credit','เงินสด')),
  is_request        boolean not null default false,
  request_fee       numeric not null default 0,
  member_status     text,
  credit_used       numeric not null default 0,
  bonus_used        numeric not null default 0,
  revenue_recognize numeric,
  created_by        text,
  created_at        timestamptz not null default now()
);

-- รายจ่าย
create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  expense_date date not null,
  item         text not null,
  category     text not null,
  amount       numeric not null,
  paid_by      text,
  notes        text,
  created_at   timestamptz not null default now()
);

-- เติมเงินสมาชิก
create table public.member_topups (
  id             uuid primary key default gen_random_uuid(),
  topup_date     date not null,
  customer_id    uuid not null references public.customers(id) on delete cascade,
  tier           text not null check (tier in ('Silver','Gold','Platinum')),
  payment_method text not null check (payment_method in ('QR Code','เงินสด','บัตรเครดิต')),
  cash_received  numeric not null,
  credit_added   numeric not null,
  bonus_added    numeric not null,
  expiry_date    date not null,
  notes          text,
  created_at     timestamptz not null default now()
);

-- ค่ามือหมอนวดรายวัน
create table public.therapist_daily_commission (
  id               uuid primary key default gen_random_uuid(),
  work_date        date not null,
  therapist_id     uuid not null references public.therapists(id) on delete cascade,
  total_commission numeric not null default 0,
  guarantee_amount numeric not null default 500,
  net_commission   numeric,
  request_fee      numeric not null default 0,
  total_income     numeric,
  status           text check (status in ('ค่ามือจริง','ใช้ประกัน')),
  is_paid          boolean not null default false,
  notes            text,
  unique (work_date, therapist_id)
);

create index sales_date_idx        on public.sales (sale_date desc);
create index sales_therapist_idx   on public.sales (therapist_id, sale_date);
create index sales_customer_idx    on public.sales (customer_id);
create index expenses_date_idx     on public.expenses (expense_date desc);
create index topups_customer_idx   on public.member_topups (customer_id);
