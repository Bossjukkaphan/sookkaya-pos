revoke insert on public.stg_sale_time from anon;
drop policy stg_ins on public.stg_sale_time;

update public.sales s
set sale_time = v.sale_time::time
from public.stg_sale_time v
where s.receipt_no = v.receipt_no
  and s.sale_time is null;

drop table public.stg_sale_time;
