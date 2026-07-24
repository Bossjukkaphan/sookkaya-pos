-- จองออนไลน์ผ่าน LINE (spec: docs/superpowers/specs/2026-07-24-line-booking-design.md)
-- ตารางผูกบัญชีไลน์ ↔ ลูกค้า — ฐานของเฟส CRM point ด้วย
create table public.line_accounts (
  line_user_id text primary key,   -- ได้จากการ verify idToken กับ LINE เท่านั้น
  customer_id  uuid not null references public.customers(id),
  display_name text,
  picture_url  text,
  phone        text,               -- เบอร์ที่กรอกตอนผูก (ช่วยพนักงานตรวจ ไม่ใช่ตัวยืนยันสิทธิ์)
  created_at   timestamptz not null default now()
);
-- ไม่มี policy ใดๆ = anon/authenticated เข้าไม่ได้เลย
-- เข้าถึงผ่าน service-role ใน server actions ที่ตรวจ idToken แล้วเท่านั้น
alter table public.line_accounts enable row level security;

-- คิว: สถานะใหม่ pending (รออนุมัติ) / rejected (ปฏิเสธ — ไม่ขึ้นบอร์ด)
alter table public.queue_entries drop constraint queue_entries_status_check;
alter table public.queue_entries add constraint queue_entries_status_check
  check (status in ('waiting','in_service','paid','cancelled','pending','rejected'));
alter table public.queue_entries add column line_user_id text;
alter table public.queue_entries add column reject_reason text;
