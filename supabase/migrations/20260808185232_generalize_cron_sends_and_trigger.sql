-- ขยายแพตเทิร์น "pg_cron ตัวหลัก + Vercel cron ตัวสำรอง + กันส่งซ้ำ" จาก daily-report
-- ให้ครอบ birthday-reminder (08:00 ไทย) ด้วย — ยุบของที่จะซ้ำกันสองชุดให้เหลือชุดเดียว:
-- ตารางกันซ้ำใส่คอลัมน์ job · ฟังก์ชันยิงรับชื่อ vault entry ของ URL · secret ใช้ร่วมกัน
--
-- secret เปลี่ยนชื่อ daily_report_cron_secret → pos_cron_secret แล้ว (ค่าเดิม ไม่ได้หมุน)
-- เพราะตอนนี้มันคุ้มกันทุก cron route ไม่ใช่แค่ daily report

-- ตารางกันซ้ำรวม — แทน daily_report_sends (primary key (job, run_date) คือตัวกันซ้ำ)
create table public.cron_sends (
  job      text not null,
  run_date date not null,
  sent_at  timestamptz not null default now(),
  source   text not null check (source in ('pg_cron', 'vercel_cron', 'manual')),
  primary key (job, run_date)
);

alter table public.cron_sends enable row level security;

-- จงใจไม่มี policy — มีแค่ service client ใน cron route ที่แตะตารางนี้ ซึ่ง bypass RLS อยู่แล้ว

comment on table public.cron_sends is
  'กันข้อความ cron ส่งซ้ำเมื่อ pg_cron กับ Vercel cron ยิง route เดียวกัน — หนึ่งแถวต่อ job ต่อวัน';

insert into public.cron_sends (job, run_date, sent_at, source)
  select 'daily-report', report_date, sent_at, source from public.daily_report_sends;

drop table public.daily_report_sends;

-- ชี้ RPC ไปที่ชื่อ secret ใหม่
create or replace function public.cron_secret_matches(candidate text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'pos_cron_secret'
      and decrypted_secret = candidate
  )
$$;

-- ฟังก์ชันยิงรวม — รับชื่อ vault entry ที่เก็บ URL ของ route ปลายทาง
create or replace function public.trigger_cron_route(url_secret_name text)
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
  from vault.decrypted_secrets where name = url_secret_name;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'pos_cron_secret';

  -- ยังไม่ได้ตั้ง vault entry = ไม่ยิงมั่ว ปล่อยให้ Vercel cron ตัวสำรองทำงานไปก่อน
  if v_url is null or v_secret is null then
    raise warning 'trigger_cron_route: ไม่พบ vault secret % หรือ pos_cron_secret', url_secret_name;
    return;
  end if;

  -- pg_net ยิงแบบ async คืน request_id ทันที ไม่ block ตัว cron worker
  perform net.http_get(
    url     := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret)
  );
end;
$$;

revoke all on function public.trigger_cron_route(text) from public;
revoke all on function public.trigger_cron_route(text) from anon, authenticated;

-- ชื่อ job ซ้ำ = cron.schedule ทับของเดิมให้เอง (daily ตัวเดิมเรียก trigger_daily_report)
select cron.schedule(
  'daily-report-2200-ict',
  '0 15 * * *',
  $$select public.trigger_cron_route('daily_report_url')$$
);

-- 01:00 UTC = 08:00 น. ไทย ตรงกับ vercel.json ตัวสำรอง
select cron.schedule(
  'birthday-reminder-0800-ict',
  '0 1 * * *',
  $$select public.trigger_cron_route('birthday_reminder_url')$$
);

drop function public.trigger_daily_report();
