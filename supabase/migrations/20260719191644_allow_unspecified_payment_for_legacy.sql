-- ข้อมูลเก่า 11 รายการไม่ได้บันทึกช่องทางชำระไว้ เก็บตามจริงดีกว่าเดา
alter table public.sales drop constraint sales_payment_method_check;
alter table public.sales add constraint sales_payment_method_check
  check (payment_method in
    ('QR Code','บัตรเครดิต','Gowabi','KOL','Member Credit','เงินสด','ไม่ระบุ'));
