-- ส่วนผสมของเงินในหนึ่งช่วงวัน: ยอดใช้บริการมาจากเงินใหม่เท่าไร เครดิตเก่าเท่าไร
-- และขายแพ็กเกจเข้ามาใหม่เท่าไร — ไว้ตอบคำถาม "รายได้เดือนนี้เป็นเงินใหม่หรือเครดิตเก่า"
--
-- เหตุที่เป็น RPC: ต้อง SUM ข้าม sales ทั้งช่วง ถ้าดึงแถวดิบมาบวกฝั่ง TS จะชน
-- เพดาน 1000 แถวของ supabase-js แล้วขาดเงียบ (เคยกัดหน้ารายงานมาแล้ว 11/8/2569)
-- SECURITY INVOKER (ค่าตั้งต้น): วิ่งใต้ RLS ของผู้เรียก สิทธิ์ไม่เปลี่ยนจาก query เดิม
--
-- กติกายอด — ต้องตรงกับหน้ารายงานเป๊ะ ห้ามนิยามใหม่:
--   volume      = sum(net_amount) ตรงกับ v_daily_summary.volume ที่หน้ารายงานใช้
--   credit_used = sum(credit_used) ตรงกับบรรทัด "ในนี้จ่ายด้วยเครดิตสมาชิก"
--   bonus_used  = sum(bonus_used) เครดิตแถม (ส่วนลด ไม่ใช่เงินที่ใครจ่ายมา)
--   topup_in    = sum(cash_received) ตรงกับบรรทัด "เติมเงินสมาชิกในช่วงนี้"
--   ช่วงวัน = between p_from and p_to เหมือน .gte/.lte ของหน้ารายงาน
--
-- outstanding_* ไม่ขึ้นกับช่วงวันโดยตั้งใจ — เป็นยอด ณ ปัจจุบัน (ภาระบริการที่ค้างอยู่)
-- ใส่มาด้วยเพราะการ์ดเดียวกันต้องใช้ ถ้าแยก query จะเป็นอีก round trip เพื่อเลขตัวเดียว
create or replace function public.member_money_rollup(p_from date, p_to date)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
select jsonb_build_object(
  'volume', coalesce((
    select sum(net_amount) from sales where sale_date between p_from and p_to
  ), 0),
  'credit_used', coalesce((
    select sum(credit_used) from sales where sale_date between p_from and p_to
  ), 0),
  'bonus_used', coalesce((
    select sum(bonus_used) from sales where sale_date between p_from and p_to
  ), 0),
  'topup_in', coalesce((
    select sum(cash_received) from member_topups where topup_date between p_from and p_to
  ), 0),
  'outstanding_credit', coalesce((
    select sum(credit_balance) from member_balances where credit_balance > 0
  ), 0),
  'outstanding_members', coalesce((
    select count(*) from member_balances where credit_balance > 0
  ), 0)
)
$$;
