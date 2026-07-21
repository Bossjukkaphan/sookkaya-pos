create table public.stg_sale_time (receipt_no text, sale_time text);
alter table public.stg_sale_time enable row level security;
create policy stg_ins on public.stg_sale_time for insert to anon with check (true);
grant insert on public.stg_sale_time to anon;
