create or replace view public.v_monthly_pl as
with months as (
  select distinct to_char(sale_date, 'YYYY-MM') as month from public.sales
  union
  select distinct to_char(expense_date, 'YYYY-MM') from public.expenses
),
sales_m as (
  select to_char(sale_date,'YYYY-MM') as month,
         sum(net_revenue) as net_revenue,
         sum(cash_in)     as cash_in,
         sum(sessions)    as sessions
  from public.v_daily_summary group by 1
),
comm_m as (
  select to_char(work_date,'YYYY-MM') as month,
         sum(total_income)    as commission_cost,
         sum(net_commission) - sum(total_commission) as guarantee_topup
  from public.v_therapist_daily group by 1
),
exp_m as (
  select to_char(expense_date,'YYYY-MM') as month,
         sum(amount)                                          as expense_total,
         sum(amount) filter (where cost_type = 'fixed')       as fixed_cost,
         sum(amount) filter (where cost_type = 'variable')    as variable_cost,
         sum(amount) filter (where cost_type = 'onetime')     as onetime_cost,
         sum(amount) filter (where category like 'HR / payroll%') as payroll_paid
  from public.expenses group by 1
),
base as (
  select
    m.month,
    coalesce(s.net_revenue, 0)      as net_revenue,
    coalesce(s.cash_in, 0)          as cash_in,
    coalesce(s.sessions, 0)         as sessions,
    coalesce(c.commission_cost, 0)  as commission_cost,
    coalesce(c.guarantee_topup, 0)  as guarantee_topup,
    coalesce(e.expense_total, 0)    as expense_total,
    coalesce(e.fixed_cost, 0)       as fixed_cost,
    coalesce(e.variable_cost, 0)    as variable_cost,
    coalesce(e.onetime_cost, 0)     as onetime_cost,
    coalesce(e.payroll_paid, 0)     as payroll_paid,
    coalesce(s.net_revenue, 0) - coalesce(e.expense_total, 0)  as profit_cash,
    coalesce(s.net_revenue, 0) - coalesce(c.commission_cost, 0)
      - (coalesce(e.expense_total, 0) - coalesce(e.payroll_paid, 0)) as profit_accrual
  from months m
  left join sales_m s on s.month = m.month
  left join comm_m  c on c.month = m.month
  left join exp_m   e on e.month = m.month
)
select
  base.*,
  -- รายได้เดือนก่อนหน้า ใช้ทำลูกศรขึ้น/ลงบนการ์ดใหญ่
  lag(net_revenue) over (order by month) as prev_net_revenue,
  -- สะสม "ต้นปี" คือ partition ตามปีในสตริงเดือน ไม่ใช่ 12 เดือนย้อนหลัง
  sum(net_revenue) over (
    partition by left(month, 4) order by month
    rows between unbounded preceding and current row
  ) as ytd_net_revenue,
  sum(profit_cash) over (
    partition by left(month, 4) order by month
    rows between unbounded preceding and current row
  ) as ytd_profit_cash
from base;
