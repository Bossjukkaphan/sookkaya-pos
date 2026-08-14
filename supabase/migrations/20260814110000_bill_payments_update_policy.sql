-- เปิดให้แก้บรรทัดชำระได้ — ตารางนี้มีแต่ policy อ่าน/เพิ่ม/ลบ ไม่เคยมี UPDATE มาก่อน
-- เพราะเดิมบรรทัดชำระแก้ไม่ได้ (ต้องลบแล้วเก็บเงินใหม่) พอเปิดให้แก้ช่องทางจึงต้องมี policy นี้
-- ถ้าขาดไป RLS จะบล็อกทุกแถวเงียบ ๆ แล้ว updateBillPaymentMethod จะล้มเหลวทุกครั้งในระบบจริง
--
-- ให้สิทธิ์ถึงระดับ staff เท่ากับ policy insert เพราะ Boss ตัดสินว่าพนักงานทุกคนแก้ช่องทางได้
-- (การลบยังจำกัด admin/manager เหมือนเดิม — ลบทำให้บิลกลายเป็นค้างรับ แต่แก้ช่องทางไม่ขยับยอด)

create policy "staff update bill_payments" on public.bill_payments
  for update to authenticated
  using (app_role() = any (array['admin', 'manager', 'staff']))
  with check (app_role() = any (array['admin', 'manager', 'staff']));
