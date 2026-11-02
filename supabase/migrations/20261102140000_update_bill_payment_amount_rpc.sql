-- แก้ "ยอดเงิน" ของบรรทัดรับเงิน โดยวันรับเงินคงเดิม + sync ป้ายช่องทางหัวบิล ในทรานแซกชันเดียว
--
-- ที่มา: 2/11/2569 เจอบิลเกินรับ 4 ใบเดือน ต.ค. (SK-20261018-005 · SK-20261027-001/-002/-003)
-- ผู้จัดการแก้ราคาบิลลงทีหลัง แต่บรรทัดรับเงินยังเป็นยอดเดิม — ทางแก้เดียวที่มีคือลบบรรทัด
-- แล้วกด "เก็บเพิ่ม" ใหม่ ซึ่ง addBillPayment ลงวันรับเงินเป็น "วันนี้" เสมอ
-- เงินของบิล 18 ต.ค. จึงย้ายไปโผล่ 2 พ.ย. ยอดเงินเข้าทั้งสองเดือนผิด
--
-- ใช้เมื่อเงินที่เข้าจริงไม่ตรงกับบรรทัด: คีย์ยอดผิด หรือโอนคืนลูกค้าไปแล้ว
-- (ลูกค้าจ่ายล่วงหน้าแล้วอยากเก็บไว้ใช้ = keepOverpayAsCredit ไม่ใช่ฟังก์ชันนี้)
--
-- เฉพาะ admin/manager — ต่างจากแก้ช่องทางที่พนักงานทุกคนทำได้ เพราะอันนี้ขยับยอดเงินเข้าจริง
-- เช็ค role ซ้ำในนี้ด้วย (policy update ของตารางเปิดถึง staff สำหรับแก้ช่องทาง)
-- ยอดเดิมถูกต่อท้ายไว้ใน note ทุกครั้ง ตามรอยได้ว่าเดิมเท่าไหร่ ใครแก้ เพราะอะไร
--
-- กติกาวิธีหลักของบิล = วิธีของบรรทัดยอดสูงสุด — เหมือน update_bill_payment_method
-- (แก้ยอดอาจทำให้บรรทัดสูงสุดเปลี่ยน ป้ายหัวบิลจึงต้อง sync ด้วย)
-- ด่านธุรกิจอื่น (เหตุผล · หน้าต่างเวลา) อยู่ฝั่ง server action updateBillPaymentAmount

create or replace function public.update_bill_payment_amount(
  p_payment_id uuid,
  p_amount numeric,
  p_reason text,
  p_edited_by text
) returns numeric
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_bill_key uuid;
  v_old numeric;
  v_primary text;
  v_count int;
begin
  if app_role() is distinct from 'admin' and app_role() is distinct from 'manager' then
    raise exception 'NOT_MANAGER';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'BAD_AMOUNT';
  end if;

  select amount into v_old from bill_payments where id = p_payment_id for update;
  if v_old is null then
    raise exception 'LINE_NOT_UPDATED';
  end if;

  update bill_payments
  set amount = p_amount,
      note = concat_ws(' · ', nullif(note, ''),
        format('แก้ยอด %s→%s (%s) โดย %s %s', v_old, p_amount, p_reason,
               coalesce(p_edited_by, '-'), to_char(now() at time zone 'Asia/Bangkok', 'DD/MM/YYYY'))),
      edited_by = p_edited_by,
      edited_at = now()
  where id = p_payment_id
  returning bill_key into v_bill_key;
  if v_bill_key is null then
    raise exception 'LINE_NOT_UPDATED';
  end if;

  select method into v_primary
  from bill_payments
  where bill_key = v_bill_key
  order by amount desc
  limit 1;
  if v_primary is null then
    raise exception 'PRIMARY_NOT_FOUND';
  end if;

  update sales
  set payment_method = v_primary, edited_by = p_edited_by
  where bill_id = v_bill_key or id = v_bill_key;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'SALE_NOT_UPDATED';
  end if;

  return v_old;
end;
$$;
