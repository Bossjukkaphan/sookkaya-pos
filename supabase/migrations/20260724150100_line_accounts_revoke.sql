-- line_accounts เก็บ PII (เบอร์โทร, LINE user id) — RLS ไม่มี policy ก็กัน API ได้อยู่แล้ว
-- แต่ default privilege ของ anon/authenticated (SELECT/INSERT/UPDATE/DELETE/TRUNCATE) ยังติดมากับตาราง
-- TRUNCATE ไม่ถูกคุมด้วย RLS เลย — revoke ทิ้งเป็น belt-and-suspenders (ตามแบบ 20260720095049_secure_backup_tables.sql)
revoke all on public.line_accounts from anon, authenticated;
