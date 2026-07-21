-- ชั้นที่ 1: ตามหมวดหมู่
update public.expenses e
set cost_type = t.cost_type
from public.expense_category_types t
where t.category = e.category;

-- ชั้นที่ 2: หมวด HR แยกตามชื่อรายการ
-- เงินเดือน reception และค่าทำบัญชี = ต้นทุนคงที่ จ่ายแม้ไม่มีลูกค้า
update public.expenses
set cost_type = 'fixed'
where category like 'HR / payroll%'
  and (
    item ilike '%reception%' or
    item ilike '%รีเซฟชั่น%' or
    item ilike '%รีเซพชั่น%' or
    item ilike '%บัญชี%'
  );
