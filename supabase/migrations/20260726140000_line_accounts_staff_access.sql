-- ฝั่งร้านต้องเห็นและย้ายลิงก์ไลน์ได้ (โชว์ชื่อไลน์ในโปรไฟล์ลูกค้า + ปุ่มรวมลูกค้าซ้ำ)
-- การสร้าง/ลบลิงก์ยังล็อกไว้ที่ service client ฝั่ง /book เท่านั้นตามเดิม
grant select, update on line_accounts to authenticated;
create policy "authenticated read line accounts" on line_accounts
  for select to authenticated using (true);
create policy "authenticated move line accounts" on line_accounts
  for update to authenticated using (true);

-- รวมลูกค้าซ้ำต้องย้ายประวัติการติดต่อตามไปด้วย
create policy "authenticated update crm" on crm_contacts
  for update to authenticated using (true);
