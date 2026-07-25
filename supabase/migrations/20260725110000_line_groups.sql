-- แจ้งเตือนไลน์ฝั่งร้านผ่าน OA ผู้ช่วย (spec: docs/superpowers/specs/2026-07-25-line-shop-notify-design.md)
-- เก็บ group_id ของกลุ่มที่ OA ผู้ช่วยถูกเชิญเข้า (จับจาก webhook) —
-- เจ้าของร้านอ่านค่าไปใส่ env LINE_ASSISTANT_QUEUE_GROUP_ID ครั้งเดียวตอนติดตั้ง
create table public.line_groups (
  group_id     text primary key,
  last_seen_at timestamptz not null default now(),
  note         text
);
-- ไม่มี policy ใดๆ = anon/authenticated เข้าไม่ได้เลย — เขียนผ่าน service client ใน webhook เท่านั้น
alter table public.line_groups enable row level security;
-- revoke default privilege ทิ้งด้วย (TRUNCATE ไม่ถูกคุมด้วย RLS) — แบบเดียวกับ 20260724150100_line_accounts_revoke.sql
revoke all on public.line_groups from anon, authenticated;
