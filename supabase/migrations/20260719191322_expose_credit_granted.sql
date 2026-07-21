drop view if exists public.member_balances;

create view public.member_balances
with (security_invoker = true) as
select
  c.id                                                       as customer_id,
  c.name,
  c.nickname,
  c.phone,
  coalesce(t.credit_added, 0) - coalesce(s.credit_used, 0)   as credit_balance,
  coalesce(t.credit_added, 0)                                as credit_granted,
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
