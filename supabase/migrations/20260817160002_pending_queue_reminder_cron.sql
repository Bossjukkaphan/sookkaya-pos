-- เตือนซ้ำคำขอจองที่ยังไม่มีใครกดรับ/ปฏิเสธ — ตาข่ายชั้นสุดท้ายกันคิวหลุด
-- (17/8/2569 คำขอค้าง 93 นาทีโดยไม่มีใครรู้ เพราะไม่มีอะไรถามซ้ำเลยสักครั้ง)
--
-- ใช้ท่อ pg_cron → trigger_cron_route เดิม · route ตรวจสิทธิ์สองประตูตามแพตเทิร์นเดิม
-- ดู src/app/api/cron/pending-queue-reminder/route.ts
select vault.create_secret(
  'https://sookkaya-pos.vercel.app/api/cron/pending-queue-reminder?source=pg_cron',
  'pending_queue_reminder_url'
);

-- ทุก 10 นาที เฉพาะชั่วโมง 01-16 UTC (08:00-23:5x ไทย) — ไม่กวนพนักงานตอนดึก
-- คำขอที่เข้ามาตอนกลางคืนจะถูกเตือนรอบแรกของเช้า (ยังอยู่ในลิสต์ pending)
select cron.schedule(
  'pending-queue-reminder-10min-ict',
  '*/10 1-16 * * *',
  $$select public.trigger_cron_route('pending_queue_reminder_url')$$
);
