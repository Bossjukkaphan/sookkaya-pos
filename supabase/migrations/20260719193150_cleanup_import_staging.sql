drop table if exists public.stg_customers;
drop table if exists public.stg_sales;
drop table if exists public.stg_expenses;
drop table if exists public.stg_topups;
drop table if exists public.import_svc_map;
drop table if exists public.import_th_map;

-- หมวดหมู่รายจ่ายให้ตรงกับที่ใช้จริงในข้อมูลเก่า
update public.settings
set value = 'ซักรีด,ค่าเช่าสถานที่,ค่าน้ำ / ค่าไฟ / Internet,วัสดุ-สิ้นเปลือง (น้ำมัน บาล์ม ฯลฯ),การตลาด / โฆษณา,HR / payroll (เงินประกัน ค่ามือ เงินเดือน),ชุดลูกค้า ชุดหมอ ชุดพนักงาน,อื่นๆ'
where key = 'expense_categories';
