-- บิล import ยอดติดลบ #34139-949 ทำให้ having > 0 ตัดบรรทัดหาย
-- สูตรเดิมนับ · เปลี่ยนเป็น <> 0 เพื่อ parity เป๊ะ
-- เมื่อเจ้าของร้านแก้ข้อมูลบิลนั้นแล้วเงื่อนไขนี้ก็ยังถูก

create or replace view public.v_bill_payments with (security_invoker = true) as
  select bill_key, method, amount, received_date from public.bill_payments
  union all
  select coalesce(s.bill_id, s.id), s.payment_method,
         sum(s.net_amount - coalesce(s.credit_used, 0)), s.sale_date
  from public.sales s
  where not s.payments_tracked
  group by coalesce(s.bill_id, s.id), s.payment_method, s.sale_date
  having sum(s.net_amount - coalesce(s.credit_used, 0)) <> 0;
