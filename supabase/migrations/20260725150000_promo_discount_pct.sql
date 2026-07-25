-- ส่วนลดอัตโนมัติของโปรโมชั่น: ตั้ง % ไว้ แล้วหน้า POS คำนวณจำนวนเงิน (ปัดเป็นบาทเต็ม) ให้เอง
alter table promotions add column discount_pct integer
  check (discount_pct is null or (discount_pct between 1 and 100));
