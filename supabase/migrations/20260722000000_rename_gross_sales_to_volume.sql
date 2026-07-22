-- คอลัมน์นี้ชื่อ gross_sales แต่ค่าที่เก็บคือ sum(net_amount) ซึ่งจริงๆ คือ Volume
-- (ยอดรับจริงหลังหักส่วนลด รวมการจ่ายด้วยเครดิต) ไม่ใช่ Gross Sales (ราคาเต็มตามเมนู)
-- ชื่อที่หลอกแบบนี้เคยทำให้เว็บ dashboard หยิบไปติดป้ายผิดมาแล้ว จึงเปลี่ยนชื่อให้ตรงความหมาย
alter view public.v_daily_summary rename column gross_sales to volume;
