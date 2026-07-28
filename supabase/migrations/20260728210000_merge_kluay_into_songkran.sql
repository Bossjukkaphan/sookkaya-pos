-- รวมลูกค้าซ้ำ "กล้วย" → "สงกรานต์" (รันจริงบน production 28/7/2569 · เจ้าของร้านยืนยันว่าคนเดียวกัน)
--
-- ที่มา: ลูกค้าคนนี้เปลี่ยนชื่อจากกล้วยเป็นสงกรานต์ แต่ชีท Member Topup ใน Excel
-- ยังใช้ชื่อเดิม ตอน import จึงหาชื่อ "กล้วย" ในชีทข้อมูลลูกค้าไม่เจอ แล้วสร้างระเบียนหุ่นขึ้นมา
-- (ดู notes เดิมของระเบียนนั้น: "สร้างจากชีท Member Topup — ไม่มีในชีทข้อมูลลูกค้าเดิม")
--
-- ผลคือแพ็ก (จ่ายจริง 5,000 ได้เครดิต 6,000 ในนั้นเป็นโบนัส 1,000) ไปอยู่ระเบียนกล้วย ส่วนบิลบางใบไปลงระเบียนสงกรานต์ที่ไม่มีเครดิตเลย
-- เครดิตของสงกรานต์จึงติดลบ 2,380 ทั้งที่เงินไม่เคยหาย
-- รวมแล้วใช้ไป 5,160 เหลือ 840 หมดอายุ 24/11/2569
-- (ทั้งสองระเบียนเบอร์ 0818509463 เหมือนกันเป๊ะ · ตรวจแล้วเคสแบบนี้มีรายเดียวในระบบ)
--
-- ด่านกันเครดิตในแอปไม่ได้รั่ว — ทั้งสี่บิลเข้ามาทาง import ไม่ได้ผ่าน createSale
--
-- ลำดับตามปุ่ม "รวมลูกค้าซ้ำ" ในหน้าดูแลลูกค้า: ย้ายลูกให้ครบทุกตารางก่อน แล้วค่อยลบตัวแม่
-- (แก้ปุ่มนั้นแล้วด้วยให้ยกสถานะสมาชิกมาด้วย ไม่งั้นคนที่รวมแล้วถือแพ็กอยู่แต่ขึ้นว่าลูกค้าทั่วไป)

do $$
-- ตั้งชื่อตัวแปร v_ นำหน้า เพราะ sales มีคอลัมน์ชื่อ source อยู่แล้ว ชนกันจน PostgreSQL ไม่ยอมรัน
declare
  v_target uuid := 'e8c54d15-5af0-4203-b393-fb9745edfe37';  -- สงกรานต์ (ชื่อที่ใช้จริงตอนนี้)
  v_source uuid := '88ab904f-71d8-4c0d-8289-bc3782a6c752';  -- กล้วย (ระเบียนหุ่นจากชีทเติมเงิน)
begin
  update sales             set customer_id = v_target where customer_id = v_source;
  update queue_entries     set customer_id = v_target where customer_id = v_source;
  update member_topups     set customer_id = v_target where customer_id = v_source;
  update line_accounts     set customer_id = v_target where customer_id = v_source;
  update point_transactions set customer_id = v_target where customer_id = v_source;
  update point_redemptions set customer_id = v_target where customer_id = v_source;
  update crm_contacts      set customer_id = v_target where customer_id = v_source;

  update customers
     set customer_type = 'สมาชิก',   -- แพ็กย้ายมาแล้ว สถานะต้องตามมาด้วย
         notes = coalesce(notes, 'เดิมใช้ชื่อ "กล้วย" — รวมระเบียนซ้ำ 28/7/2569 เพราะชีทเติมเงินยังใช้ชื่อเก่า'),
         updated_at = now()
   where id = v_target;

  delete from customers where id = v_source;
end $$;
