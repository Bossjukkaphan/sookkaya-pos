-- กัน cold start ของ Vercel serverless function — ต้นเหตุที่ "เปิดระบบครั้งแรกของวันช้ามาก"
-- (วัดแล้ว 10/8/2569: ฐานข้อมูลเร็วมาก query หนักสุดของ Boss Hub ~21ms — ความช้าอยู่ที่การ boot function)
--
-- ใช้ท่อ pg_cron → trigger_cron_route เดิม (migration 20260808185232) ping route เบาๆ
-- ทุก 5 นาทีช่วงเวลาร้าน: 01:00-16:55 UTC = 08:00-23:55 ไทย — นอกเวลานั้นปล่อยหลับ ประหยัดโควต้า
-- route ปลายทางตรวจสิทธิ์สองประตูตามแพตเทิร์นเดิม (ดู src/app/api/cron/keep-warm/route.ts)

-- vault entry ของ URL ปลายทาง — ชื่อเดียวกับแพตเทิร์น daily_report_url / birthday_reminder_url
select vault.create_secret(
  'https://sookkaya-pos.vercel.app/api/cron/keep-warm?source=pg_cron',
  'keep_warm_url'
);

-- ทุก 5 นาที เฉพาะชั่วโมง 01-16 UTC (08:00-23:55 ไทย) — pg_net ยิง async ไม่ block worker
select cron.schedule(
  'keep-warm-5min-ict',
  '*/5 1-16 * * *',
  $$select public.trigger_cron_route('keep_warm_url')$$
);
