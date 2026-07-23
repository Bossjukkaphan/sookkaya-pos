-- บั๊กจริงที่เจอ: ลบบิลที่สร้างจากคิว (กดเก็บเงิน) ไม่ได้ —
-- queue_entries.sale_id ชี้กลับมาที่บิล แล้ว FK ไม่ได้บอกว่าให้ทำยังไงเมื่อบิลถูกลบ
-- Postgres จึงปฏิเสธการลบทั้งที่ผู้ใช้ตั้งใจลบบิลผิดพลาดจริงๆ
--
-- ให้ตัดลิงก์อัตโนมัติ (set null) — คิวเป็นแค่ผังงาน ไม่ใช่สมุดเงิน การ์ดคิวต้องอยู่ต่อได้
-- ส่วนการถอยสถานะ paid → in_service ทำใน deleteSale เพื่อให้คิวกลับมาเก็บเงินใหม่ได้
alter table public.queue_entries
  drop constraint queue_entries_sale_id_fkey;

alter table public.queue_entries
  add constraint queue_entries_sale_id_fkey
  foreign key (sale_id) references public.sales(id) on delete set null;
