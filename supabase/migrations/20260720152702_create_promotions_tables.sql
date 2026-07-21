-- ทำข้อความโปรโมชั่นดิบให้เป็นคีย์เดียวกัน
create or replace function public.promo_key(txt text)
returns text
language sql
immutable
as $$
  select case when k like 'gowabi%' then 'gowabi' else k end
  from (
    select lower(regexp_replace(coalesce(txt, ''), '\s+', '', 'g')) as k
  ) t
$$;

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null default 'promotion'
    check (kind in ('promotion', 'channel', 'internal')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.promotion_aliases (
  raw_key text primary key,
  promotion_id uuid references public.promotions(id) on delete cascade,
  sample_text text,
  updated_at timestamptz not null default now()
);

alter table public.promotions enable row level security;
alter table public.promotion_aliases enable row level security;

create policy promotions_read on public.promotions
  for select to authenticated
  using (public.app_role() = any (array['admin','manager','staff']));

create policy promotions_write on public.promotions
  for all to authenticated
  using (public.app_role() = any (array['admin','manager']))
  with check (public.app_role() = any (array['admin','manager']));

create policy promotion_aliases_read on public.promotion_aliases
  for select to authenticated
  using (public.app_role() = any (array['admin','manager','staff']));

create policy promotion_aliases_write on public.promotion_aliases
  for all to authenticated
  using (public.app_role() = any (array['admin','manager']))
  with check (public.app_role() = any (array['admin','manager']));

create index sales_promo_key_idx on public.sales (public.promo_key(coupon_promo));
