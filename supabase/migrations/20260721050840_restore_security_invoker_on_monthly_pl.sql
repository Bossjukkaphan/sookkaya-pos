-- create or replace view รีเซ็ต reloptions ทิ้ง ทำให้ security_invoker หลุดไปตอนเพิ่มคอลัมน์ YTD
-- ผลคือ view กลับไปเป็น SECURITY DEFINER พนักงาน staff ยิง REST API ตรงๆ
-- อ่านกำไรขาดทุนทั้งร้านได้ ทั้งที่หน้าเว็บกันไว้แล้ว
-- ครั้งหน้าที่แก้ view นี้ ต้องใส่ with (security_invoker = true) ในคำสั่ง create or replace เสมอ
alter view public.v_monthly_pl set (security_invoker = true);
