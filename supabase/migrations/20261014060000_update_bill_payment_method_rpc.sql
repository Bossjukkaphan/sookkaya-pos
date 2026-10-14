-- แก้ช่องทางชำระของบรรทัดรับเงิน + sync ป้ายหัวบิล ให้เป็นทรานแซกชันเดียว
--
-- ที่มา: 14/10/2569 เจอบิล 2 ใบ (คุณตี๋ 13/10 · พั้นซ์ 14/10) ที่บรรทัดรับเงินถูกแก้แล้ว
-- แต่ป้ายช่องทางบนหัวบิล (sales.payment_method) ไม่ตาม — ของเดิม updateBillPaymentMethod
-- ใน src/app/(app)/payment-actions.ts เขียนสองจังหวะแยกกัน (แก้บรรทัดก่อน แล้วค่อย sync หัวบิล)
-- ถ้าจังหวะสองล้ม (เน็ตหลุด/สิทธิ์/ปิดแอป) สองตารางค้างไม่ตรงกันจนกว่าจะกดซ้ำ
-- และพนักงานมักปิดข้อความเตือนโดยไม่กดซ้ำ — ด่าน tracked_bill_method_mismatch จับได้ทีหลัง
--
-- ฟังก์ชันนี้รวมทั้งสองจังหวะไว้ในทรานแซกชันเดียว: จังหวะไหนล้ม raise exception
-- ให้ย้อนกลับทั้งหมด — ไม่มีสถานะครึ่งเดียวอีก
--
-- security invoker: เดินใต้ RLS ของผู้เรียกเหมือน query เดิมทุกประการ — RLS ปฏิเสธเงียบ
-- (อัปเดต 0 แถว) ถูกแปลงเป็น exception ซึ่ง rollback ทั้งก้อน แทนการค้างครึ่งเดียว
--
-- กติกาวิธีหลักของบิล = วิธีของบรรทัดยอดสูงสุด — ต้องตรงกับ primaryMethod()
-- ใน src/lib/payments.ts (ยอดเท่ากันเลือกบรรทัดไหนก็ผ่านด่าน reconciliation)
-- ด่านธุรกิจอื่น (whitelist ช่องทาง · หน้าต่างเวลาแก้ไข) ยังอยู่ฝั่ง server action เหมือนเดิม

create or replace function public.update_bill_payment_method(
  p_payment_id uuid,
  p_method text,
  p_edited_by text
) returns void
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_bill_key uuid;
  v_primary text;
  v_count int;
begin
  update bill_payments
  set method = p_method, edited_by = p_edited_by, edited_at = now()
  where id = p_payment_id
  returning bill_key into v_bill_key;
  -- 0 แถว = บรรทัดถูกลบไปแล้ว หรือ RLS ปฏิเสธเงียบ
  if v_bill_key is null then
    raise exception 'LINE_NOT_UPDATED';
  end if;

  select method into v_primary
  from bill_payments
  where bill_key = v_bill_key
  order by amount desc
  limit 1;
  -- บรรทัดที่เพิ่งแก้อยู่ในบิลนี้แน่ ๆ — ว่างคือความผิดปกติ ไม่ใช่บิลไม่มีบรรทัด
  if v_primary is null then
    raise exception 'PRIMARY_NOT_FOUND';
  end if;

  -- บิลชุดมีหลายแถวใน sales — อัปเดตครบทุกแถวของบิล (แถวแรกใช้ id ตัวเองเป็น bill_key)
  update sales
  set payment_method = v_primary, edited_by = p_edited_by
  where bill_id = v_bill_key or id = v_bill_key;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'SALE_NOT_UPDATED';
  end if;
end;
$$;
