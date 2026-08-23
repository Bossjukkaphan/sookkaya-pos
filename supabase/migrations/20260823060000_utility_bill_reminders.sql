-- เพิ่มเตือนบิลประจำหมวดค่าน้ำ/ค่าไฟ/เน็ต บนกระดิ่ง (ค่าไฟ · ค่าน้ำ · เน็ต/โทรศัพท์ร้าน)
--
-- ที่มา: 23/8/2569 กระทบยอดหมวดนี้แล้วพบบิลรอบ ก.ค. หายสองใบโดยไม่มีอะไรฟ้อง —
-- ค่าน้ำ (~70–165 บาท จ่ายคู่ค่าไฟทุกเดือนแต่ ก.ค. มีแต่ค่าไฟ) และบิลเน็ตหนึ่งรอบ
-- (จังหวะจ่าย 7/4 · 8/5 · 12/6 · ข้าม · 1/8)
--
-- กติกาต้องตรงกับ executable spec ใน src/lib/expense-reminders.ts เป๊ะ — แก้ที่นั่นต้องแก้ที่นี่
-- สามบิลอยู่หมวดเดียวกัน แยกกันด้วยขนาดเงินกับชื่อรายการ (สำรวจข้อมูลจริง มี.ค.–ส.ค. 2569):
--   ค่าไฟ 2,847–17,701 · เน็ต/โทรศัพท์ 462–2,197 · ซิม EDC 136 · ค่าน้ำ 70–165 (ชื่อขึ้นต้น "ค่าน้ำ")
--   ค่าไฟ+ค่าน้ำจ่ายช่วงวันที่ 21–สิ้นเดือน (ครบกำหนดสิ้นเดือน หน้าต่างมองย้อน 10 วัน)
--   บิลเน็ตจ่ายวันที่ 1–12 ของเดือนถัดไป (ครบกำหนดวันที่ 12 หน้าต่างมองย้อน 11 วัน)
--
-- โครง duties เปลี่ยนจาก case ต่อ duty เป็นตารางเกณฑ์ (category · window · min/max · item prefix)
-- เพื่อให้เงื่อนไข not exists เขียนครั้งเดียวใช้ทุกงาน — ตรงกับ DutyCheck ฝั่ง TS

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
    with duties(duty, due, category, window_days, min_amount, max_amount, item_prefix) as (
      -- รอบค่ามือหมอล่าสุดที่ผ่านมา: >20 → วันที่ 20 เดือนนี้ · >10 → วันที่ 10 · ไม่งั้นสิ้นเดือนก่อน
      select 'therapist_fee',
        case
          when extract(day from p_today)::int > 20
            then make_date(extract(year from p_today)::int, extract(month from p_today)::int, 20)
          when extract(day from p_today)::int > 10
            then make_date(extract(year from p_today)::int, extract(month from p_today)::int, 10)
          else (date_trunc('month', p_today) - interval '1 day')::date
        end,
        'HR / payroll (ค่ามือหมอ)', 3, 10000, null::numeric, null
      union all
      -- เงินเดือน: สิ้นเดือนก่อนหน้าเสมอ
      select 'salary', (date_trunc('month', p_today) - interval '1 day')::date,
        'เงินเดือนพนักงานประจำ', 3, 10000, null, null
      union all
      select 'electricity', (date_trunc('month', p_today) - interval '1 day')::date,
        'ค่าน้ำ / ค่าไฟ / Internet', 10, 2500, null, null
      union all
      select 'water', (date_trunc('month', p_today) - interval '1 day')::date,
        'ค่าน้ำ / ค่าไฟ / Internet', 10, 0, null, 'ค่าน้ำ'
      union all
      -- บิลเน็ต: วันที่ 12 เดือนนี้ถ้าผ่านแล้ว ไม่งั้นวันที่ 12 เดือนก่อน
      select 'internet',
        case
          when extract(day from p_today)::int > 12
            then make_date(extract(year from p_today)::int, extract(month from p_today)::int, 12)
          else (date_trunc('month', p_today) - interval '1 month')::date + 11
        end,
        'ค่าน้ำ / ค่าไฟ / Internet', 11, 400, 2500, null
    )
    select jsonb_agg(jsonb_build_object('duty', d.duty, 'due', to_char(d.due, 'YYYY-MM-DD')))
    from duties d
    -- ยังไม่มีรายการเข้าเกณฑ์ของงานนั้นตั้งแต่ D-window → ยังต้องเตือน
    where not exists (
      select 1 from expenses e
      where e.category = d.category
        and e.expense_date >= d.due - d.window_days
        and e.amount >= d.min_amount
        and (d.max_amount is null or e.amount < d.max_amount)
        and (d.item_prefix is null or e.item like d.item_prefix || '%')
    )
  ), '[]'::jsonb)
)
$$;
