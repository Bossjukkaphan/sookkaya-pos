-- ล็อก search_path ตามคำเตือนของ security advisor
-- ตัวฟังก์ชันใช้แต่ built-in (lower, regexp_replace, coalesce) จึงตั้งเป็นค่าว่างได้
alter function public.promo_key(text) set search_path = '';
