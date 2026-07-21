-- ตารางสำรองไม่ได้เปิด RLS ทำให้เข้าถึงผ่าน API ได้
-- เปิด RLS โดยไม่สร้าง policy ใดๆ = ไม่มีใครอ่านได้ผ่าน API
-- (คำสั่ง SQL ฝั่ง admin ยังเข้าถึงได้ตามปกติ ซึ่งเพียงพอสำหรับการกู้คืน)
alter table public.backup_expenses_costtype_20260720 enable row level security;
alter table public.backup_sales_time_20260720        enable row level security;
alter table public.backup_services_cost_20260720     enable row level security;

revoke all on public.backup_expenses_costtype_20260720 from anon, authenticated;
revoke all on public.backup_sales_time_20260720        from anon, authenticated;
revoke all on public.backup_services_cost_20260720     from anon, authenticated;
