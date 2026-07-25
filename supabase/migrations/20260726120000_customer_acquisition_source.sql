-- ช่องทางที่ลูกค้ารู้จักร้าน (เก็บจากฟอร์มสมาชิกหน้าแต้ม) — ใช้วัดว่าโปรโมทช่องทางไหนคุ้ม
alter table customers add column acquisition_source text;
