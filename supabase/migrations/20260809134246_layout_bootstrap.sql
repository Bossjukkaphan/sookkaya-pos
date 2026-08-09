-- RPC รวมข้อมูล layout ทุกหน้าให้เหลือ round trip เดียว (เดิม ~5 query เรียงกัน)
-- SECURITY INVOKER: วิ่งใต้ RLS ของผู้เรียกเหมือน query เดิมทุกประการ — สิทธิ์ไม่เปลี่ยน
-- กติกาต้องตรงกับ TS เป๊ะ: birthdayTodayCustomers (crm-birthday.ts) + expenseReminders (expense-reminders.ts)
create or replace function public.layout_bootstrap(p_today date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
select jsonb_build_object(
  'profile', (
    select to_jsonb(p) from (
      select id, email, full_name, role from profiles where id = auth.uid()
    ) p
  ),
  -- นับทุก pending ไม่กรองวัน — รายการค้างข้ามวันต้องไม่หายจากป้าย (ดู comment เดิมใน layout.tsx)
  'pending_count', (select count(*) from queue_entries where status = 'pending'),
  'birthdays', coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'nickname', c.nickname))
    from customers c
    where c.birthday is not null
      and c.phone is not null
      -- เดือน-วันเกิดตรงวันนี้ ด้วยสูตร "1 ม.ค. + (เดือน-1) + (วัน-1)" — วันเกิด 29 ก.พ.
      -- ปีที่ไม่มี 29 ก.พ. จะไหลไป 1 มี.ค. ตรงกับพฤติกรรม Date.UTC ของ daysUntilBirthday ใน TS
      and (make_date(extract(year from p_today)::int, 1, 1)
           + ((extract(month from c.birthday)::int - 1) * interval '1 month')
           + ((extract(day from c.birthday)::int - 1) * interval '1 day'))::date = p_today
      -- cooldown 30 วันนับจากเที่ยงคืน UTC — ตรงกับ cooldownSince ฝั่ง TS
      and not exists (
        select 1 from crm_contacts cc
        where cc.customer_id = c.id
          and cc.list_type = 'birthday'
          and cc.created_at >= ((p_today - 30)::timestamp at time zone 'UTC')
      )
  ), '[]'::jsonb),
  'expense_reminders', coalesce((
    with duties as (
      -- รอบค่ามือหมอล่าสุดที่ผ่านมา: >20 → วันที่ 20 เดือนนี้ · >10 → วันที่ 10 · ไม่งั้นสิ้นเดือนก่อน
      select 'therapist_fee' as duty,
        case
          when extract(day from p_today)::int > 20
            then make_date(extract(year from p_today)::int, extract(month from p_today)::int, 20)
          when extract(day from p_today)::int > 10
            then make_date(extract(year from p_today)::int, extract(month from p_today)::int, 10)
          else (date_trunc('month', p_today) - interval '1 day')::date
        end as due
      union all
      -- เงินเดือน: สิ้นเดือนก่อนหน้าเสมอ
      select 'salary', (date_trunc('month', p_today) - interval '1 day')::date
    )
    select jsonb_agg(jsonb_build_object('duty', d.duty, 'due', to_char(d.due, 'YYYY-MM-DD')))
    from duties d
    -- ยังไม่มีรายการรอบใหญ่ (≥10,000) ในหมวด ตั้งแต่ D-3 ของรอบ → ยังต้องเตือน
    where not exists (
      select 1 from expenses e
      where e.category = case d.duty
              when 'therapist_fee' then 'HR / payroll (ค่ามือหมอ)'
              else 'เงินเดือนพนักงานประจำ' end
        and e.expense_date >= d.due - 3
        and e.amount >= 10000
    )
  ), '[]'::jsonb)
)
$$;
