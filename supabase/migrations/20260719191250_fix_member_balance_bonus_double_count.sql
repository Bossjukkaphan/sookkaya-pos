-- แก้บั๊ก: Bonus รวมอยู่ใน credit_added แล้ว (Silver จ่าย 5,000 ได้ credit 6,000 ซึ่งมีโบนัส 1,000 อยู่ข้างใน)
-- ของเดิมเอา credit + bonus มาบวกกัน ทำให้สมาชิกได้เครดิตเกินจริงคนละ 1,000-5,000 บาท
drop view if exists public.member_balances;

create view public.member_balances
with (security_invoker = true) as
select
  c.id                                                       as customer_id,
  c.name,
  c.nickname,
  c.phone,
  -- ยอดที่ใช้ได้จริง = credit ที่ยังไม่หมดอายุ ลบที่ใช้ไปแล้ว
  coalesce(t.credit_added, 0) - coalesce(s.credit_used, 0)   as credit_balance,
  -- โบนัสเป็นข้อมูลประกอบ (อยู่ใน credit_added แล้ว) ไม่เอามาบวกซ้ำ
  coalesce(t.bonus_added, 0)                                 as bonus_granted,
  coalesce(t.cash_received, 0)                               as cash_paid,
  t.next_expiry
from public.customers c
left join lateral (
  select sum(credit_added)  filter (where expiry_date >= current_date) as credit_added,
         sum(bonus_added)   filter (where expiry_date >= current_date) as bonus_added,
         sum(cash_received) filter (where expiry_date >= current_date) as cash_received,
         min(expiry_date)   filter (where expiry_date >= current_date) as next_expiry
  from public.member_topups mt where mt.customer_id = c.id
) t on true
left join lateral (
  select sum(credit_used) as credit_used
  from public.sales sa where sa.customer_id = c.id
) s on true;
