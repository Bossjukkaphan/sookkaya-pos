-- ระบบเข้างานรายวัน: หมอนวด + พนักงานอื่น (ผู้จัดการ/ผู้ช่วย/พ่อบ้าน)
-- ไม่มีแถว = ยังไม่เช็คอิน · ดู docs/superpowers/specs/2026-07-27-checkin-attendance-board-status-design.md

create table staff_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create table attendance (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  therapist_id uuid references therapists(id),
  staff_id uuid references staff_members(id),
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  created_by text,
  -- หนึ่งแถวต้องเป็นของหมอ หรือพนักงาน อย่างใดอย่างหนึ่งเท่านั้น
  check ((therapist_id is null) <> (staff_id is null))
);
create unique index attendance_therapist_day on attendance (work_date, therapist_id) where therapist_id is not null;
create unique index attendance_staff_day on attendance (work_date, staff_id) where staff_id is not null;

alter table staff_members enable row level security;
alter table attendance enable row level security;
revoke all on staff_members, attendance from anon;
create policy "authenticated all staff" on staff_members for all to authenticated using (true) with check (true);
create policy "authenticated all attendance" on attendance for all to authenticated using (true) with check (true);
