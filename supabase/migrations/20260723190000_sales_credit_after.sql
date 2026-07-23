-- ใบเสร็จที่จ่ายด้วยเครดิตสมาชิกต้องบอกลูกค้าได้ว่า "เหลือเครดิตเท่าไหร่"
-- เก็บเป็น snapshot ณ ตอนออกบิล (metadata) — ไม่ใช่ตัวเลขคำนวณเงิน
-- ยอดคงเหลือจริงยังคำนวณสดจาก view member_balances เสมอ
alter table public.sales add column credit_after numeric;
