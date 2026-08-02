-- เพิ่มประเภทใบเติมเงิน "เครดิตคงเหลือ" — ไม่ใช่แพ็กเกจสมาชิก
-- ใช้เก็บเงินที่ลูกค้าจ่ายล่วงหน้ามาแล้วแต่ใช้บริการไม่ครบ (ไม่มีโบนัส ไม่เปลี่ยนสถานะเป็นสมาชิก)
-- ดู docs/superpowers/specs/2026-08-02-overpay-to-credit-design.md
-- (รันบน production ไปแล้วผ่าน migration ชื่อ allow_leftover_credit_tier — ไฟล์นี้เก็บให้ประวัติครบ)
alter table public.member_topups drop constraint if exists member_topups_tier_check;
alter table public.member_topups add constraint member_topups_tier_check
  check (tier = any (array['Silver','Gold','Platinum','เครดิตคงเหลือ']));
