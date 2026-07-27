-- แยกเงินเดือนพนักงานประจำออกจากหมวด "HR / payroll"
--
-- ปัญหา: กำไรทางบัญชี (v_monthly_pl.profit_accrual) ตัดหมวด HR / payroll ออกทั้งหมวด
-- แล้วใส่ค่ามือที่คำนวณจากงานจริงกลับเข้าไปแทน เพื่อกันนับค่ามือซ้ำสองรอบ
-- แต่หมวดนี้มีเงินเดือน reception ปนอยู่ด้วย เงินก้อนนั้นจึงหลุดจากสูตรไปเลย
-- ไม่เคยถูกหัก → กำไรทางบัญชีสูงเกินจริงเดือนละ 38,250–52,450 บาท (มี.ค.–มิ.ย. 2569)
--
-- แก้ที่ข้อมูลไม่ใช่ที่สูตร: สูตรที่ต้องเดาจากชื่อรายการจะพลาดอีกเมื่อพิมพ์ชื่อแบบใหม่
-- statement ทุกตัวรันซ้ำได้ (รันจริงบน production ไปแล้ว 27/7/2569)

update expenses set category = 'เงินเดือนพนักงานประจำ'
where category like 'HR / payroll%'
  and not (item ilike '%ค่ามือ%' or item ilike '%เบิกเงิน%')
  and item not ilike '%ทำบัญชี%';

-- ค่าทำบัญชีรายเดือนไม่ใช่ payroll ตั้งแต่ต้น
update expenses set category = 'อื่นๆ'
where category like 'HR / payroll%' and item ilike '%ทำบัญชี%';

-- ชื่อหมวดเดิมมีคำว่า "เงินเดือน" อยู่ จึงชวนให้คีย์เงินเดือนเข้ามาปนอีก
-- (ขึ้นต้นด้วย "HR / payroll" เหมือนเดิม — view ที่ filter ด้วย prefix ยังทำงานถูก)
update expenses set category = 'HR / payroll (ค่ามือหมอ)'
where category like 'HR / payroll%';

update settings set value =
  'ซักรีด,ค่าเช่าสถานที่,ค่าน้ำ / ค่าไฟ / Internet,วัสดุ-สิ้นเปลือง (น้ำมัน บาล์ม ฯลฯ),การตลาด / โฆษณา,HR / payroll (ค่ามือหมอ),เงินเดือนพนักงานประจำ,ชุดลูกค้า ชุดหมอ ชุดพนักงาน,อื่นๆ'
where key = 'expense_categories';
