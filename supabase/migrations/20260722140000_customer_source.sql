-- ที่มาลูกค้า: walk_in เดินเข้าร้าน · booking จองล่วงหน้า · agency มาจากตัวแทน (Gowabi/KOL)
-- เป็น metadata ล้วนๆ ไม่แตะสูตรเงินใดๆ
alter table public.queue_entries
  add column source text not null default 'walk_in'
  check (source in ('walk_in','booking','agency'));

-- ใบขายเก็บที่มาด้วย เพื่อวิเคราะห์ช่องทางลูกค้าย้อนหลังได้
-- แถวเก่าเป็น null = ไม่ทราบ (ไม่เดา) · แถวใหม่หน้า POS จะบังคับเลือกเสมอ
alter table public.sales
  add column source text
  check (source is null or source in ('walk_in','booking','agency'));
