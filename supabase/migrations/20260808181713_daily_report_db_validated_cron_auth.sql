-- ให้ route ตรวจ secret ของ pg_cron กับ Vault ตรงๆ — เลิกต้อง sync ค่าเข้า Vercel env
--
-- ที่มา: secret ใน Vault หมุนใหม่ด้วย gen_random_bytes ใน Postgres (ไม่เคยออกนอกฐานข้อมูล)
-- แต่ค่า CRON_SECRET ฝั่ง Vercel แก้ได้จากเครื่องเจ้าของร้านเท่านั้น การบังคับให้สองระบบ
-- ถือค่าเดียวกันคือขั้นตอนมือที่พลาดง่ายและพังเงียบ (401 ทุกคืนโดยไม่มีใครเห็น)
-- จึงแยกเป็นสองประตู: Vercel cron ใช้ env CRON_SECRET ที่ Vercel ใส่ให้เอง (แบบเดิม)
-- ส่วน pg_cron ใช้ secret ใน Vault ซึ่ง route ตรวจผ่านฟังก์ชันนี้
create or replace function public.cron_secret_matches(candidate text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'daily_report_cron_secret'
      and decrypted_secret = candidate
  )
$$;

-- security definer + แตะ vault = เปิดให้เฉพาะ service client ใน cron route
revoke all on function public.cron_secret_matches(text) from public;
revoke all on function public.cron_secret_matches(text) from anon, authenticated;
grant execute on function public.cron_secret_matches(text) to service_role;
