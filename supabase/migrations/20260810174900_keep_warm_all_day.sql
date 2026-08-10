-- ขยาย keep-warm จากช่วงเวลาร้าน (01-16 UTC) เป็นตลอด 24 ชม. —
-- เงื่อนไข "บางเวลาเร็วบางเวลาช้า" สร้างความสับสนโดยประหยัดได้นิดเดียว
-- (~288 ping/วัน แต่ละครั้งเบามาก) เจ้าของร้านเปิดกี่โมงก็ต้องเร็วเสมอ
-- cron.schedule ชื่อเดิม = ทับ schedule เดิมให้เอง
select cron.schedule(
  'keep-warm-5min-ict',
  '*/5 * * * *',
  $$select public.trigger_cron_route('keep_warm_url')$$
);
