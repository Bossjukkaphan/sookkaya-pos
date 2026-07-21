-- เพิ่ม updated_at ให้ตาราง sales เพื่อกันการแก้ทับกันเงียบๆ (optimistic concurrency)
--
-- ปัญหาเดิม: หน้า /today เปิดกล่องแก้ไขจากข้อมูลที่ render ไว้แล้ว และตอนบันทึกจะส่ง
-- ทุกช่องกลับไปเขียนทับทั้งแถว ถ้าพนักงานสองคนเปิดหน้าเดียวกันไว้พร้อมกัน
-- คนที่กดบันทึกทีหลังจะลบงานของคนแรกทิ้งทั้งหมด รวมถึงช่องที่ตัวเองไม่ได้แตะด้วยซ้ำ
-- และระบบจะขึ้นว่า "แก้ไขแล้ว" เหมือนปกติ ไม่มีใครรู้ว่าข้อมูลหาย
--
-- วิธีแก้: ฟอร์มจะส่งค่า updated_at ที่ตัวเองเห็นตอนเปิดกลับมาด้วย
-- ถ้าไม่ตรงกับค่าปัจจุบันในฐานข้อมูล แปลว่ามีคนแก้ไปก่อนแล้ว ระบบจะปฏิเสธและให้เปิดใหม่
-- trigger ด้านล่างทำหน้าที่ขยับ updated_at ทุกครั้งที่มีการ UPDATE
-- (แยกจาก sales_receipt_no_trg ซึ่งเป็น BEFORE INSERT และต้องไม่ถูกแตะต้อง)

alter table public.sales
  add column if not exists updated_at timestamptz not null default now();

comment on column public.sales.updated_at is
  'เวลาที่แก้แถวนี้ครั้งล่าสุด · ใช้เป็น version สำหรับกันสองคนแก้ทับกัน (ดู updateSale)';

create or replace function public.sales_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sales_set_updated_at_trg on public.sales;

create trigger sales_set_updated_at_trg
  before update on public.sales
  for each row
  execute function public.sales_set_updated_at();
