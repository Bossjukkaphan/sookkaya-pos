-- ปิดช่องโหว่: ของเดิมใครสมัครก็ได้ role 'staff' อัตโนมัติ = เห็นข้อมูลลูกค้าทั้งหมด
-- เปลี่ยนเป็น: ต้องมีอีเมลในรายชื่อที่อนุมัติไว้ก่อน ถึงจะได้ profile และเข้าถึงข้อมูลได้
create table public.allowed_users (
  email      text primary key,
  role       text not null default 'staff' check (role in ('admin','manager','staff')),
  full_name  text,
  created_at timestamptz not null default now()
);

alter table public.allowed_users enable row level security;

create policy allowed_users_admin on public.allowed_users
  for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

insert into public.allowed_users (email, role, full_name) values
  ('boss.jukkaphan@gmail.com', 'admin', 'เจ้าของร้าน');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed public.allowed_users%rowtype;
begin
  select * into v_allowed
  from public.allowed_users
  where lower(email) = lower(new.email);

  -- ไม่อยู่ในรายชื่อ -> ไม่สร้าง profile -> app_role() เป็น NULL -> RLS ปฏิเสธทุกตาราง
  if not found then
    return new;
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email,
          coalesce(v_allowed.full_name, new.email), v_allowed.role)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from anon, authenticated, public;
