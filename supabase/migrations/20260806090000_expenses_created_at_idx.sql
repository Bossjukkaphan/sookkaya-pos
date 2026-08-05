-- index บน expenses(created_at) — cron ของ Daily Report (route.ts) กรองรายจ่ายที่ "บันทึกเข้าระบบวันนี้"
-- ด้วยช่วง created_at (ไม่ใช่ expense_date) แล้วคอมเมนต์ในโค้ดกับสเปกทั้งคู่อ้างว่ากรองแบบนี้
-- "เพื่อให้ index บน created_at ทำงาน" — แต่ก่อนหน้านี้ตารางมีแค่ expenses_date_idx บน (expense_date)
-- เท่านั้น (20260719174023_create_transaction_tables.sql) คิวรีนั้นเลย Seq Scan ทั้งตาราง expenses
-- จริงทุกคืนตอน 22:00 ไทย ไม่ใช่ index scan ตามที่คอมเมนต์อ้างไว้
-- พบตอน whole-branch review ของ docs/superpowers/specs/2026-08-05-daily-report-members-expenses-design.md
create index if not exists expenses_created_at_idx on public.expenses (created_at);
