-- ยิง Daily Report ให้ตรง 22:00 น. จริง — ย้ายตัวจับเวลาหลักมาไว้ที่ pg_cron
--
-- ที่มา: 8/8/2569 การ์ดเข้ากลุ่มตอน 22:54 ทั้งที่ vercel.json ตั้ง `0 15 * * *` (=22:00 ไทย)
-- Vercel Cron แผน Hobby ยิงแบบ best-effort "ภายในชั่วโมงเดียวกัน" ไม่ใช่ตรงนาที
-- (จดไว้แล้วตั้งแต่ docs/superpowers/specs/2026-08-02-birthday-reminder-design.md:15)
-- pg_cron รันในตัว Postgres เอง ตรงนาที ไม่มีค่าใช้จ่ายเพิ่ม
--
-- โครงหลังการแก้:
--   pg_cron 22:00 ตรง  ──┐
--                        ├──→ GET /api/cron/daily-report ──→ จองแถวใน daily_report_sends
--   Vercel cron 22:00-22:59 ┘                                 ใครจองได้ = คนส่ง อีกตัวข้าม
--
-- ตั้งใจคง cron ของ Vercel ไว้เป็นตัวสำรอง ถ้า pg_cron หรือ pg_net ล่มยังมีการ์ดออกอยู่ดี
-- แค่ช้าหน่อย ดีกว่าเงียบหายทั้งคืนโดยไม่มีใครรู้

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- หนึ่งแถว = การ์ดของวันนั้นถูกส่งไปแล้ว (หรือกำลังส่งอยู่) — primary key คือตัวกันซ้ำ
-- route จองแถว "ก่อน" ยิง LINE แล้วลบทิ้งถ้ายิงไม่สำเร็จ เพื่อให้ตัวสำรองมีสิทธิ์ลองใหม่
create table public.daily_report_sends (
  report_date date primary key,
  sent_at     timestamptz not null default now(),
  source      text not null check (source in ('pg_cron', 'vercel_cron', 'manual'))
);

alter table public.daily_report_sends enable row level security;

-- จงใจไม่มี policy — มีแค่ service client ใน cron route ที่แตะตารางนี้ ซึ่ง bypass RLS อยู่แล้ว
-- ไม่มีหน้าจอไหนในแอปอ่านตารางนี้ ปล่อยปิดสนิทไว้ปลอดภัยกว่า

comment on table public.daily_report_sends is
  'กันการ์ด Daily Report ส่งซ้ำเมื่อ pg_cron กับ Vercel cron ยิง route เดียวกัน';

-- อ่าน URL กับ CRON_SECRET จาก Vault ไม่ฝังค่าไว้ในไฟล์ migration หรือในตาราง cron.job
-- (cron.job.command เป็น text ธรรมดา ใครอ่านตารางได้ก็เห็น secret)
-- ตั้งค่าครั้งเดียวด้วยมือ — ดู docs/ops/daily-report-cron.md
create or replace function public.trigger_daily_report()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'daily_report_url';

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'daily_report_cron_secret';

  -- ยังไม่ได้ตั้ง secret = ไม่ยิงมั่ว ปล่อยให้ Vercel cron ตัวสำรองทำงานไปก่อน
  -- warning จะโผลใน Postgres logs ให้เห็นว่าตั้งค่าไม่ครบ
  if v_url is null or v_secret is null then
    raise warning 'trigger_daily_report: ยังไม่ได้ตั้ง vault secret daily_report_url หรือ daily_report_cron_secret';
    return;
  end if;

  -- pg_net ยิงแบบ async คืน request_id ทันที ไม่ block ตัว cron worker
  -- ผลลัพธ์ไปโผลที่ net._http_response (เก็บ 6 ชม.) ถ้าต้องตามดูว่า route ตอบอะไร
  perform net.http_get(
    url     := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret)
  );
end;
$$;

-- security definer + อ่าน vault ได้ = ห้ามให้ผู้ใช้แอปเรียกเอง
revoke all on function public.trigger_daily_report() from public;
revoke all on function public.trigger_daily_report() from anon, authenticated;

-- pg_cron อ่าน cron expression ตาม timezone ของเซิร์ฟเวอร์ ซึ่ง Supabase ตั้งเป็น UTC
-- 15:00 UTC = 22:00 น. ไทย ตรงกับที่ vercel.json ใช้อยู่
-- unschedule ก่อนเผื่อรัน migration ซ้ำ — cron.schedule ชื่อซ้ำจะทับให้เองแต่เขียนให้ชัดกว่า
select cron.unschedule('daily-report-2200-ict')
where exists (select 1 from cron.job where jobname = 'daily-report-2200-ict');

select cron.schedule(
  'daily-report-2200-ict',
  '0 15 * * *',
  $$select public.trigger_daily_report()$$
);
