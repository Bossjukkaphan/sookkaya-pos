-- ข้อความในช่องโปรฯ ที่ยังไม่มีใครบอกว่าเป็นโปรฯ ตัวไหน
-- ต้องนับใน SQL ไม่ใช่ในหน้าเว็บ เพราะ supabase-js ดึงมาได้ทีละ 1000 แถวเท่านั้น
-- ถ้านับฝั่งหน้าเว็บ พอยอดขายโตเกินพันรายการ ข้อความที่ยังไม่จับคู่จะหายไปเงียบๆ
create view public.v_promo_unmatched
with (security_invoker = true) as
select
  public.promo_key(s.coupon_promo)                       as raw_key,
  mode() within group (order by s.coupon_promo)          as sample_text,
  count(*)                                               as uses
from public.sales s
where s.coupon_promo is not null
  and btrim(s.coupon_promo) <> ''
  and not exists (
    select 1 from public.promotion_aliases a
    where a.raw_key = public.promo_key(s.coupon_promo)
  )
group by 1;
