-- รวมยอดจาก sales เป็นรายวัน + รายหมอนวด ในหนึ่ง round trip
-- เหตุที่เป็น RPC: GROUP BY ฝั่ง DB เลี่ยงเพดาน 1000 แถวของ supabase-js
-- (ดึง sales ดิบทั้งเดือนมี ~1500-3000 แถว โดนตัดเงียบ ตัวเลขจะขาด)
-- SECURITY INVOKER: วิ่งใต้ RLS ของผู้เรียกเหมือน query เดิมทุกประการ — สิทธิ์ไม่เปลี่ยน
--
-- กติกายอด (ตรวจจากหน้า reports — ต้องตรงเป๊ะ ห้ามนิยามใหม่):
--   revenue = sum(coalesce(revenue_recognize, net_amount))
--     ตรงกับ src/app/(app)/reports/page.tsx:136-139 (ยอดรวม) และ :262-269 (แยกรายวัน)
--     ซึ่งเขียน Number(s.revenue_recognize ?? s.net_amount) — `??` ตกไป net_amount
--     เฉพาะตอน null เท่านั้น จึงเท่ากับ coalesce() ของ SQL พอดี (0 ไม่ถูก fallback)
--   bills   = count(*) หนึ่งแถว sales = หนึ่งบิล ตรงกับ reports (:267 agg.bills += 1)
--   ช่วงวัน = sale_date between p_from and p_to ตรงกับ .gte/.lte ของ reports (:84-85)
--   ไม่มีการกรองรายการยกเลิก — ตาราง sales ไม่มีคอลัมน์สถานะ/ยกเลิก และหน้า reports
--   ก็ไม่ได้กรองอะไรเพิ่มเลย (ทุกแถวในช่วงวันถูกนับหมด)
--
-- by_therapist ตัดแถว therapist_id is null ทิ้งตามนิยาม ผลรวมจึง ≤ ยอดรวมรายวันเสมอ
-- (คนละตัวกับการ์ด "ค่ามือรายหมอ" ในหน้า reports ที่เป็นค่ามือจาก v_therapist_daily —
--  ตัวนี้คือ "ยอดขายที่หมอคนนั้นทำได้" ใช้กติกายอดเดียวกับรายวัน)
create or replace function public.boss_hub_rollup(p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
select jsonb_build_object(
  'daily', coalesce((
    select jsonb_agg(
      jsonb_build_object('day', to_char(d.day, 'YYYY-MM-DD'), 'revenue', d.revenue, 'bills', d.bills)
      order by d.day
    )
    from (
      select sale_date as day,
             sum(coalesce(revenue_recognize, net_amount)) as revenue,
             count(*) as bills
      from sales
      where sale_date between p_from and p_to
      group by sale_date
    ) d
  ), '[]'::jsonb),
  'by_therapist', coalesce((
    select jsonb_agg(
      jsonb_build_object('therapist_id', t.therapist_id, 'revenue', t.revenue, 'sessions', t.sessions)
      order by t.revenue desc
    )
    from (
      select therapist_id,
             sum(coalesce(revenue_recognize, net_amount)) as revenue,
             count(*) as sessions
      from sales
      where sale_date between p_from and p_to
        and therapist_id is not null
      group by therapist_id
    ) t
  ), '[]'::jsonb)
)
$$;
