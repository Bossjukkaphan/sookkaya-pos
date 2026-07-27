-- แผนวันหยุดล่วงหน้า: ผู้จัดการจัดให้พนักงานสลับกันหยุด (เฟส 2 ของระบบเข้างาน)
-- ไม่มีแถว = ทำงานปกติ · off = หยุดตามแผน · leave = ลา
create table shift_plans (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  therapist_id uuid references therapists(id),
  staff_id uuid references staff_members(id),
  plan text not null check (plan in ('off', 'leave')),
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  check ((therapist_id is null) <> (staff_id is null))
);
create unique index shift_plans_therapist_day on shift_plans (work_date, therapist_id) where therapist_id is not null;
create unique index shift_plans_staff_day on shift_plans (work_date, staff_id) where staff_id is not null;

alter table shift_plans enable row level security;
revoke all on shift_plans from anon;
create policy "authenticated all shift plans" on shift_plans for all to authenticated using (true) with check (true);
