-- บันทึกว่าใครแก้ใบเติมเงินเมื่อไหร่
--
-- ตาราง member_topups ไม่เคยมีคอลัมน์บอกผู้แก้ไขเลย พอเปิดให้แก้ช่องทางชำระเงินได้
-- (ซึ่งแก้ข้ามเดือนได้ด้วย ต่างจากการลบที่ล็อกเฉพาะเดือนปัจจุบัน) จึงต้องตามรอยได้
-- ว่าใครเปลี่ยนอะไร ตามแบบเดียวกับ sales.edited_by

alter table public.member_topups add column if not exists edited_by text;
alter table public.member_topups add column if not exists edited_at timestamptz;

comment on column public.member_topups.edited_by is
  'ชื่อพนักงานที่แก้ช่องทางชำระเงินล่าสุด — null = ยังไม่เคยถูกแก้';
comment on column public.member_topups.edited_at is
  'เวลาที่แก้ช่องทางชำระเงินล่าสุด';
