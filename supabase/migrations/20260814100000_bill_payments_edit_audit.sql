-- บันทึกว่าใครแก้ช่องทางชำระเงินของบรรทัดชำระเมื่อไหร่
--
-- เปิดให้พนักงานทุกคนแก้ช่องทางได้ (ไม่จำกัด role เหมือนการลบบรรทัด) เพราะการแก้ช่องทาง
-- ไม่ขยับยอดเงินสักบาท แต่ต้องตามรอยได้ว่าใครเปลี่ยน — คอลัมน์คู่นี้คือสิ่งที่ทำให้ตามรอยได้
-- แนวเดียวกับ member_topups.edited_by/edited_at ที่เพิ่มไปเมื่อ 13 ส.ค. 2026
--
-- nullable ล้วน แถวเดิมทั้ง 198 แถวไม่กระทบ

alter table public.bill_payments add column if not exists edited_by text;
alter table public.bill_payments add column if not exists edited_at timestamptz;

comment on column public.bill_payments.edited_by is
  'ชื่อพนักงานที่แก้ช่องทางชำระเงินล่าสุด — null = ยังไม่เคยถูกแก้';
comment on column public.bill_payments.edited_at is
  'เวลาที่แก้ช่องทางชำระเงินล่าสุด';
