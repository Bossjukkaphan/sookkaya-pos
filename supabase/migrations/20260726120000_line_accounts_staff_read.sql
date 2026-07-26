-- พนักงาน (ล็อกอินระบบ POS) อ่านได้ว่าลูกค้าคนไหนผูกบัญชีไลน์แล้ว — โชว์ป้าย LINE ในหน้าลูกค้า
-- เขียน/แก้ยังทำไม่ได้เหมือนเดิม (ผูกบัญชีทำผ่าน service-role ที่ตรวจ idToken เท่านั้น)
create policy "staff read line accounts" on public.line_accounts
  for select to authenticated using (true);
