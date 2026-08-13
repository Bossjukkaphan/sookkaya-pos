-- เพิ่มช่องทางชำระเงิน E-Wallet ให้ทั้งสามตารางที่เก็บช่องทาง
--
-- ที่มา: เทียบยอด 1-10 ส.ค. 2026 กับ ThaiHand แล้วพบว่าบิลลูกค้า "อาลี" 9 ส.ค. 1,290 บาท
-- ลูกค้าจ่ายด้วย WeChat แต่ระบบไม่มีช่องทางนี้ให้เลือก พนักงานจึงต้องคีย์เป็นบัตรเครดิต
-- ทำให้ยอดบัตรเครดิตของสองระบบไม่ตรงกัน
--
-- ค่าเดิมทุกค่าคงไว้ครบ — โดยเฉพาะ 'ไม่ระบุ' ในตาราง sales ซึ่งเป็นค่าของข้อมูลนำเข้ารุ่นเก่า
-- ถ้าตัดออกจะล้มทันทีเพราะมีแถวเดิมใช้อยู่

alter table public.sales drop constraint sales_payment_method_check;
alter table public.sales add constraint sales_payment_method_check
  check (payment_method in
    ('QR Code','บัตรเครดิต','E-Wallet','Gowabi','KOL','Member Credit','เงินสด','ไม่ระบุ'));

alter table public.bill_payments drop constraint bill_payments_method_check;
alter table public.bill_payments add constraint bill_payments_method_check
  check (method in ('เงินสด','QR Code','บัตรเครดิต','E-Wallet'));

alter table public.member_topups drop constraint member_topups_payment_method_check;
alter table public.member_topups add constraint member_topups_payment_method_check
  check (payment_method in ('QR Code','เงินสด','บัตรเครดิต','E-Wallet'));
