-- ระบบเตือนเครดิตสมาชิกใกล้หมดอายุ (แผน 2026-11-11)
-- ลิสต์ใหม่ "เครดิตใกล้หมดอายุ" ในหน้า /crm + cron เตือนทีมตอนเช้าเมื่อใบแตะหลักไมล์
-- D-30/14/7/3 — ดูกติกากลางที่ src/lib/credit-expiry.ts

-- 1) ลิสต์ใหม่ใช้ crm_contacts ร่วมกับลิสต์เดิม — เพิ่มค่า list_type 'credit_expiry'
alter table public.crm_contacts drop constraint crm_contacts_list_type_check;
alter table public.crm_contacts add constraint crm_contacts_list_type_check
  check (list_type in ('birthday','winback','new_follow','credit_expiry'));

-- 2) กันเตือนหลักไมล์ซ้ำข้ามวัน — key รวม expiry_date เพื่อว่าใบที่ถูกยืดอายุ
--    หลักไมล์จะนับใหม่จากวันหมดอายุใหม่เองโดยไม่ต้องลบแถวเก่า
create table public.credit_expiry_alerts (
  topup_id    uuid not null references public.member_topups(id) on delete cascade,
  threshold   int  not null check (threshold in (30, 14, 7, 3)),
  expiry_date date not null,
  sent_at     timestamptz not null default now(),
  source      text not null check (source in ('pg_cron', 'vercel_cron', 'manual')),
  primary key (topup_id, threshold, expiry_date)
);

alter table public.credit_expiry_alerts enable row level security;
-- จงใจไม่มี policy — มีแค่ service client ใน cron route ที่แตะตารางนี้ (แบบเดียวกับ cron_sends)

comment on table public.credit_expiry_alerts is
  'กันเตือนเครดิตใกล้หมดอายุซ้ำ — หนึ่งแถวต่อใบเติมต่อหลักไมล์ (D-30/14/7/3) ต่อวันหมดอายุ';

-- 3) pg_cron 08:30 ไทย (01:30 UTC) ยิง route ผ่านท่อ trigger_cron_route เดิม
--    ตัวเดียว ไม่มี Vercel cron สำรอง — Hobby จำกัด 2 ตัวและใช้ครบแล้ว (แบบเดียวกับ
--    pending-queue-reminder) พลาดวันไหนหลักไมล์ค้างถูกเก็บรอบถัดไป + หน้า /crm โชว์ลิสต์เสมอ
select vault.create_secret(
  'https://sookkaya-pos.vercel.app/api/cron/credit-expiry-reminder?source=pg_cron',
  'credit_expiry_reminder_url'
);

select cron.schedule(
  'credit-expiry-reminder-0830-ict',
  '30 1 * * *',
  $$select public.trigger_cron_route('credit_expiry_reminder_url')$$
);
