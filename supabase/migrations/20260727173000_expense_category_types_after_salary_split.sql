-- ตามหลังการแยกหมวดเงินเดือน (20260727170000): ตารางจับคู่หมวด→ประเภทต้นทุน
-- ที่หน้าตั้งค่าใช้ ยังชี้ชื่อหมวดเก่าและไม่มีแถวของหมวดใหม่
-- ค่ามือหมอ = ผันแปร (จ่ายตามงาน) · เงินเดือนพนักงานประจำ = คงที่ (จ่ายแม้ไม่มีลูกค้า)
-- (รันจริงบน production ไปแล้ว 27/7/2569 — statement รันซ้ำได้)

update public.expense_category_types
set category = 'HR / payroll (ค่ามือหมอ)'
where category like 'HR / payroll%';

insert into public.expense_category_types (category, cost_type)
values ('เงินเดือนพนักงานประจำ', 'fixed')
on conflict (category) do nothing;
