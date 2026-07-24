-- จากหน้างาน (เค้ก): การจองล่วงหน้าต้องเก็บ "รีเควสหมอ" และ "เบอร์โทร" ตั้งแต่ตอนลงคิว
-- จะได้ไม่ตกหล่นตอนเก็บเงิน (ระบบจะ prefill รีเควส +40 ให้ตอนกดเก็บเงินจากการ์ด)
alter table public.queue_entries add column is_request boolean not null default false;
alter table public.queue_entries add column customer_phone text;
