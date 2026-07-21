-- ผู้ใช้ระบบ (เชื่อมกับ Supabase Auth)
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'staff' check (role in ('admin','manager','staff')),
  created_at timestamptz not null default now()
);

-- หมอนวด
create table public.therapists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  status     text not null default 'active' check (status in ('active','resigned')),
  created_at timestamptz not null default now()
);

-- เมนูบริการ
create table public.services (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  price          numeric not null,
  commission     numeric not null,
  commission_old numeric,
  price_old      numeric,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

-- ลูกค้า
create table public.customers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  nickname      text,
  phone         text,
  line_id       text,
  birthday      date,
  customer_type text not null default 'ลูกค้าทั่วไป' check (customer_type in ('ลูกค้าทั่วไป','สมาชิก')),
  notes         text,
  tags          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ตั้งค่าระบบ
create table public.settings (
  key   text primary key,
  value text
);

create index customers_phone_idx on public.customers (phone);
create index customers_name_idx  on public.customers (name);
