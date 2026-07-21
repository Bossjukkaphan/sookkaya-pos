-- ตารางพักข้อมูลชั่วคราวสำหรับ import (ทุกคอลัมน์เป็น text แล้วค่อย cast ตอนย้าย)
-- anon จะได้สิทธิ์ insert เฉพาะตารางเหล่านี้เท่านั้น ไม่แตะตารางข้อมูลจริง แล้วจะลบทิ้งหลัง import เสร็จ
create table public.stg_customers (
  name text, nickname text, phone text, line_id text, birthday text,
  customer_type text, notes text, legacy_ref text
);
create table public.stg_sales (
  receipt_no text, sale_date text, sale_time text, cust_ref text,
  customer_name text, customer_phone text, th_name text, svc_match text, svc_raw text,
  price_normal text, coupon_promo text, discount text, net_amount text, commission text,
  payment_method text, is_request text, request_fee text, member_status text,
  credit_used text, bonus_used text, revenue_recognize text
);
create table public.stg_expenses (
  expense_date text, item text, category text, amount text, paid_by text, notes text
);
create table public.stg_topups (
  topup_date text, cust_ref text, tier text, payment_method text, cash_received text,
  credit_added text, bonus_added text, expiry_date text, notes text
);

alter table public.stg_customers enable row level security;
alter table public.stg_sales     enable row level security;
alter table public.stg_expenses  enable row level security;
alter table public.stg_topups    enable row level security;

-- insert อย่างเดียว อ่าน/แก้/ลบไม่ได้
create policy stg_ins on public.stg_customers for insert to anon with check (true);
create policy stg_ins on public.stg_sales     for insert to anon with check (true);
create policy stg_ins on public.stg_expenses  for insert to anon with check (true);
create policy stg_ins on public.stg_topups    for insert to anon with check (true);

grant insert on public.stg_customers, public.stg_sales,
                public.stg_expenses, public.stg_topups to anon;
