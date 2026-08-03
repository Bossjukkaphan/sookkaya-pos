-- ยืนยันการจ่ายรายงวด — แถวหนึ่งคือหนึ่งงวดของเดือน มีแถว = ติ๊ก "จ่ายแล้ว" แล้ว
--
-- ที่มา: 3/8/2569 เจอค่ามือหมอ ก.ค. ถูกคีย์ซ้ำ 92,025 และส่วนต่างจ่ายจริง 180 บาท
-- ที่สืบไม่ได้เพราะไม่มีบันทึกว่าตอนจ่ายเงินระบบคำนวณได้เท่าไหร่
-- ตารางนี้แช่แข็งตัวเลขทั้งสองฝั่ง ณ วินาทีติ๊ก เป็นหลักฐานตรวจย้อนหลัง
--
-- สองขั้น: คนจ่ายติ๊ก (มีแถว) → เจ้าของร้านรับรอง (endorsed_at ไม่ null = ปิดงวดถาวร)

create table public.payout_confirmations (
  id               uuid primary key default gen_random_uuid(),
  month            text not null,                -- '2026-08'
  kind             text not null check (kind in ('commission', 'salary')),
  period_no        smallint not null default 0,  -- 1|2|3 = งวดค่ามือ · 0 = เงินเดือน
  computed_amount  numeric not null,             -- ระบบคำนวณ ณ ตอนติ๊ก (แช่แข็ง)
  recorded_amount  numeric not null,             -- รายจ่ายที่บันทึกไว้ ณ ตอนติ๊ก (แช่แข็ง)
  variance_reason  text,                         -- บังคับเมื่อสองยอดไม่เท่ากัน (บังคับใน server action)
  paid_by          text not null,                -- ชื่อจาก profiles.full_name (convention เดียวกับ sales.created_by)
  paid_at          timestamptz not null default now(),
  endorsed_by      text,
  endorsed_at      timestamptz,
  unique (month, kind, period_no)
);

alter table public.payout_confirmations enable row level security;

-- เห็นและแก้ได้เฉพาะผู้จัดการ/เจ้าของร้าน — พนักงานทั่วไปไม่เกี่ยวกับการจ่ายเงิน
-- ส่วน "รับรองได้เฉพาะ admin" บังคับใน server action เพราะ RLS แยกชนิดการ update ไม่ได้
create policy payout_confirmations_manager on public.payout_confirmations
  for all using (app_role() = any (array['admin', 'manager']))
  with check (app_role() = any (array['admin', 'manager']));

-- เงินเดือนตั้งต้นต่อคน — ยอดคาดหวังของงวดเงินเดือน = ผลรวมของคนที่ยัง is_active
-- โบนัส/คอมมิชชันที่เงื่อนไขยังไม่ชัด ไม่ทำสูตร ใช้ช่องเหตุผลตอนติ๊กแทน (เจ้าของร้านตัดสิน 3/8/2569)
alter table public.staff_members add column base_salary numeric not null default 0;
